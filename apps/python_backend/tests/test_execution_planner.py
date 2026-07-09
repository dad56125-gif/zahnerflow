from __future__ import annotations

import asyncio

import pytest

from runtime.execution_planner import ExecutionPlanner, ExecutionPlanningError


def test_execution_planner_builds_one_plan_for_steps_eta_and_boundaries():
    planner = ExecutionPlanner()
    nodes = [
        {"id": "delay_1", "type": "wait_delay", "config": {"duration": 2}},
        {"id": "ocp_1", "type": "ocp_measurement", "config": {"measurementDuration": 5}},
        {"id": "delay_2", "type": "wait_delay", "config": {"duration": 3}},
    ]

    plan = planner.plan(
        nodes,
        auto_startup_config={"host": "simulator", "simulatorProfile": "normal"},
        start_from_unrolled_index=2,
    )

    assert [step["nodeType"] for step in plan.steps] == [
        "wait_delay",
        "startup",
        "ocp_measurement",
        "shutdown",
        "wait_delay",
    ]
    assert plan.start_from_unrolled_index == 2
    assert plan.boundary_prelude_indices == (1,)
    assert len(plan.timeline["steps"]) == len(plan.steps)
    assert plan.eta["estimatedTotalSeconds"] == plan.timeline["estimatedTotalSeconds"]
    assert plan.steps[1]["node"]["config"] == {
        "host": "simulator",
        "simulatorProfile": "normal",
    }


def test_execution_planner_resolves_saved_workflow_before_planning():
    planner = ExecutionPlanner(
        workflow_loader=lambda workflow_id: {
            "id": workflow_id,
            "nodes": [{"id": "delay_1", "type": "wait_delay", "config": {"duration": 4}}],
        }
    )

    nodes = planner.resolve_nodes(None, "wf_saved")
    plan = planner.plan(nodes)

    assert nodes[0]["config"]["duration"] == 4
    assert plan.steps[0]["nodeId"] == "delay_1"
    assert plan.eta["estimatedTotalSeconds"] == 4


def test_execution_engine_consumes_plan_without_unrolling_again(monkeypatch):
    from runtime.app_runtime import AppRuntime

    runtime = AppRuntime()
    nodes = [{"id": "delay_1", "type": "wait_delay", "config": {"duration": 0}}]
    plan = runtime.plan_execution(nodes)
    runtime.execution._plan = plan
    runtime.execution.nodes = plan.nodes
    runtime.execution.execution_id = "exec_plan"
    runtime.execution.workflow_id = "wf_plan"
    runtime.execution.status = "running"

    async def noop(*_args, **_kwargs):
        return None

    async def step_started(payload):
        return payload["stepInfo"]

    monkeypatch.setattr(runtime, "on_execution_timeline_started", noop)
    monkeypatch.setattr(runtime, "on_execution_step_started", step_started)
    monkeypatch.setattr(runtime, "on_execution_step_finished", noop)
    monkeypatch.setattr(runtime, "on_execution_finished", noop)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("ExecutionEngine must consume the prepared plan")

    monkeypatch.setattr("loop_unroller.unroll_loops", fail_if_called)

    asyncio.run(runtime.execution._execute())


@pytest.mark.parametrize("start_index", ["not-a-number", -1, 3])
def test_execution_planner_rejects_invalid_start_index(start_index):
    planner = ExecutionPlanner()
    nodes = [{"id": "delay_1", "type": "wait_delay", "config": {"duration": 1}}]

    with pytest.raises(ExecutionPlanningError):
        planner.plan(nodes, start_from_unrolled_index=start_index)
