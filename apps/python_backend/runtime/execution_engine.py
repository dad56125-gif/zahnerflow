"""Single-user workflow execution engine."""

from __future__ import annotations

import asyncio
import math
import time
from datetime import datetime, timedelta
from typing import Optional

from devices.furnace.limits import validate_furnace_temperature
from runtime.execution_eta import params_for_eta
from runtime.temperature_control import (
    estimate_remaining_temperature_seconds,
    estimate_temperature_ramp_minutes,
)
from shared.contracts.events import WORKFLOW_EIS, WORKFLOW_MEASUREMENT


class WorkflowCancelled(RuntimeError):
    pass


NON_INTERRUPTIBLE_NODE_TYPES = {
    "eis_potentiostatic",
    "eis_galvanostatic",
}


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
        self._owner_name = ""
        self._workflow_name = ""
        self._workstation_type = None
        self._auto_startup_config: dict = {}
        self._path_config: dict = {}
        self._start_from_unrolled_index = 0

    @property
    def is_running(self) -> bool:
        return self.status in ("running", "paused", "cancelling")

    @property
    def is_cancelling(self) -> bool:
        return self._cancel_requested or self.status == "cancelling"

    async def start(self, payload: dict) -> dict:
        if self.is_running:
            raise RuntimeError("An execution is already active")

        self.workflow_id = payload.get("workflowId")
        self.execution_id = payload.get("executionId", f"exec_{int(time.time() * 1000)}")
        self.nodes = payload.get("nodes", [])
        self._owner_name = payload.get("ownerName", "")
        self._workflow_name = payload.get("workflowName", "")
        self._workstation_type = payload.get("workstationType")
        self._auto_startup_config = payload.get("autoStartupConfig") or {}
        self._path_config = payload.get("pathConfig") or {}
        self._start_from_unrolled_index = max(0, int(payload.get("startFromUnrolledIndex") or 0))
        self.current_step_index = 0
        self._cancel_requested = False
        self._pause_requested = False
        self.status = "running"

        self._task = asyncio.create_task(self._execute())
        return {"status": "started", "executionId": self.execution_id}

    async def pause(self) -> dict:
        if self.status != "running":
            raise RuntimeError("No running execution to pause")
        self._pause_requested = True
        self.status = "paused"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "paused", "error": None})
        return {"message": "Execution paused"}

    async def resume(self) -> dict:
        if self.status != "paused":
            raise RuntimeError("No paused execution to resume")
        self._pause_requested = False
        self.status = "running"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "running", "error": None})
        return {"message": "Execution resumed"}

    async def cancel(self) -> dict:
        if not self.is_running:
            raise RuntimeError("No running execution to cancel")
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

    async def _execute(self) -> None:
        from loop_unroller import MEASUREMENT_NODE_TYPES, unroll_loops

        start_time = time.time()
        execution_id = self.execution_id
        workflow_id = self.workflow_id
        unrolled = unroll_loops(self.nodes, auto_startup_config=self._auto_startup_config)
        steps = unrolled["steps"]
        total_steps = len(steps)
        start_from = min(self._start_from_unrolled_index, total_steps)
        boundary_prelude_indices = _boundary_prelude_indices(steps, start_from, MEASUREMENT_NODE_TYPES)
        await self.runtime.on_execution_timeline_started(
            {
                "executionId": execution_id,
                "workflowId": workflow_id,
                "nodes": self.nodes,
                "steps": steps,
                "ownerName": self._owner_name,
                "workflowName": self._workflow_name,
                "workstationType": self._workstation_type,
                "startFromUnrolledIndex": self._start_from_unrolled_index,
                "boundaryPreludeIndices": sorted(boundary_prelude_indices),
            }
        )

        try:
            for unrolled_idx, step in enumerate(steps):
                if unrolled_idx < start_from and unrolled_idx not in boundary_prelude_indices:
                    continue

                if self._cancel_requested:
                    raise WorkflowCancelled("Execution cancelled by user")

                while self._pause_requested and not self._cancel_requested:
                    await asyncio.sleep(0.5)
                if self._cancel_requested:
                    raise WorkflowCancelled("Execution cancelled by user")

                node = step.get("node") or self.nodes[step["originalIndex"]]
                node_type = node.get("type")
                params = node.get("config") or {}
                eta_params = params_for_eta(node_type, params)
                self.current_step_index = step["originalIndex"]

                for loop_event in step.get("loopEvents", []):
                    await self.runtime.on_loop_iteration_started(
                        {
                            "executionId": execution_id,
                            "workflowId": workflow_id,
                            **loop_event,
                        }
                    )

                step_info = {
                    "nodeId": node["id"],
                    "nodeType": node_type,
                    "index": step["originalIndex"],
                    "total": len(self.nodes),
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
                    result = await self._dispatch_node(node, step, params)
                    await self.runtime.on_execution_step_finished(
                        {
                            "executionId": execution_id,
                            "nodeIndex": step["originalIndex"],
                            "unrolledIndex": unrolled_idx,
                            "status": "completed",
                            "data": result,
                        }
                    )
                    step_finished = True
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
            self.status = "completed"
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
            final_status = "cancelled" if self._cancel_requested or self.status in ("cancelled", "cancelling") else "failed"
            self.status = final_status
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

    async def _dispatch_node(self, node: dict, step: dict, params: dict):
        node_type = node.get("type")
        if node_type == "startup":
            await asyncio.to_thread(self.devices.connect_zahner, params or {})
            return None
        if node_type == "shutdown":
            await asyncio.to_thread(self.devices.disconnect_zahner)
            return None
        if node_type in ("delay", "wait_delay"):
            await self._execute_wait_delay(float(params.get("duration", 1)))
            return None
        if node_type == "scheduled_start":
            scheduled_at = self._scheduled_datetime(params)
            delay = (scheduled_at - datetime.now()).total_seconds()
            if delay <= 0:
                raise RuntimeError(f"Scheduled time has already passed: {scheduled_at.isoformat()}")
            await self._execute_wait_delay(delay)
            return {"scheduledFor": scheduled_at.isoformat()}
        if node_type == "change_temperature":
            return await self._execute_change_temperature(params)
        if node_type == "change_gas_flow":
            return await self._execute_change_gas_flow(params)
        if node_type in (
            "eis_potentiostatic",
            "eis_galvanostatic",
            "ocp",
            "ocp_measurement",
            "voltage_ramp",
            "current_ramp",
            "chronoamperometry",
            "chronopotentiometry",
            "measurement",
        ):
            meas_type = params.get("measurement_type") if node_type == "measurement" else node_type
            return await self._execute_measurement(node, meas_type, params, step)
        return None

    async def _execute_wait_delay(self, duration: float):
        deadline = time.monotonic() + max(0.0, duration)
        while time.monotonic() < deadline:
            if self._cancel_requested:
                raise WorkflowCancelled("Wait node cancelled by user")
            await asyncio.sleep(min(0.25, max(0.0, deadline - time.monotonic())))

    def _scheduled_datetime(self, params: dict) -> datetime:
        now = datetime.now()
        hour = max(0, min(23, int(params.get("hour", 0) or 0)))
        minute = max(0, min(59, int(params.get("minute", 0) or 0)))
        scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if params.get("nextDay"):
            scheduled += timedelta(days=1)
        return scheduled


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
            self.devices.furnace_write_param(0x50, int(round(current_temp)))
            self.devices.furnace_write_param(0x51, calculated_duration)
            self.devices.furnace_write_param(0x52, int(round(target_temp)))
            self.devices.furnace_write_param(0x53, 5001)
            self.devices.furnace_write_param(0x54, int(round(target_temp)))
            self.devices.furnace_write_param(0x00, 28)
            self.devices.furnace_write_param(0x15, 0)

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
                    raise RuntimeError("Execution cancelled")
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
                    raise RuntimeError("Execution cancelled")
                time.sleep(1.0)
                status = self.devices.mfc_read_status(addr)
                flow = status.get("flowSccm", 0)
                if target_flow == 0 and -10 <= flow <= 4:
                    break
                if target_flow and abs(flow - target_flow) / target_flow <= 0.05:
                    break
            return None

        return await asyncio.to_thread(do_change)

    async def _execute_measurement(self, node: dict, meas_type: str, params: dict, step: dict):
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
        if meas_type not in NON_INTERRUPTIBLE_NODE_TYPES:
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
        if not result:
            return None

        eis_data = result.get("eis_data")
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

        return {
            "outputDir": output_path,
            "outputFile": result.get("output_file") or result.get("full_path"),
            "csvPath": result.get("csv_path") or (eis_data.get("csv_path") if eis_data else None),
            "data_points": result.get("points") or (eis_data.get("point_count") if eis_data else 0),
        }


def _boundary_prelude_indices(steps: list[dict], start_from: int, measurement_node_types: set[str]) -> set[int]:
    if start_from <= 0:
        return set()

    has_remaining_measurement = any(
        step.get("nodeType") in measurement_node_types
        for step in steps[start_from:]
    )
    if not has_remaining_measurement:
        return set()

    startup_indices = [
        index
        for index, step in enumerate(steps[:start_from])
        if step.get("nodeType") == "startup" and step.get("autoBoundary")
    ]
    if not startup_indices:
        return set()

    return {startup_indices[-1]}
