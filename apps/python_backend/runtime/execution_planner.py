"""Build the single authoritative plan used by preview, ETA and execution."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from database import db
from loop_unroller import WorkflowBlockError, unroll_loops
from runtime.execution_eta import estimate_workflow
from runtime.execution_semantics import (
    MEASUREMENT_NODE_TYPES,
    resolve_scheduled_start,
    unsupported_executable_steps,
    unsupported_source_nodes,
)


class ExecutionPlanningError(ValueError):
    """Raised when an execution plan cannot be built from the requested workflow."""


class WorkflowNotFoundError(ExecutionPlanningError):
    """Raised when a requested workflow definition does not exist."""


@dataclass(frozen=True)
class ExecutionPlan:
    """Execution input snapshot shared by all execution-related entry points."""

    nodes: list[dict]
    steps: list[dict]
    summary: dict
    eta: dict
    timeline: dict
    start_from_unrolled_index: int
    boundary_prelude_indices: tuple[int, ...]


WorkflowLoader = Callable[[str], dict]


class ExecutionPlanner:
    """Resolve workflow nodes and derive one complete execution plan."""

    def __init__(self, devices=None, workflow_loader: WorkflowLoader | None = None) -> None:
        self.devices = devices
        self.workflow_loader = workflow_loader or database_workflow_loader(db)

    def load_workflow(self, workflow_id: str) -> dict:
        try:
            workflow = self.workflow_loader(workflow_id)
        except WorkflowNotFoundError:
            raise
        except WorkflowBlockError as exc:
            raise WorkflowNotFoundError(str(exc)) from exc
        if not isinstance(workflow, dict):
            raise ExecutionPlanningError(f"Workflow {workflow_id} is invalid")
        return workflow

    def resolve_nodes(self, nodes: list[dict] | None, workflow_id: str | None = None) -> list[dict]:
        """Resolve request nodes or load the saved definition referenced by workflow_id."""
        if nodes is not None and not isinstance(nodes, list):
            raise ExecutionPlanningError("Nodes must be an array")

        if nodes:
            return nodes

        if workflow_id:
            workflow = self.load_workflow(workflow_id)
            resolved_nodes = workflow.get("nodes") or []
            if not isinstance(resolved_nodes, list):
                raise ExecutionPlanningError("Workflow nodes must be an array")
            return resolved_nodes

        if nodes is not None:
            return nodes

        raise ExecutionPlanningError("Nodes array is required")

    def plan(
        self,
        nodes: list[dict],
        *,
        auto_startup_config: dict | None = None,
        start_from_unrolled_index=0,
        now: datetime | None = None,
    ) -> ExecutionPlan:
        if not isinstance(nodes, list):
            raise ExecutionPlanningError("Nodes must be an array")

        nodes_snapshot = copy.deepcopy(nodes)
        unsupported_nodes = unsupported_source_nodes(nodes_snapshot)
        if unsupported_nodes:
            raise ExecutionPlanningError(_unsupported_nodes_message(unsupported_nodes))
        try:
            unrolled = unroll_loops(
                nodes_snapshot,
                workflow_loader=self.workflow_loader,
                auto_startup_config=auto_startup_config or {},
            )
        except WorkflowBlockError as exc:
            raise ExecutionPlanningError(str(exc)) from exc

        steps = unrolled["steps"]
        unsupported_steps = unsupported_executable_steps(steps)
        if unsupported_steps:
            raise ExecutionPlanningError(_unsupported_nodes_message(unsupported_steps, expanded=True))

        planned_at = now or datetime.now()
        for step in steps:
            if step.get("nodeType") != "scheduled_start":
                continue
            node = step.get("node") or nodes_snapshot[step["originalIndex"]]
            try:
                scheduled_at = resolve_scheduled_start(node.get("config") or {}, planned_at)
            except (TypeError, ValueError) as exc:
                raise ExecutionPlanningError(f"Invalid scheduled_start parameters: {exc}") from exc
            if scheduled_at <= planned_at:
                raise ExecutionPlanningError(
                    f"Scheduled time has already passed: {scheduled_at.isoformat()}"
                )
            step["scheduledAt"] = scheduled_at.isoformat()

        estimate = estimate_workflow(nodes_snapshot, steps, self.devices, now=planned_at)
        start_index = self._validate_start_index(start_from_unrolled_index, len(steps))
        boundary_prelude_indices = _boundary_prelude_indices(steps, start_index)
        timeline = {
            "steps": copy.deepcopy(estimate["steps"]),
            "estimatedTotalSeconds": float(estimate["eta"].get("estimatedTotalSeconds") or 0),
        }

        return ExecutionPlan(
            nodes=nodes_snapshot,
            steps=steps,
            summary=copy.deepcopy(unrolled["summary"]),
            eta=copy.deepcopy(estimate["eta"]),
            timeline=timeline,
            start_from_unrolled_index=start_index,
            boundary_prelude_indices=tuple(sorted(boundary_prelude_indices)),
        )

    @staticmethod
    def _validate_start_index(raw_index, total_steps: int) -> int:
        try:
            start_index = int(raw_index or 0)
        except (TypeError, ValueError) as exc:
            raise ExecutionPlanningError("startFromUnrolledIndex must be an integer") from exc
        if start_index < 0 or (total_steps > 0 and start_index >= total_steps):
            raise ExecutionPlanningError("startFromUnrolledIndex is outside the expanded step range")
        return start_index


def database_workflow_loader(database) -> WorkflowLoader:
    """Create a workflow loader for the active SQLite boundary."""

    def load_workflow_nodes(workflow_id: str) -> dict:
        row = database.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        if not row:
            raise WorkflowBlockError(f"Workflow block references missing workflow: {workflow_id}")
        return json.loads(row["json_data"])

    return load_workflow_nodes


def _boundary_prelude_indices(steps: list[dict], start_from: int) -> set[int]:
    if start_from <= 0:
        return set()

    has_remaining_measurement = any(
        step.get("nodeType") in MEASUREMENT_NODE_TYPES
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


def _unsupported_nodes_message(items: list[tuple[int, str, str]], *, expanded: bool = False) -> str:
    scope = "expanded step" if expanded else "workflow node"
    details = ", ".join(
        f"{scope} {index} ({node_id or 'no id'}): {node_type}"
        for index, node_id, node_type in items
    )
    return f"Unsupported node type(s): {details}"
