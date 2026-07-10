"""Shared execution-domain rules for planning, ETA, dispatch and persistence."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable


ACTIVE_EXECUTION_STATUSES = frozenset({"running", "paused", "cancelling"})
TERMINAL_EXECUTION_STATUSES = frozenset({"completed", "failed", "cancelled"})


def is_active_execution_status(status: str | None) -> bool:
    return status in ACTIVE_EXECUTION_STATUSES


def is_terminal_execution_status(status: str | None) -> bool:
    return status in TERMINAL_EXECUTION_STATUSES


class NoActiveExecutionError(RuntimeError):
    """Raised when a command targets an execution but no execution is active."""


class ExecutionIdMismatchError(RuntimeError):
    """Raised when a command targets a stale or unrelated execution id."""


class InvalidExecutionTransitionError(RuntimeError):
    """Raised when an execution command is invalid for the current phase."""


@dataclass(frozen=True)
class NodeExecutionSpec:
    """One executable node's shared planning, ETA and dispatch semantics."""

    dispatch_kind: str
    eta_kind: str
    measurement_type: str | None = None
    measurement_boundary: bool = False
    interruptible: bool = True
    learn_duration: bool = True


def _measurement_spec(measurement_type: str | None, *, interruptible: bool = True) -> NodeExecutionSpec:
    return NodeExecutionSpec(
        dispatch_kind="measurement",
        eta_kind="measurement",
        measurement_type=measurement_type,
        measurement_boundary=True,
        interruptible=interruptible,
    )


NODE_EXECUTION_SPECS: dict[str, NodeExecutionSpec] = {
    "startup": NodeExecutionSpec("zahner_startup", "startup", learn_duration=False),
    "shutdown": NodeExecutionSpec("zahner_shutdown", "shutdown", learn_duration=False),
    "delay": NodeExecutionSpec("wait", "delay", learn_duration=False),
    "wait_delay": NodeExecutionSpec("wait", "delay", learn_duration=False),
    "scheduled_start": NodeExecutionSpec("scheduled_wait", "scheduled_start", learn_duration=False),
    "change_temperature": NodeExecutionSpec("change_temperature", "change_temperature"),
    "change_gas_flow": NodeExecutionSpec("change_gas_flow", "change_gas_flow"),
    "measurement": _measurement_spec(None),
    "ocp": _measurement_spec("ocp"),
    "ocp_measurement": _measurement_spec("ocp_measurement"),
    "voltage_ramp": _measurement_spec("voltage_ramp"),
    "current_ramp": _measurement_spec("current_ramp"),
    "chronoamperometry": _measurement_spec("chronoamperometry"),
    "chronopotentiometry": _measurement_spec("chronopotentiometry"),
    "eis_potentiostatic": _measurement_spec("eis_potentiostatic", interruptible=False),
    "eis_galvanostatic": _measurement_spec("eis_galvanostatic", interruptible=False),
}

ADVANCED_MEASUREMENT_TYPES = frozenset(
    {
        "galvanostatic_switching",
        "potentiostatic_switching",
        "galvanostatic_step_ramp",
        "potentiostatic_step_ramp",
    }
)
STRUCTURAL_NODE_TYPES = frozenset({"loop_start", "loop_end", "workflow_block"})
KNOWN_SOURCE_NODE_TYPES = frozenset(NODE_EXECUTION_SPECS) | ADVANCED_MEASUREMENT_TYPES | STRUCTURAL_NODE_TYPES
MEASUREMENT_NODE_TYPES = frozenset(
    node_type for node_type, spec in NODE_EXECUTION_SPECS.items() if spec.measurement_boundary
)


def node_execution_spec(node_type: str | None) -> NodeExecutionSpec | None:
    return NODE_EXECUTION_SPECS.get(node_type or "")


def require_node_execution_spec(node_type: str | None) -> NodeExecutionSpec:
    spec = node_execution_spec(node_type)
    if spec is None:
        raise ValueError(f"Unsupported executable node type: {node_type or '<missing>'}")
    return spec


def unsupported_source_nodes(nodes: Iterable[dict]) -> list[tuple[int, str, str]]:
    unsupported = []
    for index, node in enumerate(nodes):
        node_type = str(node.get("type") or "")
        if node_type not in KNOWN_SOURCE_NODE_TYPES:
            unsupported.append((index, str(node.get("id") or ""), node_type or "<missing>"))
    return unsupported


def unsupported_executable_steps(steps: Iterable[dict]) -> list[tuple[int, str, str]]:
    unsupported = []
    for index, step in enumerate(steps):
        node_type = str(step.get("nodeType") or (step.get("node") or {}).get("type") or "")
        if node_type not in NODE_EXECUTION_SPECS:
            unsupported.append((index, str(step.get("nodeId") or ""), node_type or "<missing>"))
    return unsupported


def resolve_scheduled_start(params: dict, now: datetime | None = None) -> datetime:
    """Resolve the relative schedule-node config to one local absolute datetime."""

    reference = now or datetime.now()
    hour = max(0, min(23, int(params.get("hour", 0) or 0)))
    minute = max(0, min(59, int(params.get("minute", 0) or 0)))
    scheduled = reference.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if params.get("nextDay"):
        scheduled += timedelta(days=1)
    return scheduled


def parse_scheduled_at(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid scheduledAt value: {value!r}") from exc


@dataclass(frozen=True)
class MeasurementOutcome:
    """Canonical measurement result consumed by execution recording."""

    measurement_status: str
    step_status: str
    result: dict
    warnings: tuple[dict, ...] = ()
    artifacts: tuple[dict, ...] = ()


def normalize_measurement_outcome(raw_result: dict | None, *, output_dir: str | None = None) -> MeasurementOutcome:
    raw = dict(raw_result or {})
    measurement_status = str(raw.get("status") or ("success" if raw_result is not None else "failed"))
    reason = raw.get("reason") or ("Measurement returned no result" if raw_result is None else None)
    statistics = raw.get("statistics") if isinstance(raw.get("statistics"), dict) else None
    eis_data = raw.get("eis_data") if isinstance(raw.get("eis_data"), dict) else {}
    data_points = raw.get("data_points")
    if data_points is None:
        data_points = raw.get("points")
    if data_points is None:
        data_points = eis_data.get("point_count")

    output_file = raw.get("output_file") or raw.get("full_path")
    csv_path = raw.get("csv_path") or eis_data.get("csv_path")
    resolved_output_dir = output_dir or raw.get("output_path")
    canonical_result = {
        "measurementStatus": measurement_status,
        "outputDir": resolved_output_dir,
        "outputFile": output_file,
        "csvPath": csv_path,
        "data_points": data_points or 0,
        "reason": reason,
        "statistics": statistics,
    }
    canonical_result = {key: value for key, value in canonical_result.items() if value is not None}

    metadata = {
        "measurementStatus": measurement_status,
        "data_points": data_points or 0,
    }
    if reason:
        metadata["reason"] = reason
    if statistics:
        metadata["statistics"] = statistics

    artifacts: list[dict] = []
    seen_paths: set[str] = set()
    for file_type, file_path in (
        ("output_file", output_file),
        ("csv", csv_path),
        ("output_dir", resolved_output_dir),
    ):
        if not file_path or file_path in seen_paths:
            continue
        seen_paths.add(file_path)
        artifacts.append({"fileType": file_type, "filePath": file_path, "metadata": dict(metadata)})

    warnings: list[dict] = []
    if measurement_status == "stopped_safety":
        warnings.append(
            {
                "warningType": "measurement_safety_stop",
                "message": str(reason or "Measurement stopped by a safety limit"),
                "metadata": dict(metadata),
            }
        )
        step_status = "completed"
    elif measurement_status in {"failed", "error"}:
        step_status = "failed"
    elif measurement_status == "cancelled":
        step_status = "cancelled"
    else:
        step_status = "completed"

    return MeasurementOutcome(
        measurement_status=measurement_status,
        step_status=step_status,
        result=canonical_result,
        warnings=tuple(warnings),
        artifacts=tuple(artifacts),
    )
