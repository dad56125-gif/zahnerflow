// API通信协议类型定义

// API响应格式
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

// 工作流核心类型 - API协议层
export interface Workflow {
  id: string;
  name: string;
  definition: WorkflowDefinition;
  workstation: WorkstationType;
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;

  // 后端管理字段
  ownerName?: string;
  individualName?: string;
}

// 工作流定义 - API协议层
export interface WorkflowDefinition {
  // 核心标识
  id: string;
  name: string;
  version: number;

  // 工作流结构
  nodes: WorkflowNode[];

  // 可选参数
  parameters?: Record<string, any>;

  // 后端管理字段
  ownerName?: string;
  individualName?: string;
}

// 工作流节点 - API协议层
export interface WorkflowNode {
  // 核心标识
  id: string;
  type: string;
  name: string;

  // 数据和配置
  data?: any;  // 用户数据
  config?: any;  // 执行配置

  // 状态管理
  status?: NodeStatus;
}

// 节点状态类型
export type NodeStatus = 'ready' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'pending';

// 工作流状态
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed';

// 设备相关类型
export type WorkstationType = 'zahner-zennium';

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
  results?: {
    success: boolean;
    data?: any;
    error?: string;
    duration?: number;
  };
}

export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

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

// 通知系统类型
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