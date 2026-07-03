"""Application runtime for the single-process local backend."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

from device_data_service import furnace_data, mfc_data
from runtime.device_manager import DeviceManager
from runtime.execution_engine import ExecutionEngine
from runtime.execution_eta import build_timeline
from runtime.execution_recorder import finish_execution, finish_step, start_step


DEVICE_CAPABILITIES = {
    "furnace": ["connect", "status", "run", "pause", "stop", "program_segments", "presets", "history"],
    "mfc": ["connect", "status", "scan", "setpoint", "history"],
    "zahner": ["connect", "status", "measure"],
}


class AppRuntime:
    def __init__(self):
        self.sio = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self.devices = DeviceManager()
        self.execution = ExecutionEngine(self)
        self._poll_task: asyncio.Task | None = None
        self._running = False
        self.furnace_status: dict = {"connected": False}
        self.mfc_status: dict = {"connected": False, "devices": []}
        self.zahner_status: dict = {"connected": False}
        self.experiment_state: dict = {
            "status": "idle",
            "executionId": None,
            "workflowId": None,
            "workflowName": "",
            "ownerName": "",
            "workstationType": None,
            "nodes": [],
            "currentStep": None,
            "startTime": None,
            "endTime": None,
            "duration": 0,
            "eta": None,
            "error": None,
        }
        self._execution_started_at: str | None = None
        self._execution_timeline: dict | None = None
        self._current_step_started_at: str | None = None
        self._current_unrolled_index: int | None = None
        self._mfc_scan_lock = asyncio.Lock()
        self._mfc_scan_active = False
        self._mfc_scan_cancel_requested = False

    def set_sio(self, sio) -> None:
        self.sio = sio

    @property
    def is_running(self) -> bool:
        return self._running

    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        self._running = True
        if not self._poll_task or self._poll_task.done():
            self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        await asyncio.to_thread(self.devices.disconnect_all)

    async def emit(self, event: str, payload: dict) -> None:
        if self.sio:
            await self.sio.emit(event, payload)

    def emit_from_thread(self, event: str, payload: dict) -> None:
        if self.loop and self.sio:
            asyncio.run_coroutine_threadsafe(self.sio.emit(event, payload), self.loop)

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.poll_once()
            except Exception as e:
                print(f"[Runtime] Poll error: {e}")
            await asyncio.sleep(2.0)

    async def poll_once(self) -> None:
        if self.devices.furnace_connected:
            try:
                status = await asyncio.to_thread(self.devices.furnace_status)
                await self.on_device_status("furnace", status)
            except Exception as e:
                print(f"[Runtime] Furnace poll error: {e}")

        if self.devices.mfc_connected:
            try:
                status = await asyncio.to_thread(self.devices.mfc_status)
                await self.on_device_status("mfc", status)
            except Exception as e:
                print(f"[Runtime] MFC poll error: {e}")

    async def on_device_status(self, device: str, status: dict) -> None:
        ts = datetime.utcnow().isoformat() + "Z"
        envelope = self._device_status_envelope(device, status, ts)
        await self.emit("deviceStatusUpdate", envelope)

        if device == "furnace":
            self.furnace_status = {"device": "furnace", **status}
            pv = status.get("pv", 0)
            sv = status.get("sv", 0)
            mv = status.get("mv", 0)
            sc = status.get("statusCode", 0)
            segment = status.get("segment", 0)
            segment_time = status.get("segmentTime", 0)
            segment_time_set = status.get("segmentTimeSet", 0)
            furnace_data.add_sample(
                pv=pv,
                sv=sv,
                mv=mv,
                status_code=sc,
                segment=segment,
                segment_time=segment_time,
                segment_time_set=segment_time_set,
            )
        elif device == "mfc":
            self.mfc_status = {"device": "mfc", **status}
            devices = status.get("devices", [])
            for dev in devices:
                addr = dev.get("address")
                if addr is not None:
                    mfc_data.add_flow_sample(
                        address=addr,
                        flow_sccm=dev.get("flowSccm", 0),
                        flow_percent=dev.get("flowPercent", 0),
                        digital_setpoint_percent=dev.get("digitalSetpointPercent", 0),
                        active_setpoint_percent=dev.get("activeSetpointPercent", 0),
                    )

    async def on_device_connection(self, device: str, connected: bool) -> None:
        status = await self.device_status(device)
        await self.emit("deviceStatusUpdate", self._device_status_envelope(device, status))

    async def on_experiment_state(self, payload: dict) -> None:
        now = datetime.utcnow().isoformat() + "Z"
        self.experiment_state.update(
            {
                "status": payload.get("status", self.experiment_state.get("status")),
                "executionId": payload.get("executionId", self.experiment_state.get("executionId")),
                "workflowId": payload.get("workflowId", self.experiment_state.get("workflowId")),
                "workflowName": payload.get("workflowName", self.experiment_state.get("workflowName", "")),
                "ownerName": payload.get("ownerName", self.experiment_state.get("ownerName", "")),
                "workstationType": payload.get("workstationType", self.experiment_state.get("workstationType")),
                "nodes": payload.get("nodes", self.experiment_state.get("nodes", [])),
                "currentStep": payload.get("currentStep", self.experiment_state.get("currentStep")),
                "startTime": payload.get("startTime", self.experiment_state.get("startTime")),
                "endTime": payload.get("endTime", self.experiment_state.get("endTime")),
                "duration": payload.get("duration", self._elapsed_seconds(now)),
                "eta": payload.get("eta", self._eta_snapshot(now)),
                "error": payload.get("error", self.experiment_state.get("error")),
                "timestamp": now,
            }
        )
        await self.emit("systemStateSnapshot", self.experiment_state)

    async def on_execution_timeline_started(self, payload: dict) -> None:
        now = datetime.utcnow().isoformat() + "Z"
        self._execution_started_at = now
        self._execution_timeline = build_timeline(payload.get("nodes", []), payload.get("steps", []), self.devices)
        self._current_step_started_at = None
        self._current_unrolled_index = None
        await self.on_experiment_state(
            {
                "executionId": payload.get("executionId"),
                "workflowId": payload.get("workflowId"),
                "workflowName": payload.get("workflowName"),
                "ownerName": payload.get("ownerName"),
                "workstationType": payload.get("workstationType"),
                "nodes": payload.get("nodes", []),
                "status": "running",
                "currentStep": None,
                "startTime": now,
                "endTime": None,
                "duration": 0,
                "eta": self._eta_snapshot(now),
                "error": None,
            }
        )

    async def on_execution_step_started(self, payload: dict) -> dict:
        now = datetime.utcnow().isoformat() + "Z"
        step_info = dict(payload.get("stepInfo") or {})
        unrolled_index = step_info.get("unrolledIndex")
        timeline_step = self._timeline_step(unrolled_index)
        if timeline_step:
            step_info.update(
                {
                    "estimatedSeconds": timeline_step.get("estimatedSeconds"),
                    "etaSource": timeline_step.get("etaSource"),
                    "etaConfidence": timeline_step.get("etaConfidence"),
                }
            )

        self._current_unrolled_index = unrolled_index
        self._current_step_started_at = now

        if payload.get("executionId") and unrolled_index is not None:
            start_step(
                execution_id=payload["executionId"],
                original_index=step_info["index"],
                unrolled_index=unrolled_index,
                node_id=step_info.get("nodeId") or "",
                node_type=step_info.get("nodeType") or "",
                params=payload.get("params") or {},
                iteration_path=step_info.get("iterationPath") or [],
                block_path=step_info.get("blockPath") or [],
                estimated_seconds=float(step_info.get("estimatedSeconds") or 0),
                eta_source=step_info.get("etaSource") or "fallback",
            )

        await self.on_experiment_state(
            {
                "executionId": payload.get("executionId"),
                "workflowId": payload.get("workflowId"),
                "status": "running",
                "currentStep": step_info,
                "duration": self._elapsed_seconds(now),
                "eta": self._eta_snapshot(now),
                "error": None,
            }
        )
        await self.on_node_status(
            {
                "executionId": payload.get("executionId"),
                "nodeIndex": step_info.get("index"),
                "status": "running",
                "data": None,
            }
        )
        return step_info

    async def on_loop_iteration_started(self, payload: dict) -> None:
        await self.emit(
            "loopiteration_start",
            {
                "loopStartIndex": payload.get("loopStartIndex"),
                "iteration": payload.get("iteration"),
                "totalIterations": payload.get("totalIterations"),
                "nodeIndices": payload.get("nodeIndices") or [],
            },
        )

    async def on_node_status(self, payload: dict) -> None:
        await self.emit(
            "nodeStatusUpdate",
            {"i": payload.get("nodeIndex"), "s": payload.get("status"), "d": payload.get("data")},
        )

    async def on_execution_step_finished(self, payload: dict) -> None:
        exec_id = payload.get("executionId")
        unrolled_index = payload.get("unrolledIndex")
        status = payload.get("status")
        data = payload.get("data")
        if exec_id and unrolled_index is not None:
            recorded = finish_step(
                execution_id=exec_id,
                unrolled_index=unrolled_index,
                status=status,
                result=data,
            )
            timeline_step = self._timeline_step(unrolled_index)
            if timeline_step and recorded and recorded.get("actualSeconds") is not None and status == "completed":
                timeline_step["actualSeconds"] = recorded["actualSeconds"]
                timeline_step["etaSource"] = "actual"
                timeline_step["etaConfidence"] = 1.0
                timeline_step["completed"] = True

        await self.on_node_status(
            {
                "executionId": exec_id,
                "nodeIndex": payload.get("nodeIndex"),
                "status": status,
                "data": data,
            }
        )
        now = datetime.utcnow().isoformat() + "Z"
        await self.on_experiment_state(
            {
                "executionId": exec_id,
                "status": "running" if status == "completed" else status,
                "duration": self._elapsed_seconds(now),
                "eta": self._eta_snapshot(now),
                "error": data.get("error") if data and status == "failed" else None,
            }
        )

    async def on_execution_finished(self, payload: dict) -> None:
        exec_id = payload.get("executionId")
        status = payload.get("status")
        duration_ms = payload.get("durationMs")
        error = payload.get("error")
        if exec_id:
            finish_execution(exec_id, status, duration_ms, error)

        now = datetime.utcnow().isoformat() + "Z"
        self.experiment_state.update(
            {
                "status": status,
                "duration": (duration_ms or 0) / 1000,
                "endTime": now,
                "eta": self._eta_snapshot(now, finished=True),
                "error": error,
                "timestamp": now,
            }
        )
        await self.emit("systemStateSnapshot", self.experiment_state)
        await self.emit(
            "executionFinished",
            {
                "executionId": exec_id,
                "status": status,
                "durationMs": duration_ms,
                "error": error,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
        await self.emit(
            "notification",
            {
                "id": f"notification_{int(time.time() * 1000)}",
                "type": "success" if status == "completed" else "error",
                "title": "执行完成" if status == "completed" else "执行失败",
                "message": (
                    f"{self.experiment_state.get('workflowName') or exec_id} 已完成"
                    if status == "completed"
                    else f"{self.experiment_state.get('workflowName') or exec_id} 执行失败"
                ),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "details": {
                    "executionId": exec_id,
                    "workflowId": self.experiment_state.get("workflowId"),
                    "durationMs": duration_ms,
                    "error": error,
                },
            },
        )
        try:
            from email_service import email_service

            await email_service.send_workflow_notification(
                type_="completed" if status == "completed" else "failed",
                workflow_id=self.experiment_state.get("workflowId"),
                user=self.experiment_state.get("ownerName", ""),
                details={
                    "duration": duration_ms,
                    "error": error,
                    "workflowName": self.experiment_state.get("workflowName", ""),
                },
            )
        except Exception as email_err:
            print(f"[Runtime] Email notification error: {email_err}")

    async def connect_device(self, device: str, config: dict) -> dict:
        if device == "furnace":
            result = await asyncio.to_thread(self.devices.connect_furnace, config)
            await self.on_device_connection("furnace", True)
            return {"device": "furnace", **result}
        if device == "mfc":
            result = await asyncio.to_thread(self.devices.connect_mfc, config)
            await self.on_device_connection("mfc", True)
            return {"device": "mfc", **result}
        if device == "zahner":
            result = await asyncio.to_thread(self.devices.connect_zahner, config)
            await self.on_device_connection("zahner", True)
            return {"device": "zahner", **result}
        raise ValueError(f"Unknown device: {device}")

    async def disconnect_device(self, device: str) -> dict:
        if device == "furnace":
            await asyncio.to_thread(self.devices.disconnect_furnace)
        elif device == "mfc":
            await asyncio.to_thread(self.devices.disconnect_mfc)
        elif device == "zahner":
            await asyncio.to_thread(self.devices.disconnect_zahner)
        else:
            raise ValueError(f"Unknown device: {device}")
        await self.on_device_connection(device, False)
        return {"device": device, "connected": False}

    async def device_status(self, device: str) -> dict:
        if device == "furnace":
            return await asyncio.to_thread(self.devices.furnace_status)
        if device == "mfc":
            return await asyncio.to_thread(self.devices.mfc_status)
        if device == "zahner":
            return await asyncio.to_thread(self.devices.zahner_status)
        raise ValueError(f"Unknown device: {device}")

    async def runtime_device_status(self, device: str) -> dict:
        status = await self.device_status(device)
        return self._device_status_envelope(device, status)

    def _device_status_envelope(self, device: str, status: dict, timestamp: str | None = None) -> dict:
        connected = bool(status.get("connected", False))
        payload = {key: value for key, value in status.items() if key != "connected"}
        device_count = len(status.get("devices", [])) if device == "mfc" else (1 if connected else 0)
        profile = self.devices.device_profile(device)
        diagnostics = self.devices.device_diagnostics(device)
        return {
            "device": device,
            "connected": connected,
            "mode": self.devices.device_mode(device),
            "profile": profile,
            "timestamp": timestamp or datetime.utcnow().isoformat() + "Z",
            "payload": payload,
            "connectionState": {
                "status": "connected" if connected else "disconnected",
                "mode": self.devices.device_mode(device),
                "profile": profile,
            },
            "diagnostics": diagnostics,
            "capabilities": DEVICE_CAPABILITIES.get(device, []),
            "deviceCount": device_count,
            "error": status.get("error") or diagnostics.get("lastError"),
        }

    async def furnace_run(self) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_param, 0x15, 0)

    async def furnace_stop(self) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_param, 0x15, 12)

    async def furnace_pause(self) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_param, 0x15, 4)

    async def furnace_set_segment(self, segment: int) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_param, 0x00, segment)

    async def furnace_write_param(self, code: int, value: int) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_param, code, value)

    async def furnace_read_segments(self) -> list[dict]:
        return await asyncio.to_thread(self.devices.furnace_read_segments)

    async def furnace_write_segments(self, segments: list[dict]) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_segments, segments)

    async def mfc_scan(self, address: int) -> dict:
        return await asyncio.to_thread(self.devices.mfc_scan, address)

    async def mfc_scan_range(
        self,
        start_address: int,
        end_address: int,
        port: str | None = None,
        diagnostic_start_address: int | None = None,
        diagnostic_end_address: int | None = None,
    ) -> list[dict]:
        if start_address > end_address:
            start_address, end_address = end_address, start_address

        async with self._mfc_scan_lock:
            self._mfc_scan_active = True
            self._mfc_scan_cancel_requested = False
            self.devices.record_mfc_scan_range(
                diagnostic_start_address if diagnostic_start_address is not None else start_address,
                diagnostic_end_address if diagnostic_end_address is not None else end_address,
            )
            discovered: list[dict] = []

            try:
                for address in range(start_address, end_address + 1):
                    if self._mfc_scan_cancel_requested:
                        break

                    result = await self.mfc_scan(address)
                    device_info = result.get("device")
                    if result.get("found") and device_info:
                        discovered.append(
                            {
                                "address": device_info.get("address", device_info.get("device_address", address)),
                                "gasType": device_info.get("gasType", device_info.get("gas_type", "Unknown")),
                                "maxFlowSccm": device_info.get("maxFlowSccm", device_info.get("max_flow_sccm", 0)),
                                "name": device_info.get("name", "MFC"),
                                "port": port,
                            }
                        )

                return discovered
            finally:
                self._mfc_scan_active = False
                self._mfc_scan_cancel_requested = False

    async def cancel_mfc_scan(self) -> dict:
        if not self._mfc_scan_active:
            return {"active": False, "message": "No active MFC scan"}
        self._mfc_scan_cancel_requested = True
        return {"active": True, "message": "MFC scan cancellation requested"}

    async def mfc_setpoint(self, address: int, sccm: float) -> dict:
        return await asyncio.to_thread(self.devices.mfc_set_setpoint, address, sccm)

    async def start_execution(self, payload: dict) -> dict:
        return await self.execution.start(payload)

    async def pause_execution(self) -> dict:
        return await self.execution.pause()

    async def resume_execution(self) -> dict:
        return await self.execution.resume()

    async def cancel_execution(self) -> dict:
        return await self.execution.cancel()

    def reset_execution_state(self) -> None:
        self.experiment_state.update(
            {
                "status": "idle",
                "workflowId": None,
                "executionId": None,
                "workflowName": "",
                "ownerName": "",
                "workstationType": None,
                "nodes": [],
                "currentStep": None,
                "startTime": None,
                "endTime": None,
                "duration": 0,
                "eta": None,
                "error": None,
            }
        )
        self._execution_started_at = None
        self._execution_timeline = None
        self._current_step_started_at = None
        self._current_unrolled_index = None

    def _timeline_step(self, unrolled_index: int | None) -> dict | None:
        if unrolled_index is None or not self._execution_timeline:
            return None
        for step in self._execution_timeline.get("steps", []):
            if step.get("unrolledIndex") == unrolled_index:
                return step
        return None

    def _elapsed_seconds(self, now: str | None = None) -> float:
        if not self._execution_started_at:
            return 0.0
        return _seconds_between(self._execution_started_at, now or datetime.utcnow().isoformat() + "Z")

    def _eta_snapshot(self, now: str | None = None, finished: bool = False) -> dict | None:
        if not self._execution_timeline:
            return None
        now = now or datetime.utcnow().isoformat() + "Z"
        elapsed = self._elapsed_seconds(now)
        if finished:
            remaining = 0.0
        else:
            remaining = 0.0
            for step in self._execution_timeline.get("steps", []):
                if step.get("completed"):
                    continue
                seconds = float(step.get("actualSeconds") or step.get("estimatedSeconds") or 0)
                if step.get("unrolledIndex") == self._current_unrolled_index and self._current_step_started_at:
                    seconds = max(0.0, seconds - _seconds_between(self._current_step_started_at, now))
                remaining += seconds
        estimates = self._execution_timeline.get("steps", [])
        total = sum(float(step.get("actualSeconds") or step.get("estimatedSeconds") or 0) for step in estimates)
        current = self._timeline_step(self._current_unrolled_index)
        confidences = [float(step.get("etaConfidence") or 0) for step in estimates]
        sources = {step.get("etaSource") for step in estimates}
        return {
            "estimatedTotalSeconds": total,
            "estimatedRemainingSeconds": remaining,
            "elapsedSeconds": elapsed,
            "currentStepEstimatedSeconds": current.get("estimatedSeconds") if current else None,
            "currentStepElapsedSeconds": (
                _seconds_between(self._current_step_started_at, now)
                if current and self._current_step_started_at
                else None
            ),
            "source": "history" if sources == {"history"} else ("rule" if sources <= {"rule", "actual"} else "mixed"),
            "confidence": sum(confidences) / len(confidences) if confidences else 0,
            "updatedAt": now,
        }


def _seconds_between(start_iso: str | None, end_iso: str) -> float:
    if not start_iso:
        return 0.0
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0.0, (end - start).total_seconds())
    except Exception:
        return 0.0


runtime = AppRuntime()
