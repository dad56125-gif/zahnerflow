import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ModuleStatus, ExecutionStatus } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { FurnaceService } from '../furnace/furnace.service';
import { MfcService } from '../mfc/mfc.service';
import { FurnaceMaintenanceService } from '../furnace/furnace-maintenance.service';
import { EventBus } from '../../notification/event-bus.service';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';
import { DbService } from '../../db/db.service';
import { FilesService } from '../files/files.service';

// --- 【新增】全量状态快照接口 ---
export interface ExecutionSnapshot {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  workflowId: string | null;
  executionId: string | null;
  currentStep: {
    nodeId: string | null;
    nodeType: string | null;
    index: number;
    total: number;
  } | null;
  startTime: Date | null;
  duration: number;
  error: string | null;
  timestamp: Date;
}

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

  // --- 【重构】单一真理源：内存中的全量状态 ---
  private _globalState: ExecutionSnapshot = {
    status: 'idle',
    workflowId: null,
    executionId: null,
    currentStep: null,
    startTime: null,
    duration: 0,
    error: null,
    timestamp: new Date()
  };

  // 执行上下文 (保留用于文件路径生成等内部逻辑)
  private executionContexts = new Map<string, {
    workflowId: string;
    executionId: string;
    startTime: Date;
    workflowTimestamp: string;
  }>();

  // 运行时状态 (兼容旧代码逻辑)
  private currentNodeId: string | null = null;

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
  ) {
    this.setupDeviceEventListeners();
  }

  async onModuleInit() {
    this.initDbTables();
    this.eventBus.emit('module.initialized', {
      moduleName: 'execution',
      version: this.version,
      timestamp: new Date()
    });
  }

  // --- 【新增】获取当前状态快照 (供 Gateway 初始化使用) ---
  getExecutionSnapshot(): ExecutionSnapshot {
    return { ...this._globalState };
  }

  // --- 【新增】统一状态更新方法 ---
  private updateState(partial: Partial<ExecutionSnapshot>) {
    this._globalState = {
      ...this._globalState,
      ...partial,
      timestamp: new Date()
    };
    this.eventBus.emit('execution.state.changed', this._globalState);
    if (partial.status) {
      this.logger.log(`[StateChange] Status -> ${partial.status}`);
    }
  }

  private initDbTables() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT,
        status TEXT,
        start_time TEXT,
        end_time TEXT,
        duration INTEGER,
        error TEXT,
        logs_json TEXT
      )
    `).run();

    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        name TEXT,
        enabled INTEGER DEFAULT 1,
        rule_json TEXT
      )
    `).run();
  }

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

  getLoadedHookRules(): HookRule[] {
    const rows = this.db.prepare(`SELECT rule_json FROM hooks WHERE enabled = 1`).all() as { rule_json: string }[];
    return rows.map(r => JSON.parse(r.rule_json));
  }

  // ======================================================================
  // 核心执行逻辑
  // ======================================================================

  async executeWorkflow(workflowId: string): Promise<ExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = new Date();
    const workflowTimestamp = this.generateTimestamp();

    this.executionContexts.set(executionId, { workflowId, executionId, startTime, workflowTimestamp });
    this.consoleManager.log('ExecutionService', 'enableLog', `工作流开始执行 ID: ${executionId}`);

    this.db.prepare(`
      INSERT INTO executions (id, workflow_id, status, start_time)
      VALUES (?, ?, 'running', ?)
    `).run(executionId, workflowId, startTime.toISOString());

    // 更新全局状态 -> Running
    this.updateState({
      status: 'running',
      workflowId,
      executionId,
      startTime,
      error: null,
      duration: 0,
      currentStep: { nodeId: null, nodeType: null, index: 0, total: 0 }
    });

    this.emitWorkflowEvent('started', executionId, workflowId);

    try {
      const workflow = await this.workflowService.getWorkflow(workflowId);
      if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

      const totalNodes = workflow.definition?.nodes?.length || 0;
      this.updateState({
        currentStep: { ...this._globalState.currentStep!, total: totalNodes }
      });

      const completedNodes = await this.executeNodesV2(executionId, workflow);
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.updateDbStatus(executionId, 'success', endTime, duration);
      this.emitWorkflowEvent('completed', executionId, workflowId, { success: true, duration });

      // 更新全局状态 -> Completed
      this.updateState({
        status: 'completed',
        duration,
        currentStep: null 
      });

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

      this.updateDbStatus(executionId, 'failed', endTime, duration, errorMsg);
      this.emitWorkflowEvent('failed', executionId, workflowId, { error: errorMsg, duration });

      // 更新全局状态 -> Failed
      this.updateState({
        status: 'failed',
        error: errorMsg,
        duration
      });

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
    }
  }

  private updateDbStatus(id: string, status: string, endTime: Date, duration: number, error?: string) {
    this.db.prepare(`
      UPDATE executions 
      SET status = ?, end_time = ?, duration = ?, error = ?
      WHERE id = ?
    `).run(status, endTime.toISOString(), duration, error || null, id);
  }

  // ----------------------------------------------------------------------
  // 节点执行引擎
  // ----------------------------------------------------------------------
  
  private async executeNodesV2(executionId: string, workflowDefinition: any): Promise<string[]> {
    const original = workflowDefinition.definition?.nodes || [];
    const queue: any[] = original.map((n: any) => ({ ...n }));
    const completedNodes: string[] = [];
    
    const bounds = this.buildLoopBoundaries(queue);
    const frames: Array<any> = [];
    const insertedMarks = new Set<string>();

    let ip = 0;
    while (ip < queue.length) {
      const node = queue[ip];
      this.currentNodeId = node.id;
      
      this.updateState({
        currentStep: {
          nodeId: node.id,
          nodeType: node.type,
          index: ip + 1, 
          total: this._globalState.currentStep?.total || 0
        }
      });

      if (node.type === 'loop_start') {
        const { loop_count } = this.getLoopParams(node);
        const endIp = bounds.get(ip);
        if (endIp != null) {
          const top = frames[frames.length - 1];
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

      this.emitNodeEvent('started', executionId, node);
      
      // 执行节点核心逻辑
      await this.executeNode(executionId, node);
      
      completedNodes.push(node.id);

      // Hook 检查 (Missing Method Fix 1: evaluateHooks)
      if ((node as any).origin !== 'hook') {
        await this.evaluateHooks('after_node', executionId, queue, ip, frames, insertedMarks);
      }

      this.emitNodeEvent('completed', executionId, node, { result: true });

      if (node.type === 'loop_end') {
        const top = frames[frames.length - 1];
        if (top && top.endIp === ip) {
          if (top.iteration < top.total) {
            top.iteration += 1;
            ip = top.startIp; 
          } else {
            frames.pop(); 
          }
        }
      }
      ip += 1;
    }

    return completedNodes;
  }

  // ----------------------------------------------------------------------
  // 缺失方法补全区域
  // ----------------------------------------------------------------------

  // Fix 1: evaluateHooks
  private async evaluateHooks(
    trigger: 'after_node' | 'before_node',
    executionId: string,
    queue: any[],
    ip: number,
    frames: any[],
    marks: Set<string>,
  ): Promise<void> {
    const rules = this.getLoadedHookRules(); 
    if (rules.length === 0) return;

    const cur = queue[ip];
    const workflowId = this.getCurrentWorkflowId(executionId);

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.trigger?.type !== trigger) continue;

      const frame = frames.find(f => f.loopNodeId === rule.loopBinding?.loopNodeId);
      if (!frame) continue;

      const sel = rule.trigger.nodeSelector || {};
      if (sel.id && sel.id !== cur.id) continue;
      if (sel.type && sel.type !== cur.type) continue;

      const every = Math.max(1, Number(rule.cycle?.every) || 1);
      const offset = Number(rule.cycle?.offset) || 0;
      if (((frame.iteration - offset) % every) !== 0) continue;

      const key = `${executionId}|${frame.loopNodeId}|${frame.iteration}|${rule.id}`;
      if (marks.has(key)) continue;

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
  // Dispatcher & Business Logic
  // ----------------------------------------------------------------------

  private async executeNode(executionId: string, node: any): Promise<void> {
    const type = node.type;
    
    // 设备控制
    if (type === 'startup') await this.zahnerService.startup(node.data?.parameters);
    else if (type === 'shutdown') await this.zahnerService.shutdown();
    // Fix 2 & 3: Device Control Methods
    else if (type === 'change_temperature') await this.executeChangeTemperature(executionId, node);
    else if (type === 'change_gas_flow') await this.executeChangeGasFlow(executionId, node);
    
    // 测量 (Fix 4: executeMeasurement)
    else if (this.isMeasurementNodeType(type) || type === 'measurement') {
      await this.executeMeasurement(executionId, node, type === 'measurement' ? node.data?.measurement_type : type);
    }
    
    // 流程控制
    else if (type === 'delay' || type === 'wait_delay') await this.executeDelay(node);
    else if (type === 'loop_start' || type === 'loop_end') { /* handled in V2 */ }
    
    else {
      this.logger.warn(`Unknown node type: ${type}, skipping.`);
    }
  }

  // Fix 4: executeMeasurement
  private async executeMeasurement(executionId: string, node: any, type: string): Promise<void> {
    let params = {};
    if (node.config && typeof node.config === 'object') {
      params = { ...node.config };
    } else if (node.data?.parameters) {
      params = { ...node.data.parameters };
    }

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
    
    const res = await this.zahnerService.performMeasurement(type, params, node.id, executionId);
    if (res.status !== 'success') throw new Error(res.error || 'Measurement failed');
  }

  // Fix 2: executeChangeTemperature
  private async executeChangeTemperature(executionId: string, node: any) {
    const p = node.data?.parameters || {};
    const params = {
      target_temperature: p.target_temperature,
      rate: p.rate,
      tolerance: 5,
      stabilization_time: 30
    };
    const res = await this.furnaceService.autoTemperatureControl(params, node.id, executionId);
    if (!res.success) throw new Error(res.error);
  }

  // Fix 3: executeChangeGasFlow
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

    if (sec >= 300) {
      const maintenanceWindow = sec - 30;
      this.logger.log(`[DelayNode] Starting background maintenance, window: ${maintenanceWindow}s`);
      this.furnaceMaintenanceService.runSession(maintenanceWindow)
        .then(() => this.logger.log(`[DelayNode] Background maintenance completed`))
        .catch(error => this.logger.error(`[DelayNode] Background maintenance failed: ${error}`));
    }

    await new Promise(resolve => setTimeout(resolve, sec * 1000));
    this.logger.log(`[DelayNode] Delay completed after ${sec}s`);
  }

  // ----------------------------------------------------------------------
  // 辅助方法
  // ----------------------------------------------------------------------

  private setupDeviceEventListeners() {
    this.eventBus.on('measurement.completed').subscribe(event => {
       const { nodeId, executionId } = event.data.context || {};
       if(nodeId && executionId) {
         this.emitNodeEvent('completed', executionId, { id: nodeId, type: event.data.measurementType }, { result: event.data.result });
       }
    });
    
    this.eventBus.on('measurement.failed').subscribe(event => {
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

  async pauseExecution(id: string) { 
    this.updateState({ status: 'paused' }); 
    this.eventBus.emit('execution.paused', { executionId: id, timestamp: new Date() }); 
  }
  
  async resumeExecution(id: string) { 
    this.updateState({ status: 'running' }); 
    this.eventBus.emit('execution.resumed', { executionId: id, timestamp: new Date() }); 
  }
  
  async cancelExecution(id: string) { 
    this.updateState({ status: 'cancelled' }); 
    this.eventBus.emit('execution.cancelled', { executionId: id, timestamp: new Date() }); 
  }

  async stopExecution(id: string) {
    // Stop 逻辑通常等同于 Cancel 或特定逻辑，这里暂映射为 cancel
    this.updateState({ status: 'cancelled' });
    this.eventBus.emit('execution.cancelled', { executionId: id, timestamp: new Date() });
  }

  // --- 【新增】重置状态为 Idle ---
  async resetState() {
    // 只有在非运行状态下才允许重置
    if (this._globalState.status === 'running') {
       this.logger.warn('Attempt to reset state while running');
       return;
    }

    this.updateState({
      status: 'idle',
      workflowId: null,
      executionId: null,
      currentStep: null,
      startTime: null,
      duration: 0,
      error: null
    });

    this.logger.log('[ExecutionService] State reset to IDLE');
  }

  // --- 【新增】完整重置执行状态（包括节点）---
  async resetExecution() {
    // 只有在非运行状态下才允许重置
    if (this._globalState.status === 'running') {
       this.logger.warn('Attempt to reset execution while running');
       return { success: false, error: 'Cannot reset while running' };
    }

    // 1. 重置全局执行状态
    this.updateState({
      status: 'idle',
      workflowId: null,
      executionId: null,
      currentStep: null,
      startTime: null,
      duration: 0,
      error: null
    });

    // 2. 【关键修复】广播节点重置指令
    // 明确告诉所有监听者：所有节点现在回归 'ready' 状态
    this.eventBus.emit('execution.nodes.reset', {
      targetStatus: 'ready',
      timestamp: new Date(),
      message: '所有节点状态已重置为就绪'
    });

    this.logger.log('[ExecutionService] Execution reset complete - all nodes reset to ready');

    return { success: true, message: 'Execution reset successfully' };
  }

  async getExecutionStatus(id: string): Promise<ExecutionStatus> {
    const row = this.db.prepare(`
      SELECT id, workflow_id, status, error, start_time, end_time
      FROM executions
      WHERE id = ?
    `).get(id) as any;

    if (!row) {
      return {
        executionId: id,
        workflowId: 'unknown',
        status: 'unknown' as any,
        startTime: new Date(),
        currentNode: undefined,
        completedNodes: []
      };
    }

    return {
      executionId: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      error: row.error,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      completedNodes: []
    };
  }
  
  getStatus(): ModuleStatus { return { state: 'running', health: 'healthy', lastCheck: new Date() }; }
}
