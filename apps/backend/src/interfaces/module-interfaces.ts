// 模块间接口规范定义

export interface IModuleInterface {
  name: string;
  version: string;
  dependencies: string[];
  getStatus(): ModuleStatus;
}

export interface ModuleStatus {
  state: 'initialized' | 'running' | 'stopped' | 'error';
  health: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  error?: string;
}

export interface IExecutionModule extends IModuleInterface {
  executeWorkflow(workflowId: string): Promise<ExecutionResult>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
}

export interface IWorkflowModule extends IModuleInterface {
  createWorkflow(definition: WorkflowDefinition): Promise<Workflow>;
  updateWorkflow(id: string, definition: WorkflowDefinition): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  validateWorkflow(definition: WorkflowDefinition): ValidationResult;
}

export interface IPrecheckModule extends IModuleInterface {
  checkWorkstation(workstationId: string): Promise<PrecheckResult>;
  batchCheckWorkstations(workstationIds: string[]): Promise<PrecheckResult[]>;
  getRealtimeStatus(workstationId: string): Promise<RealtimeStatus>;
}

export interface IZahnerZenniumModule extends IModuleInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeMeasurement(measurement: any): Promise<any>;
  calibrate(): Promise<any>;
  checkConnection(): Promise<boolean>;
}

export interface IPP242Module extends IModuleInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeMeasurement(measurement: any): Promise<any>;
  calibrate(): Promise<any>;
  checkConnection(): Promise<boolean>;
}

export interface IConfigModule extends IModuleInterface {
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface IUtilsModule extends IModuleInterface {
  formatData(data: any, format: string): string;
  parseData(data: string, format: string): any;
  generateId(): string;
  formatDate(date: Date): string;
  parseDate(dateString: string): Date;
}

// 数据类型定义
export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'failed' | 'running' | 'paused';
  startTime: Date;
  endTime?: Date;
  error?: string;
  results?: any[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  /**
   * 工作流归属人与自定义名，用于目录组织与检索。
   * 在无鉴权场景下从请求体直接透传。
   */
  ownerName?: string;
  individualName?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  config: any;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  /**
   * 归属信息在顶层冗余一份，便于列表页与存储索引使用。
   */
  ownerName?: string;
  individualName?: string;
  definition: WorkflowDefinition;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PrecheckResult {
  workstationId: string;
  status: 'ready' | 'warning' | 'error';
  confidence: number;
  issues: string[];
  recommendations: string[];
  lastCheck: Date;
}

export interface RealtimeStatus {
  workstationId: string;
  connected: boolean;
  busy: boolean;
  lastActivity: Date;
  performance: {
    cpu: number;
    memory: number;
    network: number;
  };
}

export interface Measurement {
  type: string;
  parameters: any;
  config: any;
}

export interface MeasurementResult {
  success: boolean;
  data: any;
  metadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    device: string;
    measurement_type?: string;
  };
  error?: string;
}

export interface DeviceStatus {
  connected: boolean;
  busy: boolean;
  error?: string;
  lastActivity: Date;
  capabilities: string[];
}

export interface CalibrationResult {
  success: boolean;
  timestamp: Date;
  parameters: any;
  error?: string;
}

export interface ExecutionStatus {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  currentNode: string;
  completedNodes: string[];
  nodeResults?: Map<string, any>;
  error?: string;
  startTime: Date;
  endTime?: Date;
  progress: number;
}
