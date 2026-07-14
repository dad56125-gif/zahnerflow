"""Single-user workflow execution engine."""

from __future__ import annotations

import asyncio
import math
import time
from datetime import datetime
from typing import Optional

from devices.furnace.limits import validate_furnace_temperature
from runtime.execution_eta import params_for_eta
from runtime.execution_planner import ExecutionPlan
from runtime.execution_semantics import (
    ExecutionIdMismatchError,
    InvalidExecutionTransitionError,
    MeasurementOutcome,
    NoActiveExecutionError,
    is_active_execution_status,
    normalize_measurement_outcome,
    parse_scheduled_at,
    require_node_execution_spec,
)
from runtime.temperature_control import (
    estimate_remaining_temperature_seconds,
    estimate_temperature_ramp_minutes,
)
from shared.contracts.events import WORKFLOW_EIS, WORKFLOW_MEASUREMENT


class WorkflowCancelled(RuntimeError):
    pass


class ExecutionEngine:
    def __init__(self, runtime):
        self.runtime = runtime
        self.devices = runtime.devices
        self.status = "idle"
        self.execution_id: Optional[str] = None
        self.workflow_id: Optional[str] = None
        self.nodes: list[dict] = []
        self.current_step_index = 0
        self._cancel_requested = False
        self._pause_requested = False
        self._task: Optional[asyncio.Task] = None
        self._plan: ExecutionPlan | None = None
        self._owner_name = ""
        self._workflow_name = ""
        self._workstation_type = None
        self._path_config: dict = {}

    @property
    def is_running(self) -> bool:
        return is_active_execution_status(self.status)

    @property
    def is_cancelling(self) -> bool:
        return self._cancel_requested or self.status == "cancelling"

    async def start(self, payload: dict) -> dict:
        if self.is_running:
            raise RuntimeError("An execution is already active")

        plan = payload.get("executionPlan")
        if not isinstance(plan, ExecutionPlan):
            raise RuntimeError("Execution plan is required")

        self.workflow_id = payload.get("workflowId")
        self.execution_id = payload.get("executionId", f"exec_{int(time.time() * 1000)}")
        self._plan = plan
        self.nodes = plan.nodes
        self._owner_name = payload.get("ownerName", "")
        self._workflow_name = payload.get("workflowName", "")
        self._workstation_type = payload.get("workstationType")
        self._path_config = payload.get("pathConfig") or {}
        self.current_step_index = 0
        self._cancel_requested = False
        self._pause_requested = False
        self.status = "running"

        self._task = asyncio.create_task(self._execute())
        return {"status": "started", "executionId": self.execution_id}

    async def pause(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        if self.status != "running":
            raise InvalidExecutionTransitionError(f"Cannot pause execution while status is {self.status}")
        self._pause_requested = True
        self.status = "paused"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "paused", "error": None})
        return {"message": "Execution paused"}

    async def resume(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        if self.status != "paused":
            raise InvalidExecutionTransitionError(f"Cannot resume execution while status is {self.status}")
        self._pause_requested = False
        self.status = "running"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "running", "error": None})
        return {"message": "Execution resumed"}

    async def cancel(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        self._cancel_requested = True
        self._pause_requested = False
        self.status = "cancelling"
        await self.runtime.on_experiment_state(
            {
                "executionId": self.execution_id,
                "workflowId": self.workflow_id,
                "status": "cancelling",
                "error": None,
            }
        )
        return {"message": "Execution cancellation requested"}

    def _require_execution_target(self, expected_execution_id: str) -> None:
        if not self.execution_id or not self.is_running:
            raise NoActiveExecutionError("No active execution")
        if self.execution_id != expected_execution_id:
            raise ExecutionIdMismatchError("Execution id does not match active execution")

    async def _execute(self) -> None:
        start_time = time.time()
        execution_id = self.execution_id
        workflow_id = self.workflow_id
        plan = self._plan
        if plan is None:
            raise RuntimeError("Execution plan is required")

        steps = plan.steps
        total_steps = len(steps)
        start_from = plan.start_from_unrolled_index
        await self.runtime.on_execution_timeline_started(
            {
                "executionId": execution_id,
                "workflowId": workflow_id,
                "nodes": self.nodes,
                "steps": steps,
                "ownerName": self._owner_name,
                "workflowName": self._workflow_name,
                "workstationType": self._workstation_type,
                "startFromUnrolledIndex": start_from,
                "boundaryPreludeIndices": list(plan.boundary_prelude_indices),
                "timeline": plan.timeline,
            }
        )

        try:
            for unrolled_idx, step in enumerate(steps):
                if unrolled_idx < start_from and unrolled_idx not in plan.boundary_prelude_indices:
                    continue

                await self._wait_until_runnable()

                node = step.get("node") or plan.nodes[step["originalIndex"]]
                node_type = node.get("type")
                params = node.get("config") or {}
                eta_params = params_for_eta(node_type, params)
                if step.get("scheduledAt"):
                    eta_params["scheduledAt"] = step["scheduledAt"]
                self.current_step_index = step["originalIndex"]

                for loop_event in step.get("loopEvents", []):
                    await self.runtime.on_loop_iteration_started(
                        {
                            "executionId": execution_id,
                            "workflowId": workflow_id,
                            **loop_event,
                        }
                    )
                await self._wait_until_runnable()

                step_info = {
                    "nodeId": node["id"],
                    "nodeType": node_type,
                    "index": step["originalIndex"],
                    "total": len(plan.nodes),
                    "unrolledIndex": unrolled_idx,
                    "unrolledTotal": total_steps,
                    "iterationPath": step.get("iterationPath", []),
                    "blockPath": step.get("blockPath", []),
                }

                step_info = await self.runtime.on_execution_step_started(
                    {
                        "executionId": execution_id,
                        "workflowId": workflow_id,
                        "stepInfo": step_info,
                        "params": eta_params,
                    }
                )

                step_finished = False
                try:
                    await self._wait_until_runnable()
                    dispatch_result = await self._dispatch_node(node, step, params)
                    outcome = dispatch_result if isinstance(dispatch_result, MeasurementOutcome) else None
                    status = outcome.step_status if outcome else "completed"
                    result = outcome.result if outcome else dispatch_result
                    await self.runtime.on_execution_step_finished(
                        {
                            "executionId": execution_id,
                            "nodeIndex": step["originalIndex"],
                            "unrolledIndex": unrolled_idx,
                            "status": status,
                            "data": result,
                            "warnings": list(outcome.warnings) if outcome else [],
                            "artifacts": list(outcome.artifacts) if outcome else [],
                        }
                    )
                    step_finished = True
                    if status == "cancelled":
                        raise WorkflowCancelled(result.get("reason") or "Measurement cancelled")
                    if status == "failed":
                        raise RuntimeError(result.get("reason") or "Measurement failed")
                    if self._cancel_requested:
                        raise WorkflowCancelled("Execution cancelled after current step completed")
                except WorkflowCancelled as e:
                    if not step_finished:
                        await self.runtime.on_execution_step_finished(
                            {
                                "executionId": execution_id,
                                "nodeIndex": step["originalIndex"],
                                "unrolledIndex": unrolled_idx,
                                "status": "cancelled",
                                "data": {"reason": str(e)},
                            }
                        )
                    raise
                except Exception as e:
                    if not step_finished:
                        await self.runtime.on_execution_step_finished(
                            {
                                "executionId": execution_id,
                                "nodeIndex": step["originalIndex"],
                                "unrolledIndex": unrolled_idx,
                                "status": "failed",
                                "data": {"error": str(e)},
                            }
                        )
                    raise

            duration_ms = int((time.time() - start_time) * 1000)
            await self.runtime.on_execution_finished(
                {
                    "executionId": execution_id,
                    "status": "completed",
                    "durationMs": duration_ms,
                    "error": None,
                    "summary": {"total_steps": total_steps},
                }
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            final_status = (
                "cancelled"
                if isinstance(e, WorkflowCancelled) or self._cancel_requested or self.status in ("cancelled", "cancelling")
                else "failed"
            )
            await self.runtime.on_execution_finished(
                {
                    "executionId": execution_id,
                    "status": final_status,
                    "durationMs": duration_ms,
                    "error": str(e),
                    "summary": {},
                }
            )
        finally:
            self.status = "idle"
            self.execution_id = None
            self._plan = None

    async def _dispatch_node(self, node: dict, step: dict, params: dict):
        node_type = node.get("type")
        spec = require_node_execution_spec(node_type)
        if spec.dispatch_kind == "zahner_startup":
            await asyncio.to_thread(self.devices.connect_zahner, params or {})
            return None
        if spec.dispatch_kind == "zahner_shutdown":
            await asyncio.to_thread(self.devices.disconnect_zahner)
            return None
        if spec.dispatch_kind == "wait":
            await self._execute_wait_delay(float(params.get("duration", 1)))
            return None
        if spec.dispatch_kind == "scheduled_wait":
            scheduled_value = step.get("scheduledAt")
            if not scheduled_value:
                raise RuntimeError("scheduled_start is missing the absolute scheduledAt from its execution plan")
            scheduled_at = parse_scheduled_at(scheduled_value)
            delay = (scheduled_at - datetime.now()).total_seconds()
            if delay <= 0:
                raise RuntimeError(f"Scheduled time has already passed: {scheduled_at.isoformat()}")
            await self._execute_wait_delay(delay)
            return {"scheduledFor": scheduled_at.isoformat()}
        if spec.dispatch_kind == "change_temperature":
            return await self._execute_change_temperature(params)
        if spec.dispatch_kind == "change_gas_flow":
            return await self._execute_change_gas_flow(params)
        if spec.dispatch_kind == "measurement":
            meas_type = params.get("measurement_type") if node_type == "measurement" else spec.measurement_type
            if not meas_type:
                raise RuntimeError("measurement node is missing measurement_type")
            return await self._execute_measurement(node, meas_type, params, step, interruptible=spec.interruptible)
        raise RuntimeError(f"Unsupported dispatch kind for {node_type}: {spec.dispatch_kind}")

    async def _execute_wait_delay(self, duration: float):
        deadline = time.monotonic() + max(0.0, duration)
        while time.monotonic() < deadline:
            if self._cancel_requested:
                raise WorkflowCancelled("Wait node cancelled by user")
            await asyncio.sleep(min(0.25, max(0.0, deadline - time.monotonic())))

    async def _wait_until_runnable(self) -> None:
        if self._cancel_requested:
            raise WorkflowCancelled("Execution cancelled by user")
        while self._pause_requested and not self._cancel_requested:
            await asyncio.sleep(0.25)
        if self._cancel_requested:
            raise WorkflowCancelled("Execution cancelled by user")

    async def _execute_change_temperature(self, params: dict):
        def do_change():
            status = self.devices.furnace_status()
            current_temp = float(status.get("pv", 25.0))
            target_temp = validate_furnace_temperature(params.get("targetTemperature"), "targetTemperature")
            rate = float(params.get("rate", 5))
            tolerance = max(0.0, float(params.get("tolerance", 5)))
            stabilization_time = max(0.0, float(params.get("stabilizationTime", 30)))
            ambient_temperature = float(params.get("ambientTemperature", 25) or 25)
            cooling_linear_floor = float(params.get("coolingLinearFloor", 500) or 500)

            ramp_minutes = estimate_temperature_ramp_minutes(
                current_temp=current_temp,
                target_temp=target_temp,
                rate=rate,
                ambient_temperature=ambient_temperature,
                cooling_linear_floor=cooling_linear_floor,
            )
            calculated_duration = int(math.ceil(ramp_minutes))
            # AI-518P program temperatures use raw tenths of a degree, including
            # the reserved 28-30 scratch segments used by this node.
            self.devices.furnace_write_param(0x50, int(round(current_temp * 10)))
            self.devices.furnace_write_param(0x51, calculated_duration)
            self.devices.furnace_write_param(0x52, int(round(target_temp * 10)))
            self.devices.furnace_write_param(0x53, 5001)
            self.devices.furnace_write_param(0x54, int(round(target_temp * 10)))
            self.devices.furnace_write_param(0x00, 28)
            self.devices.furnace_write_param(0x15, 0)
            confirm_furnace_action = getattr(self.runtime, "confirm_furnace_action_from_worker", None)
            if callable(confirm_furnace_action):
                confirm_furnace_action("run", self.execution_id)

            base_wait_s = calculated_duration * 60 + stabilization_time
            min_extension_s = float(params.get("temperatureProgressExtensionSeconds", 600) or 600)
            stall_timeout_s = float(params.get("temperatureStallTimeoutSeconds", 1800) or 1800)
            hard_cap_s = float(
                params.get(
                    "maxTemperatureWaitSeconds",
                    max(base_wait_s * 4.0, base_wait_s + 3600.0, 21600.0),
                )
            )
            start = time.monotonic()
            deadline = start + base_wait_s
            hard_deadline = start + hard_cap_s
            best_distance = abs(current_temp - target_temp)
            last_progress_at = start
            progress_epsilon = max(0.25, tolerance * 0.25)
            samples: list[tuple[float, float]] = [(start, current_temp)]

            while True:
                if self._cancel_requested:
                    self.devices.furnace_write_param(0x15, 12)
                    confirm_furnace_action = getattr(self.runtime, "confirm_furnace_action_from_worker", None)
                    if callable(confirm_furnace_action):
                        confirm_furnace_action("stop", self.execution_id)
                    raise WorkflowCancelled("Temperature change cancelled by user")
                time.sleep(2.0)
                status = self.devices.furnace_status()
                now = time.monotonic()
                pv = float(status.get("pv", current_temp))
                distance = abs(pv - target_temp)
                samples.append((now, pv))
                samples = [sample for sample in samples if now - sample[0] <= 300.0]

                if distance <= tolerance:
                    return {
                        "reached": True,
                        "targetTemperature": target_temp,
                        "finalTemperature": pv,
                        "tolerance": tolerance,
                        "elapsedSeconds": now - start,
                    }

                if distance < best_distance - progress_epsilon:
                    best_distance = distance
                    last_progress_at = now

                remaining_s = estimate_remaining_temperature_seconds(samples, target_temp, tolerance)
                if remaining_s is not None and remaining_s > 0:
                    adaptive_deadline = now + remaining_s * 1.5 + stabilization_time
                    deadline = min(hard_deadline, max(deadline, adaptive_deadline))

                if now < deadline:
                    continue

                if now - last_progress_at <= stall_timeout_s and now < hard_deadline:
                    deadline = min(hard_deadline, now + min_extension_s)
                    continue

                raise RuntimeError(
                    "Furnace temperature did not approach target "
                    f"{target_temp:.1f}C within the adaptive wait window; "
                    f"last pv={pv:.1f}C, tolerance={tolerance:.1f}C"
                )

        return await asyncio.to_thread(do_change)

    async def _execute_change_gas_flow(self, params: dict):
        def do_change():
            device_sel = params.get("deviceSelection", "")
            if not device_sel or ":" not in device_sel:
                raise ValueError("Invalid deviceSelection")
            addr = int(device_sel.split(":")[0])
            target_flow = params.get("targetFlowRate")
            stabilization_time = int(params.get("stabilizationTime", 10))
            self.devices.mfc_set_setpoint(addr, target_flow)

            for _ in range(stabilization_time):
                if self._cancel_requested:
                    self.devices.mfc_set_setpoint(addr, 0)
                    raise WorkflowCancelled("Gas flow change cancelled by user")
                time.sleep(1.0)
                status = self.devices.mfc_read_status(addr)
                flow = status.get("flowSccm", 0)
                if target_flow == 0 and -10 <= flow <= 4:
                    break
                if target_flow and abs(flow - target_flow) / target_flow <= 0.05:
                    break
            return None

        return await asyncio.to_thread(do_change)

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
        path_config = self._path_config if isinstance(self._path_config, dict) else {}
        options = {
            "basePath": params.get("outputPath") or path_config.get("basePath") or "C:\\data\\archive",
            "projectName": params.get("projectName") or path_config.get("projectName") or "",
            "individualName": params.get("individualName") or path_config.get("individualName") or "",
            "measurementType": meas_type,
            "workflowId": self.workflow_id,
            "workflowName": self._workflow_name,
            "workflowTimestamp": timestamp,
        }
        if params.get("parentNodeType"):
            options["parentNodeType"] = params["parentNodeType"]
            options["nodeConfig"] = params.get("nodeConfig")
        output_path = build_output_path(options)

        env_context = {}
        furnace_status = self.devices.furnace_status()
        if furnace_status.get("connected") and furnace_status.get("pv") is not None:
            env_context["furnace_temp"] = int(round(furnace_status["pv"]))
        mfc_status = self.devices.mfc_status()
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
            measurement_params["_cancel_requested"] = lambda: self._cancel_requested

        def stream_callback(data):
            self.runtime.emit_from_thread(
                WORKFLOW_MEASUREMENT,
                {
                    "executionId": self.execution_id,
                    "stepIndex": step.get("originalIndex", 0),
                    "nodeId": node.get("id", ""),
                    "iterationPath": step.get("iterationPath", []),
                    "data": data,
                },
            )

        try:
            result = await asyncio.to_thread(self.devices.zahner_measure, meas_type, measurement_params, stream_callback)
        except Exception as e:
            if self._cancel_requested:
                raise WorkflowCancelled("Measurement cancelled by user") from e
            raise
        eis_data = result.get("eis_data") if isinstance(result, dict) else None
        if eis_data and ("eis_potentiostatic" in meas_type or "eis_galvanostatic" in meas_type):
            await self.runtime.emit(
                WORKFLOW_EIS,
                {
                    "executionId": self.execution_id,
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
