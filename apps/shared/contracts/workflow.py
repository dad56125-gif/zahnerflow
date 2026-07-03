"""
工作流数据契约

统一定义工作流相关的所有数据结构。
基于前端 Interfaces.ts 中实际使用的类型。
"""

from pydantic import Field
from typing import Optional, List, Any
from ._base import ContractModel


# ==================== 基础枚举 ====================

WorkstationType = str  # 'zahner-zennium'

NodeType = str  # 节点类型联合

NodeCategory = str  # 'device' | 'basic_measurement' | 'advanced_measurement' | 'flow_control'

NodeStatus = str  # 'idle' | 'running' | 'paused' | 'cancelling' | 'completed' | 'failed' | 'cancelled'


# ==================== 核心业务实体 ====================

class WorkflowNode(ContractModel):
    """
    工作流节点 — 画布上的一个方块

    代表实验流程中的一个操作步骤。
    """
    id: str = Field(description="唯一标识 (如 node-1)")
    type: NodeType = Field(description="节点类型 (如 eis_potentiostatic)")
    config: dict = Field(default_factory=dict, description="节点参数 (扁平化)")
    group: Optional[dict] = Field(default=None, description="可选分组元数据，不参与节点参数")


class Workflow(ContractModel):
    """
    完整工作流 — 画布上所有节点的有序列表

    代表一个完整的实验流程。
    """
    id: str = Field(description="唯一标识 (如 wf-000008)")
    name: str = Field(description="工作流名称")
    nodes: List[WorkflowNode] = Field(description="节点列表 (顺序即拓扑)")
    ownerName: Optional[str] = Field(default=None, description="创建者")
    project_name: Optional[str] = Field(default=None, description="项目名称")
    individualName: Optional[str] = Field(default=None, description="样品名称 (用于报告)")


# ==================== 执行状态 ====================

class CurrentStep(ContractModel):
    """当前执行步骤"""
    nodeId: Optional[str] = Field(default=None, description="当前节点 ID")
    nodeType: Optional[str] = Field(default=None, description="当前节点类型")
    index: int = Field(description="第几个节点 (共 total 个)")
    total: int = Field(description="节点总数")
    unrolledIndex: Optional[int] = Field(default=None, description="循环展开后的步骤索引")
    unrolledTotal: Optional[int] = Field(default=None, description="展开后的总步骤数")
    iterationPath: Optional[List[dict]] = Field(default=None, description="迭代路径，包含循环节点和迭代次数")
    blockPath: Optional[List[dict]] = Field(default=None, description="工作流块来源路径")
    estimatedSeconds: Optional[float] = Field(default=None, description="当前节点预计时长 (秒)")
    etaSource: Optional[str] = Field(default=None, description="当前节点 ETA 来源: rule / history / fallback / actual")
    etaConfidence: Optional[float] = Field(default=None, description="当前节点 ETA 置信度 (0-1)")


class ExecutionEtaSnapshot(ContractModel):
    """执行 ETA 快照"""
    estimatedTotalSeconds: float = Field(default=0, description="预计总时长 (秒)")
    estimatedRemainingSeconds: float = Field(default=0, description="预计剩余时长 (秒)")
    elapsedSeconds: float = Field(default=0, description="已运行时长 (秒)")
    currentStepEstimatedSeconds: Optional[float] = Field(default=None, description="当前步骤预计时长 (秒)")
    currentStepElapsedSeconds: Optional[float] = Field(default=None, description="当前步骤已运行时长 (秒)")
    source: str = Field(default="fallback", description="ETA 综合来源")
    confidence: float = Field(default=0, description="ETA 综合置信度 (0-1)")
    updatedAt: str = Field(description="ETA 生成时间 (ISO)")


class ExecutionEtaStep(ContractModel):
    """展开后步骤的 ETA 明细"""
    nodeId: Optional[str] = Field(default=None, description="节点 ID")
    nodeType: Optional[str] = Field(default=None, description="节点类型")
    index: int = Field(description="原始节点索引")
    total: int = Field(description="原始节点总数")
    unrolledIndex: int = Field(description="循环展开后的步骤索引")
    unrolledTotal: int = Field(description="展开后的总步骤数")
    iterationPath: List[dict] = Field(default_factory=list, description="迭代路径，包含循环节点和迭代次数")
    blockPath: List[dict] = Field(default_factory=list, description="工作流块来源路径")
    estimatedSeconds: float = Field(default=0, description="预计时长 (秒)")
    etaSource: str = Field(default="fallback", description="ETA 来源")
    etaConfidence: float = Field(default=0, description="ETA 置信度 (0-1)")
    etaSampleCount: int = Field(default=0, description="历史样本数")
    paramsHash: str = Field(description="持续时间相关参数指纹")


class WorkflowEtaEstimate(ContractModel):
    """执行前工作流 ETA 预估"""
    workflowId: Optional[str] = Field(default=None, description="工作流 ID")
    nodeCount: int = Field(description="原始节点数量")
    unrolledStepCount: int = Field(description="循环展开后的步骤数量")
    eta: ExecutionEtaSnapshot = Field(description="整体 ETA 快照")
    steps: List[ExecutionEtaStep] = Field(default_factory=list, description="展开后步骤 ETA 明细")


class ExecutionSnapshot(ContractModel):
    """
    执行快照 — 工作流正在跑时的进度状态

    后端每隔一段时间推送一次，告诉你跑到哪了。
    """
    status: NodeStatus = Field(description="整体状态")
    workflowId: Optional[str] = Field(default=None, description="工作流 ID")
    executionId: Optional[str] = Field(default=None, description="执行 ID")
    workflowName: Optional[str] = Field(default=None, description="工作流名称")
    ownerName: Optional[str] = Field(default=None, description="执行用户")
    workstationType: Optional[WorkstationType] = Field(default=None, description="工作站类型")
    nodes: List[WorkflowNode] = Field(default_factory=list, description="正在执行的工作流节点")
    currentStep: Optional[CurrentStep] = Field(default=None, description="当前步骤")
    startTime: Optional[str] = Field(default=None, description="开始时间 (ISO)")
    endTime: Optional[str] = Field(default=None, description="结束时间 (ISO)")
    duration: float = Field(default=0, description="已运行时长 (秒)")
    eta: Optional[ExecutionEtaSnapshot] = Field(default=None, description="运行时间估算")
    error: Optional[str] = Field(default=None, description="错误信息")
    timestamp: str = Field(description="快照时间")
    results: Optional[List[Any]] = Field(default=None, description="节点执行结果")


# ==================== WebSocket 事件载体 ====================

class NodeStatusUpdate(ContractModel):
    """
    节点状态更新事件

    某个节点的状态变化时推送。
    """
    workflowId: str = Field(description="工作流 ID")
    nodeId: str = Field(description="节点 ID")
    status: str = Field(description="新状态")
    data: Optional[Any] = Field(default=None, description="附加数据")
    timestamp: str = Field(description="时间")


class NodesResetEvent(ContractModel):
    """
    节点重置事件

    用户点了"停止"或"重置"时推送。
    """
    targetStatus: str = Field(description="重置成什么状态")
    timestamp: str = Field(description="时间")
    message: str = Field(description="提示信息")


class LoopIterationEvent(ContractModel):
    """
    循环迭代事件

    工作流里有循环时，每次迭代推送一次。
    """
    loopStartIndex: int = Field(description="循环起始节点索引")
    iteration: int = Field(description="当前第几次迭代")
    totalIterations: int = Field(description="总共要迭代几次")
    nodeIndices: List[int] = Field(description="循环体包含的节点索引")


# ==================== 流数据 ====================

class RawStreamData(ContractModel):
    """
    原始测量流数据

    后端实时推送的电压/电流/时间数据点。
    """
    t: float = Field(description="时间 (秒)")
    v: float = Field(description="电压 (V)")
    i: float = Field(description="电流 (A)")


class EnrichedStreamData(ContractModel):
    """
    带上下文的流数据

    在 RawStreamData 基础上附加了执行上下文。
    """
    executionId: str = Field(description="执行 ID")
    stepIndex: int = Field(description="步骤索引")
    nodeId: str = Field(description="节点 ID")
    data: RawStreamData = Field(description="原始数据")
