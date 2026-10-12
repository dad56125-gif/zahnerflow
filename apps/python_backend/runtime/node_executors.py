"""Node adapters own device work and cleanup, never workflow transitions."""

from __future__ import annotations

import math
import inspect
import time
from datetime import datetime
from typing import Awaitable, Callable

from devices.furnace.limits import validate_furnace_temperature
from devices.zahner.logic import MeasurementCancelled
from runtime.execution_control import NodeExecutionContext, WorkflowCancelled
from runtime.execution_failure import ExecutionFailureError, TemperatureTargetTimeout, temperature_failure
from runtime.execution_semantics import MeasurementOutcome, NodeExecutionSpec, normalize_measurement_outcome, parse_scheduled_at, resolve_node_execution_spec
from runtime.temperature_control import estimate_remaining_temperature_seconds, estimate_temperature_program_minutes, estimate_temperature_ramp_minutes
from shared.contracts.events import WORKFLOW_EIS, WORKFLOW_MEASUREMENT


class NodeExecutor:
    def __init__(self, context: NodeExecutionContext):
        self.context = context
        self.control = context.control
        self.runtime = context.runtime
        self.devices = context.devices

    async def startup(self, node, step, params, spec):
        await self.control.run_in_thread(self.devices.connect_zahner, params)

    async def shutdown(self, node, step, params, spec):
        return await self.control.run_in_thread(self.devices.disconnect_zahner)

    async def wait(self, node, step, params, spec):
        await self.control.sleep(float(params.get("duration", 1)))

    async def scheduled_wait(self, node, step, params, spec):
        scheduled_value = step.get("scheduledAt")
        if not scheduled_value:
            raise RuntimeError("scheduled_start is missing the absolute scheduledAt from its execution plan")
        scheduled_at = parse_scheduled_at(scheduled_value)
        delay = (scheduled_at - datetime.now()).total_seconds()
        if delay <= 0:
            raise RuntimeError(f"Scheduled time has already passed: {scheduled_at.isoformat()}")
        await self.control.sleep(delay)
        return {"scheduledFor": scheduled_at.isoformat()}

    async def temperature(self, node, step, params, spec):
        return await self._execute_change_temperature(params)

    async def gas_flow(self, node, step, params, spec):
        return await self._execute_change_gas_flow(params)

    async def measurement(self, node, step, params, spec):
        return await self._execute_measurement(node, spec.measurement_type, params, step, interruptible=spec.interruptible)

    async def _execute_change_temperature(self, params: dict):
        execution_id = self.context.execution_id

        def require_current_run():
            self.runtime.require_furnace_execution(execution_id)
            if self.control.cancel_requested:
                raise WorkflowCancelled("Temperature change cancelled by user")

        def do_change():
            stage = "preflight"
            parameter_keys = (
                "targetTemperature", "rate", "tolerance", "stabilizationTime", "coolingLinearFloor",
                "temperatureProgressExtensionSeconds", "temperatureStallTimeoutSeconds", "maxTemperatureWaitSeconds",
            )
            details = {
                "executionId": execution_id,
                "parameters": {key: params[key] for key in parameter_keys if key in params},
                "pv": None,
                "writeAttemptCount": 0,
                "acknowledgedWriteCount": 0,
                "runCommandAttempted": False,
                "runCommandAcknowledged": False,
                "runStateConfirmed": False,
                "confirmedWrites": [],
            }

            def command_outcome():
                if details["runCommandAcknowledged"]:
                    return "acknowledged"
                if details["runCommandAttempted"]:
                    return "unknown"
                if details["acknowledgedWriteCount"]:
                    return "partial"
                return "not_sent"

            def write_param(code, value, *, allow_cancelled=False):
                if allow_cancelled:
                    self.runtime.require_furnace_execution(execution_id)
                else:
                    require_current_run()
                details["lastCommand"] = {"code": code, "register": f"0x{code:02X}", "value": value, "acknowledged": False}
                details["writeAttemptCount"] += 1
                is_run = code == 0x15 and value == 0
                if is_run:
                    details["runCommandAttempted"] = True
                receipt = self.devices.furnace_write_param(code, value)
                details["lastWriteResponse"] = receipt
                # 驱动在写命令响应后读取寄存器；value 是回读值，瞬态运行指令
                # 不要求回读值等于写入值。只确认取得了驱动定义的有效响应。
                if not isinstance(receipt, dict) or any(
                    type(receipt.get(key)) not in (int, float) or not math.isfinite(receipt[key])
                    for key in ("value", "pv")
                ):
                    raise RuntimeError("Furnace write response missing or invalid")
                details["acknowledgedWriteCount"] += 1
                details["confirmedWrites"].append({"code": code, "value": value})
                details["lastWriteAcknowledgement"] = receipt
                details["lastCommand"]["acknowledged"] = True
                if "pv" in receipt:
                    details["pv"] = receipt["pv"]
                if is_run:
                    details["runCommandAcknowledged"] = True

            def finite_number(value, name):
                number = float(value)
                if not math.isfinite(number):
                    raise ValueError(f"{name} must be finite")
                return number

            try:
                require_current_run()
                status = self.devices.furnace_status()
                details["lastDeviceStatus"] = status
                if not status.get("connected"):
                    raise RuntimeError("Furnace not connected")
                if "pv" not in status:
                    raise RuntimeError("Furnace status response missing pv before temperature command")
                current_temp = finite_number(status["pv"], "pv")
                details["pv"] = current_temp
                target_temp = validate_furnace_temperature(params.get("targetTemperature"), "targetTemperature")
                rate = finite_number(params.get("rate", 5), "rate")
                tolerance = max(0.0, finite_number(params.get("tolerance", 0.5), "tolerance"))
                stabilization_time = max(0.0, finite_number(params.get("stabilizationTime", 30), "stabilizationTime"))
                cooling_linear_floor = finite_number(params.get("coolingLinearFloor", 500) or 500, "coolingLinearFloor")
                program_minutes = estimate_temperature_program_minutes(current_temp, target_temp, rate)
                estimated_ramp_minutes = estimate_temperature_ramp_minutes(
                    current_temp, target_temp, rate, tolerance, cooling_linear_floor,
                )
                program_duration = int(math.ceil(program_minutes))
                base_wait_s = estimated_ramp_minutes * 60 + stabilization_time
                min_extension_s = finite_number(params.get("temperatureProgressExtensionSeconds", 600) or 600, "temperatureProgressExtensionSeconds")
                stall_timeout_s = finite_number(params.get("temperatureStallTimeoutSeconds", 1800) or 1800, "temperatureStallTimeoutSeconds")
                hard_cap_s = finite_number(params.get("maxTemperatureWaitSeconds", max(base_wait_s * 4.0, base_wait_s + 3600.0, 21600.0)), "maxTemperatureWaitSeconds")
                details["parameters"].update({
                    "targetTemperature": target_temp, "rate": rate, "tolerance": tolerance,
                    "stabilizationTime": stabilization_time, "coolingLinearFloor": cooling_linear_floor,
                    "temperatureProgressExtensionSeconds": min_extension_s,
                    "temperatureStallTimeoutSeconds": stall_timeout_s, "maxTemperatureWaitSeconds": hard_cap_s,
                })
                details.update({"initialPv": current_temp, "programDurationMinutes": program_duration, "estimatedRampMinutes": estimated_ramp_minutes})
                require_current_run()
                stage = "command"
                # scratch 温度寄存器保持 0.1℃ 编码，程序时间仅取设定速率。
                for code, value in (
                    (0x50, int(round(current_temp * 10))), (0x51, program_duration),
                    (0x52, int(round(target_temp * 10))), (0x53, 5001),
                    (0x54, int(round(target_temp * 10))), (0x00, 28), (0x15, 0),
                ):
                    write_param(code, value)
                stage = "confirmation"
                self.runtime.confirm_furnace_action_from_worker("run", execution_id)
                details["runStateConfirmed"] = True
                stage = "waiting"
                start = time.monotonic()
                deadline = start + base_wait_s
                hard_deadline = start + hard_cap_s
                best_distance = abs(current_temp - target_temp)
                last_progress_at = start
                progress_epsilon = max(0.25, tolerance * 0.25)
                samples: list[tuple[float, float]] = [(start, current_temp)]

                while True:
                    details["elapsedSeconds"] = time.monotonic() - start
                    if self.control.wait_for_cancel(2.0):
                        stage = "command"
                        # 取消时仍允许当前 execution 停止炉子；不重新发送 run。
                        write_param(0x15, 12, allow_cancelled=True)
                        stage = "confirmation"
                        self.runtime.confirm_furnace_action_from_worker("stop", execution_id)
                        details["cancellationCleanupConfirmed"] = True
                        raise WorkflowCancelled("Temperature change cancelled by user")
                    details["elapsedSeconds"] = time.monotonic() - start
                    try:
                        status = self.devices.furnace_status()
                        details["lastDeviceStatus"] = status
                        if not status.get("connected"):
                            raise RuntimeError("Furnace status reported disconnected while waiting")
                        if "pv" not in status:
                            raise RuntimeError("Furnace status response missing pv while waiting")
                        pv = finite_number(status["pv"], "pv")
                    except WorkflowCancelled:
                        raise
                    except Exception as error:
                        raise temperature_failure(
                            error, stage, command_outcome(), details,
                            code="FURNACE_TEMPERATURE_STATUS_READ_FAILED",
                        ) from error
                    now = time.monotonic()
                    details.update({"pv": pv, "elapsedSeconds": now - start})
                    distance = abs(pv - target_temp)
                    samples.append((now, pv))
                    samples = [sample for sample in samples if now - sample[0] <= 300.0]
                    if distance <= tolerance:
                        return {
                            "reached": True, "targetTemperature": target_temp, "finalTemperature": pv,
                            "tolerance": tolerance, "elapsedSeconds": now - start,
                        }
                    if distance < best_distance - progress_epsilon:
                        best_distance = distance
                        last_progress_at = now
                    remaining_s = estimate_remaining_temperature_seconds(samples, target_temp, tolerance)
                    if remaining_s is not None and remaining_s > 0:
                        adaptive_deadline = now + remaining_s * 1.5 + stabilization_time
                        deadline = min(hard_deadline, max(deadline, adaptive_deadline))
                    details.update({"waitDeadlineSeconds": deadline - start, "hardDeadlineSeconds": hard_cap_s, "lastProgressSeconds": last_progress_at - start})
                    if now < deadline:
                        continue
                    if now - last_progress_at <= stall_timeout_s and now < hard_deadline:
                        deadline = min(hard_deadline, now + min_extension_s)
                        continue
                    raise TemperatureTargetTimeout(
                        "Furnace temperature did not approach target "
                        f"{target_temp:.1f}C within the adaptive wait window; "
                        f"last pv={pv:.1f}C, tolerance={tolerance:.1f}C"
                    )
            except WorkflowCancelled:
                if details["runCommandAttempted"] and not details.get("cancellationCleanupConfirmed"):
                    try:
                        write_param(0x15, 12, allow_cancelled=True)
                        self.runtime.confirm_furnace_action_from_worker("stop", execution_id)
                    except Exception as error:
                        raise temperature_failure(error, "confirmation", command_outcome(), details) from error
                raise
            except ExecutionFailureError:
                raise
            except Exception as error:
                raise temperature_failure(
                    error, stage, command_outcome(), details,
                    code="FURNACE_TEMPERATURE_TARGET_TIMEOUT" if isinstance(error, TemperatureTargetTimeout) else None,
                ) from error

        return await self.control.run_in_thread(do_change)

    async def _execute_change_gas_flow(self, params: dict):
        def do_change():
            self.control.check_cancelled()
            device_sel = params.get("deviceSelection", "")
            if not device_sel or ":" not in device_sel:
                raise ValueError("Invalid deviceSelection")
            addr = int(device_sel.split(":")[0])
            target_flow = params.get("targetFlowRate")
            stabilization_time = int(params.get("stabilizationTime", 10))
            self.control.check_cancelled()
            self.devices.mfc_set_setpoint(addr, target_flow)
            try:
                for _ in range(stabilization_time):
                    if self.control.wait_for_cancel(1.0):
                        break
                    status = self.devices.mfc_read_status(addr)
                    flow = status.get("flowSccm", 0)
                    if target_flow == 0 and -10 <= flow <= 4:
                        break
                    if target_flow and abs(flow - target_flow) / target_flow <= 0.05:
                        break
            finally:
                if self.control.cancel_requested:
                    self.devices.mfc_set_setpoint(addr, 0)
            self.control.check_cancelled()
            return None

        return await self.control.run_in_thread(do_change)

    async def _execute_measurement(
        self,
        node: dict,
        meas_type: str,
        params: dict,
        step: dict,
        *,
        interruptible: bool = True,
    ) -> MeasurementOutcome:
        from experiment_worker import build_output_path

        timestamp = time.strftime("%y%m%d_%H%M%S")
        path_config = self.context.path_config if isinstance(self.context.path_config, dict) else {}
        options = {
            "basePath": params.get("outputPath") or path_config.get("basePath") or "C:\\data\\archive",
            "projectName": params.get("projectName") or path_config.get("projectName") or "",
            "individualName": params.get("individualName") or path_config.get("individualName") or "",
            "measurementType": meas_type,
            "workflowId": self.context.workflow_id,
            "workflowName": self.context.workflow_name,
            "workflowTimestamp": timestamp,
        }
        if params.get("parentNodeType"):
            options["parentNodeType"] = params["parentNodeType"]
            options["nodeConfig"] = params.get("nodeConfig")
        output_path = build_output_path(options)

        env_context = {}
        furnace_status = await self.control.run_in_thread(self.devices.furnace_status)
        self.control.check_cancelled()
        if furnace_status.get("connected") and furnace_status.get("pv") is not None:
            env_context["furnace_temp"] = int(round(furnace_status["pv"]))
        mfc_status = await self.control.run_in_thread(self.devices.mfc_status)
        self.control.check_cancelled()
        mfc_flows = {}
        for device in mfc_status.get("devices", []) if mfc_status.get("connected") else []:
            flow = device.get("flowSccm")
            if flow is None:
                continue
            gas_name = device.get("gasType") or f"MFC{device.get('address')}"
            if gas_name == "Unknown" and device.get("address") is not None:
                gas_name = f"MFC{device['address']}"
            mfc_flows[gas_name] = flow
        if mfc_flows:
            env_context["mfc_flows"] = mfc_flows

        measurement_params = {
            **params,
            "outputPath": output_path,
            "output_path": output_path,
            "environment_context": env_context,
        }
        if interruptible:
            measurement_params["_cancel_requested"] = lambda: self.control.cancel_requested

        def stream_callback(data):
            self.runtime.emit_from_thread(
                WORKFLOW_MEASUREMENT,
                {
                    "executionId": self.context.execution_id,
                    "stepIndex": step.get("originalIndex", 0),
                    "nodeId": node.get("id", ""),
                    "iterationPath": step.get("iterationPath", []),
                    "data": data,
                },
            )

        try:
            result = await self.control.run_in_thread(self.devices.zahner_measure, meas_type, measurement_params, stream_callback)
        except Exception as e:
            if isinstance(e, MeasurementCancelled):
                raise WorkflowCancelled("Measurement cancelled by user") from e
            raise
        eis_data = result.get("eis_data") if isinstance(result, dict) else None
        if eis_data and ("eis_potentiostatic" in meas_type or "eis_galvanostatic" in meas_type):
            await self.runtime.emit(
                WORKFLOW_EIS,
                {
                    "executionId": self.context.execution_id,
                    "nodeIndex": step.get("originalIndex", 0),
                    "nodeId": node.get("id", ""),
                    "iterationPath": step.get("iterationPath", []),
                    "data": {
                        "frequency": eis_data.get("frequency"),
                        "z_real": eis_data.get("z_real"),
                        "z_imag": eis_data.get("z_imag"),
                        "point_count": eis_data.get("point_count"),
                        "csv_path": eis_data.get("csv_path"),
                    },
                },
            )

        return normalize_measurement_outcome(result, output_dir=output_path)


NodeHandler = Callable[[NodeExecutor, dict, dict, dict, NodeExecutionSpec], Awaitable[object]]
NODE_EXECUTORS: dict[str, NodeHandler] = {
    "zahner_startup": NodeExecutor.startup,
    "zahner_shutdown": NodeExecutor.shutdown,
    "wait": NodeExecutor.wait,
    "scheduled_wait": NodeExecutor.scheduled_wait,
    "change_temperature": NodeExecutor.temperature,
    "change_gas_flow": NodeExecutor.gas_flow,
    "measurement": NodeExecutor.measurement,
}


def validate_node_executor(node: dict) -> NodeExecutionSpec:
    spec = resolve_node_execution_spec(node.get("type"), node.get("config") or {})
    handler = NODE_EXECUTORS.get(spec.dispatch_kind)
    if handler is None:
        raise ValueError(f"Missing node executor: {spec.dispatch_kind}")
    if not inspect.iscoroutinefunction(handler):
        raise ValueError(f"Node executor must be asynchronous: {spec.dispatch_kind}")
    return spec


async def execute_node(context: NodeExecutionContext, node: dict, step: dict, params: dict):
    spec = validate_node_executor(node)
    await context.control.checkpoint()
    executor = NodeExecutor(context)
    return await NODE_EXECUTORS[spec.dispatch_kind](executor, node, step, params, spec)
