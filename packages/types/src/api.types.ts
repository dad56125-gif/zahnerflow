// API相关类型定义
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// 工作流相关类型 - 前后端共享
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  workstation: WorkstationType;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;

  // 后端管理字段（前端可选）
  ownerName?: string;
  individualName?: string;
}

// 工作流定义 - 前后端共享核心结构
export interface WorkflowDefinition {
  // 核心标识
  id: string;
  name: string;
  description?: string;
  version: number;

  // 工作流结构
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // 可选参数
  parameters?: Record<string, any>;

  // 后端管理字段（前端可选）
  ownerName?: string;
  individualName?: string;
}

// 节点状态类型 - 前后端共享
export type NodeStatus = 'ready' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'pending';

// 工作流节点 - 前后端共享
export interface WorkflowNode {
  // 核心标识
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };

  // 数据和配置（前后端通用）
  data?: any;  // 前端用户数据，后端可读取
  config?: any;  // 后端执行配置，前端可设置

  // 状态管理（主要用于前端）
  status?: NodeStatus;
}

// 工作流连接 - 前后端共享
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// 工作流状态 - 前后端共享
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed';

// 设备相关类型
export type WorkstationType = 'zahner-zennium';

export interface DeviceConfiguration {
  id: string;
  type: WorkstationType;
  name: string;
  parameters: DeviceParameters;
  calibration: any;
  safety: any;
}

export interface DeviceParameters {
  // Zahner Zennium 特定参数
  thalesMode?: 'standard' | 'advanced';
  impedanceRange?: string;
  potentiostatMode?: 'potentiostatic' | 'galvanostatic';
  
  // PP242 特定参数
  frameworkMode?: 'standard' | 'custom';
  echemVersion?: string;
  
  // 通用参数
  samplingRate: number;
  dataBuffer: number;
  timeout: number;
}

export interface Device {
  id: string;
  type: WorkstationType;
  name: string;
  status: ApiDeviceStatus;
  isConnected: boolean;
  lastSeen: Date;
}

export type ApiDeviceStatus = 'online' | 'offline' | 'error' | 'maintenance';

// 执行相关类型
export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  currentNode?: string;
  completedNodes: string[];
  results?: ExecutionResult;
}

export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}


// 模块状态类型
export interface ModuleStatus {
  state: 'initialized' | 'running' | 'stopped' | 'error';
  health: 'good' | 'warning' | 'error';
  lastCheck: Date;
}

// 用户相关类型
export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'operator' | 'viewer';

// WebSocket事件类型
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

export interface ExecutionUpdateMessage {
  executionId: string;
  status: ExecutionStatus;
  currentNode?: string;
  progress?: number;
  error?: string;
}

// 通知系统类型定义
export enum UserNotificationLevel {
  SYSTEM = 'system',
  WORKFLOW = 'workflow',
  DEVICE = 'device',
  OPERATION = 'operation',
  ERROR = 'error'
}

export enum DebugNotificationLevel {
  EXECUTION_DETAIL = 'execution_detail',
  STATE_CHANGE = 'state_change',
  NETWORK = 'network',
  PERFORMANCE = 'performance',
  INTERNAL = 'internal'
}

export interface NotificationMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  sourceFile: string;
  sourceFunction: string;
  details?: string;
  timestamp: Date;
  executionId: string;
  level: UserNotificationLevel | DebugNotificationLevel;
  layerTrace: string;
}

export type NotificationLevel = UserNotificationLevel | DebugNotificationLevel;