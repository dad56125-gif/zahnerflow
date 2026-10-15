"""Single-user workflow execution engine."""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from runtime.execution_failure import ExecutionFailureError
from runtime.execution_eta import params_for_eta
from runtime.execution_planner import ExecutionPlan
from runtime.execution_semantics import (
    ExecutionIdMismatchError,
    InvalidExecutionTransitionError,
    MeasurementOutcome,
    NoActiveExecutionError,
    execution_phase,
)
from runtime.execution_control import ExecutionControl, NodeExecutionContext, WorkflowCancelled
from runtime.execution_resources import ExecutionResources
from runtime.node_executors import execute_node


def _step_partial_result(error: BaseException) -> dict:
    """节点在失败/取消前已落盘的部分结果，沿用现有异常机制携带。"""

    partial = getattr(error, "partial_step_result", None)
    return dict(partial) if isinstance(partial, dict) else {}


class ExecutionEngine:
    def __init__(self, runtime):
        self.runtime = runtime
        self.status = "idle"
        self.execution_id: Optional[str] = None
        self.workflow_id: Optional[str] = None
        self.nodes: list[dict] = []
        self.current_step_index = 0
        self._control: ExecutionControl | None = None
        self._task: Optional[asyncio.Task] = None
        self._plan: ExecutionPlan | None = None
        self._owner_name = ""
        self._workflow_name = ""
        self._workstation_type = None
        self._path_config: dict = {}

    @property
    def phase(self):
        return execution_phase(self.status)

    @property
    def is_active(self) -> bool:
        return self.phase.is_active

    @property
    def is_cancelling(self) -> bool:
        return bool(self._control and self._control.cancel_requested) or self.status == "cancelling"

    def reset(self) -> None:
        if self.phase.is_active:
            raise InvalidExecutionTransitionError(f"Cannot reset execution while status is {self.status}")
        self.status = "idle"
        self.execution_id = None
        self.workflow_id = None
        self.nodes = []
        self.current_step_index = 0
        self._control = None
        self._resources = None
        self._task = None
        self._plan = None

    async def start(self, payload: dict) -> dict:
        if not self.phase.can_start:
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
        self._control = ExecutionControl(self.execution_id)
        self._resources = ExecutionResources()
        self.status = "running"

        context = NodeExecutionContext(
            runtime=self.runtime,
            control=self._control,
            resources=self._resources,
            plan_steps=tuple(plan.steps),
            execution_id=self.execution_id,
            workflow_id=self.workflow_id,
            workflow_name=self._workflow_name,
            path_config=dict(self._path_config),
        )
        self._task = asyncio.create_task(self._execute(context, plan))
        return {"status": "started", "executionId": self.execution_id}

    async def pause(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        if not self.phase.can_pause:
            raise InvalidExecutionTransitionError(f"Cannot pause execution while status is {self.status}")
        self._control.pause()
        self.status = "paused"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "paused", "error": None})
        return {"message": "Execution paused"}

    async def resume(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        if not self.phase.can_resume:
            raise InvalidExecutionTransitionError(f"Cannot resume execution while status is {self.status}")
        self._control.resume()
        self.status = "running"
        await self.runtime.on_experiment_state({"executionId": self.execution_id, "status": "running", "error": None})
        return {"message": "Execution resumed"}

    async def cancel(self, expected_execution_id: str) -> dict:
        self._require_execution_target(expected_execution_id)
        if self._control.cancel_requested:
            return {"message": "Execution cancellation requested"}
        if not self.phase.can_cancel:
            raise InvalidExecutionTransitionError(f"Cannot cancel execution while status is {self.status}")
        self._control.request_cancel()
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

    async def shutdown(self) -> None:
        task = self._task
        if not task or task.done():
            return
        if self.is_active and self._control:
            self._control.request_cancel(shutdown_reason="RUNTIME_SHUTDOWN: 后端关闭，执行无法继续")
            self.status = "cancelling"
        await asyncio.shield(task)

    def _require_execution_target(self, expected_execution_id: str) -> None:
        if not self.execution_id or not self.is_active:
            raise NoActiveExecutionError("No active execution")
        if self.execution_id != expected_execution_id:
            raise ExecutionIdMismatchError("Execution id does not match active execution")

    async def _execute(self, context: NodeExecutionContext, plan: ExecutionPlan) -> None:
        start_time = time.time()
        execution_id = context.execution_id
        workflow_id = context.workflow_id
        control = context.control

        steps = plan.steps
        total_steps = len(steps)
        start_from = plan.start_from_unrolled_index
        try:
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

            for unrolled_idx, step in enumerate(steps):
                if unrolled_idx < start_from and unrolled_idx not in plan.boundary_prelude_indices:
                    continue

                await control.checkpoint()

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
                await control.checkpoint()

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
                    await control.checkpoint()
                    dispatch_result = await execute_node(context, node, step, params)
                    outcome = dispatch_result if isinstance(dispatch_result, MeasurementOutcome) else None
                    status = outcome.step_status if outcome else "completed"
                    result = outcome.result if outcome else dispatch_result
                    await self.runtime.on_execution_step_finished(
                        {
                            "executionId": execution_id,
                            "nodeIndex": step["originalIndex"],
                            "unrolledIndex": unrolled_idx,
                            "nodeId": node.get("id"),
                            "iterationPath": step.get("iterationPath", []),
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
                    control.check_cancelled()
                except (WorkflowCancelled, asyncio.CancelledError) as e:
                    if isinstance(e, asyncio.CancelledError):
                        control.request_cancel()
                    stopped_status = "failed" if control.shutdown_reason else "cancelled"
                    if not step_finished:
                        stopped_data = {"reason": control.shutdown_reason or str(e) or "Execution cancelled by user"}
                        stopped_data.update(_step_partial_result(e))
                        await self.runtime.on_execution_step_finished(
                            {
                                "executionId": execution_id,
                                "nodeIndex": step["originalIndex"],
                                "unrolledIndex": unrolled_idx,
                                "nodeId": node.get("id"),
                                "iterationPath": step.get("iterationPath", []),
                                "status": stopped_status,
                                "data": stopped_data,
                            }
                        )
                    raise
                except Exception as e:
                    if not step_finished:
                        failure_data = {"error": str(e)}
                        if isinstance(e, ExecutionFailureError):
                            failure_data["failure"] = e.failure
                        failure_data.update(_step_partial_result(e))
                        await self.runtime.on_execution_step_finished(
                            {
                                "executionId": execution_id,
                                "nodeIndex": step["originalIndex"],
                                "unrolledIndex": unrolled_idx,
                                "nodeId": node.get("id"),
                                "iterationPath": step.get("iterationPath", []),
                                "status": "failed",
                                "data": failure_data,
                            }
                        )
                    raise

            control.check_cancelled()
            final_status = "completed"
            error = None
            failure = None
        except (Exception, asyncio.CancelledError) as e:
            if isinstance(e, asyncio.CancelledError):
                control.request_cancel()
            final_status = "cancelled" if isinstance(e, (WorkflowCancelled, asyncio.CancelledError)) and not control.shutdown_reason else "failed"
            error = str(e) or control.shutdown_reason or "Execution cancelled by user"
            failure = e.failure if final_status == "failed" and isinstance(e, ExecutionFailureError) else None

        try:
            # 公共收尾只调用通用 close；具体资源由执行期适配登记。
            context.resources.close()
        except Exception as close_error:
            # 收尾失败即使此前已取消也必须最终 failed，同时保留原错误与收尾错误。
            final_status = "failed"
            if error:
                error = f"{error}；收尾失败：{close_error}"
            else:
                error = str(close_error)

        self.status = final_status
        try:
            await self.runtime.on_execution_finished(
                {
                    "executionId": execution_id,
                    "status": final_status,
                    "durationMs": int((time.time() - start_time) * 1000),
                    "error": error,
                    "failure": failure,
                    "summary": {"total_steps": total_steps} if final_status == "completed" else {},
                }
            )
        finally:
            if self._control is control:
                self._task = None
                self._plan = None
                self._resources = None
