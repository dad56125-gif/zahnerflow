"""Per-execution cooperative control, independent of node and UI types."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from threading import Event
from typing import Any, Callable


class WorkflowCancelled(RuntimeError):
    """A node acknowledged the current execution's stop request."""


class ExecutionControl:
    """A fresh instance belongs to exactly one execution and is never reset."""

    def __init__(self, execution_id: str):
        self.execution_id = execution_id
        self._cancel = Event()
        self._paused = Event()
        self.shutdown_reason: str | None = None

    @property
    def cancel_requested(self) -> bool:
        return self._cancel.is_set()

    def request_cancel(self, *, shutdown_reason: str | None = None) -> None:
        if shutdown_reason:
            self.shutdown_reason = shutdown_reason
        self._cancel.set()
        self._paused.clear()

    def pause(self) -> None:
        self.check_cancelled()
        self._paused.set()

    def resume(self) -> None:
        self.check_cancelled()
        self._paused.clear()

    def check_cancelled(self) -> None:
        if self.cancel_requested:
            raise WorkflowCancelled(self.shutdown_reason or "Execution cancelled by user")

    async def checkpoint(self) -> None:
        self.check_cancelled()
        while self._paused.is_set():
            await asyncio.sleep(0.05)
            self.check_cancelled()

    async def sleep(self, duration: float) -> None:
        deadline = time.monotonic() + max(0.0, duration)
        self.check_cancelled()
        while time.monotonic() < deadline:
            self.check_cancelled()
            await asyncio.sleep(min(0.05, max(0.0, deadline - time.monotonic())))
        self.check_cancelled()

    def wait_for_cancel(self, timeout: float) -> bool:
        """Wake a device worker's wait immediately without interrupting its I/O."""
        return self._cancel.wait(max(0.0, timeout))

    async def run_in_thread(self, function: Callable[..., Any], *args) -> Any:
        """Do not release a device worker merely because its asyncio waiter ends."""
        worker = asyncio.create_task(asyncio.to_thread(function, *args))
        try:
            return await asyncio.shield(worker)
        except asyncio.CancelledError:
            self.request_cancel()
            while not worker.done():
                try:
                    await asyncio.shield(worker)
                except asyncio.CancelledError:
                    continue
            # Preserve device cleanup failures; the engine classifies them.
            worker.result()
            self.check_cancelled()


@dataclass(frozen=True)
class NodeExecutionContext:
    """Only execution-local identity, resources and control are exposed to nodes."""

    runtime: Any
    control: ExecutionControl
    execution_id: str
    workflow_id: str | None
    workflow_name: str
    path_config: dict

    @property
    def devices(self):
        return self.runtime.devices
