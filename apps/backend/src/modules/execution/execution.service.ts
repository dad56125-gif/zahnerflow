import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ModuleStatus, ExecutionStatus } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { FurnaceService } from '../furnace/furnace.service';
import { MfcService } from '../mfc/mfc.service';
import { FurnaceMaintenanceService } from '../furnace/furnace-maintenance.service'; // ✅ 新增：后台维护服务
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { DbService } from '../../db/db.service';
import { FilesService } from '../files/files.service';

// Hook 规则定义
type HookRule = {
  id: string;
  name: string;
  enabled: boolean;
  loopBinding: { loopNodeId: string };
  trigger: { type: 'after_node' | 'before_node'; nodeSelector: { id?: string; type?: string } };
  cycle: { every: number; offset?: number };
  action: { type: 'insert_node'; placement: 'after' | 'before'; nodeTemplate: { type: string; params: Record<string, any> }; tag?: string; };
};

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '2.0.0';
  readonly dependencies = [];
  private readonly logger = new Logger(ExecutionService.name);

  // 运行时状态 (内存中保持)
  private currentExecutionId: string | null = null;
  private currentNodeId: string | null = null;
  
  // 执行上下文
  private executionContexts = new Map<string, {
    workflowId: string;
    executionId: string;
    startTime: Date;
    workflowTimestamp: string;
  }>();

  constructor(
    protected readonly zahnerService: ZahnerZenniumService,
    protected readonly workflowService: WorkflowService,
    protected readonly furnaceService: FurnaceService,
    protected readonly mfcService: MfcService,
    protected readonly furnaceMaintenanceService: FurnaceMaintenanceService, // ✅ 新增：后台维护服务
    protected readonly eventBus: EventBus,
    private readonly db: DbService,
    private readonly consoleManager: ConsoleDisplayManager,
    private readonly filesService: FilesService,
  ) {
    this.setupDeviceEventListeners();
  }

  async onModuleInit() {
    this.initDbTables();
    
    // 发送初始化事件
    this.eventBus.emit('module.initialized', {
      moduleName: 'execution',
      version: this.version,
      timestamp: new Date()
    });
  }

  /**
   * 初始化 SQLite 表结构
   */
  private initDbTables() {
    // 1. 执行历史表
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT,
        status TEXT, -- running, success, failed, cancelled
        start_time TEXT,
        end_time TEXT,
        duration INTEGER,
        error TEXT,
        logs_json TEXT
      )
    `).run();

    // 2. Hook 规则表 (替代 hooks.json)
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        name TEXT,
        enabled INTEGER DEFAULT 1,
        rule_json TEXT -- 存储完整的 HookRule JSON
      )
    `).run();
  }

  /**
   * 获取所有执行历史 (供 Controller 调用)
   */
  getAllExecutions(): ExecutionStatus[] {
    const rows = this.db.prepare(`
      SELECT id, workflow_id, status, start_time, end_time, error 
      FROM executions 
      ORDER BY start_time DESC 
      LIMIT 50
    `).all() as any[];

    return rows.map(row => ({
      executionId: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      error: row.error
    })) as any;
  }

  /**
   * 获取 Hook 规则
   */
  getLoadedHookRules(): HookRule[] {
    const rows = this.db.prepare(`SELECT rule_json FROM hooks WHERE enabled = 1`).all() as { rule_json: string }[];
    return rows.map(r => JSON.parse(r.rule_json));
  }

  // ======================================================================
  // 核心执行逻辑
  // ======================================================================

  async executeWorkflow(workflowId: string): Promise<ExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.currentExecutionId = executionId;
    const startTime = new Date();
    const workflowTimestamp = this.generateTimestamp();

    // 1. 记录上下文
    this.executionContexts.set(executionId, { workflowId, executionId, startTime, workflowTimestamp });
    this.consoleManager.log('ExecutionService', 'enableLog', `工作流开始执行 ID: ${executionId}`);

    // 2. 持久化状态：Running
    this.db.prepare(`
      INSERT INTO executions (id, workflow_id, status, start_time)
      VALUES (?, ?, 'running', ?)
    `).run(executionId, workflowId, startTime.toISOString());

    // 3. 发送通知
    this.emitWorkflowEvent('started', executionId, workflowId);

    try {
      // 获取工作流定义
      const workflow = await this.workflowService.getWorkflow(workflowId);
      if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

      // 执行节点
      const completedNodes = await this.executeNodesV2(executionId, workflow);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // 4. 持久化状态：Success
      this.updateExecutionStatus(executionId, 'success', endTime, duration);
      this.emitWorkflowEvent('completed', executionId, workflowId, { success: true, duration });

      return {
        executionId,
        status: 'success',
        startTime,
        endTime,
        results: completedNodes,
      };

    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMsg = error.message || String(error);

      // 4. 持久化状态：Failed
      this.updateExecutionStatus(executionId, 'failed', endTime, duration, errorMsg);
      this.emitWorkflowEvent('failed', executionId, workflowId, { error: errorMsg, duration });

      return {
        executionId,
        status: 'failed',
        startTime,
        endTime,
        error: errorMsg,
        results: [],
      };
    } finally {
      this.executionContexts.delete(executionId);
      if (this.currentExecutionId === executionId) this.currentExecutionId = null;
    }
  }

  private updateExecutionStatus(id: string, status: string, endTime: Date, duration: number, error?: string) {
    this.db.prepare(`
      UPDATE executions 
      SET status = ?, end_time = ?, duration = ?, error = ?
      WHERE id = ?
    `).run(status, endTime.toISOString(), duration, error || null, id);
  }

  // ----------------------------------------------------------------------
  // 节点执行引擎 (Loop & Hooks 支持)
  // ----------------------------------------------------------------------
  
  private async executeNodesV2(executionId: string, workflowDefinition: any): Promise<string[]> {
    const original = workflowDefinition.definition?.nodes || [];
    const queue: any[] = original.map((n: any) => ({ ...n }));
    const completedNodes: string[] = [];
    
    // Loop 栈管理
    const bounds = this.buildLoopBoundaries(queue);
    const frames: Array<{ loopNodeId: string; depth: number; startIp: number; endIp: number; iteration: number; total: number }> = [];
    const insertedMarks = new Set<string>(); // 防止 Hook 重复插入

    let ip = 0;
    while (ip < queue.length) {
      const node = queue[ip];
      this.currentNodeId = node.id;

      // Loop Start 处理
      if (node.type === 'loop_start') {
        const { loop_count } = this.getLoopParams(node);
        const endIp = bounds.get(ip);
        if (endIp != null) {
          const top = frames[frames.length - 1];
          // 如果是新进入循环，或者上一层循环刚结束进入下一轮
          if (!top || top.startIp !== ip) {
            frames.push({ 
              loopNodeId: node.id, 
              depth: frames.length + 1, 
              startIp: ip, 
              endIp, 
              iteration: 1, 
              total: Math.max(1, Number(loop_count) || 1) 
            });
          }
        }
      }

      // 节点执行前通知
      this.emitNodeEvent('started', executionId, node);

      // 执行具体业务
      await this.executeNode(executionId, node);
      completedNodes.push(node.id);

      // Hook 检查: After Node
      if ((node as any).origin !== 'hook') {
        await this.evaluateHooks('after_node', executionId, queue, ip, frames, insertedMarks);
      }

      // 节点执行后通知
      this.emitNodeEvent('completed', executionId, node, { result: true });

      // Loop End 处理
      if (node.type === 'loop_end') {
        const top = frames[frames.length - 1];
        if (top && top.endIp === ip) {
          if (top.iteration < top.total) {
            top.iteration += 1;
            ip = top.startIp; // 跳转回 Start
            // 注意：ip 会在下面 += 1，所以实际下一条是 startIp + 1，即循环体第一条
          } else {
            frames.pop(); // 循环结束，出栈
          }
        }
      }

      ip += 1;
    }

    return completedNodes;
  }

  // ----------------------------------------------------------------------
  // Hooks 逻辑
  // ----------------------------------------------------------------------

  private async evaluateHooks(
    trigger: 'after_node' | 'before_node',
    executionId: string,
    queue: any[],
    ip: number,
    frames: any[],
    marks: Set<string>,
  ): Promise<void> {
    const rules = this.getLoadedHookRules(); // 从 DB 获取规则
    if (rules.length === 0) return;

    const cur = queue[ip];
    const workflowId = this.getCurrentWorkflowId(executionId);

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.trigger?.type !== trigger) continue;

      // 检查 Loop 绑定
      const frame = frames.find(f => f.loopNodeId === rule.loopBinding?.loopNodeId);
      if (!frame) continue;

      // 检查节点选择器
      const sel = rule.trigger.nodeSelector || {};
      if (sel.id && sel.id !== cur.id) continue;
      if (sel.type && sel.type !== cur.type) continue;

      // 检查循环周期
      const every = Math.max(1, Number(rule.cycle?.every) || 1);
      const offset = Number(rule.cycle?.offset) || 0;
      if (((frame.iteration - offset) % every) !== 0) continue;

      // 防止重复插入
      const key = `${executionId}|${frame.loopNodeId}|${frame.iteration}|${rule.id}`;
      if (marks.has(key)) continue;

      // 插入新节点
      const tmpNode = this.materializeNode(rule.action?.nodeTemplate);
      (tmpNode as any).origin = 'hook';
      (tmpNode as any).meta = { fromRule: rule.id };

      if (rule.action?.placement === 'before') {
        queue.splice(ip, 0, tmpNode);
      } else {
        queue.splice(ip + 1, 0, tmpNode);
      }

      marks.add(key);
      this.logger.log(`[Hook] Inserted node ${tmpNode.id} via rule ${rule.name}`);
      
      // 通知前端
      this.eventBus.emit('hook.insert.applied', {
        ruleId: rule.id, workflowId, targetNodeId: cur.id, insertedNodeId: tmpNode.id
      });
    }
  }

  private materializeNode(tpl: any): any {
    const { type, params } = tpl || { type: 'delay', params: { duration: 1 } };
    const id = `hook_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    return { id, type, name: `Hook: ${type}`, data: { parameters: params } };
  }

  // ----------------------------------------------------------------------
  // 节点分发 (Dispatcher)
  // ----------------------------------------------------------------------

  private async executeNode(executionId: string, node: any): Promise<void> {
    const type = node.type;
    
    // 设备控制
    if (type === 'startup') await this.zahnerService.startup(node.data?.parameters);
    else if (type === 'shutdown') await this.zahnerService.shutdown();
    else if (type === 'change_temperature') await this.executeChangeTemperature(executionId, node);
    else if (type === 'change_gas_flow') await this.executeChangeGasFlow(executionId, node);
    
    // 测量
    else if (this.isMeasurementNodeType(type) || type === 'measurement') {
      await this.executeMeasurement(executionId, node, type === 'measurement' ? node.data?.measurement_type : type);
    }
    
    // 流程控制
    else if (type === 'delay' || type === 'wait_delay') await this.executeDelay(node);
    else if (type === 'loop_start' || type === 'loop_end') { /* 逻辑在 executeNodesV2 处理 */ }
    
    else {
      this.logger.warn(`Unknown node type: ${type}, skipping.`);
    }
  }

  // ----------------------------------------------------------------------
  // 具体业务方法
  // ----------------------------------------------------------------------

  private async executeMeasurement(executionId: string, node: any, type: string): Promise<void> {
    // 优先从 node.config 读取参数（前端传递的最新参数），其次从 node.data.parameters 读取
    let params = {};

    if (node.config && typeof node.config === 'object') {
      // 如果有 config 字段，优先使用（这是前端传递的最新参数）
      params = { ...node.config };
      this.logger.log(`[ExecutionService] 使用 node.config 中的参数: ${JSON.stringify(Object.keys(params))}`);
    } else if (node.data?.parameters) {
      // 回退到 data.parameters
      params = { ...node.data.parameters };
      this.logger.log(`[ExecutionService] 使用 node.data.parameters 中的参数: ${JSON.stringify(Object.keys(params))}`);
    } else {
      this.logger.warn(`[ExecutionService] 节点 ${node.id} 没有找到参数`);
    }

    // 路径计算
    const workflowId = this.getCurrentWorkflowId(executionId);
    const workflow = await this.workflowService.getWorkflow(workflowId);
    const config = workflow ? this.filesService.getProjectConfig(workflow.ownerName, workflow.definition.name, workflow.individualName) : null;
    const timestamp = this.getWorkflowTimestamp(executionId);

    const outputPath = this.filesService.buildOutputPath({
      base_path: config?.base_path,
      project_name: workflow?.definition.name,
      individual_name: workflow?.individualName,
      test_type: config?.test_type,
      measurement_type: type,
      workflow_id: workflowId,
      workflow_timestamp: timestamp
    });

    params = { ...params, output_path: outputPath };
    
    // 调用 Zahner 服务
    // 注意：这里假设 ZahnerService 已经内部处理了不同类型的 mapping
    const res = await this.zahnerService.performMeasurement(type, params, node.id, executionId);
    if (res.status !== 'success') throw new Error(res.error || 'Measurement failed');
  }

  private async executeChangeTemperature(executionId: string, node: any) {
    const p = node.data?.parameters || {};
    // 直接传递业务参数，不进行单位转换
    const params = {
      target_temperature: p.target_temperature,
      rate: p.rate,
      tolerance: 5,
      stabilization_time: 30
    };
    const res = await this.furnaceService.autoTemperatureControl(params, node.id, executionId);
    if (!res.success) throw new Error(res.error);
    // 不更新节点参数，避免状态污染
  }

  private async executeChangeGasFlow(executionId: string, node: any) {
    const p = node.data?.parameters || {};
    if (!p.device_selection) throw new Error('Missing device_selection');
    const [addrStr, gas] = p.device_selection.split(':');
    
    const params = {
      device_address: parseInt(addrStr, 10),
      gas_type: gas,
      target_flow_rate: p.target_flow_rate,
      stabilization_time: 10
    };
    
    const res = await this.mfcService.setFlowRateControl(params, node.id, executionId);
    if (!res.success) throw new Error(res.error);
  }

  private async executeDelay(node: any) {
    const sec = node.data?.parameters?.duration || 1;
    this.logger.log(`[DelayNode] Starting delay for ${sec}s`);

    // ✅ 启动后台维护（仅在长时间延时时，非阻塞调用）
    if (sec >= 300) {  // 5分钟以上
      const maintenanceWindow = sec - 30;  // 预留30秒余量
      this.logger.log(`[DelayNode] Starting background maintenance, window: ${maintenanceWindow}s`);

      // 关键：不await，让后台维护并行执行
      this.furnaceMaintenanceService.runSession(maintenanceWindow)
        .then(result => {
          this.logger.log(`[DelayNode] Background maintenance completed`);
        })
        .catch(error => {
          this.logger.error(`[DelayNode] Background maintenance failed: ${error}`);
          // 维护失败不影响主流程
        });
    }

    // ✅ 精确执行用户延时（不受维护影响）
    await new Promise(resolve => setTimeout(resolve, sec * 1000));

    this.logger.log(`[DelayNode] Delay completed after ${sec}s`);
  }

  // ----------------------------------------------------------------------
  // 辅助方法
  // ----------------------------------------------------------------------

  private setupDeviceEventListeners() {
    // 这里保留监听逻辑，用于处理来自硬件的异步事件
    // 代码保持原样，但注意不要使用 this.db.emit
    this.eventBus.on('measurement.completed').subscribe(event => {
       // 转发为 node.completed
       const { nodeId, executionId } = event.data.context || {};
       if(nodeId && executionId) {
         this.emitNodeEvent('completed', executionId, { id: nodeId, type: event.data.measurementType }, { result: event.data.result });
       }
    });
    
    this.eventBus.on('measurement.failed').subscribe(event => {
        // 转发为 node.failed
        const { nodeId, executionId } = event.data.context || {};
        if(nodeId && executionId) {
             this.emitNodeEvent('failed', executionId, { id: nodeId }, { error: event.data.error });
        }
    });
  }

  private emitWorkflowEvent(type: 'started' | 'completed' | 'failed', executionId: string, workflowId: string, extra?: any) {
    this.eventBus.emit(`workflow.${type}`, {
      executionId, workflowId, timestamp: new Date(), ...extra, context: { source: 'execution-service' }
    });
  }

  private emitNodeEvent(type: 'started' | 'completed' | 'failed', executionId: string, node: any, extra?: any) {
    this.eventBus.emit(`node.${type}`, {
      nodeId: node.id, executionId, workflowId: this.getCurrentWorkflowId(executionId), nodeType: node.type,
      timestamp: new Date(), ...extra, context: { source: 'execution-service' }
    });
  }

  private getCurrentWorkflowId(execId: string): string { return this.executionContexts.get(execId)?.workflowId || 'unknown'; }
  private getWorkflowTimestamp(execId: string): string { return this.executionContexts.get(execId)?.workflowTimestamp || this.generateTimestamp(); }
  private generateTimestamp(): string { return new Date().toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_'); }
  
  private getLoopParams(node: any) {
    const p = node?.data?.parameters || node?.config || {};
    return { loop_count: Number(p.loop_count) || 1 };
  }

  private buildLoopBoundaries(nodes: any[]): Map<number, number> {
    const map = new Map<number, number>();
    const stack: number[] = [];
    nodes.forEach((n, i) => {
      if (n.type === 'loop_start') stack.push(i);
      else if (n.type === 'loop_end' && stack.length) map.set(stack.pop()!, i);
    });
    return map;
  }

  private isMeasurementNodeType(t: string): boolean {
    return ['eis_potentiostatic', 'eis_galvanostatic', 'ocp_measurement', 'chronoamperometry', 'chronopotentiometry', 'voltage_ramp', 'current_ramp', 'lsv_measurement'].includes(t);
  }

  // 占位符方法，实际逻辑由 EventBus 触发
  async pauseExecution(id: string) { this.eventBus.emit('execution.paused', { executionId: id, timestamp: new Date() }); }
  async resumeExecution(id: string) { this.eventBus.emit('execution.resumed', { executionId: id, timestamp: new Date() }); }
  async cancelExecution(id: string) { this.eventBus.emit('execution.cancelled', { executionId: id, timestamp: new Date() }); }
  async getExecutionStatus(id: string): Promise<ExecutionStatus> {
    // 1. 修改 SQL，多查 workflow_id 和 start_time
    const row = this.db.prepare(`
      SELECT id, workflow_id, status, error, start_time, end_time
      FROM executions
      WHERE id = ?
    `).get(id) as any;

    if (!row) {
      // 2. 没找到时，必须返回符合 ExecutionStatus 接口的默认对象
      return {
        executionId: id,
        workflowId: 'unknown', // 补全必填项
        status: 'unknown' as any,
        startTime: new Date(), // 补全必填项
        currentNode: undefined,
        completedNodes: []
      };
    }

    // 3. 正常返回时，映射数据库字段
    return {
      executionId: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      error: row.error,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      // 如果需要 currentNode 和 completedNodes，需要从 context 或 logs_json 里解析
      // 暂时留空以满足接口
      completedNodes: []
    };
  }
  getStatus(): ModuleStatus { return { state: 'running', health: 'healthy', lastCheck: new Date() }; }
}