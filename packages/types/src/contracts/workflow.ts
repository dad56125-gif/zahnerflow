/**
 * 工作流数据契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/workflow.py
 */

export interface WorkflowNode {
  /** 唯一标识 (如 node-1) */
  id: string;
  /** 节点类型 (如 eis_potentiostatic) */
  type: string;
  /** 节点参数 (扁平化) */
  config?: Record<string, any>;
  /** 可选分组元数据，不参与节点参数 */
  group?: Record<string, any> | null;
}

export interface Workflow {
  /** 唯一标识 (如 wf-000008) */
  id: string;
  /** 工作流名称 */
  name: string;
  /** 节点列表 (顺序即拓扑) */
  nodes: WorkflowNode[];
  /** 创建者 */
  ownerName?: string | null;
  /** 项目名称 */
  projectName?: string | null;
  /** 样品名称 (用于报告) */
  individualName?: string | null;
}

export interface CurrentStep {
  /** 当前节点 ID */
  nodeId?: string | null;
  /** 当前节点类型 */
  nodeType?: string | null;
  /** 第几个节点 (共 total 个) */
  index: number;
  /** 节点总数 */
  total: number;
  /** 循环展开后的步骤索引 */
  unrolledIndex?: number | null;
  /** 展开后的总步骤数 */
  unrolledTotal?: number | null;
  /** 迭代路径，包含循环节点和迭代次数 */
  iterationPath?: Record<string, any>[] | null;
  /** 工作流块来源路径 */
  blockPath?: Record<string, any>[] | null;
  /** 当前节点预计时长 (秒) */
  estimatedSeconds?: number | null;
  /** 当前节点 ETA 来源: rule / history / fallback / actual */
  etaSource?: string | null;
  /** 当前节点 ETA 置信度 (0-1) */
  etaConfidence?: number | null;
}

export interface ExecutionEtaSnapshot {
  /** 预计总时长 (秒) */
  estimatedTotalSeconds?: number;
  /** 预计剩余时长 (秒) */
  estimatedRemainingSeconds?: number;
  /** 已运行时长 (秒) */
  elapsedSeconds?: number;
  /** 当前步骤预计时长 (秒) */
  currentStepEstimatedSeconds?: number | null;
  /** 当前步骤已运行时长 (秒) */
  currentStepElapsedSeconds?: number | null;
  /** ETA 综合来源 */
  source?: string;
  /** ETA 综合置信度 (0-1) */
  confidence?: number;
  /** ETA 生成时间 (ISO) */
  updatedAt: string;
}

export interface ExecutionEtaStep {
  /** 节点 ID */
  nodeId?: string | null;
  /** 节点类型 */
  nodeType?: string | null;
  /** 原始节点索引 */
  index: number;
  /** 原始节点总数 */
  total: number;
  /** 循环展开后的步骤索引 */
  unrolledIndex: number;
  /** 展开后的总步骤数 */
  unrolledTotal: number;
  /** 迭代路径，包含循环节点和迭代次数 */
  iterationPath?: Record<string, any>[];
  /** 工作流块来源路径 */
  blockPath?: Record<string, any>[];
  /** 预计时长 (秒) */
  estimatedSeconds?: number;
  /** ETA 来源 */
  etaSource?: string;
  /** ETA 置信度 (0-1) */
  etaConfidence?: number;
  /** 历史样本数 */
  etaSampleCount?: number;
  /** 持续时间相关参数指纹 */
  paramsHash: string;
}

export interface WorkflowEtaEstimate {
  /** 工作流 ID */
  workflowId?: string | null;
  /** 原始节点数量 */
  nodeCount: number;
  /** 循环展开后的步骤数量 */
  unrolledStepCount: number;
  /** 整体 ETA 快照 */
  eta: ExecutionEtaSnapshot;
  /** 展开后步骤 ETA 明细 */
  steps?: ExecutionEtaStep[];
}

export interface ExecutionStartRequest {
  /** 本次执行的画布节点 */
  nodes?: WorkflowNode[];
  /** 可选工作流 ID，仅在不传节点时读取归档定义 */
  workflowId?: string | null;
  /** 执行用户 */
  ownerName?: string | null;
  /** 工作流名称建议 */
  workflowName?: string | null;
  /** 工作站类型 */
  workstationType?: string | null;
  /** 自动启动程序配置 */
  autoStartupConfig?: Record<string, any>;
  /** 本次执行的文件路径配置 */
  pathConfig?: Record<string, any>;
  /** 缺少用户/项目/样品名时是否强制启动 */
  forceStartWithMissingRunMetadata?: boolean;
  /** 从第几个展开步骤开始执行，0 为从头开始 */
  startFromUnrolledIndex?: number;
}

export interface UnrolledWorkflowStep {
  /** 展开后节点 ID */
  nodeId: string;
  /** 展开后节点类型 */
  nodeType: string;
  /** 父工作流原始节点索引 */
  originalIndex: number;
  /** 节点在来源工作流中的索引 */
  sourceIndex?: number | null;
  /** 展开后步骤索引 */
  unrolledIndex: number;
  /** 展开后总步骤数 */
  unrolledTotal: number;
  /** 循环迭代路径 */
  iterationPath?: Record<string, any>[];
  /** 循环上下文栈 */
  loopContextStack?: number[];
  /** 循环嵌套深度 */
  loopDepth?: number;
  /** 工作流块来源路径 */
  blockPath?: Record<string, any>[];
  /** 实际执行节点快照 */
  node?: Record<string, any>;
  /** 高级节点父节点 ID */
  parentNodeId?: string | null;
  /** 高级节点父类型 */
  parentNodeType?: string | null;
  /** 高级节点内部步骤索引 */
  stepIndex?: number | null;
  /** 高级节点内部总步骤数 */
  totalSteps?: number | null;
  /** 高级节点当前步设定值 */
  stepValue?: number | null;
  /** 切换类高级节点周期索引 */
  cycleIndex?: number | null;
  /** 是否为自动启动/停止边界 */
  autoBoundary?: boolean | null;
}

export interface WorkflowUnrollPreview {
  /** 原始节点数量 */
  nodeCount: number;
  /** 展开后步骤 */
  steps?: UnrolledWorkflowStep[];
  /** 展开摘要 */
  summary?: Record<string, any>;
}

export interface ExecutionSnapshot {
  /** 整体状态 */
  status: string;
  /** 工作流 ID */
  workflowId?: string | null;
  /** 执行 ID */
  executionId?: string | null;
  /** 工作流名称 */
  workflowName?: string | null;
  /** 执行用户 */
  ownerName?: string | null;
  /** 工作站类型 */
  workstationType?: string | null;
  /** 正在执行的工作流节点 */
  nodes?: WorkflowNode[];
  /** 当前步骤 */
  currentStep?: CurrentStep | null;
  /** 开始时间 (ISO) */
  startTime?: string | null;
  /** 结束时间 (ISO) */
  endTime?: string | null;
  /** 已运行时长 (秒) */
  duration?: number;
  /** 运行时间估算 */
  eta?: ExecutionEtaSnapshot | null;
  /** 错误信息 */
  error?: string | null;
  /** 快照时间 */
  timestamp: string;
  /** 节点执行结果 */
  results?: any[] | null;
}

export interface NodeStatusUpdate {
  /** 工作流 ID */
  workflowId: string;
  /** 节点 ID */
  nodeId: string;
  /** 新状态 */
  status: string;
  /** 附加数据 */
  data?: any | null;
  /** 时间 */
  timestamp: string;
}

export interface NodesResetEvent {
  /** 重置成什么状态 */
  targetStatus: string;
  /** 时间 */
  timestamp: string;
  /** 提示信息 */
  message: string;
}

export interface LoopIterationEvent {
  /** 循环起始节点索引 */
  loopStartIndex: number;
  /** 当前第几次迭代 */
  iteration: number;
  /** 总共要迭代几次 */
  totalIterations: number;
  /** 循环体包含的节点索引 */
  nodeIndices: number[];
}

export interface RawStreamData {
  /** 时间 (秒) */
  t: number;
  /** 电压 (V) */
  v: number;
  /** 电流 (A) */
  i: number;
}

export interface EnrichedStreamData {
  /** 执行 ID */
  executionId: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 节点 ID */
  nodeId: string;
  /** 原始数据 */
  data: RawStreamData;
}

/** 工作站类型 */
export type WorkstationType = 'zahner-zennium';

/** 节点类型 */
export type NodeType =
  | 'startup' | 'shutdown'
  | 'change_temperature' | 'change_gas_flow'
  | 'eis_potentiostatic' | 'eis_galvanostatic'
  | 'ocp_measurement'
  | 'chronoamperometry' | 'chronopotentiometry'
  | 'voltage_ramp' | 'current_ramp'
  | 'galvanostatic_switching' | 'potentiostatic_switching'
  | 'galvanostatic_step_ramp' | 'potentiostatic_step_ramp'
  | 'loop_start' | 'loop_end' | 'wait_delay' | 'scheduled_start' | 'workflow_block';

/** 节点分类 */
export type NodeCategory = 'device' | 'basic_measurement' | 'advanced_measurement' | 'flow_control';

/** 节点状态 */
export type NodeStatus = 'idle' | 'running' | 'paused' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
