"""
数据契约 — Pydantic Model 作为唯一真相源

此目录下的 .py 文件定义了前后端共享的所有数据结构。
Python 后端直接使用这些 Model，TypeScript 前端通过代码生成器自动产生对应类型。

维护规则：
1. 修改类型时只需改此处的 Pydantic Model
2. 运行 `python -m shared.contracts.generate` 重新生成 TypeScript 类型
3. 勿手动修改生成的 .d.ts 文件
"""

from .furnace import (
    FurnaceStatus,
    ProgramSegment,
    FurnacePreset,
    FurnaceConnectRequest,
    FurnaceConfig,
    SegmentProgress,
)
from .mfc import (
    MfcDeviceInfo,
    MfcStatus,
    MfcSetpointRequest,
    MfcScanRequest,
)
from .workflow import (
    WorkstationType,
    NodeType,
    NodeCategory,
    NodeStatus,
    WorkflowNode,
    Workflow,
    IterationPathEntry,
    CurrentStep,
    ExecutionEtaSnapshot,
    ExecutionEtaStep,
    WorkflowEtaEstimate,
    ExecutionSnapshot,
    NodeStatusUpdate,
    NodesResetEvent,
    LoopIterationEvent,
    RawStreamData,
    EnrichedStreamData,
    EisResultData,
    EnrichedEisData,
)
from .common import (
    DeviceConnectionStatus,
    DeviceError,
    LogEntry,
    LogEntryType,
    ChartDataPoint,
    NotificationMessage,
    HistoryQueryParams,
)
from .events import (
    DEVICE_STATUS_UPDATE,
    RUNTIME_CONNECTED,
    RUNTIME_JOIN_WORKFLOW,
    RUNTIME_LEAVE_WORKFLOW,
    RUNTIME_JOINED_WORKFLOW,
    RUNTIME_LEFT_WORKFLOW,
    WORKFLOW_NODE_STATUS,
    WORKFLOW_SNAPSHOT,
    WORKFLOW_MEASUREMENT,
    WORKFLOW_EIS,
    WORKFLOW_LOOP_START,
    WORKFLOW_LOOP_END,
    WORKFLOW_NODES_RESET,
    WORKFLOW_NOTIFICATION,
    WORKFLOW_EXECUTION_FINISHED,
)
from .runtime_device import RuntimeDeviceState, RuntimeDeviceStatusEnvelope

__all__ = [
    "FurnaceStatus",
    "ProgramSegment",
    "FurnacePreset",
    "FurnaceConnectRequest",
    "FurnaceConfig",
    "SegmentProgress",
    "MfcDeviceInfo",
    "MfcStatus",
    "MfcSetpointRequest",
    "MfcScanRequest",
    "WorkstationType",
    "NodeType",
    "NodeCategory",
    "NodeStatus",
    "WorkflowNode",
    "Workflow",
    "IterationPathEntry",
    "CurrentStep",
    "ExecutionEtaSnapshot",
    "ExecutionEtaStep",
    "WorkflowEtaEstimate",
    "ExecutionSnapshot",
    "NodeStatusUpdate",
    "NodesResetEvent",
    "LoopIterationEvent",
    "RawStreamData",
    "EnrichedStreamData",
    "EisResultData",
    "EnrichedEisData",
    "DeviceConnectionStatus",
    "DeviceError",
    "LogEntry",
    "LogEntryType",
    "ChartDataPoint",
    "NotificationMessage",
    "HistoryQueryParams",
    "DEVICE_STATUS_UPDATE",
    "RUNTIME_CONNECTED",
    "RUNTIME_JOIN_WORKFLOW",
    "RUNTIME_LEAVE_WORKFLOW",
    "RUNTIME_JOINED_WORKFLOW",
    "RUNTIME_LEFT_WORKFLOW",
    "WORKFLOW_NODE_STATUS",
    "WORKFLOW_SNAPSHOT",
    "WORKFLOW_MEASUREMENT",
    "WORKFLOW_EIS",
    "WORKFLOW_LOOP_START",
    "WORKFLOW_LOOP_END",
    "WORKFLOW_NODES_RESET",
    "WORKFLOW_NOTIFICATION",
    "WORKFLOW_EXECUTION_FINISHED",
    "RuntimeDeviceState",
    "RuntimeDeviceStatusEnvelope",
]
