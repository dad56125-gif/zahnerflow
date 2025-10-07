import { Injectable, OnModuleInit } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';
import { ExecutionNotificationService } from './execution-notification.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { DbService } from '../../db/db.service';

type HookRule = {
  id: string;
  name: string;
  enabled: boolean;
  loopBinding: { loopNodeId: string };
  trigger: { type: 'after_node' | 'before_node'; nodeSelector: { id?: string; type?: string } };
  cycle: { every: number; offset?: number };
  limit?: { perIteration?: number; perRun?: number };
  action: { type: 'insert_node'; placement: 'after' | 'before'; nodeTemplate: { type: string; params: Record<string, any> }; tag?: string; priority?: number };
};

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '1.1.0';
  readonly dependencies = [];

  private executionCounter = 0;
  private currentExecutionId: string | null = null;
  private currentNodeId: string | null = null;
  private hookRules: HookRule[] = [];

  // 执行上下文管理 - 存储workflowId引用
  private executionContexts = new Map<string, {
    workflowId: string;
    executionId: string;
    startTime: Date;
  }>();

  constructor(
    protected readonly zahnerService: ZahnerZenniumService,
    protected readonly workflowService: WorkflowService,
    protected readonly eventBus: SimpleEventBus,
    protected readonly executionNotificationService: ExecutionNotificationService,
    private readonly db: DbService,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    // 监听设备事件，发送节点和工作流通知
    this.setupDeviceEventListeners();
  }

  async onModuleInit() {
    // 事件驱动架构：发送模块初始化事件
    this.eventBus.emit('module.initialized', {
      moduleName: 'execution',
      version: this.version,
      timestamp: new Date()
    });
    this.loadHookRulesFromFile();
  }

  private loadHookRulesFromFile() {
    try {
      const path = require('path');
      const fs = require('fs');
      const candidates: string[] = [];
      if (process.env.HOOKS_JSON_PATH && process.env.HOOKS_JSON_PATH.trim()) {
        const p = process.env.HOOKS_JSON_PATH;
        candidates.push(path.isAbsolute(p) ? p : path.join(process.cwd(), p));
      }
      // repository-root/data/hooks/hooks.json relative to dist file
      candidates.push(path.resolve(__dirname, '../../../data/hooks/hooks.json'));
      // cwd fallback
      candidates.push(path.join(process.cwd(), 'data', 'hooks', 'hooks.json'));

      for (const hp of candidates) {
        if (fs.existsSync(hp)) {
          const raw = fs.readFileSync(hp, 'utf-8');
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          this.hookRules = arr.filter((r: any) => !!r && r.enabled !== false);
          break;
        }
      }
    } catch {
      this.hookRules = [];
    }
  }

  private setupDeviceEventListeners(): void {
    // 监听测量完成事件，发送节点完成通知
    this.eventBus.on('measurement.completed').subscribe((event) => {
      this.consoleManager.log('ExecutionService', 'enableLog', '收到设备measurement.completed事件，发送节点完成通知', {
        measurementType: event.data.measurementType
      });

      const nodeId = event.data.context?.nodeId || this.getCurrentNodeId();
      const executionId = event.data.context?.executionId || this.getCurrentExecutionId();
      const workflowId = this.getCurrentWorkflowId(executionId); // 关键修复！

      // 发送节点完成通知
      this.eventBus.emit('node.completed', {
        nodeId,
        executionId,
        workflowId, // 添加workflowId
        nodeType: event.data.measurementType,
        result: event.data.result,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      // 发送工作流节点完成通知
      this.eventBus.emit('workflow.node.completed', {
        nodeId,
        executionId,
        workflowId, // 添加workflowId
        result: event.data.result,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.consoleManager.log('ExecutionService', 'enableLog', '发送 workflow.node.completed 事件', {
        nodeId,
        executionId,
        result: event.data.result
      });
    });

    // 监听测量失败事件，发送节点失败通知
    this.eventBus.on('measurement.failed').subscribe((event) => {
      this.consoleManager.log('ExecutionService', 'enableError', '收到设备measurement.failed事件，发送节点失败通知', {
        measurementType: event.data.measurementType,
        error: event.data.error
      });

      const nodeId = event.data.context?.nodeId || this.getCurrentNodeId();
      const executionId = event.data.context?.executionId || this.getCurrentExecutionId();
      const workflowId = this.getCurrentWorkflowId(executionId); // 关键修复！

      this.eventBus.emit('node.failed', {
        nodeId,
        executionId,
        workflowId, // 添加workflowId
        error: event.data.error,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.eventBus.emit('workflow.node.failed', {
        nodeId,
        executionId,
        workflowId, // 添加workflowId
        error: event.data.error,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.consoleManager.log('ExecutionService', 'enableError', '发送 workflow.node.failed 事件', {
        nodeId,
        executionId,
        error: event.data.error
      });
    });
  }

  
  async executeWorkflow(workflowId: string): Promise<ExecutionResult> {
    const executionId = this.generateExecutionId();
    this.currentExecutionId = executionId; // 设置当前执行ID
    const startTime = Date.now();

    // 保存执行上下文 - 关键修复！
    this.executionContexts.set(executionId, {
      workflowId,
      executionId,
      startTime: new Date()
    });

    // 发送执行开始通知
    this.executionNotificationService.sendExecutionStartNotification(executionId, workflowId);

    // 事件驱动架构：发送工作流开始事件（状态由StateEventHandler管理）
    this.eventBus.emit('workflow.started', {
      executionId,
      workflowId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });

    try {
      // 获取工作流定义
      const workflow = await this.workflowService.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      this.consoleManager.log('ExecutionService', 'enableLog', `获取到工作流定义: ${workflowId}`, {
        nodesCount: workflow.definition.nodes?.length || 0,
        hasNodes: !!(workflow.definition.nodes && workflow.definition.nodes.length > 0)
      });

      const completedNodes = await this.executeNodesV2(executionId, workflow);
      const duration = Date.now() - startTime;

      // 发送执行完成通知
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, true, duration, workflowId);

      // 事件驱动架构：发送工作流完成事件
      this.eventBus.emit('workflow.completed', {
        executionId,
        workflowId,
        success: true,
        duration,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      return {
        executionId,
        status: 'success',
        startTime: new Date(startTime),
        endTime: new Date(),
        results: completedNodes,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // 发送执行失败通知
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, false, duration, workflowId);

      // 事件驱动架构：发送工作流失败事件
      this.eventBus.emit('workflow.failed', {
        executionId,
        workflowId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      return {
        executionId,
        status: 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        error: error instanceof Error ? error.message : String(error),
        results: [], // 错误情况下没有完成的节点
      };
    } finally {
      // 执行结束后清理上下文
      this.executionContexts.delete(executionId);
    }
  }

  // 新版执行：指令队列 + 循环栈 + Hook（after_node）
  private async executeNodesV2(executionId: string, workflowDefinition: any): Promise<string[]> {
    const original = workflowDefinition.definition?.nodes || [];
    const queue: any[] = original.map((n: any) => ({ ...n }));
    const completedNodes: string[] = [];
    this.consoleManager.log('ExecutionService', 'enableLog', `执行工作流节点 - 初始节点数: ${queue.length}`);

    // 构建 loop 边界（startIp -> endIp）
    const bounds = this.buildLoopBoundaries(queue);
    type LoopFrame = { loopNodeId: string; depth: number; startIp: number; endIp: number; iteration: number; total: number };
    const frames: LoopFrame[] = [];
    const insertedMarks = new Set<string>();

    let ip = 0;
    while (ip < queue.length) {
      const node = queue[ip];
      this.currentNodeId = node.id;

      // 进入 loop_start：若不在栈顶则压栈
      if (node.type === 'loop_start') {
        const { loop_id, loop_count } = this.getLoopParams(node);
        const endIp = bounds.get(ip);
        if (endIp != null) {
          const top = frames[frames.length - 1];
          if (!top || top.startIp !== ip) {
            frames.push({ loopNodeId: String(loop_id || node.id), depth: frames.length + 1, startIp: ip, endIp, iteration: 1, total: Math.max(1, Number(loop_count) || 1) });
          }
        }
      }

      // 节点开始事件
      this.consoleManager.log('ExecutionService', 'enableLog', `开始执行节点: #${ip + 1}/${queue.length} ${node.id} (type=${node.type})`);
      this.eventBus.emit('node.started', {
        nodeId: node.id,
        executionId,
        workflowId: this.getCurrentWorkflowId(executionId),
        nodeType: node.type,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      // 执行节点
      await this.executeNode(executionId, node);
      completedNodes.push(node.id);

      // after_node Hook：仅对非 hook 来源节点
      if ((node as any).origin !== 'hook') {
        await this.evaluateHooks('after_node', executionId, queue, ip, frames, insertedMarks);
      }

      this.consoleManager.log('ExecutionService', 'enableLog', `完成执行节点: ${node.id}`);
      this.eventBus.emit('node.completed', {
        nodeId: node.id,
        executionId,
        workflowId: this.getCurrentWorkflowId(executionId),
        nodeType: node.type,
        result: true,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      // 循环尾部处理
      if (node.type === 'loop_end') {
        const top = frames[frames.length - 1];
        if (top && top.endIp === ip) {
          if (top.iteration < top.total) {
            top.iteration += 1;
            ip = top.startIp; // 回到 loop_start（循环体首个节点将是 startIp+1）
          } else {
            frames.pop();
          }
        }
      }

      ip += 1;
    }

    this.consoleManager.log('ExecutionService', 'enableLog', `工作流节点执行完成 - 完成节点数 ${completedNodes.length}/${queue.length}`);
    return completedNodes;
  }

  // 读取循环参数（兼容 data.parameters 与 config）
  private getLoopParams(node: any): { loop_id?: string; loop_count?: number } {
    const p = node?.data?.parameters || node?.config || {};
    return {
      loop_id: p.loop_id,
      loop_count: typeof p.loop_count === 'number' ? p.loop_count : (p.loop_count ? Number(p.loop_count) : undefined)
    };
  }

  // 扫描并配对 loop_start / loop_end，返回 startIp->endIp 映射
  private buildLoopBoundaries(nodes: any[]): Map<number, number> {
    const map = new Map<number, number>();
    const stack: Array<{ ip: number; loop_id?: string }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n?.type === 'loop_start') {
        const { loop_id } = this.getLoopParams(n);
        stack.push({ ip: i, loop_id });
      } else if (n?.type === 'loop_end') {
        const { loop_id } = this.getLoopParams(n);
        for (let s = stack.length - 1; s >= 0; s--) {
          if ((stack[s].loop_id || '') === (loop_id || '')) {
            const start = stack[s].ip;
            map.set(start, i);
            stack.splice(s, 1);
            break;
          }
        }
      }
    }
    return map;
  }

  private async evaluateHooks(
    trigger: 'after_node' | 'before_node',
    executionId: string,
    queue: any[],
    ip: number,
    frames: Array<{ loopNodeId: string; depth: number; startIp: number; endIp: number; iteration: number; total: number }>,
    marks: Set<string>,
  ): Promise<void> {
    if (!this.hookRules || this.hookRules.length === 0) return;
    const cur = queue[ip];
    const workflowId = this.getCurrentWorkflowId(executionId);
    for (const rule of this.hookRules) {
      if (!rule?.enabled) continue;
      if (rule.trigger?.type !== trigger) continue;
      const frame = frames.find(f => f.loopNodeId === rule.loopBinding?.loopNodeId);
      if (!frame) continue;
      const sel = rule.trigger.nodeSelector || {};
      if (sel.id && sel.id !== cur.id) continue;
      if (sel.type && sel.type !== cur.type) continue;
      const every = Math.max(1, Number(rule.cycle?.every) || 1);
      const offset = Number(rule.cycle?.offset) || 0;
      if (((frame.iteration - offset) % every) !== 0) continue;
      const key = `${executionId}|${frame.loopNodeId}|${frame.iteration}|${rule.id}|${rule.action?.tag || ''}`;
      if (marks.has(key)) {
        const sup = { ruleId: rule.id, workflowId, targetNodeId: cur.id, loopContext: { loopNodeId: frame.loopNodeId, depth: frame.depth, iteration: frame.iteration }, reason: 'duplicate' };
        this.db.emit('hook_suppressed', sup);
        this.eventBus.emit('hook.insert.suppressed', sup);
        continue;
      }
      const planned = { ruleId: rule.id, workflowId, targetNodeId: cur.id, loopContext: { loopNodeId: frame.loopNodeId, depth: frame.depth, iteration: frame.iteration } };
      this.db.emit('hook_debug', { stage: 'before_insert', ...planned });
      this.db.emit('hook_insert_planned', planned);
      this.eventBus.emit('hook.insert.planned', planned);
      const tmpNode = this.materializeNode(rule.action?.nodeTemplate);
      (tmpNode as any).origin = 'hook';
      (tmpNode as any).meta = { tag: rule.action?.tag, fromRule: rule.id };
      if (rule.action?.placement === 'before') {
        queue.splice(ip, 0, tmpNode);
      } else {
        queue.splice(ip + 1, 0, tmpNode);
      }
      marks.add(key);
      const applied = { ruleId: rule.id, workflowId, targetNodeId: cur.id, insertedNodeId: tmpNode.id, loopContext: { loopNodeId: frame.loopNodeId, depth: frame.depth, iteration: frame.iteration } };
      this.db.emit('hook_insert_applied', applied);
      this.eventBus.emit('hook.insert.applied', applied);
    }
  }

  private materializeNode(tpl: { type: string; params: Record<string, any> } | undefined): any {
    const { type, params } = tpl || { type: 'eis_potentiostatic', params: {} } as any;
    const id = `node_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const data: any = { parameters: params };
    if (type === 'delay' && params && typeof (params as any).duration !== 'undefined') {
      data.duration = (params as any).duration;
    }
    return { id, type, name: `hook:${type}`, data };
  }
  private async executeNodes(executionId: string, workflowDefinition: any): Promise<string[]> {
    const nodes = workflowDefinition.definition.nodes || [];
    const totalNodes = nodes.length;
    const completedNodes: string[] = [];

    this.consoleManager.log('ExecutionService', 'enableLog', `执行工作流节点 - 总节点数: ${totalNodes}`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.currentNodeId = node.id; // 设置当前节点ID

      this.consoleManager.log('ExecutionService', 'enableLog', `开始执行节点 ${i + 1}/${totalNodes}: ${node.id} (类型: ${node.type})`);

      // 事件驱动架构：发送节点开始事件
      this.eventBus.emit('node.started', {
        nodeId: node.id,
        executionId,
        workflowId: this.getCurrentWorkflowId(executionId), // 添加workflowId
        nodeType: node.type,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      await this.executeNode(executionId, node);
      completedNodes.push(node.id);

      this.consoleManager.log('ExecutionService', 'enableLog', `完成执行节点: ${node.id}`);

      // 事件驱动架构：发送节点完成事件
      this.eventBus.emit('node.completed', {
        nodeId: node.id,
        executionId,
        workflowId: this.getCurrentWorkflowId(executionId), // 添加workflowId
        nodeType: node.type,
        result: true,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });
    }

    this.consoleManager.log('ExecutionService', 'enableLog', `工作流节点执行完成 - 完成节点数: ${completedNodes.length}/${totalNodes}`);
    return completedNodes;
  }

  private async executeNode(executionId: string, node: any): Promise<void> {
    const nodeId = node.id;
    const nodeType = node.type;

    // 根据节点类型执行不同的逻辑
    switch (nodeType) {
      // 设备控制节点
      case 'startup':
        await this.executeStartup(executionId, node);
        break;
      case 'shutdown':
        await this.executeShutdown(executionId, node);
        break;

      // 基础测量节点 - 所有都使用zahner-measurement逻辑，但传递不同的测量类型
      case 'eis_potentiostatic':
      case 'eis_galvanostatic':
      case 'ocp_measurement':
      case 'chronoamperometry':
      case 'chronopotentiometry':
      case 'voltage_ramp':
      case 'current_ramp':
      case 'lsv_measurement':
        await this.executeMeasurement(executionId, node, nodeType);
        break;
      case 'measurement':
        await this.executeMeasurement(executionId, node);
        break;

      // 流程控制节点
      case 'wait_delay':
      case 'delay':
        await this.executeDelay(executionId, node);
        break;
      case 'loop_start':
        await this.executeLoopStart(executionId, node);
        break;
      case 'loop_end':
        await this.executeLoopEnd(executionId, node);
        break;

      // 兼容旧版本
      case 'zahner-measurement':
        await this.executeZahnerMeasurement(executionId, node);
        break;

      default:
        this.consoleManager.log('ExecutionService', 'enableWarn', `Unknown node type: ${nodeType}`);
    }
  }

  private async executeZahnerMeasurement(executionId: string, node: any): Promise<void> {
    const measurement = node.data;
    const measurementType = measurement.measurement_type || 'impedance';
    const parameters = measurement;

    // 使用设备服务执行测量（事件发送由 ZahnerZenniumService 处理）
    const result = await this.zahnerService.performMeasurement(measurementType, parameters, node.id, executionId);

    if (result.status !== 'success') {
      throw new Error(`Measurement failed: ${result.error}`);
    }
  }

  private async executeStartup(executionId: string, node: any): Promise<void> {
    const parameters = node.data?.parameters || {};

    // 使用设备服务执行启动操作（事件发送由 ZahnerZenniumService 处理）
    const result = await this.zahnerService.startup(parameters);

    if (result.status !== 'success') {
      throw new Error(`Startup failed: ${result.error}`);
    }
  }

  private async executeShutdown(executionId: string, node: any): Promise<void> {
    // 使用设备服务执行关闭操作（事件发送由 ZahnerZenniumService 处理）
    const result = await this.zahnerService.shutdown();

    if (result.status !== 'success') {
      throw new Error(`Shutdown failed: ${result.error}`);
    }
  }

  private async executeMeasurement(executionId: string, node: any, measurementType?: string): Promise<void> {
    const parameters = node.data?.parameters || {};

    // 映射节点类型到设备服务的方法（事件发送由 ZahnerZenniumService 处理）
    let result;
    switch (measurementType) {
      case 'eis_potentiostatic':
        result = await this.zahnerService.performMeasurement('eis_potentiostatic', parameters, node.id, executionId);
        break;
      case 'eis_galvanostatic':
        result = await this.zahnerService.performMeasurement('eis_galvanostatic', parameters, node.id, executionId);
        break;
      case 'ocp_measurement':
        result = await this.zahnerService.performMeasurement('ocp', parameters, node.id, executionId);
        break;
      case 'chronoamperometry':
        result = await this.zahnerService.performMeasurement('ca', parameters, node.id, executionId);
        break;
      case 'chronopotentiometry':
        result = await this.zahnerService.performMeasurement('cp', parameters, node.id, executionId);
        break;
      case 'voltage_ramp':
      case 'lsv_measurement':
        result = await this.zahnerService.performMeasurement('lsv', parameters, node.id, executionId);
        break;
      case 'current_ramp':
        result = await this.zahnerService.performMeasurement('current_ramp', parameters, node.id, executionId);
        break;
      default:
        throw new Error(`Unsupported measurement type: ${measurementType}`);
    }

    if (result.status !== 'success') {
      throw new Error(`Measurement failed: ${result.error}`);
    }
  }

  private async executeDelay(executionId: string, node: any): Promise<void> {
    const delayMs = node.data?.duration || 1000;
    this.consoleManager.log('ExecutionService', 'enableLog', `Executing delay node ${node.id} for ${delayMs}ms`);

    await new Promise(resolve => setTimeout(resolve, delayMs));
    this.consoleManager.log('ExecutionService', 'enableLog', `Delay completed for node ${node.id}`);
  }

  private async executeLoopStart(executionId: string, node: any): Promise<void> {
    const parameters = node.data?.parameters || {};
    this.consoleManager.log('ExecutionService', 'enableLog', `Loop start: ${parameters.loop_id}, count: ${parameters.loop_count}`);
    // 循环逻辑在工作流层面处理，这里只记录日志
  }

  private async executeLoopEnd(executionId: string, node: any): Promise<void> {
    const parameters = node.data?.parameters || {};
    this.consoleManager.log('ExecutionService', 'enableLog', `Loop end: ${parameters.loop_id}`);
    // 循环逻辑在工作流层面处理，这里只记录日志
  }

  private isMeasurementNodeType(nodeType: string): boolean {
    const measurementTypes = [
      'eis_potentiostatic',
      'eis_galvanostatic',
      'ocp_measurement',
      'chronoamperometry',
      'chronopotentiometry',
      'voltage_ramp',
      'current_ramp',
      'lsv_measurement',
      'zahner-measurement'
    ];
    return measurementTypes.includes(nodeType);
  }

  private getCurrentNodeId(): string {
    return this.currentNodeId || 'unknown';
  }

  private getCurrentWorkflowId(executionId: string): string {
    const context = this.executionContexts.get(executionId);
    return context?.workflowId || 'unknown';
  }

  private getCurrentExecutionId(): string {
    return this.currentExecutionId || 'unknown';
  }

  private generateExecutionId(): string {
    return `exec_${++this.executionCounter}_${Date.now()}`;
  }

  getStatus(): ModuleStatus {
    return {
      state: 'running',
      health: 'healthy',
      lastCheck: new Date(),
      error: undefined
    };
  }

  // 实现接口要求的控制方法（通过事件总线实现）
  async pauseExecution(executionId: string): Promise<void> {
    // 事件驱动架构：发送执行暂停事件
    this.eventBus.emit('execution.paused', {
      executionId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });
  }

  async resumeExecution(executionId: string): Promise<void> {
    // 事件驱动架构：发送执行恢复事件
    this.eventBus.emit('execution.resumed', {
      executionId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });
  }

  async cancelExecution(executionId: string): Promise<void> {
    // 事件驱动架构：发送执行取消事件
    this.eventBus.emit('execution.cancelled', {
      executionId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });
  }

  async getExecutionStatus(executionId: string): Promise<any> {
    // 事件驱动架构：发送状态查询事件
    this.eventBus.emit('execution.status.query', {
      executionId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });

    // 返回基本状态信息（详细状态由 StateEventHandler 管理）
    return {
      executionId,
      status: 'unknown',
      message: '状态查询已发送到事件总线，详细状态由 StateEventHandler 管理'
    };
  }

  // 调试：查看已加载的 Hook 规则
  getLoadedHookRules(): any[] {
    return Array.isArray(this.hookRules) ? this.hookRules : [];
  }
}
