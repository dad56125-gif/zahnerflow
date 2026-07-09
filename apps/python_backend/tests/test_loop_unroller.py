from __future__ import annotations

import asyncio

import pytest

from loop_unroller import WorkflowBlockError, find_matching_loop_end, unroll_loops
from runtime.execution_eta import estimate_workflow


def test_unroll_loops_repeats_loop_body_and_records_iteration_path():
    nodes = [
        {"id": "loop_1", "type": "loop_start", "config": {"loopCount": 3}},
        {"id": "node_a", "type": "wait_delay", "config": {"duration": 1}},
        {"id": "node_b", "type": "wait_delay", "config": {"duration": 2}},
        {"id": "end_1", "type": "loop_end", "config": {}},
    ]

    result = unroll_loops(nodes)

    assert [step["originalIndex"] for step in result["steps"]] == [1, 2, 1, 2, 1, 2]
    assert [step["unrolledIndex"] for step in result["steps"]] == list(range(6))
    assert {step["unrolledTotal"] for step in result["steps"]} == {6}
    assert result["steps"][0]["iterationPath"] == [
        {"loopNodeId": "loop_1", "loopStartIndex": 0, "iteration": 1, "totalIterations": 3}
    ]
    assert result["steps"][2]["iterationPath"][0]["iteration"] == 2
    assert result["steps"][4]["iterationPath"][0]["iteration"] == 3
    assert result["steps"][0]["loopEvents"] == [
        {"loopStartIndex": 0, "iteration": 1, "totalIterations": 3, "nodeIndices": [1, 2]}
    ]


def test_unroll_loops_supports_nested_loops():
    nodes = [
        {"id": "outer", "type": "loop_start", "config": {"loopCount": 2}},
        {"id": "inner", "type": "loop_start", "config": {"loopCount": 2}},
        {"id": "node_a", "type": "wait_delay", "config": {"duration": 1}},
        {"id": "inner_end", "type": "loop_end", "config": {}},
        {"id": "outer_end", "type": "loop_end", "config": {}},
    ]

    result = unroll_loops(nodes)

    assert find_matching_loop_end(nodes, 0) == 4
    assert find_matching_loop_end(nodes, 1) == 3
    assert [step["originalIndex"] for step in result["steps"]] == [2, 2, 2, 2]
    assert [path["iteration"] for path in result["steps"][0]["iterationPath"]] == [1, 1]
    assert [path["iteration"] for path in result["steps"][1]["iterationPath"]] == [1, 2]
    assert [path["iteration"] for path in result["steps"][2]["iterationPath"]] == [2, 1]
    assert [path["iteration"] for path in result["steps"][3]["iterationPath"]] == [2, 2]
    assert result["summary"]["maxLoopDepth"] == 2


def test_eta_uses_unrolled_step_count_for_looped_workflow():
    nodes = [
        {"id": "loop_1", "type": "loop_start", "config": {"loopCount": 3}},
        {"id": "delay_1", "type": "wait_delay", "config": {"duration": 2}},
        {"id": "end_1", "type": "loop_end", "config": {}},
    ]
    unrolled = unroll_loops(nodes)

    estimate = estimate_workflow(nodes, unrolled["steps"])

    assert len(estimate["steps"]) == 3
    assert estimate["eta"]["estimatedTotalSeconds"] == 6
    assert estimate["steps"][2]["unrolledTotal"] == 3


def test_measurement_workflow_inserts_automatic_startup_and_shutdown():
    nodes = [
        {"id": "delay_1", "type": "wait_delay", "config": {"duration": 2}},
        {"id": "ocp_1", "type": "ocp_measurement", "config": {"measurementDuration": 5}},
        {"id": "delay_2", "type": "wait_delay", "config": {"duration": 3}},
    ]

    result = unroll_loops(nodes, auto_startup_config={"host": "simulator", "simulatorProfile": "normal"})

    assert [step["nodeType"] for step in result["steps"]] == [
        "wait_delay",
        "startup",
        "ocp_measurement",
        "shutdown",
        "wait_delay",
    ]
    assert result["steps"][1]["node"]["auto"] is True
    assert result["steps"][1]["node"]["config"] == {"host": "simulator", "simulatorProfile": "normal"}
    assert result["steps"][3]["node"]["auto"] is True
    assert [step["unrolledIndex"] for step in result["steps"]] == list(range(5))


def test_measurement_workflow_replaces_manual_startup_shutdown_boundaries():
    nodes = [
        {"id": "manual_startup", "type": "startup", "config": {"host": "legacy"}},
        {"id": "ocp_1", "type": "ocp_measurement", "config": {"measurementDuration": 5}},
        {"id": "manual_shutdown", "type": "shutdown", "config": {}},
    ]

    result = unroll_loops(nodes, auto_startup_config={"host": "localhost"})

    assert [step["nodeId"] for step in result["steps"]] == [
        "__auto_startup_before_measurement",
        "ocp_1",
        "__auto_shutdown_after_measurement",
    ]
    assert result["steps"][0]["node"]["config"] == {"host": "localhost"}


def test_advanced_step_ramp_expands_to_executable_chrono_steps():
    nodes = [
        {
            "id": "ramp_1",
            "type": "potentiostatic_step_ramp",
            "config": {
                "startPotential": 0.0,
                "endPotential": 0.2,
                "stepPotential": 0.1,
                "holdTime": 5,
                "samplingInterval": 0.5,
            },
        }
    ]

    result = unroll_loops(nodes, auto_startup_config={"host": "simulator"})

    assert [step["nodeType"] for step in result["steps"]] == [
        "startup",
        "chronoamperometry",
        "chronoamperometry",
        "chronoamperometry",
        "shutdown",
    ]
    chrono_steps = [step for step in result["steps"] if step["nodeType"] == "chronoamperometry"]
    assert [step["parentNodeType"] for step in chrono_steps] == ["potentiostatic_step_ramp"] * 3
    assert [step["node"]["config"]["polarizationVoltage"] for step in chrono_steps] == [0.0, 0.1, 0.2]
    assert [step["unrolledIndex"] for step in result["steps"]] == list(range(5))


def test_workflow_block_expands_child_nodes_and_ignores_startup_shutdown():
    nodes = [
        {"id": "block_1", "type": "workflow_block", "config": {"workflowId": "wf_child", "workflowName": "子流程"}},
    ]

    def loader(workflow_id: str) -> dict:
        assert workflow_id == "wf_child"
        return {
            "id": "wf_child",
            "name": "子流程",
            "nodes": [
                {"id": "startup_1", "type": "startup", "config": {}},
                {"id": "delay_1", "type": "wait_delay", "config": {"duration": 2}},
                {"id": "shutdown_1", "type": "shutdown", "config": {}},
            ],
        }

    result = unroll_loops(nodes, workflow_loader=loader)

    assert len(result["steps"]) == 1
    step = result["steps"][0]
    assert step["originalIndex"] == 0
    assert step["nodeId"] == "delay_1"
    assert step["nodeType"] == "wait_delay"
    assert step["node"]["config"]["duration"] == 2
    assert step["blockPath"] == [
        {
            "blockNodeId": "block_1",
            "blockWorkflowId": "wf_child",
            "blockWorkflowName": "子流程",
            "blockOriginalIndex": 0,
        }
    ]


def test_workflow_block_advanced_child_keeps_block_and_parent_metadata():
    nodes = [
        {"id": "block_1", "type": "workflow_block", "config": {"workflowId": "wf_child", "workflowName": "子流程"}},
    ]

    def loader(_workflow_id: str) -> dict:
        return {
            "id": "wf_child",
            "name": "子流程",
            "nodes": [
                {
                    "id": "adv_1",
                    "type": "potentiostatic_step_ramp",
                    "config": {
                        "startPotential": 0.0,
                        "endPotential": 0.1,
                        "stepPotential": 0.1,
                        "holdTime": 5,
                    },
                },
            ],
        }

    result = unroll_loops(nodes, workflow_loader=loader, auto_startup_config={"host": "simulator"})
    measurement_steps = [step for step in result["steps"] if step["nodeType"] == "chronoamperometry"]

    assert [step["nodeType"] for step in result["steps"]] == [
        "startup",
        "chronoamperometry",
        "chronoamperometry",
        "shutdown",
    ]
    assert [step["parentNodeType"] for step in measurement_steps] == ["potentiostatic_step_ramp"] * 2
    assert measurement_steps[0]["blockPath"] == [
        {
            "blockNodeId": "block_1",
            "blockWorkflowId": "wf_child",
            "blockWorkflowName": "子流程",
            "blockOriginalIndex": 0,
        }
    ]


def test_workflow_block_rejects_nested_workflow_block():
    nodes = [
        {"id": "block_1", "type": "workflow_block", "config": {"workflowId": "wf_child"}},
    ]

    def loader(_workflow_id: str) -> dict:
        return {
            "id": "wf_child",
            "nodes": [
                {"id": "nested", "type": "workflow_block", "config": {"workflowId": "wf_nested"}},
            ],
        }

    with pytest.raises(WorkflowBlockError):
        unroll_loops(nodes, workflow_loader=loader)


def test_execution_engine_emits_loop_iteration_events(monkeypatch):
    asyncio.run(_run_execution_engine_emits_loop_iteration_events(monkeypatch))


def test_execution_engine_can_start_from_unrolled_index(monkeypatch):
    asyncio.run(_run_execution_engine_can_start_from_unrolled_index(monkeypatch))


def test_execution_engine_runs_startup_before_mid_measurement_start(monkeypatch):
    asyncio.run(_run_execution_engine_runs_startup_before_mid_measurement_start(monkeypatch))


async def _run_execution_engine_emits_loop_iteration_events(monkeypatch):
    from runtime.app_runtime import AppRuntime

    runtime = AppRuntime()
    emitted = []

    async def fake_emit(event, payload):
        emitted.append((event, payload))

    monkeypatch.setattr(runtime, "emit", fake_emit)
    monkeypatch.setattr(runtime, "on_execution_timeline_started", _async_noop)
    monkeypatch.setattr(runtime, "on_execution_step_started", _async_step_started)
    monkeypatch.setattr(runtime, "on_execution_step_finished", _async_noop)
    monkeypatch.setattr(runtime, "on_execution_finished", _async_noop)

    runtime.execution.nodes = [
        {"id": "loop_1", "type": "loop_start", "config": {"loopCount": 2}},
        {"id": "delay_1", "type": "wait_delay", "config": {"duration": 0}},
        {"id": "end_1", "type": "loop_end", "config": {}},
    ]
    runtime.execution.execution_id = "exec_loop"
    runtime.execution.workflow_id = "wf_loop"
    runtime.execution.status = "running"
    runtime.execution._plan = runtime.plan_execution(runtime.execution.nodes)

    await runtime.execution._execute()

    loop_events = [payload for event, payload in emitted if event == "loopiteration_start"]
    assert loop_events == [
        {"loopStartIndex": 0, "iteration": 1, "totalIterations": 2, "nodeIndices": [1]},
        {"loopStartIndex": 0, "iteration": 2, "totalIterations": 2, "nodeIndices": [1]},
    ]


async def _run_execution_engine_can_start_from_unrolled_index(monkeypatch):
    from runtime.app_runtime import AppRuntime

    runtime = AppRuntime()
    started_indices = []

    async def fake_step_started(payload):
        started_indices.append(payload["stepInfo"]["unrolledIndex"])
        return payload["stepInfo"]

    monkeypatch.setattr(runtime, "on_execution_timeline_started", _async_noop)
    monkeypatch.setattr(runtime, "on_execution_step_started", fake_step_started)
    monkeypatch.setattr(runtime, "on_execution_step_finished", _async_noop)
    monkeypatch.setattr(runtime, "on_execution_finished", _async_noop)

    runtime.execution.nodes = [
        {"id": "delay_1", "type": "wait_delay", "config": {"duration": 0}},
        {"id": "delay_2", "type": "wait_delay", "config": {"duration": 0}},
        {"id": "delay_3", "type": "wait_delay", "config": {"duration": 0}},
    ]
    runtime.execution.execution_id = "exec_start_from"
    runtime.execution.workflow_id = "wf_start_from"
    runtime.execution.status = "running"
    runtime.execution._plan = runtime.plan_execution(
        runtime.execution.nodes,
        start_from_unrolled_index=2,
    )

    await runtime.execution._execute()

    assert started_indices == [2]


async def _run_execution_engine_runs_startup_before_mid_measurement_start(monkeypatch):
    from runtime.app_runtime import AppRuntime

    runtime = AppRuntime()
    started_types = []
    timeline_payloads = []

    async def fake_timeline_started(payload):
        timeline_payloads.append(payload)

    async def fake_step_started(payload):
        started_types.append(payload["stepInfo"]["nodeType"])
        return payload["stepInfo"]

    async def fake_dispatch(node, step, params):
        return {"nodeType": node.get("type")}

    monkeypatch.setattr(runtime, "on_execution_timeline_started", fake_timeline_started)
    monkeypatch.setattr(runtime, "on_execution_step_started", fake_step_started)
    monkeypatch.setattr(runtime, "on_execution_step_finished", _async_noop)
    monkeypatch.setattr(runtime, "on_execution_finished", _async_noop)
    monkeypatch.setattr(runtime.execution, "_dispatch_node", fake_dispatch)

    runtime.execution.nodes = [
        {"id": "ocp_1", "type": "ocp_measurement", "config": {"measurementDuration": 0}},
        {"id": "ocp_2", "type": "ocp_measurement", "config": {"measurementDuration": 0}},
    ]
    runtime.execution.execution_id = "exec_start_from_measurement"
    runtime.execution.workflow_id = "wf_start_from_measurement"
    runtime.execution.status = "running"
    runtime.execution._plan = runtime.plan_execution(
        runtime.execution.nodes,
        auto_startup_config={"host": "simulator"},
        start_from_unrolled_index=2,
    )

    await runtime.execution._execute()

    assert timeline_payloads[0]["boundaryPreludeIndices"] == [0]
    assert started_types == ["startup", "ocp_measurement", "shutdown"]


async def _async_noop(*args, **kwargs):
    return None


async def _async_step_started(payload):
    return payload["stepInfo"]
