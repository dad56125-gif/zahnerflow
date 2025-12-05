// ==================== 1. 物理/流数据 ====================
export interface RawStreamData {
  t: number; v: number; i: number;
}

export interface EnrichedStreamData {
  executionId: string;
  stepIndex: number;
  nodeId: string;
  data: RawStreamData;
}

// ==================== 2. 全局/快照状态 ====================
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
  startTime: string | null; // JSON传输后是string
  duration: number;
  error: string | null;
  timestamp: string;
}

// ==================== 3. WebSocket 消息载体 ====================
export interface NodeStatusUpdate {
  workflowId: string;
  nodeId: string;
  status: string;
  data?: any;
  timestamp: string;
}

export interface NodesResetEvent {
  targetStatus: string;
  timestamp: string;
  message: string;
}

export interface NotificationMessage {
  id?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

// ==================== 4. 业务实体 (Workflow/Execution) ====================
export interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
  // 前端特有扩展字段 (可选)
  project_name?: string;
  status?: string;
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: string;
  startTime: string;
  endTime?: string;
  results?: any[];
}