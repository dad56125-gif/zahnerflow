// ==================== 1. 基础枚举与类型 ====================
export type WorkstationType = 'zahner-zennium' | 'simulator';

export type NodeCategory = 'device' | 'basic_measurement' | 'flow_control';

// 节点状态枚举 (原 NodeStatus)
export type NodeStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type NodeType =
  | 'startup' | 'shutdown'
  | 'change_temperature' | 'change_gas_flow'
  | 'eis_potentiostatic' | 'eis_galvanostatic'
  | 'ocp_measurement' | 'chronoamperometry' | 'chronopotentiometry'
  | 'voltage_ramp' | 'current_ramp' | 'lsv_measurement'
  | 'loop_start' | 'loop_end' | 'wait_delay';

// ==================== 2. 静态配置 (Metadata) ====================
// 用于 NodeConfiguration.ts
export interface NodeConfig {
  type: NodeType;
  name: string;
  category: NodeCategory;
  description: string;
  icon: string;
  defaultParameters?: Record<string, any>;
}

// ==================== 3. 核心业务实体 (Workflow/Node) ====================
// 前端 Store / 后端 API / 数据库 统一使用的结构
export interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, any>; // 扁平化参数，原 data.parameters
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[]; // 顺序即拓扑
  // 可选的元数据字段
  ownerName?: string;
  project_name?: string;
}

// ==================== 4. 物理/流数据 (Stream Data) ====================
export interface RawStreamData {
  t: number; v: number; i: number;
}

export interface EnrichedStreamData {
  executionId: string;
  stepIndex: number;
  nodeId: string;
  data: RawStreamData;
}

// ==================== 5. 执行状态与快照 (Execution State) ====================
export interface ExecutionSnapshot {
  status: NodeStatus;
  workflowId: string | null;
  executionId: string | null;
  currentStep: {
    nodeId: string | null;
    nodeType: string | null;
    index: number;
    total: number;
  } | null;
  startTime: string | null;
  endTime?: string;  // 新增：执行结束时间
  duration: number;
  error: string | null;
  timestamp: string;
  results?: any[];  // 新增：节点执行结果
}

// ==================== 6. WebSocket 消息载体 (Notifications) ====================
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