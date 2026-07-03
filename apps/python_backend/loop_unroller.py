"""Loop unroller for the unified Python backend."""

from __future__ import annotations



LOOP_START = "loop_start"
LOOP_END = "loop_end"
WORKFLOW_BLOCK = "workflow_block"
IGNORED_BLOCK_NODE_TYPES = {"startup", "shutdown"}
BOUNDARY_NODE_TYPES = {"startup", "shutdown"}
MEASUREMENT_NODE_TYPES = {
    "eis_potentiostatic",
    "eis_galvanostatic",
    "ocp",
    "ocp_measurement",
    "voltage_ramp",
    "current_ramp",
    "chronoamperometry",
    "chronopotentiometry",
    "galvanostatic_switching",
    "potentiostatic_switching",
    "galvanostatic_step_ramp",
    "potentiostatic_step_ramp",
    "measurement",
}


class WorkflowBlockError(ValueError):
    """Raised when a workflow block cannot be expanded for v1 execution."""


def find_matching_loop_end(nodes: list[dict], loop_start_idx: int, end_idx: int | None = None) -> int:
    depth = 0
    limit = len(nodes) if end_idx is None else min(end_idx, len(nodes))
    for index in range(loop_start_idx, limit):
        node_type = nodes[index].get("type")
        if node_type == LOOP_START:
            depth += 1
        elif node_type == LOOP_END:
            depth -= 1
            if depth == 0:
                return index
    return -1


def unroll_loops(nodes: list[dict], workflow_loader=None, auto_startup_config: dict | None = None) -> dict:
    steps = _unroll_recursive(nodes, 0, len(nodes), [], [], [], workflow_loader or _load_workflow_nodes)
    steps = _with_measurement_boundaries(steps, auto_startup_config or {})
    for unrolled_index, step in enumerate(steps):
        step["unrolledIndex"] = unrolled_index
        step["unrolledTotal"] = len(steps)
    return {"steps": steps, "summary": _build_summary(nodes, steps)}


def _unroll_recursive(
    nodes: list[dict],
    start_idx: int,
    end_idx: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
    workflow_loader,
    parent_original_index: int | None = None,
) -> list[dict]:
    steps: list[dict] = []
    index = start_idx

    while index < end_idx:
        node = nodes[index]
        node_type = node.get("type")

        if node_type == LOOP_START:
            loop_end_idx = find_matching_loop_end(nodes, index, end_idx)
            if loop_end_idx == -1:
                index += 1
                continue

            total_iterations = _loop_count(node)
            body_node_indices = _body_node_indices(nodes, index + 1, loop_end_idx)
            for iteration_idx in range(total_iterations):
                loop_event = {
                    "loopStartIndex": index,
                    "iteration": iteration_idx + 1,
                    "totalIterations": total_iterations,
                    "nodeIndices": body_node_indices,
                }
                child_path = [
                    *iteration_path,
                    {
                        "loopNodeId": node.get("id", ""),
                        "loopStartIndex": index,
                        "iteration": iteration_idx + 1,
                        "totalIterations": total_iterations,
                    },
                ]
                child_steps = _unroll_recursive(
                    nodes,
                    index + 1,
                    loop_end_idx,
                    child_path,
                    [*loop_context_stack, index],
                    block_path,
                    workflow_loader,
                    parent_original_index,
                )
                if child_steps:
                    child_steps[0].setdefault("loopEvents", []).insert(0, loop_event)
                steps.extend(child_steps)

            index = loop_end_idx + 1
            continue

        if node_type == WORKFLOW_BLOCK:
            child_steps = _expand_workflow_block(
                node,
                index,
                iteration_path,
                loop_context_stack,
                block_path,
                workflow_loader,
                parent_original_index,
            )
            steps.extend(child_steps)
            index += 1
            continue

        if node_type == LOOP_END:
            index += 1
            continue

        steps.append(
            {
                "nodeId": node.get("id"),
                "nodeType": node_type,
                "originalIndex": parent_original_index if parent_original_index is not None else index,
                "sourceIndex": index,
                "node": node,
                "iterationPath": [dict(item) for item in iteration_path],
                "loopContextStack": list(loop_context_stack),
                "loopDepth": len(loop_context_stack),
                "blockPath": [dict(item) for item in block_path],
            }
        )
        index += 1

    return steps


def _expand_workflow_block(
    node: dict,
    index: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
    workflow_loader,
    parent_original_index: int | None,
) -> list[dict]:
    config = node.get("config") or {}
    workflow_id = str(config.get("workflowId") or "").strip()
    if not workflow_id:
        raise WorkflowBlockError("Workflow block is missing workflowId")

    workflow = workflow_loader(workflow_id)
    child_nodes = list((workflow or {}).get("nodes") or [])
    nested_block = next((child for child in child_nodes if child.get("type") == WORKFLOW_BLOCK), None)
    if nested_block:
        raise WorkflowBlockError("Nested workflow blocks are not supported in v1")

    executable_nodes = [
        child
        for child in child_nodes
        if child.get("type") not in IGNORED_BLOCK_NODE_TYPES
    ]
    child_block_path = [
        *block_path,
        {
            "blockNodeId": node.get("id", ""),
            "blockWorkflowId": workflow_id,
            "blockWorkflowName": config.get("workflowName") or (workflow or {}).get("name") or workflow_id,
            "blockOriginalIndex": parent_original_index if parent_original_index is not None else index,
        },
    ]
    return _unroll_recursive(
        executable_nodes,
        0,
        len(executable_nodes),
        iteration_path,
        loop_context_stack,
        child_block_path,
        workflow_loader,
        parent_original_index if parent_original_index is not None else index,
    )


def _load_workflow_nodes(workflow_id: str) -> dict:
    from database import db
    import json

    row = db.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    if not row:
        raise WorkflowBlockError(f"Workflow block references missing workflow: {workflow_id}")
    return json.loads(row["json_data"])


def _with_measurement_boundaries(steps: list[dict], startup_config: dict) -> list[dict]:
    non_boundary_steps = [step for step in steps if step.get("nodeType") not in BOUNDARY_NODE_TYPES]
    measurement_positions = [
        index
        for index, step in enumerate(non_boundary_steps)
        if step.get("nodeType") in MEASUREMENT_NODE_TYPES
    ]
    if not measurement_positions:
        return steps

    first_measurement = non_boundary_steps[measurement_positions[0]]
    last_measurement_position = measurement_positions[-1]
    last_measurement = non_boundary_steps[last_measurement_position]
    with_boundaries = list(non_boundary_steps)
    with_boundaries.insert(
        measurement_positions[0],
        _auto_boundary_step(
            "startup",
            "__auto_startup_before_measurement",
            first_measurement,
            startup_config,
        ),
    )
    with_boundaries.insert(
        last_measurement_position + 2,
        _auto_boundary_step(
            "shutdown",
            "__auto_shutdown_after_measurement",
            last_measurement,
            {},
        ),
    )
    return with_boundaries


def _auto_boundary_step(node_type: str, node_id: str, anchor_step: dict, config: dict) -> dict:
    original_index = int(anchor_step.get("originalIndex") or 0)
    return {
        "nodeId": node_id,
        "nodeType": node_type,
        "originalIndex": original_index,
        "sourceIndex": anchor_step.get("sourceIndex", original_index),
        "node": {
            "id": node_id,
            "type": node_type,
            "config": dict(config),
            "auto": True,
        },
        "iterationPath": [],
        "loopContextStack": [],
        "loopDepth": 0,
        "blockPath": [],
        "autoBoundary": True,
    }


def _loop_count(node: dict) -> int:
    config = node.get("config") or {}
    raw_count = config.get("loopCount", 1)
    try:
        return max(0, int(raw_count))
    except (TypeError, ValueError):
        return 1


def _body_node_indices(nodes: list[dict], start_idx: int, end_idx: int) -> list[int]:
    return [
        index
        for index in range(start_idx, end_idx)
        if nodes[index].get("type") not in (LOOP_START, LOOP_END)
    ]


def _build_summary(nodes: list[dict], steps: list[dict]) -> dict:
    loops = []
    for index, node in enumerate(nodes):
        if node.get("type") != LOOP_START:
            continue
        loop_end_idx = find_matching_loop_end(nodes, index)
        if loop_end_idx == -1:
            continue
        loops.append(
            {
                "startIndex": index,
                "endIndex": loop_end_idx,
                "iterationCount": _loop_count(node),
                "depth": _loop_depth_at(nodes, index),
            }
        )

    return {
        "totalSteps": len(steps),
        "physicalNodeCount": len([node for node in nodes if node.get("type") not in (LOOP_START, LOOP_END)]),
        "maxLoopDepth": max((int(step.get("loopDepth") or 0) for step in steps), default=0),
        "loops": loops,
    }


def _loop_depth_at(nodes: list[dict], target_idx: int) -> int:
    depth = 0
    for index in range(target_idx):
        node_type = nodes[index].get("type")
        if node_type == LOOP_START and find_matching_loop_end(nodes, index) > target_idx:
            depth += 1
        elif node_type == LOOP_END:
            depth = max(0, depth - 1)
    return depth
