"""温度执行失败的阶段说明与故障当时事实。"""

from __future__ import annotations

import math

from shared.contracts.common import ExecutionFailure


def finite_json_facts(value):
    """复制故障事实，非有限数写为 null，不输出非标准 JSON 数值。"""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, dict):
        return {str(key): finite_json_facts(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite_json_facts(item) for item in value]
    return str(value)


class ExecutionFailureError(RuntimeError):
    def __init__(self, failure: ExecutionFailure):
        self.failure = failure.model_dump(mode="json")
        super().__init__(f"{failure.title}：{failure.message} 原因：{failure.originalError}")


class TemperatureTargetTimeout(TimeoutError):
    """仅用于温度目标等待窗口耗尽，不代表串口读取超时。"""


def temperature_failure(
    error: Exception,
    stage: str,
    command_outcome: str,
    details: dict,
    *,
    code: str | None = None,
) -> ExecutionFailureError:
    code = code or {
        "preflight": "FURNACE_TEMPERATURE_PREFLIGHT_FAILED",
        "command": "FURNACE_TEMPERATURE_COMMAND_FAILED",
        "confirmation": "FURNACE_TEMPERATURE_CONFIRMATION_FAILED",
        "waiting": "FURNACE_TEMPERATURE_WAIT_FAILED",
    }[stage]
    title, message, suggestion = {
        "FURNACE_TEMPERATURE_PREFLIGHT_FAILED": (
            "温度节点启动前检查失败",
            "温度控制命令尚未发送，设备状态或参数检查未通过。",
            "检查炉子连接、当前温度和节点参数，再导出诊断日志定位原因。",
        ),
        "FURNACE_TEMPERATURE_COMMAND_FAILED": (
            "温度控制命令写入失败",
            {
                "not_sent": "参数写入失败，启动命令尚未发送。",
                "partial": "部分配置已取得写入回执，后续写入失败，不能视为完整启动成功。",
                "acknowledged": "启动命令已取得写入回执，后续控制命令写入失败。",
                "unknown": "命令写入未取得有效回执，无法确认设备是否已执行。",
            }[command_outcome],
            "先检查炉子实际状态和串口连接，导出诊断日志后再决定是否重新配置；不要直接重复启动。",
        ),
        "FURNACE_TEMPERATURE_CONFIRMATION_FAILED": (
            "温度控制状态确认失败",
            "启动命令已取得写入回执，但后端状态确认失败；炉子可能仍在运行。",
            "先检查炉子实际运行状态与通信，再导出诊断日志；不要直接重复启动。",
        ),
        "FURNACE_TEMPERATURE_WAIT_FAILED": (
            "温度节点等待失败",
            "等待目标温度时发生错误，尚不能判定为目标温度等待超时。",
            "检查炉子当前温度与运行状态，并导出诊断日志定位等待阶段错误。",
        ),
        "FURNACE_TEMPERATURE_STATUS_READ_FAILED": (
            "等待温度时读取状态失败",
            "等待目标温度时未能读取有效设备状态，尚不能判定为目标温度等待超时。",
            "检查串口连接和炉子实际运行状态，并导出诊断日志；不要直接重复启动。",
        ),
        "FURNACE_TEMPERATURE_TARGET_TIMEOUT": (
            "等待目标温度超时",
            "启动命令已取得写入回执，但未在等待窗口内达到目标温度。",
            "检查实际温度、目标温度、变化速率及加热或冷却能力，并导出诊断日志；不要直接重复启动。",
        ),
    }[code]
    return ExecutionFailureError(ExecutionFailure(
        code=code,
        device="furnace",
        stage=stage,
        title=title,
        message=message,
        suggestion=suggestion,
        commandOutcome=command_outcome,
        originalError=str(error),
        details=finite_json_facts({**details, "exceptionType": type(error).__name__}),
    ))
