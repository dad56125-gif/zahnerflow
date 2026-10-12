"""Loop unroller for the unified Python backend."""

from __future__ import annotations

from devices.zahner.logic import normalize_measurement_parameters
from runtime.execution_semantics import ADVANCED_MEASUREMENT_TYPES, MEASUREMENT_NODE_TYPES

LOOP_START = "loop_start"
LOOP_END = "loop_end"
WORKFLOW_BLOCK = "workflow_block"
IGNORED_BLOCK_NODE_TYPES = {"startup", "shutdown"}
BOUNDARY_NODE_TYPES = {"startup", "shutdown"}


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


def unroll_loops(nodes: list[dict], workflow_loader=None, auto_startup_config: dict | None = None, node_validator=None) -> dict:
    _validate_loop_structure(nodes)
    steps = _unroll_recursive(nodes, 0, len(nodes), [], [], [], workflow_loader or _load_workflow_nodes, node_validator=node_validator)
    steps = _with_measurement_boundaries(steps, auto_startup_config or {})
    for unrolled_index, step in enumerate(steps):
        step["unrolledIndex"] = unrolled_index
        step["unrolledTotal"] = len(steps)
    return {"steps": steps, "summary": _build_summary(nodes, steps)}


def _validate_loop_structure(nodes: list[dict]) -> None:
    starts: list[str] = []
    for node in nodes:
        if node.get("type") == LOOP_START:
            _loop_count(node)
            starts.append(str(node.get("id", "")))
        elif node.get("type") == LOOP_END:
            if not starts:
                raise ValueError(f"循环结束节点 {node.get('id', '')} 缺少对应的开始节点")
            starts.pop()
    if starts:
        raise ValueError(f"循环开始节点 {starts[-1]} 缺少对应的结束节点")


def _unroll_recursive(
    nodes: list[dict],
    start_idx: int,
    end_idx: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
    workflow_loader,
    parent_original_index: int | None = None,
    node_validator=None,
) -> list[dict]:
    steps: list[dict] = []
    index = start_idx

    while index < end_idx:
        node = nodes[index]
        node_type = node.get("type")

        if node_type == LOOP_START:
            loop_end_idx = find_matching_loop_end(nodes, index, end_idx)
            if loop_end_idx == -1:
                raise ValueError(f"循环开始节点 {node.get('id', '')} 缺少对应的结束节点")

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
                    node_validator,
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
                node_validator,
            )
            steps.extend(child_steps)
            index += 1
            continue

        if node_validator and not node_validator(node, parent_original_index if parent_original_index is not None else index):
            index += 1
            continue

        if node_type in ADVANCED_MEASUREMENT_TYPES:
            steps.extend(
                _expand_advanced_node(
                    node,
                    index,
                    iteration_path,
                    loop_context_stack,
                    block_path,
                    parent_original_index,
                )
            )
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


def _expand_advanced_node(
    node: dict,
    index: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
    parent_original_index: int | None,
) -> list[dict]:
    config = dict(node.get("config") or {})
    node_type = node.get("type")
    parameters = normalize_measurement_parameters(node_type, config)
    original_index = parent_original_index if parent_original_index is not None else index
    common_meta = {
        "parentNodeId": node.get("id"),
        "parentNodeType": node_type,
        "nodeConfig": config,
    }

    if node_type in ("galvanostatic_step_ramp", "potentiostatic_step_ramp"):
        is_galvanostatic = node_type == "galvanostatic_step_ramp"
        start = parameters["start_current" if is_galvanostatic else "start_potential"]
        end = parameters["end_current" if is_galvanostatic else "end_potential"]
        step_value = parameters["step_current" if is_galvanostatic else "step_potential"]
        hold_time = parameters["hold_time"]
        sampling_interval = parameters["sampling_interval"]
        raw_step_count = int(abs(end - start) // abs(step_value)) + 1
        step_count = min(max(1, raw_step_count), 1000)
        direction = 1 if end >= start else -1
        actual_step = abs(step_value) * direction
        child_type = "chronopotentiometry" if is_galvanostatic else "chronoamperometry"
        child_steps = []

        for step_index in range(step_count):
            value = start + step_index * actual_step
            child_config = {
                **config,
                **common_meta,
                "measurementDuration": hold_time,
                "measurement_duration": hold_time,
                "samplingInterval": sampling_interval,
                "sampling_interval": sampling_interval,
                "stepIndex": step_index,
                "totalSteps": step_count,
                "stepValue": value,
            }
            if is_galvanostatic:
                child_config["polarizationCurrent"] = value
                child_config["polarization_current"] = value
            else:
                child_config["polarizationVoltage"] = value
                child_config["polarization_voltage"] = value
            child_steps.append(
                _advanced_child_step(
                    node,
                    child_type,
                    child_config,
                    original_index,
                    step_index,
                    iteration_path,
                    loop_context_stack,
                    block_path,
                )
            )
        return child_steps

    if node_type in ("galvanostatic_switching", "potentiostatic_switching"):
        is_galvanostatic = node_type == "galvanostatic_switching"
        cycles = parameters["cycles"]
        sampling_interval = parameters["sampling_interval"]
        first_value = parameters["current_1" if is_galvanostatic else "potential_1"]
        second_value = parameters["current_2" if is_galvanostatic else "potential_2"]
        hold_times = [parameters["hold_time_1"], parameters["hold_time_2"]]
        values = [first_value, second_value]
        child_type = "chronopotentiometry" if is_galvanostatic else "chronoamperometry"
        total_steps = cycles * 2
        child_steps = []

        for cycle_index in range(cycles):
            for phase_index, value in enumerate(values):
                step_index = cycle_index * 2 + phase_index
                child_config = {
                    **config,
                    **common_meta,
                    "measurementDuration": hold_times[phase_index],
                    "measurement_duration": hold_times[phase_index],
                    "samplingInterval": sampling_interval,
                    "sampling_interval": sampling_interval,
                    "stepIndex": step_index,
                    "totalSteps": total_steps,
                    "cycleIndex": cycle_index,
                    "isFirstOfCycle": phase_index == 0,
                    "stepValue": value,
                }
                if is_galvanostatic:
                    child_config["polarizationCurrent"] = value
                    child_config["polarization_current"] = value
                else:
                    child_config["polarizationVoltage"] = value
                    child_config["polarization_voltage"] = value
                child_steps.append(
                    _advanced_child_step(
                        node,
                        child_type,
                        child_config,
                        original_index,
                        step_index,
                        iteration_path,
                        loop_context_stack,
                        block_path,
                    )
                )
        return child_steps

    return []


def _advanced_child_step(
    parent_node: dict,
    child_type: str,
    child_config: dict,
    original_index: int,
    step_index: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
) -> dict:
    parent_id = parent_node.get("id", "advanced")
    child_node = {
        "id": f"{parent_id}__expanded_{step_index + 1}",
        "type": child_type,
        "config": child_config,
    }
    return {
        "nodeId": child_node["id"],
        "nodeType": child_type,
        "originalIndex": original_index,
        "sourceIndex": original_index,
        "node": child_node,
        "iterationPath": [dict(item) for item in iteration_path],
        "loopContextStack": list(loop_context_stack),
        "loopDepth": len(loop_context_stack),
        "blockPath": [dict(item) for item in block_path],
        "parentNodeId": parent_id,
        "parentNodeType": parent_node.get("type"),
        "stepIndex": step_index,
        "totalSteps": child_config.get("totalSteps"),
        "stepValue": child_config.get("stepValue"),
        "cycleIndex": child_config.get("cycleIndex"),
    }


def _expand_workflow_block(
    node: dict,
    index: int,
    iteration_path: list[dict],
    loop_context_stack: list[int],
    block_path: list[dict],
    workflow_loader,
    parent_original_index: int | None,
    node_validator=None,
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
    if node_validator:
        root_index = parent_original_index if parent_original_index is not None else index
        invalid_counts = [child for child in executable_nodes
                          if child.get("type") == LOOP_START and not node_validator(child, root_index)]
        if invalid_counts:
            return []
    _validate_loop_structure(executable_nodes)
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
        node_validator,
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
        count = int(raw_count)
        if isinstance(raw_count, bool) or count < 0 or float(raw_count) != count:
            raise ValueError
        return count
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"循环节点 {node.get('id', '')} 的 loopCount 必须是非负整数") from None


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
