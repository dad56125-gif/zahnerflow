// src/interfaces/module-interfaces.ts

// ==========================================
// 1. 基础状态定义
// ==========================================

export interface ModuleStatus {
  state: 'initialized' | 'running' | 'stopped' | 'error';
  health: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  error?: string;
}

export interface DeviceStatus {
  connected: boolean;
  busy: boolean;
  error?: string;
  lastActivity: Date;
  capabilities: string[];
}

// ==========================================
// 2. 核心业务数据模型 (Data Models)
// ==========================================

// 工作流定义 (对应 JSON 结构)
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  ownerName?: string;
  individualName?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
}

// 工作流实例 (对应 DB 记录)
export interface Workflow {
  id: string;
  name: string;
  description: string;
  ownerName?: string;
  individualName?: string;
  definition: WorkflowDefinition;
  version: number;
  createdAt: Date;
  updatedAt: Date;
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

// ==========================================
// 3. 执行结果定义
// ==========================================

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'failed' | 'running' | 'paused';
  startTime: Date;
  endTime?: Date;
  error?: string;
  results?: any[];
}

export interface ExecutionStatus {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  currentNode?: string;     // 可选
  completedNodes?: string[]; // 可选
  error?: string;
  startTime: Date;
  endTime?: Date;
  progress?: number;
}

// ==========================================
// 4. 测量与校准 (Zahner 专用)
// ==========================================

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

export interface CalibrationResult {
  success: boolean;
  timestamp: Date;
  parameters: any;
  error?: string;
}

// ==========================================
// 5. 模块行为接口 (只保留核心)
// ==========================================

export interface IModuleInterface {
  name: string;
  version: string;
  dependencies: string[];
  getStatus(): ModuleStatus;
}

export interface IExecutionModule extends IModuleInterface {
  executeWorkflow(workflowId: string): Promise<ExecutionResult>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>; // 返回值类型放宽
}

export interface IWorkflowModule extends IModuleInterface {
  createWorkflow(definition: WorkflowDefinition): Promise<Workflow>;
  updateWorkflow(id: string, definition: WorkflowDefinition): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  validateWorkflow(definition: WorkflowDefinition): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}