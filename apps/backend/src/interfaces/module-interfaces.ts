// src/interfaces/module-interfaces.ts

// ==========================================
// 1. 物理层数据 (Python -> NestJS)
// ==========================================
export interface RawStreamData {
  t: number; // 时间 (s)
  v: number; // 电压 (V)
  i: number; // 电流 (A)
}

// ==========================================
// 2. 业务层数据 (NestJS -> Frontend)
// ==========================================
export interface EnrichedStreamData {
  executionId: string; // 批次号，防止混淆旧数据
  stepIndex: number;   // 核心过滤键：当前是第几步？
  nodeId: string;      // 辅助校验
  data: RawStreamData; // 物理载荷
}

// ==========================================
// 3. 通用状态定义
// ==========================================

export type RunState = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'success';

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
// 4. 状态快照 (用于 System State)
// ==========================================
export interface ExecutionSnapshot {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  workflowId: string | null;
  executionId: string | null;
  currentStep: {
    nodeId: string | null;
    nodeType: string | null;
    index: number; // 前端组件用这个 index 与 EnrichedStreamData.stepIndex 比对
    total: number;
  } | null;
  startTime: Date | null;
  duration: number;
  error: string | null;
  timestamp: Date;
}

// ==========================================
// 2. 核心业务数据模型 (Workflow)
// ==========================================

export interface WorkflowNode {
  id: string;
  type: string;
  // name 移除
  // position 移除
  config: Record<string, any>; // 统一参数存放处
}

// 单一数据源：DB存储结构 = 业务传输对象
export interface Workflow {
  id: string;
  name: string;
  ownerName?: string;
  individualName?: string;
  nodes: WorkflowNode[];
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// 3. 执行结果定义 (Execution)
// ==========================================

export interface ExecutionBase {
  executionId: string;
  workflowId: string;
  status: RunState;
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export interface ExecutionStatus extends ExecutionBase {
  currentNode?: string;
  completedNodes?: string[];
  progress?: number;
}

export interface ExecutionResult extends ExecutionBase {
  results?: Record<string, any>[];
}

// ==========================================
// 4. 测量与校准
// ==========================================

export interface MeasurementResult {
  success: boolean;
  data: any;
  metadata: {
    timestamp: Date;
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
// 5. 模块行为接口
// ==========================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IModuleInterface {
  name: string;
  version: string;
  dependencies: string[];
  getStatus(): ModuleStatus;
}

export interface IExecutionModule extends IModuleInterface {
  // 支持直接传入 nodes 进行执行（Create-if-Null 模式）
  executeWorkflow(workflowId: string | null, nodes?: WorkflowNode[]): Promise<ExecutionResult>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;
}

export interface IWorkflowModule extends IModuleInterface {
  // 创建只需要核心数据，ID和时间由后端生成
  createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow>;
  
  updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  getWorkflow(id: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  validateWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): ValidationResult;
}