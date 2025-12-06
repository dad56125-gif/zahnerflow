import { Injectable, OnModuleInit, Inject, forwardRef, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ExecutionStatus, WorkflowNode } from '../../interfaces/module-interfaces';
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

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '3.2.1'; // Fix missing methods
  readonly dependencies = [];
  private readonly logger = new Logger(ExecutionService.name);

  private _globalStateRaw: ExecutionSnapshot = {
    status: 'idle',
    workflowId: null,
    executionId: null,
    currentStep: null,
    startTime: null,
    duration: 0,
    error: null,
    timestamp: new Date()
  };

  // 使用getter/setter拦截所有访问
  private get _globalState(): ExecutionSnapshot {
    return this._globalStateRaw;
  }

  private set _globalState(value: ExecutionSnapshot) {
    this.logger.error(`[_globalState SETTER] DIRECT ASSIGNMENT DETECTED!`);
    this.logger.error(`[_globalState SETTER] Current stack: ${new Error().stack}`);
    this._globalStateRaw = value;
  }

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
  // [修复] 缺失的辅助方法
  // ==========================================

  getAllExecutions(): ExecutionStatus[] {
    try {
      // 从 SQLite 获取最近的 50 条记录
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
    } catch (e) {
      this.logger.error(`Failed to get executions: ${e}`);
      return [];
    }
  }

  getLoadedHookRules(): any[] {
    // 如果你有 hooks 表则查询，否则返回空
    try {
      const rows = this.db.prepare(`SELECT * FROM hooks WHERE enabled = 1`).all();
      return rows.map((r: any) => r.rule_json ? JSON.parse(r.rule_json) : r);
    } catch (e) {
      return [];
    }
  }

  async resetExecution() {
    this.logger.log(`[resetExecution] CALLED - CurrentStatus=${this._globalState.status}, ExecutionId=${this._globalState.executionId}`);

    if (this._globalState.status === 'running') {
      this.logger.warn(`[resetExecution] REJECTED - Cannot reset while running`);
      return { success: false, error: 'Cannot reset while running' };
    }

    // 重置状态
    this.updateState({
      status: 'idle',
      workflowId: null,
      executionId: null,
      currentStep: null,
      error: null,
      duration: 0
    });

    this.logger.log(`[resetExecution] SUCCESS - State reset to idle`);

    // 通知前端重置节点状态
    this.eventBus.emit('execution.nodes.reset', { targetStatus: 'ready' });
    this.workflowGateway.broadcast('nodesReset', { targetStatus: 'ready' });

    return { success: true };
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
    this.logger.log(`[handleRawStreamData] TRIGGER - About to query state`);
    const snapshot = this.getExecutionSnapshot();
    this.logger.log(`[handleRawStreamData] AFTER query - Status: ${snapshot.status}, ExecutionId: ${snapshot.executionId}, StepIndex: ${snapshot.currentStep?.index}`);

    if (snapshot.status !== 'running') {
      this.logger.warn(`[handleRawStreamData] Filtered: status is not running (${snapshot.status})`);
      return;
    }
    if (!snapshot.executionId || !snapshot.currentStep) {
      this.logger.warn(`[handleRawStreamData] Filtered: missing executionId or currentStep`);
      return;
    }

    const enrichedPayload = {
      executionId: snapshot.executionId,
      stepIndex: snapshot.currentStep.index,
      nodeId: snapshot.currentStep.nodeId,
      data: rawData
    };

    this.logger.log(`[handleRawStreamData] Broadcasting: stepIndex=${enrichedPayload.stepIndex}, nodeId=${enrichedPayload.nodeId}`);
    this.workflowGateway.broadcast('measurementData', enrichedPayload);
  }

  getExecutionSnapshot(): ExecutionSnapshot {
    this.logger.log(`[getExecutionSnapshot] CALLED - Status: ${this._globalState.status}, ExecutionId: ${this._globalState.executionId}, StepIndex: ${this._globalState.currentStep?.index}`);
    return { ...this._globalState };
  }

  private updateState(partial: Partial<ExecutionSnapshot>) {
    this.logger.log(`[updateState] ENTER - this instanceof ExecutionService: ${this instanceof ExecutionService}`);
    this.logger.log(`[updateState] this._globalState === this._globalStateRaw? ${this._globalState === (this as any)._globalStateRaw}`);

    const oldStatus = this._globalState.status;
    const oldExecutionId = this._globalState.executionId;
    const oldStepIndex = this._globalState.currentStep?.index;

    this.logger.log(`[updateState] BEFORE - Status: ${oldStatus}, ExecutionId: ${oldExecutionId}, StepIndex: ${oldStepIndex}`);
    this.logger.log(`[updateState] PARTIAL - ${JSON.stringify(partial)}`);

    this.logger.log(`[updateState] About to call setter manually with: ${JSON.stringify({ ...this._globalState, ...partial, timestamp: new Date() })}`);
    this._globalState = { ...this._globalState, ...partial, timestamp: new Date() };

    const newStatus = this._globalState.status;
    const newExecutionId = this._globalState.executionId;
    const newStepIndex = this._globalState.currentStep?.index;

    this.logger.log(`[updateState] AFTER - Status: ${newStatus}, ExecutionId: ${newExecutionId}, StepIndex: ${newStepIndex}`);

    this.eventBus.emit('execution.state.changed', this._globalState);
  }

  // ==========================================
  // Workflow Execution
  // ==========================================

  async executeWorkflow(workflowId: string | null, nodes?: any[]): Promise<ExecutionResult> {
    this.logger.log(`[executeWorkflow] START - workflowId=${workflowId}, ExecutionService=${this.constructor.name}`);

    let finalWorkflowId = workflowId;

    if (!workflowId) {
      if (!nodes || nodes.length === 0) {
        throw new Error('Cannot create workflow: nodes array is required when workflowId is null');
      }
      const newWorkflow = await this.workflowService.createWorkflow({
        name: `AutoRun_${new Date().toISOString()}`,
        nodes: nodes
      });
      finalWorkflowId = newWorkflow.id;
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const startTime = new Date();
    
    this.executionContexts.set(executionId, {
      workflowId: finalWorkflowId!,
      executionId,
      startTime,
      workflowTimestamp: this.generateTimestamp()
    });

    this.db.prepare(`INSERT INTO executions (id, workflow_id, status, start_time) VALUES (?, ?, 'running', ?)`)
      .run(executionId, finalWorkflowId, startTime.toISOString());

    this.updateState({
      status: 'running',
      workflowId: finalWorkflowId,
      executionId,
      startTime,
      error: null,
      currentStep: { nodeId: null, nodeType: null, index: 0, total: nodes?.length || 0 }
    });

    this.emitWorkflowEvent('started', executionId, finalWorkflowId!);

    try {
      const workflow = await this.workflowService.getWorkflow(finalWorkflowId!);
      this.updateState({
        currentStep: { ...this._globalState.currentStep!, total: workflow.nodes.length }
      });

      const results = await this.executeNodes(executionId, workflow.nodes);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      this.finishExecution(executionId, 'success', endTime, duration);
      
      return { executionId, workflowId: finalWorkflowId!, status: 'success', startTime, endTime, results };

    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMsg = error.message || String(error);

      this.logger.error(`[Execution Failed] ID: ${executionId}, Reason: ${errorMsg}`);
      this.finishExecution(executionId, 'failed', endTime, duration, errorMsg);
      
      return { executionId, workflowId: finalWorkflowId!, status: 'failed', startTime, endTime, error: errorMsg, results: [] };
    } finally {
      this.executionContexts.delete(executionId);
    }
  }

  private async executeNodes(executionId: string, originalNodes: WorkflowNode[]): Promise<any[]> {
    const queue: any[] = originalNodes.map(n => ({ ...n }));
    const completedResults: any[] = [];
    
    let ip = 0; 
    while (ip < queue.length) {
      if (this._globalState.status === 'cancelled') throw new Error('Execution cancelled by user');
      if (this._globalState.status === 'paused') await this.waitForResume();

      const node = queue[ip];
      
      this.updateState({
        currentStep: {
          nodeId: node.id,
          nodeType: node.type,
          index: ip, 
          total: queue.length
        }
      });

      this.emitNodeEvent('started', executionId, node);
      
      try {
        await this.dispatchNodeLogic(executionId, node);
        completedResults.push({ id: node.id, status: 'success' });
        this.emitNodeEvent('completed', executionId, node);
      } catch (e: any) {
        const enhancedError = `Node [${node.type}] Failed: ${e.message}`;
        this.emitNodeEvent('failed', executionId, node, { error: enhancedError });
        throw new Error(enhancedError); 
      }
      
      ip++;
    }

    return completedResults;
  }

  private async dispatchNodeLogic(executionId: string, node: WorkflowNode): Promise<void> {
    const { type, config } = node;
    const params = config || {}; 

    try {
      switch (type) {
        case 'startup': await this.zahnerService.startup(params); break;
        case 'shutdown': await this.zahnerService.shutdown(); break;
        
        case 'change_temperature': 
          await this.furnaceService.autoTemperatureControl({
            target_temperature: params.target_temperature,
            rate: params.rate,
            tolerance: 5, stabilization_time: 30
          }, node.id, executionId);
          break;

        case 'change_gas_flow':
          if (!params.device_selection) throw new Error('Missing device_selection');
          const [addr, gas] = params.device_selection.split(':');
          await this.mfcService.setFlowRateControl({
            device_address: parseInt(addr, 10),
            gas_type: gas,
            target_flow_rate: params.target_flow_rate,
            stabilization_time: 10
          }, node.id, executionId);
          break;

        case 'delay':
          await this.executeDelay(params.duration || 1);
          break;

        default:
          if (this.isMeasurementNodeType(type) || type === 'measurement') {
            const measType = type === 'measurement' ? params.measurement_type : type;
            await this.executeMeasurement(executionId, node, measType);
          }
      }
    } catch (error: any) {
      throw error; 
    }
  }

  private async executeMeasurement(executionId: string, node: WorkflowNode, type: string) {
    const workflowId = this.executionContexts.get(executionId)?.workflowId || 'unknown';
    const workflow = await this.workflowService.getWorkflow(workflowId);
    
    const projectConfig = this.filesService.getProjectConfig(workflow.ownerName, workflow.name, workflow.individualName);
    const outputPath = this.filesService.buildOutputPath({
      base_path: projectConfig?.base_path,
      project_name: workflow.name,
      individual_name: workflow.individualName,
      test_type: projectConfig?.test_type,
      measurement_type: type,
      workflow_id: workflowId,
      workflow_timestamp: this.executionContexts.get(executionId)?.workflowTimestamp
    });

    const params = { ...node.config, output_path: outputPath };
    
    // 执行测量，Python 会负责 WS 流
    await this.zahnerService.performMeasurement(type, params, node.id, executionId);
  }

  private finishExecution(id: string, status: 'success' | 'failed', endTime: Date, duration: number, error?: string) {
    const finalStatus = status === 'success' ? 'completed' : 'failed';
    this.db.prepare(`UPDATE executions SET status = ?, end_time = ?, duration = ?, error = ? WHERE id = ?`)
      .run(finalStatus, endTime.toISOString(), duration, error || null, id);
    
    const wfId = this.executionContexts.get(id)?.workflowId || 'unknown';
    this.emitWorkflowEvent(finalStatus, id, wfId, { error, duration });
    
    this.updateState({ status: finalStatus, duration, error: error || null, currentStep: null });
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
    // 确保 hooks 表存在，即使是空的
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        name TEXT,
        enabled INTEGER,
        rule_json TEXT
      )
    `).run();
  }

  private async executeDelay(seconds: number) {
    this.logger.log(`Delaying ${seconds}s`);
    await new Promise(r => setTimeout(r, seconds * 1000));
  }

  private async waitForResume() {
    while (this._globalState.status === 'paused') {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  private isMeasurementNodeType(t: string): boolean {
    return ['eis_potentiostatic', 'ocp', 'ocp_measurement', 'voltage_ramp', 'current_ramp', 'chronoamperometry'].some(k => t.includes(k));
  }

  private generateTimestamp() { return new Date().toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_'); }

  private emitWorkflowEvent(type: string, eid: string, wfid: string, extra?: any) { 
    this.eventBus.emit(`workflow.${type}`, { executionId: eid, workflowId: wfid, timestamp: new Date(), ...extra });
  }
  private emitNodeEvent(type: string, eid: string, node: any, extra?: any) { 
    this.eventBus.emit(`node.${type}`, { nodeId: node.id, executionId: eid, nodeType: node.type, timestamp: new Date(), ...extra });
  }
  
  async pauseExecution(id: string) { this.updateState({ status: 'paused' }); }
  async resumeExecution(id: string) { this.updateState({ status: 'running' }); }
  async cancelExecution(id: string) { this.updateState({ status: 'cancelled' }); }
  async getExecutionStatus(id: string): Promise<ExecutionStatus> {
      return { executionId: id, workflowId: '', status: 'unknown', startTime: new Date() } as any; 
  }
  getStatus() { return { state: 'running', health: 'healthy', lastCheck: new Date() } as any; }
}