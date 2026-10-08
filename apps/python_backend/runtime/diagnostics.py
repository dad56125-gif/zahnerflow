"""本地诊断只读投影：不访问设备，不导出设置、曲线或其他实验。"""

from __future__ import annotations

import json
import math
import platform
import re
from datetime import datetime, timezone

from database import db
from shared.contracts.common import RuntimeDiagnosticBundle
from version import APP_VERSION


ITEM_LIMIT = 200
TEXT_LIMIT = 2048
JSON_READ_LIMIT = 32768
DEVICES = ("furnace", "mfc", "zahner")

# 仅收集诊断所需标量；路径、样品、操作者、凭据和原始曲线不进入投影。
PARAM_FIELDS = (
    "targetTemperature", "rate", "tolerance", "stabilizationTime", "coolingLinearFloor",
    "temperatureProgressExtensionSeconds", "temperatureStallTimeoutSeconds",
    "maxTemperatureWaitSeconds", "duration", "targetFlowRate", "address",
    "startFrequency", "endFrequency", "minFrequency", "maxFrequency",
    "pointsPerDecade", "amplitude", "acAmplitude", "dcPotential", "dcCurrent",
    "voltage", "current", "scanRate", "cycles", "samplingInterval",
)
DETAIL_FIELDS = PARAM_FIELDS + (
    "currentTemperature", "initialTemperature", "finalTemperature", "lastTemperature",
    "lastConfirmedTemperature", "elapsedSeconds", "programMinutes", "programDuration",
    "register", "registerCode", "registerValue", "statusCode", "segment",
    "command", "exceptionType", "connected", "reached", "writesCompleted",
    "pv", "initialPv", "writeAttemptCount", "acknowledgedWriteCount",
    "runCommandAttempted", "runCommandAcknowledged", "runStateConfirmed",
    "programDurationMinutes", "estimatedRampMinutes", "waitDeadlineSeconds",
    "hardDeadlineSeconds", "lastProgressSeconds",
)
STATE_FIELDS = (
    "connectionStatus", "connectedAt", "executionStatus", "currentSegmentIndex",
    "startedAt", "currentRunStartedAt", "accumulatedRunSeconds", "stoppedAt",
    "lastSuccessfulCommunicationAt", "stateVersion", "updatedAt",
)
STATUS_FIELDS = (
    "connected", "mode", "pv", "sv", "mv", "statusCode", "segment",
    "segmentTime", "segmentTimeSet", "address", "flowSccm", "flowPercent",
    "maxFlowSccm", "setpointSccm", "digitalSetpointPercent", "activeSetpointPercent",
    "connectionStatus", "lastCommunication",
)
FAILURE_FIELDS = (
    "code", "device", "stage", "title", "message", "suggestion",
    "commandOutcome", "originalError",
)
_PRIVATE_ASSIGNMENT = re.compile(
    r'''(?i)(["']?(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|'''
    r'''authorization|credential[s]?|smtp\w*|email|username|user|ownerName|'''
    r'''projectName|individualName|sampleName|basePath|outputPath)["']?\s*[:=]\s*)'''
    r'''(?:"[^"]*"|'[^']*'|[^\s,;]+)'''
)
_EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_AUTH = re.compile(r"(?i)\b(Bearer|Basic)\s+[^\s,;]+")
_URL_CREDENTIALS = re.compile(r"(?i)([a-z][a-z0-9+.-]*://)[^/\s@]+@")
_WINDOWS_PATH = re.compile(r'''(?i)(?:[a-z]:[\\/]|\\\\)[^\r\n"'<>]*''')
_UNIX_PATH = re.compile(r'''(?<![\w:/])/(?:[^/\s]+/)+[^\s"'<>]*''')


def _text(value, limit: int = TEXT_LIMIT) -> str | None:
    if value is None:
        return None
    text = str(value)
    text = _PRIVATE_ASSIGNMENT.sub(r"\1[redacted]", text)
    text = _AUTH.sub(r"\1 [redacted]", text)
    text = _URL_CREDENTIALS.sub(r"\1[redacted]@", text)
    text = _EMAIL.sub("[redacted-email]", text)
    text = _WINDOWS_PATH.sub("[redacted-path]", text)
    text = _UNIX_PATH.sub("[redacted-path]", text)
    return text if len(text) <= limit else text[:limit] + "…[truncated]"


def _fields(source, names, *, text_limit: int = 128) -> dict:
    if not isinstance(source, dict):
        return {}
    result = {}
    for name in names:
        value = source.get(name)
        if name not in source:
            continue
        if value is None or isinstance(value, (bool, int)):
            result[name] = value
        elif isinstance(value, float) and math.isfinite(value):
            result[name] = value
        elif isinstance(value, str):
            result[name] = _text(value, text_limit)
    return result


def _object(value) -> dict:
    if not isinstance(value, str) or len(value) > JSON_READ_LIMIT:
        return {}
    try:
        decoded = json.loads(value)
    except (ValueError, TypeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _finite(value):
    return None if isinstance(value, float) and not math.isfinite(value) else value


def _details(source) -> dict:
    if not isinstance(source, dict):
        return {}
    details = _fields(source, DETAIL_FIELDS)
    for key, fields in (
        ("parameters", PARAM_FIELDS),
        ("lastCommand", ("code", "register", "value", "acknowledged")),
        ("lastDeviceStatus", STATUS_FIELDS),
        ("lastWriteResponse", ("code", "register", "value", "pv", "acknowledged")),
        ("lastWriteAcknowledgement", ("code", "register", "value", "pv", "acknowledged")),
    ):
        if isinstance(source.get(key), dict):
            details[key] = _fields(source[key], fields)
    writes = source.get("confirmedWrites")
    if isinstance(writes, list):
        details["confirmedWrites"] = [_fields(item, ("code", "value")) for item in writes[:ITEM_LIMIT]
                                     if isinstance(item, dict)]
        if len(writes) > ITEM_LIMIT:
            details["confirmedWritesTruncated"] = True
    return details


def _failure(header: dict, details: dict) -> dict | None:
    # 历史格式不猜测分类，也不因旧枚举导致整份诊断导出失败。
    if not header:
        return None
    return {**_fields(header, FAILURE_FIELDS, text_limit=TEXT_LIMIT),
            "details": _details(details)}


def _execution(execution_id: str) -> dict | None:
    row = db.conn.execute(
        """SELECT id, workflow_id, status, start_time, end_time, duration,
                  substr(error, 1, ?) AS error
           FROM executions WHERE id = ? LIMIT 1""",
        (TEXT_LIMIT + 1, execution_id),
    ).fetchone()
    if row is None:
        return None
    # 从 JSON 中只读取 failure/error；不读取完整 result 或测量曲线。
    rows = db.conn.execute(
        """SELECT original_index, unrolled_index, node_id, node_type, status,
                  started_at, ended_at, actual_seconds,
                  substr(params, 1, ?) AS params,
                  substr(error, 1, ?) AS error,
                  CASE WHEN json_valid(result) THEN
                    substr(CASE WHEN json_type(result, '$.error') = 'text' THEN json_extract(result, '$.error')
                                WHEN json_type(result, '$.reason') = 'text' THEN json_extract(result, '$.reason') END,
                           1, ?) END AS result_error,
                  CASE WHEN json_valid(result) AND json_type(result, '$.failure') = 'object' THEN
                    substr(json_remove(json_extract(result, '$.failure'), '$.details'), 1, ?)
                  END AS failure,
                  CASE WHEN json_valid(result) THEN
                    substr(json_extract(result, '$.failure.details'), 1, ?) END AS failure_details
           FROM execution_steps WHERE execution_id = ?
           ORDER BY unrolled_index DESC LIMIT ?""",
        (JSON_READ_LIMIT + 1, TEXT_LIMIT + 1, TEXT_LIMIT + 1,
         JSON_READ_LIMIT + 1, JSON_READ_LIMIT + 1, execution_id, ITEM_LIMIT + 1),
    ).fetchall()
    steps = []
    for step in reversed(rows[:ITEM_LIMIT]):
        steps.append({
            "originalIndex": step["original_index"], "unrolledIndex": step["unrolled_index"],
            "nodeId": _text(step["node_id"], 128), "nodeType": _text(step["node_type"], 128),
            "status": _text(step["status"], 128), "startedAt": _text(step["started_at"], 128),
            "endedAt": _text(step["ended_at"], 128), "actualSeconds": _finite(step["actual_seconds"]),
            "params": _fields(_object(step["params"]), PARAM_FIELDS),
            "error": _text(step["error"] if step["error"] is not None else step["result_error"]),
            "failure": _failure(_object(step["failure"]), _object(step["failure_details"])),
        })
    return {
        "executionId": _text(row["id"], 128), "workflowId": _text(row["workflow_id"], 128),
        "status": _text(row["status"], 128), "startedAt": _text(row["start_time"], 128),
        "endedAt": _text(row["end_time"], 128), "durationMs": _finite(row["duration"]),
        "error": _text(row["error"]), "steps": steps,
        "failure": next((step["failure"] for step in reversed(steps) if step["failure"]), None),
        "scope": "selected_execution_persisted_history", "stepLimit": ITEM_LIMIT,
        "stepsTruncated": len(rows) > ITEM_LIMIT, "stepsSelection": "latest_by_unrolled_index",
    }


def _events(execution_id: str | None) -> tuple[list[dict], bool]:
    condition = "execution_id = ?" if execution_id is not None else "execution_id IS NULL"
    parameters = (execution_id, ITEM_LIMIT + 1) if execution_id is not None else (ITEM_LIMIT + 1,)
    rows = db.conn.execute(
        f"""SELECT id, device, event_type, execution_id, from_status, to_status, occurred_at,
                   substr(payload_json, 1, {JSON_READ_LIMIT + 1}) AS payload
            FROM device_runtime_events WHERE {condition} ORDER BY id DESC LIMIT ?""",
        parameters,
    ).fetchall()
    return [{
        "id": row["id"], "device": _text(row["device"], 128),
        "eventType": _text(row["event_type"], 128), "executionId": _text(row["execution_id"], 128),
        "fromStatus": _text(row["from_status"], 128), "toStatus": _text(row["to_status"], 128),
        "occurredAt": _text(row["occurred_at"], 128),
        "payload": _fields(_object(row["payload"]), ("stateVersion", "connectionGeneration")),
        "scope": "selected_execution_history" if execution_id is not None else "unassociated_device_history",
    } for row in reversed(rows[:ITEM_LIMIT])], len(rows) > ITEM_LIMIT


def _recent_logs(entries: list[dict]) -> list[dict]:
    """MFC 合并了两组 newest-first 日志；按本地钟点合并后再限量。

    既有日志没有日期，只能按最近 24 小时排序；跨天旧日志无法精确归属。
    未知时间格式保持源顺序，排在可解析条目之后。
    """
    local_now = datetime.now()
    now_seconds = (local_now.hour * 3600 + local_now.minute * 60 + local_now.second
                   + local_now.microsecond / 1_000_000)

    def age(entry):
        try:
            timestamp = datetime.strptime(entry.get("timestamp", ""), "%H:%M:%S.%f")
        except (ValueError, TypeError):
            return math.inf
        seconds = (timestamp.hour * 3600 + timestamp.minute * 60 + timestamp.second
                   + timestamp.microsecond / 1_000_000)
        return (now_seconds - seconds) % 86400

    return sorted((entry for entry in entries if isinstance(entry, dict)), key=age)[:ITEM_LIMIT]


def build_runtime_diagnostics(runtime, execution_id: str | None = None) -> RuntimeDiagnosticBundle:
    """只读既有持久记录和内存缓存；显式未知 execution id 抛出 LookupError。"""
    selected_id = execution_id
    if selected_id is None:
        selected_id = runtime.execution.execution_id or runtime.experiment_state.get("executionId")
    execution = _execution(selected_id) if selected_id is not None else None
    if execution_id is not None and execution is None:
        raise LookupError("Execution not found")
    # 当前进程尚无持久记录时不拼造历史，也不借用另一实验的失败。
    if execution is None:
        selected_id = None
    elif not execution["failure"] and selected_id == runtime.execution.execution_id:
        current_failure = runtime.experiment_state.get("failure")
        if isinstance(current_failure, dict):
            execution["failure"] = _failure(current_failure, current_failure.get("details"))
            execution["failureSource"] = "current_process_state"

    exported_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    snapshots = []
    logs = {}
    logs_truncated = {}
    for device in DEVICES:
        state = runtime._runtime_states.get(device, {})
        projected = _fields(state, STATE_FIELDS)
        # 快照是导出时设备事实；省略不属于选定执行的身份与错误文本。
        same_execution = state.get("executionId") in (None, selected_id)
        if selected_id is not None and state.get("executionId") == selected_id:
            projected["executionId"] = _text(selected_id, 128)
        if same_execution:
            projected["lastError"] = _fields(state.get("lastError"), ("code", "message", "timestamp"), text_limit=TEXT_LIMIT)
        projected["deviceStatus"] = _fields(state.get("deviceStatus"), STATUS_FIELDS)
        scanned = state.get("scannedDevices") or []
        projected["scannedDevices"] = [_fields(item, STATUS_FIELDS) for item in scanned[:ITEM_LIMIT] if isinstance(item, dict)]
        snapshots.append({"device": device, "scope": "at_export_not_at_failure", "capturedAt": exported_at,
                          "runtimeState": projected, "scannedDevicesTruncated": len(scanned) > ITEM_LIMIT})
        # device_command_logs 仅访问进程日志/comm_log 内存，不读取串口状态。
        entries = runtime.devices.device_command_logs(device)
        logs[device] = [_fields(entry, ("timestamp", "direction", "data", "error"), text_limit=1024)
                        for entry in _recent_logs(entries)]
        logs_truncated[device] = len(entries) > ITEM_LIMIT
    events, events_truncated = _events(selected_id)
    return RuntimeDiagnosticBundle(
        appVersion=APP_VERSION, exportedAt=exported_at, runtimeId=runtime.runtime_id,
        system={"platform": platform.system(), "release": platform.release(),
                "machine": platform.machine(), "python": platform.python_version()},
        execution=execution, deviceSnapshots=snapshots, runtimeEvents=events,
        commandLogs={"scope": "current_process_not_execution_history", "runtimeId": runtime.runtime_id,
                     "capturedAt": exported_at, "mayBeEmptyAfterRestart": True,
                     "executionAssociation": "unavailable", "mayIncludeOtherExecutions": True,
                     "order": "newest_by_local_time_of_day",
                     "timestampLimit": "no_date_or_execution_id; cross_day_order_is_approximate",
                     "limitPerDevice": ITEM_LIMIT, "truncated": logs_truncated, "devices": logs,
                     "runtimeEventLimit": ITEM_LIMIT, "runtimeEventsTruncated": events_truncated,
                     "privacy": "allowlisted_fields_redacted_text_no_settings_paths_or_raw_curves",
                     "textLimit": TEXT_LIMIT, "jsonReadLimit": JSON_READ_LIMIT,
                     "oversizedJsonObjects": "omitted"},
    )
