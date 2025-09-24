import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';
import { ExecutionNotificationService } from './execution-notification.service';

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '1.1.0';
  readonly dependencies = [];

  protected logger = new Logger(ExecutionService.name);
  private executionCounter = 0;
  private currentExecutionId: string | null = null;
  private currentNodeId: string | null = null;

  constructor(
    protected readonly zahnerService: ZahnerZenniumService,
    protected readonly workflowService: WorkflowService,
    protected readonly eventBus: SimpleEventBus,
    protected readonly executionNotificationService: ExecutionNotificationService,
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
  }

  private setupDeviceEventListeners(): void {
    // 监听测量完成事件，发送节点完成通知
    this.eventBus.on('measurement.completed').subscribe((event) => {
      this.logger.log('收到设备measurement.completed事件，发送节点完成通知', {
        measurementType: event.data.measurementType
      });

      // 从事件上下文中获取节点信息
      const nodeId = event.data.context?.nodeId || this.getCurrentNodeId();
      const executionId = event.data.context?.executionId || this.getCurrentExecutionId();

      // 发送节点完成通知
      this.eventBus.emit('node.completed', {
        nodeId,
        executionId,
        nodeType: event.data.measurementType,
        result: event.data.result,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      // 发送工作流节点完成通知
      this.eventBus.emit('workflow.node.completed', {
        nodeId,
        executionId,
        result: event.data.result,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.logger.log('发送 workflow.node.completed 事件', {
        nodeId,
        executionId,
        result: event.data.result
      });
    });

    // 监听测量失败事件，发送节点失败通知
    this.eventBus.on('measurement.failed').subscribe((event) => {
      this.logger.error('收到设备measurement.failed事件，发送节点失败通知', {
        measurementType: event.data.measurementType,
        error: event.data.error
      });

      const nodeId = event.data.context?.nodeId || this.getCurrentNodeId();
      const executionId = event.data.context?.executionId || this.getCurrentExecutionId();

      this.eventBus.emit('node.failed', {
        nodeId,
        executionId,
        error: event.data.error,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.eventBus.emit('workflow.node.failed', {
        nodeId,
        executionId,
        error: event.data.error,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      this.logger.error('发送 workflow.node.failed 事件', {
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

      this.logger.log(`获取到工作流定义: ${workflowId}`, {
        nodesCount: workflow.definition.nodes?.length || 0,
        hasNodes: !!(workflow.definition.nodes && workflow.definition.nodes.length > 0)
      });

      const completedNodes = await this.executeNodes(executionId, workflow);
      const duration = Date.now() - startTime;

      // 发送执行完成通知
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, true, duration);

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
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, false, duration);

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
    }
  }

  private async executeNodes(executionId: string, workflowDefinition: any): Promise<string[]> {
    const nodes = workflowDefinition.definition.nodes || [];
    const totalNodes = nodes.length;
    const completedNodes: string[] = [];

    this.logger.log(`执行工作流节点 - 总节点数: ${totalNodes}`);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      this.currentNodeId = node.id; // 设置当前节点ID

      this.logger.log(`开始执行节点 ${i + 1}/${totalNodes}: ${node.id} (类型: ${node.type})`);

      // 事件驱动架构：发送节点开始事件
      this.eventBus.emit('node.started', {
        nodeId: node.id,
        executionId,
        nodeType: node.type,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      await this.executeNode(executionId, node);
      completedNodes.push(node.id);

      this.logger.log(`完成执行节点: ${node.id}`);

      // 事件驱动架构：发送节点完成事件
      this.eventBus.emit('node.completed', {
        nodeId: node.id,
        executionId,
        nodeType: node.type,
        result: true,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });
    }

    this.logger.log(`工作流节点执行完成 - 完成节点数: ${completedNodes.length}/${totalNodes}`);
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
        this.logger.warn(`Unknown node type: ${nodeType}`);
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
    this.logger.log(`Executing delay node ${node.id} for ${delayMs}ms`);

    await new Promise(resolve => setTimeout(resolve, delayMs));
    this.logger.log(`Delay completed for node ${node.id}`);
  }

  private async executeLoopStart(executionId: string, node: any): Promise<void> {
    const parameters = node.data?.parameters || {};
    this.logger.log(`Loop start: ${parameters.loop_id}, count: ${parameters.loop_count}`);
    // 循环逻辑在工作流层面处理，这里只记录日志
  }

  private async executeLoopEnd(executionId: string, node: any): Promise<void> {
    const parameters = node.data?.parameters || {};
    this.logger.log(`Loop end: ${parameters.loop_id}`);
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
}