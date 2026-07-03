"""
WebSocket 事件名常量

前后端统一引用这些常量，避免硬编码字符串导致的命名不一致。
"""

# === Device runtime 事件 ===
DEVICE_STATUS_UPDATE = "deviceStatusUpdate"

# === Workflow 事件 ===
WORKFLOW_NODE_STATUS = "nodeStatusUpdate"
WORKFLOW_SNAPSHOT = "systemStateSnapshot"
WORKFLOW_MEASUREMENT = "measurementData"
WORKFLOW_EIS = "eisDataReady"
WORKFLOW_LOOP_START = "loopiteration_start"
WORKFLOW_LOOP_END = "loopiteration_end"
WORKFLOW_NODES_RESET = "nodesReset"
WORKFLOW_NOTIFICATION = "notification"
