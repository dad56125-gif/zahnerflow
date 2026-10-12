"""Pure node checks shared by planning and execution adapters."""

from __future__ import annotations

import math

from devices.furnace.limits import validate_furnace_temperature
from devices.zahner.logic import MeasurementParameterError, _PARAMETER_ALIASES, normalize_measurement_parameters
from runtime.execution_semantics import ADVANCED_MEASUREMENT_TYPES, resolve_node_execution_spec
from shared.contracts.workflow import WorkflowValidationDetails, WorkflowValidationIssue

# Only experiment inputs are mandatory; safety limits, reference modes and scan
# strategy retain the defaults already owned by the measurement normalizer.
_REQUIRED_MEASUREMENT_INPUTS = {
    "ocp": ("measurement_duration", "sampling_interval"),
    "ocp_measurement": ("measurement_duration", "sampling_interval"),
    "chronoamperometry": ("polarization_voltage", "measurement_duration", "sampling_interval"),
    "chronopotentiometry": ("polarization_current", "measurement_duration", "sampling_interval"),
    "voltage_ramp": ("start_voltage", "end_voltage", "measurement_duration", "sampling_interval"),
    "current_ramp": ("start_current", "end_current", "measurement_duration", "sampling_interval"),
    "eis_potentiostatic": ("eis_lower_frequency", "eis_upper_frequency", "eis_amplitude"),
    "eis_galvanostatic": ("eis_lower_frequency", "eis_upper_frequency", "eis_amplitude"),
    "galvanostatic_step_ramp": ("start_current", "end_current", "step_current", "hold_time"),
    "potentiostatic_step_ramp": ("start_potential", "end_potential", "step_potential", "hold_time"),
    "galvanostatic_switching": ("current_1", "current_2", "hold_time_1", "hold_time_2", "cycles"),
    "potentiostatic_switching": ("potential_1", "potential_2", "hold_time_1", "hold_time_2", "cycles"),
}


class WorkflowValidationError(ValueError):
    def __init__(self, issues: list[WorkflowValidationIssue]):
        self.details = WorkflowValidationDetails(issues=unique_issues(issues))
        super().__init__(self.details.message)


def validation_issue(nodes: list[dict], node: dict, index: int, parameter: str, message: str) -> WorkflowValidationIssue:
    source = nodes[index]
    return WorkflowValidationIssue(
        nodeId=source["id"], nodeIndex=index, nodeType=node.get("type", source["type"]),
        parameter=parameter, message=message,
        sourceNodeId=node.get("id") if node.get("id") != source["id"] else None,
    )


def step_validation_issue(plan, step: dict, parameter: str, message: str) -> WorkflowValidationIssue:
    node = step.get("node") or plan.nodes[step["originalIndex"]]
    source_node = {**node, "id": step.get("parentNodeId") or node.get("id"), "type": step.get("parentNodeType") or node.get("type")}
    return validation_issue(plan.nodes, source_node, step["originalIndex"], parameter, message)


def unique_issues(issues: list[WorkflowValidationIssue]) -> list[WorkflowValidationIssue]:
    result = []
    seen = set()
    for issue in issues:
        key = (issue.nodeId, issue.sourceNodeId, issue.parameter, issue.message)
        if key not in seen:
            seen.add(key)
            result.append(issue)
    return result


def gas_device_address(params: dict) -> int:
    selection = params.get("deviceSelection")
    if not isinstance(selection, str) or not selection.strip():
        raise ValueError("请选择气体设备")
    address, separator, gas = selection.partition(":")
    if not separator or not gas.strip():
        raise ValueError("设备选择已失效，请重新选择")
    try:
        number = int(address)
    except (TypeError, ValueError):
        raise ValueError("设备地址无效，请重新选择") from None
    if not 1 <= number <= 255:
        raise ValueError("设备地址无效，请重新选择")
    return number


def node_parameter_issues(node: dict) -> list[tuple[str, str]]:
    params = node.get("config") or {}
    kind = node.get("type")
    issues: list[tuple[str, str]] = []

    def number(key, default=None, *, minimum=None, maximum=None, integer=False, positive=False):
        value = params.get(key, default)
        try:
            if value is None or isinstance(value, bool) or (isinstance(value, str) and not value.strip()):
                raise ValueError
            result = float(value)
            if not math.isfinite(result):
                raise ValueError
        except (TypeError, ValueError, OverflowError):
            issues.append((key, "请填写有效的数值"))
            return
        if integer and not result.is_integer():
            issues.append((key, "必须是整数"))
        elif positive and result <= 0:
            issues.append((key, "必须大于 0"))
        elif minimum is not None and result < minimum:
            issues.append((key, f"不能小于 {minimum:g}"))
        elif maximum is not None and result > maximum:
            issues.append((key, f"不能大于 {maximum:g}"))

    if kind == "startup":
        host = params.get("host", "localhost")
        if not isinstance(host, str) or not host.strip():
            issues.append(("host", "请填写工作站地址"))
    elif kind in ("delay", "wait_delay"):
        number("duration", minimum=0)
    elif kind == "scheduled_start":
        number("hour", 0, minimum=0, maximum=23, integer=True)
        number("minute", 0, minimum=0, maximum=59, integer=True)
        if "nextDay" in params and not isinstance(params["nextDay"], bool):
            issues.append(("nextDay", "请选择有效的执行日期"))
    elif kind == "change_temperature":
        try:
            validate_furnace_temperature(params.get("targetTemperature"), "targetTemperature")
        except (TypeError, ValueError, OverflowError):
            issues.append(("targetTemperature", "请填写 25–1100℃ 的目标温度"))
        number("rate", 5, minimum=0.1, maximum=20)
        number("tolerance", 0.5, minimum=0)
        number("stabilizationTime", 30, minimum=0)
        for key in ("coolingLinearFloor", "temperatureProgressExtensionSeconds", "temperatureStallTimeoutSeconds", "maxTemperatureWaitSeconds"):
            if key in params:
                number(key, positive=True)
    elif kind == "change_gas_flow":
        try:
            gas_device_address(params)
        except ValueError as error:
            issues.append(("deviceSelection", str(error)))
        number("targetFlowRate", minimum=0)
        number("stabilizationTime", 10, minimum=0, integer=True)
    elif kind == "loop_start":
        from loop_unroller import _loop_count
        try:
            _loop_count(node)
        except ValueError as error:
            issues.append(("loopCount", str(error)))
    elif kind not in ("shutdown", "loop_start", "loop_end", "workflow_block"):
        try:
            measurement_type = kind if kind in ADVANCED_MEASUREMENT_TYPES else resolve_node_execution_spec(kind, params).measurement_type
            for key in _REQUIRED_MEASUREMENT_INPUTS.get(measurement_type, ()):
                if key not in params and not any(canonical == key and alias in params for alias, canonical in _PARAMETER_ALIASES.items()):
                    field = next((alias for alias, canonical in _PARAMETER_ALIASES.items() if canonical == key), key)
                    issues.append((field, "请填写此参数"))
            if measurement_type in ("eis_potentiostatic", "eis_galvanostatic") and params.get("enable_dc_bias", params.get("enableDcBias", measurement_type == "eis_galvanostatic")) is True:
                key = "eis_potential" if measurement_type == "eis_potentiostatic" else "eis_current"
                if key not in params and not any(canonical == key and alias in params for alias, canonical in _PARAMETER_ALIASES.items()):
                    issues.append(("eisPotential" if key == "eis_potential" else "eisCurrent", "请填写直流偏置"))
            normalize_measurement_parameters(measurement_type, params)
        except MeasurementParameterError as error:
            for key, message in error.issues:
                field = next((alias for alias, canonical in _PARAMETER_ALIASES.items() if canonical == key and alias in params), key)
                issues.append((field, message))
        except (TypeError, ValueError) as error:
            issues.append(("measurement_type", str(error)))
    return issues
