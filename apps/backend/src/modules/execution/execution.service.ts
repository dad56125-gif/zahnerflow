import { Injectable, OnModuleInit, Inject, forwardRef, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionStatus, WorkflowNode, ExecutionSnapshot as IExecutionSnapshot } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { FurnaceService } from '../furnace/furnace.service';
import { MfcService } from '../mfc/mfc.service';
import { FurnaceMaintenanceService } from '../furnace/furnace-maintenance.service';
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { DbService } from '../../db/db.service';
import { FilesService } from '../files/files.service';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import { unrollLoops, UnrolledStep, UnrollResult } from '@shared/loopUnroller';

export interface ExecutionSnapshot {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  workflowId: string | null;
  executionId: string | null;
  currentStep: {
    nodeId: string | null;
    nodeType: string | null;
    index: number;           // 原始节点索引 (向后兼容)
    total: number;           // 原始节点总数 (向后兼容)
    // 新增：展开后的索引（用于准确进度计算）
    unrolledIndex?: number;  // 展开后的当前步骤索引
    unrolledTotal?: number;  // 展开后的总步骤数
    iterationPath?: number[]; // 当前迭代路径 [外层轮次, 内层轮次, ...]
  } | null;
  startTime: Date | null;
  endTime?: Date;  // 新增
  duration: number;
  error: string | null;
  timestamp: Date;
  results?: Record<string, any>[];  // 新增
}

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '3.2.2'; // 版本号微升
  readonly dependencies = [];
  private readonly logger = new Logger(ExecutionService.name);

  // =================================================================
  // 核心状态存储 (STATIC)
  // 必须使用 static 以防止 NestJS 的 Circular Dependency 导致的 Proxy 分身问题
  // =================================================================

  private static _state: ExecutionSnapshot = {
    status: 'idle',
    workflowId: null,
    executionId: null,
    currentStep: null,
    startTime: null,
    duration: 0,
    error: null,
    timestamp: new Date()
  };

  // 【关键优化】Context 也必须是静态的，否则不同实例间会丢失 ExecutionId 对应的 Workflow 信息
  private static _contexts = new Map<string, {
    workflowId: string;
    executionId: string;
    startTime: Date;
    workflowTimestamp: string;
  }>();

  // 内部便捷访问器 (Read-only)
  private get state(): ExecutionSnapshot {
    return ExecutionService._state;
  }

  constructor(
    protected readonly zahnerService: ZahnerZenniumService,
    protected readonly workflowService: WorkflowService,
    protected readonly furnaceService: FurnaceService,
    protected readonly mfcService: MfcService,
    protected readonly furnaceMaintenanceService: FurnaceMaintenanceService,
    protected readonly eventBus: EventBus,
    private readonly db: DbService,
    private readonly consoleManager: ConsoleDisplayManager,
    private readonly filesService: FilesService,
    @Inject(forwardRef(() => WorkflowGateway))
    private readonly workflowGateway: WorkflowGateway,
  ) {
    this.setupDeviceEventListeners();
  }

  async onModuleInit() {
    this.initDbTables();
    this.eventBus.emit('module.initialized', { moduleName: 'execution', version: this.version });
  }

  // ==========================================
  // Core Logic (Stream & State)
  // ==========================================

  private setupDeviceEventListeners() {
    this.eventBus.on('device.raw_stream').subscribe((event) => {
      this.handleRawStreamData(event.data);
    });
  }

  private async handleRawStreamData(rawData: { t: number; v: number; i: number }) {
    // 移除不必要的 debug 日志，只在必要时读取状态
    const snapshot = this.state;

    // 快速过滤，减少日志噪音
    if (snapshot.status !== 'running' || !snapshot.executionId || !snapshot.currentStep) {
      return;
    }

    // 广播数据
    this.workflowGateway.broadcast('measurementData', {
      executionId: snapshot.executionId,
      stepIndex: snapshot.currentStep.index,
      nodeId: snapshot.currentStep.nodeId,
      data: rawData
    });
  }

  /**
   * 获取当前状态快照（返回副本以防止外部修改）
   */
  getExecutionSnapshot(): ExecutionSnapshot {
    return { ...ExecutionService._state };
  }

  /**
   * 统一状态更新方法
   * 所有的状态变更必须通过此方法，确保 EventBus 触发
   */
  private updateState(partial: Partial<ExecutionSnapshot>) {
    // 直接合并到静态对象
    Object.assign(ExecutionService._state, {
      ...partial,
      timestamp: new Date()
    });

    // 仅打印关键状态变更，减少日志刷屏
    if (partial.status) {
      this.logger.log(`[Status Change] -> ${partial.status} (ExecID: ${ExecutionService._state.executionId})`);
    }

    // 发送事件
    this.eventBus.emit('execution.state.changed', ExecutionService._state);
  }

  // ==========================================
  // Workflow Execution
  // ==========================================

  async executeWorkflow(workflowId: string | null, nodes?: any[]): Promise<ExecutionSnapshot> {
    // 【日志】前端传递的节点列表
    if (nodes) {
      this.logger.log(`[ExecutionService] 前端传递的节点列表 - 数量: ${nodes.length}`);
      nodes.forEach((node, index) => {
        this.logger.log(`[前端节点] 索引: ${index}, 类型: ${node.type}, 参数: ${JSON.stringify(node.config || {})}`);
      });
    }

    this.logger.log(`[executeWorkflow] START - workflowId=${workflowId}`);

    let finalWorkflowId = workflowId;

    // 处理自动运行模式（无 WorkflowId）
    if (!workflowId) {
      if (!nodes || nodes.length === 0) {
        throw new Error('Nodes array is required when workflowId is null');
      }
      const newWorkflow = await this.workflowService.createWorkflow({
        name: `AutoRun_${new Date().toISOString()}`,
        nodes: nodes
      });
      finalWorkflowId = newWorkflow.id;
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = new Date();

    // 【修改】使用静态 Map 存储上下文
    ExecutionService._contexts.set(executionId, {
      workflowId: finalWorkflowId!,
      executionId,
      startTime,
      workflowTimestamp: this.generateTimestamp()
    });

    // 写入数据库
    this.db.prepare(`INSERT INTO executions (id, workflow_id, status, start_time) VALUES (?, ?, 'running', ?)`)
      .run(executionId, finalWorkflowId, startTime.toISOString());

    // ✅ 【核心修改】确定要执行的节点：优先使用前端传递的 nodes
    let nodesToExecute: any[];
    if (nodes && nodes.length > 0) {
      // 前端传递了 nodes，直接使用（支持修改参数后重新执行）
      nodesToExecute = nodes;
      this.logger.log(`[executeWorkflow] 使用前端传递的节点执行 (${nodes.length} 个)`);
    } else {
      // 没有传递 nodes，从数据库读取
      const workflow = await this.workflowService.getWorkflow(finalWorkflowId!);
      nodesToExecute = workflow.nodes;
      this.logger.log(`[executeWorkflow] 从数据库读取节点执行 (${workflow.nodes.length} 个)`);
    }

    // 更新全局状态
    this.updateState({
      status: 'running',
      workflowId: finalWorkflowId,
      executionId,
      startTime,
      error: null,
      currentStep: { nodeId: null, nodeType: null, index: 0, total: nodesToExecute.length }
    });

    this.emitWorkflowEvent('started', executionId, finalWorkflowId!);

    try {
      const results = await this.executeNodes(executionId, nodesToExecute);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.finishExecution(executionId, 'success', endTime, duration);

      // 返回完整的 ExecutionSnapshot
      return this.getExecutionSnapshot();

    } catch (error: any) {
      const endTime = new Date();
      const errorMsg = error.message || String(error);
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error(`[Execution Failed] ID: ${executionId}, Reason: ${errorMsg}`);
      this.finishExecution(executionId, 'failed', endTime, duration, errorMsg);

      // 返回完整的 ExecutionSnapshot
      return this.getExecutionSnapshot();
    } finally {
      // 【修改】清理静态 Map
      ExecutionService._contexts.delete(executionId);
    }
  }

  // ... executeNodes 和 dispatchNodeLogic 逻辑保持不变，它们会自动使用 updateState ...


  private async executeNodes(executionId: string, originalNodes: WorkflowNode[]): Promise<any[]> {
    const completedResults: any[] = [];

    // ✅ 核心改动：使用 loopUnroller 展开循环
    const unrollResult = unrollLoops(originalNodes);
    const { steps } = unrollResult;
    const totalSteps = unrollResult.summary.totalSteps;

    this.logger.log(`[ExecuteNodes] 展开后共 ${totalSteps} 步 (原始节点: ${originalNodes.length})`);

    // 跟踪当前循环迭代，用于发送循环事件
    let lastIterationPath: number[] = [];

    for (let unrolledIdx = 0; unrolledIdx < steps.length; unrolledIdx++) {
      const step = steps[unrolledIdx];
      const node = originalNodes[step.originalIndex];

      // 检查状态
      if (this.state.status === 'cancelled') throw new Error('Execution cancelled by user');
      if (this.state.status === 'paused') await this.waitForResume();

      // 检测循环迭代变化，发送循环事件
      if (step.loopDepth > 0) {
        const currentIterationKey = step.iterationPath.join(',');
        const lastIterationKey = lastIterationPath.join(',');

        if (currentIterationKey !== lastIterationKey) {
          // 新的迭代开始
          const loopStartIndex = step.loopContextStack[step.loopContextStack.length - 1];
          const loopNode = originalNodes[loopStartIndex];
          const totalIterations = loopNode?.config?.loop_count ?? 1;
          const currentIteration = step.iterationPath[step.iterationPath.length - 1];

          // 收集本迭代的节点索引（用于前端重置状态）
          const nodeIndices = steps
            .filter(s =>
              s.iterationPath.join(',') === currentIterationKey &&
              s.loopContextStack[s.loopContextStack.length - 1] === loopStartIndex
            )
            .map(s => s.originalIndex);

          this.emitLoopEvent('iteration.start', executionId, {
            loopStartIndex,
            iteration: currentIteration,
            totalIterations,
            nodeIndices
          });

          this.logger.log(`[Loop] === 第 ${currentIteration + 1}/${totalIterations} 轮 ===`);
        }
        lastIterationPath = [...step.iterationPath];
      }

      // ✅ 更新状态：包含展开后的索引
      this.updateState({
        currentStep: {
          nodeId: node.id,
          nodeType: node.type,
          index: step.originalIndex,       // 原始索引 (向后兼容)
          total: originalNodes.length,     // 原始总数 (向后兼容)
          unrolledIndex: unrolledIdx,      // 展开后索引
          unrolledTotal: totalSteps,       // 展开后总数
          iterationPath: step.iterationPath // 迭代路径
        }
      });

      this.emitNodeEvent('started', executionId, node, step.originalIndex, {
        iteration: step.iterationPath.length > 0 ? step.iterationPath[step.iterationPath.length - 1] : undefined,
        iterationPath: step.iterationPath,
        unrolledIndex: unrolledIdx,
        unrolledTotal: totalSteps
      });

      try {
        await this.dispatchNodeLogic(executionId, node);
        completedResults.push({
          id: node.id,
          status: 'success',
          iterationPath: step.iterationPath,
          unrolledIndex: unrolledIdx
        });
        this.emitNodeEvent('completed', executionId, node, step.originalIndex, {
          iteration: step.iterationPath.length > 0 ? step.iterationPath[step.iterationPath.length - 1] : undefined,
          iterationPath: step.iterationPath,
          unrolledIndex: unrolledIdx,
          unrolledTotal: totalSteps
        });
      } catch (e: any) {
        const iterInfo = step.iterationPath.length > 0
          ? ` (迭代 ${step.iterationPath.map(i => i + 1).join('-')})`
          : '';
        const enhancedError = `Node [${node.type}] Failed${iterInfo}: ${e.message}`;
        this.emitNodeEvent('failed', executionId, node, step.originalIndex, {
          error: enhancedError,
          iterationPath: step.iterationPath
        });
        throw new Error(enhancedError);
      }
    }

    return completedResults;
  }

  /**
   * 发送循环事件
   */
  private emitLoopEvent(type: string, executionId: string, data: any): void {
    this.eventBus.emit(`loop.${type}`, { executionId, timestamp: new Date(), ...data });
    // 同时通过 WebSocket 广播给前端
    this.workflowGateway.broadcast(`loop${type.replace('.', '_')}`, data);
  }


  private async dispatchNodeLogic(executionId: string, node: WorkflowNode): Promise<void> {
    const { type, config } = node;
    const params = config || {};

    // 这里保留原来的 switch case 逻辑
    switch (type) {
      case 'startup': await this.zahnerService.startup(params); break;
      case 'shutdown': await this.zahnerService.shutdown(); break;
      case 'delay':
      case 'wait_delay':
        this.logger.log(`[wait_delay] params: ${JSON.stringify(params)}, duration: ${params.duration}`);
        await this.executeDelay(params.duration || 1);
        break;

      case 'change_temperature':
        const tempResult = await this.furnaceService.autoTemperatureControl({
          target_temperature: params.target_temperature,
          rate: params.rate,
          tolerance: params.tolerance ?? 5,
          stabilization_time: params.stabilization_time ?? 30
        }, node.id, executionId);
        if (!tempResult.success) {
          throw new Error(tempResult.error || '温度控制失败');
        }
        break;

      case 'change_gas_flow':
        if (!params.device_selection) throw new Error('Missing device_selection');
        const [addr, gas] = params.device_selection.split(':');
        const flowResult = await this.mfcService.setFlowRateControl({
          device_address: parseInt(addr, 10),
          gas_type: gas,
          target_flow_rate: params.target_flow_rate,
          stabilization_time: params.stabilization_time ?? 10
        }, node.id, executionId);
        if (!flowResult.success) {
          throw new Error(flowResult.error || '流量控制失败');
        }
        break;

      default:
        if (this.isMeasurementNodeType(type) || type === 'measurement') {
          const measType = type === 'measurement' ? params.measurement_type : type;
          await this.executeMeasurement(executionId, node, measType);
        }
    }
  }

  private async executeMeasurement(executionId: string, node: WorkflowNode, type: string) {
    // 【修改】从静态 Map 获取 context
    const context = ExecutionService._contexts.get(executionId);
    const workflowId = context?.workflowId || 'unknown';
    const timestamp = context?.workflowTimestamp;

    const workflow = await this.workflowService.getWorkflow(workflowId);
    const projectConfig = this.filesService.getProjectConfig(workflow.ownerName, workflow.name, workflow.individualName);

    const outputPath = this.filesService.buildOutputPath({
      base_path: projectConfig?.base_path,
      project_name: workflow.name,
      individual_name: workflow.individualName,
      test_type: projectConfig?.test_type,
      measurement_type: type,
      workflow_id: workflowId,
      workflow_timestamp: timestamp
    });

    const result = await this.zahnerService.performMeasurement(type, { ...node.config, output_path: outputPath }, node.id, executionId);

    // ✅ 新增：如果是 EIS 测量且包含解析后的数据，广播给前端
    if (result?.eis_data && (type.includes('eis_potentiostatic') || type.includes('eis_galvanostatic'))) {
      const eisData = result.eis_data;
      this.logger.log(`[EIS] Broadcasting EIS data: ${eisData.point_count} points`);

      // 广播 EIS 数据（仅包含 frequency, z_real, z_imag）
      this.workflowGateway.broadcast('eisDataReady', {
        executionId,
        nodeIndex: this.state.currentStep?.index,
        nodeId: node.id,
        data: {
          frequency: eisData.frequency,
          z_real: eisData.z_real,
          z_imag: eisData.z_imag,
          point_count: eisData.point_count,
          csv_path: eisData.csv_path
        }
      });
    }
  }

  private finishExecution(id: string, status: 'success' | 'failed', endTime: Date, duration: number, error?: string) {
    const finalStatus = status === 'success' ? 'completed' : 'failed';
    this.db.prepare(`UPDATE executions SET status = ?, end_time = ?, duration = ?, error = ? WHERE id = ?`)
      .run(finalStatus, endTime.toISOString(), duration, error || null, id);

    // 【修改】从静态 Map 获取 workflowId
    const wfId = ExecutionService._contexts.get(id)?.workflowId || 'unknown';

    this.emitWorkflowEvent(finalStatus, id, wfId, { error, duration });
    this.updateState({ status: finalStatus, endTime, duration, error: error || null, currentStep: null });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  async resetExecution() {
    if (this.state.status === 'running') {
      this.logger.warn(`[resetExecution] REJECTED - Cannot reset while running`);
      return { success: false, error: 'Cannot reset while running' };
    }

    this.updateState({
      status: 'idle',
      workflowId: null,
      executionId: null,
      currentStep: null,
      error: null,
      duration: 0
    });

    this.logger.log(`[resetExecution] State reset to idle`);
    this.eventBus.emit('execution.nodes.reset', { targetStatus: 'ready' });
    this.workflowGateway.broadcast('nodesReset', { targetStatus: 'ready' });
    return { success: true };
  }

  private async executeDelay(seconds: number) {
    this.logger.log(`Delaying ${seconds}s`);
    await new Promise(r => setTimeout(r, seconds * 1000));
  }

  private async waitForResume() {
    // 简单轮询等待
    while (this.state.status === 'paused') {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 辅助方法保持不变
  getAllExecutions(): ExecutionStatus[] {
    try {
      const rows = this.db.prepare(`SELECT id, workflow_id, status, start_time, end_time, error FROM executions ORDER BY start_time DESC LIMIT 50`).all() as any[];
      return rows.map(row => ({
        executionId: row.id,
        workflowId: row.workflow_id,
        status: row.status,
        startTime: new Date(row.start_time),
        endTime: row.end_time ? new Date(row.end_time) : undefined,
        error: row.error
      })) as any;
    } catch (e) { return []; }
  }

  getLoadedHookRules(): any[] {
    try { return this.db.prepare(`SELECT * FROM hooks WHERE enabled = 1`).all().map((r: any) => r.rule_json ? JSON.parse(r.rule_json) : r); } catch (e) { return []; }
  }

  private initDbTables() {
    this.db.prepare(`CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, workflow_id TEXT, status TEXT, start_time TEXT, end_time TEXT, duration INTEGER, error TEXT, logs_json TEXT)`).run();
    this.db.prepare(`CREATE TABLE IF NOT EXISTS hooks (id TEXT PRIMARY KEY, name TEXT, enabled INTEGER, rule_json TEXT)`).run();
  }

  private isMeasurementNodeType(t: string): boolean {
    // ✅ 修复：添加遗漏的 chronopotentiometry 和 eis_galvanostatic
    return [
      'eis_potentiostatic',
      'eis_galvanostatic',    // 新增
      'ocp',
      'ocp_measurement',
      'voltage_ramp',
      'current_ramp',
      'chronoamperometry',
      'chronopotentiometry'   // 新增
    ].some(k => t.includes(k));
  }
  private generateTimestamp() { return new Date().toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_'); }
  private emitWorkflowEvent(type: string, eid: string, wfid: string, extra?: any) { this.eventBus.emit(`workflow.${type}`, { executionId: eid, workflowId: wfid, timestamp: new Date(), ...extra }); }
  private emitNodeEvent(type: string, eid: string, node: any, index: number, extra?: any) { this.eventBus.emit(`node.${type}`, { nodeId: node.id, executionId: eid, nodeType: node.type, index, timestamp: new Date(), ...extra }); }
  async pauseExecution(id: string) { this.updateState({ status: 'paused' }); }
  async resumeExecution(id: string) { this.updateState({ status: 'running' }); }
  async cancelExecution(id: string) { this.updateState({ status: 'cancelled' }); }
  async getExecutionStatus(id: string): Promise<ExecutionStatus> { return { executionId: id, workflowId: '', status: 'unknown', startTime: new Date() } as any; }
  getStatus() { return { state: 'running', health: 'healthy', lastCheck: new Date() } as any; }
}