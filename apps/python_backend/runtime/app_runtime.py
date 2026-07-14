"""Application runtime for the single-process local backend."""

from __future__ import annotations

import asyncio
import copy
import time
import uuid
from datetime import datetime, timezone

from device_data_service import (
    furnace_data,
    load_runtime_state,
    mfc_data,
    record_runtime_event,
    save_runtime_state,
)
from runtime.device_manager import DeviceManager
from runtime.execution_engine import ExecutionEngine
from runtime.execution_recorder import finish_execution, finish_step, start_step
from runtime.execution_planner import ExecutionPlan, ExecutionPlanner
from runtime.execution_semantics import is_active_execution_status, is_terminal_execution_status
from shared.contracts.events import (
    DEVICE_STATUS_UPDATE,
    WORKFLOW_EXECUTION_FINISHED,
    WORKFLOW_LOOP_START,
    WORKFLOW_NODE_STATUS,
    WORKFLOW_NOTIFICATION,
    WORKFLOW_SNAPSHOT,
)


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
        self.execution_planner = ExecutionPlanner(self.devices)
        self.execution = ExecutionEngine(self)
        self._poll_task: asyncio.Task | None = None
        self._running = False
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
            "nodeTimings": [],
            "error": None,
        }
        self._execution_started_at: str | None = None
        self._execution_timeline: dict | None = None
        self._current_step_started_at: str | None = None
        self._current_unrolled_index: int | None = None
        self._start_from_unrolled_index: int = 0
        self._mfc_scan_lock = asyncio.Lock()
        self._mfc_scan_active = False
        self._mfc_scan_cancel_requested = False
        self._connect_attempt_tokens = {device: 0 for device in DEVICE_CAPABILITIES}
        self._connection_locks = {device: asyncio.Lock() for device in DEVICE_CAPABILITIES}
        self._runtime_states = {
            "furnace": _new_runtime_state("furnace"),
            "mfc": _new_runtime_state("mfc"),
            "zahner": _new_runtime_state("zahner"),
        }
        self._restore_runtime_states()

    def set_sio(self, sio) -> None:
        self.sio = sio

    @property
    def is_running(self) -> bool:
        return self._running

    def _restore_runtime_states(self) -> None:
        """恢复业务记录，但永不恢复物理连接、设备对象或扫描 session。"""
        for device, default_state in self._runtime_states.items():
            persisted = load_runtime_state(device)
            if not persisted:
                continue
            state = {**default_state, **persisted}
            state["stateVersion"] = int(state.get("stateVersion") or 0)
            state["accumulatedRunSeconds"] = max(0.0, float(state.get("accumulatedRunSeconds") or 0))

            active_execution = state.get("executionStatus") in {"running", "paused"}
            physical_state_was_live = (
                state.get("connectionStatus") != "disconnected"
                or state.get("connectedPort") is not None
                or state.get("connectedAt") is not None
                or state.get("deviceStatus") is not None
                or bool(state.get("scannedDevices"))
            )
            if active_execution:
                # 进程重启后无法证明物理设备在这段离线时间内持续运行。
                # 只结算到最后一次后端快照，不把重启期间的时间算进业务时长。
                last_confirmed_at = state.get("updatedAt") or _utc_now()
                state["accumulatedRunSeconds"] = _accumulated_seconds(state, last_confirmed_at)
                state["currentRunStartedAt"] = None
                state["executionStatus"] = "error"
                state["stoppedAt"] = _utc_now()
                state["lastError"] = _runtime_error(
                    "RUNTIME_RESTARTED",
                    "后端重启时未恢复物理设备连接，活动运行已标记为错误",
                    state["stoppedAt"],
                )

            # 物理对象、连接和扫描 session 不跨进程恢复。即使旧快照已经写成
            # disconnected，也要清除可能残留的 deviceStatus/scannedDevices。
            state["connectionStatus"] = "disconnected"
            state["connectedPort"] = None
            state["connectedAt"] = None
            state["deviceStatus"] = None
            state["scannedDevices"] = []
            if physical_state_was_live or active_execution:
                state["updatedAt"] = _utc_now()
                state["stateVersion"] += 1
                save_runtime_state(device, state)
            self._runtime_states[device] = state

    def _commit_runtime_state_sync(
        self,
        device: str,
        updates: dict,
        *,
        event_type: str | None = None,
        now: str | None = None,
    ) -> dict:
        state = self._runtime_states[device]
        previous = copy.deepcopy(state)
        state.update(copy.deepcopy(updates))
        state["stateVersion"] = int(previous.get("stateVersion") or 0) + 1
        state["updatedAt"] = now or _utc_now()
        save_runtime_state(device, state)
        if event_type:
            connection_transition = previous.get("connectionStatus") != state.get("connectionStatus")
            execution_transition = device == "furnace" and (
                previous.get("executionStatus") != state.get("executionStatus")
                or event_type.startswith("furnace_")
            )
            if event_type in {"communication_succeeded", "communication_disconnected", "communication_error"} and not (
                connection_transition or execution_transition
            ):
                return copy.deepcopy(state)
            record_runtime_event(
                device,
                event_type,
                execution_id=state.get("executionId"),
                from_status=(previous.get("executionStatus") if execution_transition else previous.get("connectionStatus")),
                to_status=(state.get("executionStatus") if execution_transition else state.get("connectionStatus")),
                payload={"stateVersion": state["stateVersion"]},
                occurred_at=state["updatedAt"],
            )
        return copy.deepcopy(state)

    async def _commit_runtime_state(
        self,
        device: str,
        updates: dict,
        *,
        event_type: str | None = None,
        now: str | None = None,
        broadcast: bool = True,
    ) -> dict:
        state = self._commit_runtime_state_sync(device, updates, event_type=event_type, now=now)
        if broadcast:
            await self.emit(DEVICE_STATUS_UPDATE, self._device_status_envelope(device))
        return state

    def _sync_furnace_execution_from_device(
        self,
        updates: dict,
        event_type: str,
        status: dict,
        now: str,
    ) -> tuple[dict, str]:
        """只把设备明确返回的运行/暂停/停止状态同步到业务状态。

        不从历史样本或前端刷新时间创建运行起点。若设备在后端没有收到开始
        事件前就处于运行态，则保留既有业务状态，避免伪造运行时长。
        """
        state = self._runtime_states["furnace"]
        status_code = int(status.get("statusCode") or 0)
        execution_status = state.get("executionStatus")
        if execution_status == "running" and status_code == 4:
            updates.update(
                {
                    "executionStatus": "paused",
                    "accumulatedRunSeconds": _accumulated_seconds(state, now),
                    "currentRunStartedAt": None,
                }
            )
            return updates, "furnace_pause_confirmed"
        if execution_status in {"running", "paused"} and status_code == 12:
            updates.update(
                {
                    "executionStatus": "stopped",
                    "accumulatedRunSeconds": _accumulated_seconds(state, now),
                    "currentRunStartedAt": None,
                    "stoppedAt": now,
                }
            )
            return updates, "furnace_stop_confirmed"
        if execution_status == "paused" and status_code == 0:
            updates.update(
                {
                    "executionStatus": "running",
                    "currentRunStartedAt": now,
                }
            )
            return updates, "furnace_resume_confirmed"
        if execution_status in {"idle", "stopped", "completed", "error"} and status_code in {0, 4}:
            # 设备在本后端没有收到开始事件却已经处于运行/暂停态，不能用
            # 历史样本补造起点；以错误态暴露“硬件状态未被本次业务确认”。
            updates.update(
                {
                    "executionStatus": "error",
                    "currentRunStartedAt": None,
                    "lastError": _runtime_error(
                        "UNTRACKED_DEVICE_EXECUTION",
                        "设备已处于运行或暂停态，但后端没有对应的开始事件",
                        now,
                    ),
                }
            )
            return updates, "furnace_execution_untracked"
        return updates, event_type

    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        self._running = True
        if not self._poll_task or self._poll_task.done():
            self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        self._running = False
        for device in DEVICE_CAPABILITIES:
            self._connect_attempt_tokens[device] += 1
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        for device in ("furnace", "mfc", "zahner"):
            state = self._runtime_states[device]
            now = _utc_now()
            updates = {
                "connectionStatus": "disconnected",
                "connectedPort": None,
                "connectedAt": None,
                "deviceStatus": None,
                "scannedDevices": [],
            }
            if device == "furnace" and state.get("executionStatus") in {"running", "paused"}:
                updates.update(
                    {
                        "executionStatus": "error",
                        "accumulatedRunSeconds": _accumulated_seconds(state, now),
                        "currentRunStartedAt": None,
                        "stoppedAt": now,
                        "lastError": _runtime_error(
                            "RUNTIME_SHUTDOWN",
                            "后端关闭时无法继续确认 Furnace 程序运行状态",
                            now,
                        ),
                    }
                )
            if state["connectionStatus"] != "disconnected" or any(
                state.get(key) != value for key, value in updates.items()
            ):
                self._commit_runtime_state_sync(
                    device,
                    updates,
                    event_type="runtime_shutdown",
                    now=now,
                )
        disconnect_methods = {
            "furnace": self.devices.disconnect_furnace,
            "mfc": self.devices.disconnect_mfc,
            "zahner": self.devices.disconnect_zahner,
        }
        for device, disconnect_method in disconnect_methods.items():
            async with self._connection_locks[device]:
                await asyncio.to_thread(disconnect_method)

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
            generation = self.devices.connection_generation("furnace")
            try:
                status = await asyncio.to_thread(self.devices.furnace_status)
                if generation == self.devices.connection_generation("furnace"):
                    await self.on_device_status("furnace", status, generation=generation)
            except Exception as e:
                print(f"[Runtime] Furnace poll error: {e}")
                await self.on_device_communication_error("furnace", e, generation=generation)

        if self.devices.mfc_connected:
            generation = self.devices.connection_generation("mfc")
            try:
                status = await asyncio.to_thread(self.devices.mfc_status)
                if generation == self.devices.connection_generation("mfc"):
                    await self.on_device_status("mfc", status, generation=generation)
            except Exception as e:
                print(f"[Runtime] MFC poll error: {e}")
                await self.on_device_communication_error("mfc", e, generation=generation)

    async def on_device_status(
        self,
        device: str,
        status: dict,
        generation: int | None = None,
        source: str = "poll",
        attempt_token: int | None = None,
    ) -> None:
        if generation is not None and generation != self.devices.connection_generation(device):
            return
        if attempt_token is not None and attempt_token != self._connect_attempt_tokens[device]:
            return
        if device == "mfc" and self._mfc_scan_active and source not in {"scan", "connection"}:
            return

        now = _utc_now()
        connected = bool(status.get("connected", False))
        if not connected:
            state = self._runtime_states[device]
            updates = {
                "connectionStatus": "disconnected",
                "connectedPort": None,
                "connectedAt": None,
                "deviceStatus": None,
                "scannedDevices": [],
                "lastError": None,
            }
            if device == "furnace" and state.get("executionStatus") in {"running", "paused"}:
                updates.update(
                    {
                        "executionStatus": "error",
                        "accumulatedRunSeconds": _accumulated_seconds(state, now),
                        "currentRunStartedAt": None,
                        "stoppedAt": now,
                        "lastError": _runtime_error(
                            "DEVICE_DISCONNECTED_DURING_EXECUTION",
                            "设备通信返回断开，当前 Furnace 程序进入错误状态",
                            now,
                        ),
                    }
                )
            await self._commit_runtime_state(
                device,
                updates,
                event_type="communication_disconnected",
                now=now,
            )
            return

        clean_status = _without_connected(status)
        if device == "furnace":
            updates = {
                "connectionStatus": "connected",
                "connectedPort": self.devices.device_connection_info("furnace").get("port"),
                "connectedAt": self.devices.device_connection_info("furnace").get("connectedAt"),
                "deviceStatus": clean_status,
                "currentSegmentIndex": status.get("segment"),
                "lastSuccessfulCommunicationAt": now,
                "lastError": None,
            }
            event_type = "communication_succeeded"
            updates, event_type = self._sync_furnace_execution_from_device(updates, event_type, status, now)
            await self._commit_runtime_state(device, updates, event_type=event_type)

            furnace_data.add_sample(
                pv=status.get("pv", 0),
                sv=status.get("sv", 0),
                mv=status.get("mv", 0),
                status_code=status.get("statusCode", 0),
                segment=status.get("segment", 0),
                segment_time=status.get("segmentTime", 0),
                segment_time_set=status.get("segmentTimeSet", 0),
            )
        elif device == "mfc":
            devices = list(status.get("devices", []))
            await self._commit_runtime_state(
                device,
                {
                    "connectionStatus": "connected",
                    "connectedPort": self.devices.device_connection_info("mfc").get("port"),
                    "connectedAt": self.devices.device_connection_info("mfc").get("connectedAt"),
                    "deviceStatus": clean_status,
                    "scannedDevices": devices,
                    "lastSuccessfulCommunicationAt": now,
                    "lastError": None,
                },
                event_type="communication_succeeded",
            )
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
        else:
            await self._commit_runtime_state(
                device,
                {
                    "connectionStatus": "connected",
                    "connectedPort": self.devices.device_connection_info(device).get("port"),
                    "connectedAt": self.devices.device_connection_info(device).get("connectedAt"),
                    "deviceStatus": clean_status,
                    "lastSuccessfulCommunicationAt": now,
                    "lastError": None,
                },
                event_type="communication_succeeded",
            )

    async def on_device_communication_error(
        self,
        device: str,
        error: Exception | str,
        generation: int | None = None,
    ) -> None:
        if generation is not None and generation != self.devices.connection_generation(device):
            return
        now = _utc_now()
        state = self._runtime_states[device]
        updates = {
            "connectionStatus": "communication_error",
            "deviceStatus": None,
            "lastError": _runtime_error("DEVICE_COMMUNICATION_ERROR", str(error), now),
        }
        if device == "furnace" and state.get("executionStatus") in {"running", "paused"}:
            if state.get("executionStatus") == "running":
                updates["accumulatedRunSeconds"] = _accumulated_seconds(state, now)
            updates.update(
                {
                    "executionStatus": "error",
                    "currentRunStartedAt": None,
                    "stoppedAt": now,
                }
            )
        await self._commit_runtime_state(device, updates, event_type="communication_error")

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
                "nodeTimings": payload.get("nodeTimings", self.experiment_state.get("nodeTimings", [])),
                "error": payload.get("error", self.experiment_state.get("error")),
                "timestamp": now,
            }
        )
        await self.emit(WORKFLOW_SNAPSHOT, self.experiment_state)

    async def on_execution_timeline_started(self, payload: dict) -> None:
        now = datetime.utcnow().isoformat() + "Z"
        self._execution_started_at = now
        timeline = payload.get("timeline")
        if not isinstance(timeline, dict):
            raise ValueError("Execution timeline is required in the execution plan")
        self._execution_timeline = copy.deepcopy(timeline)
        self._start_from_unrolled_index = max(0, int(payload.get("startFromUnrolledIndex") or 0))
        boundary_prelude_indices = {int(index) for index in payload.get("boundaryPreludeIndices") or []}
        for step in self._execution_timeline.get("steps", []):
            step_unrolled_index = int(step.get("unrolledIndex") or 0)
            if step_unrolled_index < self._start_from_unrolled_index and step_unrolled_index not in boundary_prelude_indices:
                step["skipped"] = True
                step["completed"] = True
                step["estimatedSeconds"] = 0.0
                step["etaSource"] = "skipped"
                step["etaConfidence"] = 1.0
        self._current_step_started_at = None
        self._current_unrolled_index = None
        self.experiment_state["nodeTimings"] = []
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
        node_timing = {
            "nodeId": step_info.get("nodeId"),
            "nodeType": step_info.get("nodeType"),
            "index": step_info.get("index", 0),
            "unrolledIndex": unrolled_index,
            "status": "running",
            "estimatedSeconds": step_info.get("estimatedSeconds"),
            "startedAt": now,
            "endedAt": None,
            "actualSeconds": None,
        }
        node_timings = [
            timing for timing in self.experiment_state.get("nodeTimings", [])
            if timing.get("unrolledIndex") != unrolled_index
        ]
        node_timings.append(node_timing)

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
                "nodeTimings": node_timings,
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
            WORKFLOW_LOOP_START,
            {
                "loopStartIndex": payload.get("loopStartIndex"),
                "iteration": payload.get("iteration"),
                "totalIterations": payload.get("totalIterations"),
                "nodeIndices": payload.get("nodeIndices") or [],
            },
        )

    async def on_node_status(self, payload: dict) -> None:
        await self.emit(
            WORKFLOW_NODE_STATUS,
            {"i": payload.get("nodeIndex"), "s": payload.get("status"), "d": payload.get("data")},
        )

    async def on_execution_step_finished(self, payload: dict) -> None:
        exec_id = payload.get("executionId")
        unrolled_index = payload.get("unrolledIndex")
        status = payload.get("status")
        data = payload.get("data")
        recorded = None
        if exec_id and unrolled_index is not None:
            recorded = finish_step(
                execution_id=exec_id,
                unrolled_index=unrolled_index,
                status=status,
                result=data,
                warnings=payload.get("warnings") or [],
                artifacts=payload.get("artifacts") or [],
            )
            timeline_step = self._timeline_step(unrolled_index)
            if timeline_step and recorded and recorded.get("actualSeconds") is not None and status == "completed":
                timeline_step["actualSeconds"] = recorded["actualSeconds"]
                timeline_step["etaSource"] = "actual"
                timeline_step["etaConfidence"] = 1.0
                timeline_step["completed"] = True

        now = datetime.utcnow().isoformat() + "Z"
        node_timings = list(self.experiment_state.get("nodeTimings", []))
        for timing in reversed(node_timings):
            if timing.get("unrolledIndex") != unrolled_index:
                continue
            timing["status"] = status
            timing["endedAt"] = now
            timing["actualSeconds"] = (
                recorded.get("actualSeconds") if recorded and recorded.get("actualSeconds") is not None
                else _seconds_between(timing.get("startedAt"), now)
            )
            break

        await self.on_node_status(
            {
                "executionId": exec_id,
                "nodeIndex": payload.get("nodeIndex"),
                "status": status,
                "data": data,
            }
        )
        for warning in payload.get("warnings") or []:
            await self.emit(
                WORKFLOW_NOTIFICATION,
                {
                    "id": f"notification_{int(time.time() * 1000)}",
                    "type": "warning",
                    "title": "测量安全停止",
                    "message": warning.get("message") or "测量因安全限制提前停止",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "details": {
                        "warningType": warning.get("warningType"),
                        "metadata": warning.get("metadata") or {},
                    },
                },
            )
            try:
                from email_service import email_service

                await email_service.send_workflow_notification(
                    type_="warning",
                    workflow_id=self.experiment_state.get("workflowId"),
                    user=self.experiment_state.get("ownerName", ""),
                    details={
                        "message": warning.get("message"),
                        "warningType": warning.get("warningType"),
                        "workflowName": self.experiment_state.get("workflowName", ""),
                    },
                )
            except Exception as email_err:
                print(f"[Runtime] Warning email notification error: {email_err}")
        now = datetime.utcnow().isoformat() + "Z"
        active_status = self.execution.status
        next_status = (
            active_status
            if status == "completed" and is_active_execution_status(active_status)
            else status
        )
        await self.on_experiment_state(
            {
                "executionId": exec_id,
                "status": next_status,
                "duration": self._elapsed_seconds(now),
                "eta": self._eta_snapshot(now),
                "nodeTimings": node_timings,
                "error": (data.get("error") or data.get("reason")) if data and status == "failed" else None,
            }
        )

    async def on_execution_finished(self, payload: dict) -> None:
        exec_id = payload.get("executionId")
        status = payload.get("status")
        duration_ms = payload.get("durationMs")
        error = payload.get("error")
        if not is_terminal_execution_status(status):
            raise ValueError(f"Execution finished with non-terminal status: {status}")
        if exec_id:
            finish_execution(exec_id, status, duration_ms, error)

        now = datetime.utcnow().isoformat() + "Z"
        self.experiment_state.update(
            {
                "status": status,
                "duration": (duration_ms or 0) / 1000,
                "endTime": now,
                "eta": self._eta_snapshot(now, finished=True),
                "nodeTimings": self.experiment_state.get("nodeTimings", []),
                "error": error,
                "timestamp": now,
            }
        )
        await self.emit(WORKFLOW_SNAPSHOT, self.experiment_state)
        await self.emit(
            WORKFLOW_EXECUTION_FINISHED,
            {
                "executionId": exec_id,
                "status": status,
                "durationMs": duration_ms,
                "error": error,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            },
        )
        notification_copy = {
            "completed": {
                "type": "success",
                "title": "执行完成",
                "message": f"{self.experiment_state.get('workflowName') or exec_id} 已完成",
            },
            "cancelled": {
                "type": "info",
                "title": "执行已取消",
                "message": f"{self.experiment_state.get('workflowName') or exec_id} 已取消",
            },
            "failed": {
                "type": "error",
                "title": "执行失败",
                "message": f"{self.experiment_state.get('workflowName') or exec_id} 执行失败",
            },
        }.get(
            status,
            {
                "type": "info",
                "title": "执行状态已更新",
                "message": f"{self.experiment_state.get('workflowName') or exec_id} 状态：{status}",
            },
        )
        await self.emit(
            WORKFLOW_NOTIFICATION,
            {
                "id": f"notification_{int(time.time() * 1000)}",
                **notification_copy,
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "details": {
                    "durationMs": duration_ms,
                    "error": error,
                },
            },
        )
        try:
            from email_service import email_service

            if status != "cancelled":
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
        if device not in DEVICE_CAPABILITIES:
            raise ValueError(f"Unknown device: {device}")

        self._connect_attempt_tokens[device] += 1
        attempt_token = self._connect_attempt_tokens[device]
        requested_port = config.get("port") if isinstance(config, dict) else None
        await self._commit_runtime_state(
            device,
            {
                "connectionStatus": "connecting",
                "connectedPort": requested_port,
                "connectedAt": None,
                "deviceStatus": None,
                "scannedDevices": [],
                "lastError": None,
            },
            event_type="connect_started",
        )

        connect_method = {
            "furnace": self.devices.connect_furnace,
            "mfc": self.devices.connect_mfc,
            "zahner": self.devices.connect_zahner,
        }[device]
        status_method = {
            "furnace": self.devices.furnace_status,
            "mfc": self.devices.mfc_status,
            "zahner": self.devices.zahner_status,
        }[device]
        disconnect_method = {
            "furnace": self.devices.disconnect_furnace,
            "mfc": self.devices.disconnect_mfc,
            "zahner": self.devices.disconnect_zahner,
        }[device]
        connection_lock = self._connection_locks[device]
        await connection_lock.acquire()
        try:
            result = await asyncio.to_thread(connect_method, config)
            generation = self.devices.connection_generation(device)
            if attempt_token != self._connect_attempt_tokens[device]:
                return {
                    "device": device,
                    **result,
                    "runtimeStatus": self._device_status_envelope(device),
                }
            if device == "mfc":
                # 新连接从空的当前扫描快照开始，不能把上一次 session 的发现结果
                # 当成这次连接已经确认的设备。
                await asyncio.to_thread(self.devices.reset_mfc_scan_devices)
            status = await asyncio.to_thread(status_method)
            await self.on_device_status(
                device,
                status,
                generation=generation,
                source="connection",
                attempt_token=attempt_token,
            )
            envelope = self._device_status_envelope(device)
            return {
                "device": device,
                **result,
                "runtimeStatus": envelope,
            }
        except Exception as error:
            if attempt_token == self._connect_attempt_tokens[device]:
                try:
                    # 只有当前连接尝试拥有的 token 才能清理物理设备，防止旧
                    # 请求失败时把新请求刚建立的连接一起断开。
                    await asyncio.to_thread(disconnect_method)
                except Exception:
                    pass
            else:
                raise
            await self._commit_runtime_state(
                device,
                {
                    "connectionStatus": "disconnected",
                    "connectedPort": None,
                    "connectedAt": None,
                    "deviceStatus": None,
                    "scannedDevices": [],
                    "lastError": _runtime_error("DEVICE_CONNECT_ERROR", str(error), _utc_now()),
                },
                event_type="connect_failed",
            )
            raise
        finally:
            connection_lock.release()

    async def disconnect_device(self, device: str) -> dict:
        if device not in DEVICE_CAPABILITIES:
            raise ValueError(f"Unknown device: {device}")
        # 让并发中的 connect 请求失去提交 runtime 快照的资格。
        self._connect_attempt_tokens[device] += 1
        async with self._connection_locks[device]:
            if device == "furnace":
                await asyncio.to_thread(self.devices.disconnect_furnace)
            elif device == "mfc":
                await asyncio.to_thread(self.devices.disconnect_mfc)
            elif device == "zahner":
                await asyncio.to_thread(self.devices.disconnect_zahner)
        now = _utc_now()
        state = self._runtime_states[device]
        updates = {
            "connectionStatus": "disconnected",
            "connectedPort": None,
            "connectedAt": None,
            "deviceStatus": None,
            "scannedDevices": [],
            "lastError": None,
        }
        if device == "furnace" and state.get("executionStatus") in {"running", "paused"}:
            updates.update(
                {
                    "executionStatus": "error",
                    "accumulatedRunSeconds": _accumulated_seconds(state, now),
                    "currentRunStartedAt": None,
                    "stoppedAt": now,
                    "lastError": _runtime_error(
                        "DEVICE_DISCONNECTED_DURING_EXECUTION",
                        "设备断开导致当前 Furnace 程序进入错误状态",
                        now,
                    ),
                }
            )
        await self._commit_runtime_state(device, updates, event_type="disconnect_completed", now=now)
        return {
            "device": device,
            "connected": False,
            "runtimeStatus": self._device_status_envelope(device),
        }

    async def device_status(self, device: str) -> dict:
        if device not in self._runtime_states:
            raise ValueError(f"Unknown device: {device}")
        state = self._runtime_states[device]
        if state["connectionStatus"] != "connected":
            return {"connected": False, **({"devices": []} if device == "mfc" else {})}
        status = copy.deepcopy(state.get("deviceStatus") or {})
        if device == "mfc":
            status["devices"] = copy.deepcopy(state.get("scannedDevices") or [])
        status["connected"] = True
        return status

    async def runtime_device_status(self, device: str) -> dict:
        if device not in self._runtime_states:
            raise ValueError(f"Unknown device: {device}")
        return self._device_status_envelope(device)

    def _device_status_envelope(self, device: str, status: dict | None = None, timestamp: str | None = None) -> dict:
        state = copy.deepcopy(self._runtime_states[device])
        direct_status = status is not None
        if direct_status:
            connected = bool(status.get("connected", False))
            payload = _without_connected(status)
            device_count = len(status.get("devices", [])) if device == "mfc" else (1 if connected else 0)
        else:
            connected = state["connectionStatus"] == "connected"
            payload = copy.deepcopy(state.get("deviceStatus") or {}) if connected else {}
            if device == "mfc":
                payload["devices"] = copy.deepcopy(state.get("scannedDevices") or [])
            device_count = len(state.get("scannedDevices") or []) if device == "mfc" else (1 if connected else 0)
        profile = self.devices.device_profile(device)
        diagnostics = self.devices.device_diagnostics(device)
        connection_info = self.devices.device_connection_info(device)
        connection_status = state["connectionStatus"]
        if direct_status and state["stateVersion"] == 0:
            connection_status = "connected" if connected else "disconnected"
        last_error = state.get("lastError") or diagnostics.get("lastError")
        error_message = last_error.get("message") if isinstance(last_error, dict) else last_error
        return {
            "device": device,
            "connected": connected,
            "mode": self.devices.device_mode(device),
            "profile": profile,
            "timestamp": timestamp or datetime.utcnow().isoformat() + "Z",
            "payload": payload,
            "connectionState": {
                "status": connection_status,
                "mode": self.devices.device_mode(device),
                "profile": profile,
                **connection_info,
                "port": state.get("connectedPort") if not connection_info.get("port") else connection_info.get("port"),
                "connectedAt": state.get("connectedAt") or connection_info.get("connectedAt"),
            },
            "diagnostics": diagnostics,
            "capabilities": DEVICE_CAPABILITIES.get(device, []),
            "deviceCount": device_count,
            "error": error_message,
            "runtimeState": state,
            "stateVersion": state["stateVersion"],
            "updatedAt": state["updatedAt"],
        }

    async def _finish_furnace_action(
        self,
        action: str,
        status: dict,
        now: str | None = None,
        execution_id: str | None = None,
    ) -> dict:
        now = now or _utc_now()
        state = self._runtime_states["furnace"]
        if execution_id:
            current_execution_id = state.get("executionId")
            current_execution_status = state.get("executionStatus")
            stale_active_run = action == "run" and current_execution_status in {"running", "paused"}
            stale_stop = action == "stop" and current_execution_id != execution_id
            if (stale_active_run or stale_stop) and current_execution_id != execution_id:
                raise RuntimeError(
                    f"Stale Furnace execution event {execution_id}; "
                    f"current execution is {current_execution_id or 'none'}"
                )
        connection_info = self.devices.device_connection_info("furnace")
        updates = {
            "connectionStatus": "connected",
            "connectedPort": connection_info.get("port"),
            "connectedAt": connection_info.get("connectedAt"),
            "deviceStatus": _without_connected(status),
            "currentSegmentIndex": status.get("segment"),
            "lastSuccessfulCommunicationAt": now,
            "lastError": None,
        }
        if action == "run":
            if state.get("executionStatus") == "paused" and state.get("executionId"):
                updates.update({"executionStatus": "running", "currentRunStartedAt": now})
                event_type = "furnace_resumed"
            elif state.get("executionStatus") == "running":
                updates.update(
                    {
                        "executionStatus": "running",
                        "executionId": state.get("executionId") or execution_id,
                    }
                )
                event_type = "furnace_run_idempotent"
            else:
                updates.update(
                    {
                        "executionStatus": "running",
                        "executionId": execution_id or f"furnace_{uuid.uuid4().hex}",
                        "startedAt": now,
                        "currentRunStartedAt": now,
                        "accumulatedRunSeconds": 0.0,
                        "stoppedAt": None,
                    }
                )
                event_type = "furnace_started"
        elif action == "pause":
            updates.update(
                {
                    "executionStatus": "paused",
                    "accumulatedRunSeconds": _accumulated_seconds(state, now),
                    "currentRunStartedAt": None,
                }
            )
            event_type = "furnace_paused"
        elif action == "stop":
            updates.update(
                {
                    "executionStatus": "stopped",
                    "accumulatedRunSeconds": _accumulated_seconds(state, now),
                    "currentRunStartedAt": None,
                    "stoppedAt": now,
                }
            )
            event_type = "furnace_stopped"
        elif action == "segment":
            updates["currentSegmentIndex"] = status.get("segment")
            event_type = "furnace_segment_changed"
        else:
            event_type = "furnace_command_succeeded"

        await self._commit_runtime_state("furnace", updates, event_type=event_type, now=now)
        furnace_data.add_sample(
            pv=status.get("pv", 0),
            sv=status.get("sv", 0),
            mv=status.get("mv", 0),
            status_code=status.get("statusCode", 0),
            segment=status.get("segment", 0),
            segment_time=status.get("segmentTime", 0),
            segment_time_set=status.get("segmentTimeSet", 0),
        )
        return self._device_status_envelope("furnace")

    async def furnace_external_action(self, action: str, execution_id: str | None = None) -> dict:
        """确认由工作流线程直接写入的 Furnace 运行命令。

        温度节点仍由执行器负责协议写入和数值计算；这里仅在写入成功后读取
        一次后端设备状态，并把业务运行生命周期提交给 AppRuntime。这样工作流
        不会产生一条绕过 runtime 快照的 Furnace 状态链。
        """
        status = await asyncio.to_thread(self.devices.furnace_status)
        if not status.get("connected"):
            raise RuntimeError("Furnace status confirmation reported disconnected")
        return await self._finish_furnace_action("run" if action == "run" else "stop", status, execution_id=execution_id)

    def confirm_furnace_action_from_worker(self, action: str, execution_id: str | None = None) -> dict | None:
        """在执行器工作线程中同步等待 AppRuntime 确认业务状态。"""
        if not self.loop or self.loop.is_closed():
            return None
        future = asyncio.run_coroutine_threadsafe(
            self.furnace_external_action(action, execution_id=execution_id),
            self.loop,
        )
        return future.result()

    async def _run_furnace_action(self, code: int, value: int, action: str) -> dict:
        if self._runtime_states["furnace"]["connectionStatus"] != "connected":
            raise RuntimeError("Furnace not connected")
        await asyncio.to_thread(self.devices.furnace_write_param, code, value)
        status = await asyncio.to_thread(self.devices.furnace_status)
        if not status.get("connected"):
            raise RuntimeError("Furnace status confirmation reported disconnected")
        return await self._finish_furnace_action(action, status)

    async def furnace_run(self) -> dict:
        return await self._run_furnace_action(0x15, 0, "run")

    async def furnace_stop(self) -> dict:
        return await self._run_furnace_action(0x15, 12, "stop")

    async def furnace_pause(self) -> dict:
        return await self._run_furnace_action(0x15, 4, "pause")

    async def furnace_set_segment(self, segment: int) -> dict:
        return await self._run_furnace_action(0x00, segment, "segment")

    async def furnace_write_param(self, code: int, value: int) -> dict:
        action = {0: "run", 4: "pause", 12: "stop"}.get(value) if code == 0x15 else None
        if action:
            return await self._run_furnace_action(code, value, action)
        result = await asyncio.to_thread(self.devices.furnace_write_param, code, value)
        return result

    async def furnace_read_segments(self) -> list[dict]:
        return await asyncio.to_thread(self.devices.furnace_read_segments)

    async def furnace_write_segments(self, segments: list[dict]) -> dict:
        return await asyncio.to_thread(self.devices.furnace_write_segments, segments)

    async def mfc_scan(self, address: int, reset: bool = False) -> dict:
        if self._mfc_scan_active:
            return await self._mfc_scan_once(address, reset=reset)

        # 独立扫描请求与范围扫描共用同一把锁，避免两个请求交错写入同一个
        # DeviceManager session。reset 由扫描 session 的第一请求明确传入；
        # 不能在每个单地址 HTTP 请求中自动清空，否则范围扫描会只剩最后一个地址。
        async with self._mfc_scan_lock:
            self._mfc_scan_active = True
            self._mfc_scan_cancel_requested = False
            try:
                return await self._mfc_scan_once(address, reset=reset)
            finally:
                self._mfc_scan_active = False
                self._mfc_scan_cancel_requested = False

    async def _mfc_scan_once(self, address: int, reset: bool = False) -> dict:
        if reset and self.devices.mfc_connected:
            await asyncio.to_thread(self.devices.reset_mfc_scan_devices)
            await self._publish_mfc_scan_snapshot()
        result = await asyncio.to_thread(self.devices.mfc_scan, address)
        await self._publish_mfc_scan_snapshot()
        return result

    async def _publish_mfc_scan_snapshot(self) -> None:
        if not self.devices.mfc_connected:
            return
        generation = self.devices.connection_generation("mfc")
        status = await asyncio.to_thread(self.devices.mfc_status)
        await self.on_device_status(device="mfc", status=status, generation=generation, source="scan")

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
            discovered: list[dict] = []

            try:
                if self.devices.mfc_connected:
                    await asyncio.to_thread(self.devices.reset_mfc_scan_devices)
                    await self._publish_mfc_scan_snapshot()
                self.devices.record_mfc_scan_range(
                    diagnostic_start_address if diagnostic_start_address is not None else start_address,
                    diagnostic_end_address if diagnostic_end_address is not None else end_address,
                )
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

    def plan_execution(
        self,
        nodes: list[dict],
        *,
        auto_startup_config: dict | None = None,
        start_from_unrolled_index=0,
    ) -> ExecutionPlan:
        return self.execution_planner.plan(
            nodes,
            auto_startup_config=auto_startup_config,
            start_from_unrolled_index=start_from_unrolled_index,
        )

    async def pause_execution(self, execution_id: str) -> dict:
        return await self.execution.pause(execution_id)

    async def resume_execution(self, execution_id: str) -> dict:
        return await self.execution.resume(execution_id)

    async def cancel_execution(self, execution_id: str) -> dict:
        return await self.execution.cancel(execution_id)

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
        self._start_from_unrolled_index = 0

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


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_runtime_state(device: str) -> dict:
    return {
        "connectionStatus": "disconnected",
        "connectedPort": None,
        "connectedAt": None,
        "executionStatus": "idle" if device == "furnace" else None,
        "executionId": None,
        "currentSegmentIndex": None,
        "startedAt": None,
        "currentRunStartedAt": None,
        "accumulatedRunSeconds": 0.0,
        "stoppedAt": None,
        "deviceStatus": None,
        "scannedDevices": [],
        "lastSuccessfulCommunicationAt": None,
        "lastError": None,
        "stateVersion": 0,
        "updatedAt": _utc_now(),
    }


def _without_connected(status: dict) -> dict:
    return {key: value for key, value in status.items() if key != "connected"}


def _runtime_error(code: str, message: str, timestamp: str | None = None) -> dict:
    return {
        "code": code,
        "message": message,
        "timestamp": timestamp or _utc_now(),
    }


def _accumulated_seconds(state: dict, now: str) -> float:
    accumulated = max(0.0, float(state.get("accumulatedRunSeconds") or 0))
    if state.get("executionStatus") != "running":
        return accumulated
    return accumulated + _seconds_between(state.get("currentRunStartedAt"), now)


runtime = AppRuntime()
