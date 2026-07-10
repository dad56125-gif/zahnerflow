from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import executions, workflows
from runtime import app_runtime as app_runtime_module
from runtime import execution_eta
from runtime import execution_recorder
from runtime.app_runtime import AppRuntime
from runtime.execution_engine import ExecutionEngine
from runtime.execution_planner import ExecutionPlanner, ExecutionPlanningError
from runtime.execution_semantics import (
    ExecutionIdMismatchError,
    InvalidExecutionTransitionError,
    normalize_measurement_outcome,
)


def test_planner_rejects_unknown_node_type_instead_of_estimating_and_completing_it():
    planner = ExecutionPlanner()

    with pytest.raises(ExecutionPlanningError, match="Unsupported node type"):
        planner.plan([{"id": "typo", "type": "ocp_measurment", "config": {}}])


def test_planner_resolves_one_absolute_schedule_for_eta_and_execution():
    planned_at = datetime(2026, 7, 10, 23, 50, 0)
    plan = ExecutionPlanner().plan(
        [
            {"id": "delay", "type": "wait_delay", "config": {"duration": 600}},
            {
                "id": "schedule",
                "type": "scheduled_start",
                "config": {"hour": 0, "minute": 5, "nextDay": True},
            },
        ],
        now=planned_at,
    )

    assert plan.steps[1]["scheduledAt"] == "2026-07-11T00:05:00"
    assert plan.timeline["steps"][1]["scheduledAt"] == plan.steps[1]["scheduledAt"]
    assert plan.timeline["steps"][0]["estimatedSeconds"] == 600
    assert plan.timeline["steps"][1]["estimatedSeconds"] == 300
    assert plan.eta["estimatedTotalSeconds"] == 900


def test_planner_rejects_schedule_that_is_already_past():
    with pytest.raises(ExecutionPlanningError, match="already passed"):
        ExecutionPlanner().plan(
            [
                {
                    "id": "schedule",
                    "type": "scheduled_start",
                    "config": {"hour": 9, "minute": 0, "nextDay": False},
                }
            ],
            now=datetime(2026, 7, 10, 10, 0, 0),
        )


def test_learnable_measurement_nodes_still_use_historical_eta(monkeypatch):
    historical = {
        "seconds": 12.5,
        "source": "history",
        "confidence": 0.79,
        "sampleCount": 3,
        "paramsHash": "history-hash",
    }
    monkeypatch.setattr(execution_eta, "_lookup_historical_estimate", lambda *_args: historical)

    estimate = execution_eta.estimate_node_seconds(
        "chronoamperometry",
        {"measurementDuration": 60},
    )

    assert estimate == historical


def test_execution_commands_guard_the_target_id_and_phase():
    state_updates = []

    async def on_experiment_state(payload):
        state_updates.append(payload)

    runtime = SimpleNamespace(devices=SimpleNamespace(), on_experiment_state=on_experiment_state)
    engine = ExecutionEngine(runtime)
    engine.execution_id = "exec_active"
    engine.workflow_id = "wf"
    engine.status = "running"

    async def scenario():
        with pytest.raises(ExecutionIdMismatchError):
            await engine.pause("exec_stale")
        await engine.pause("exec_active")
        with pytest.raises(InvalidExecutionTransitionError):
            await engine.pause("exec_active")
        await engine.resume("exec_active")
        await engine.cancel("exec_active")

    asyncio.run(scenario())

    assert [update["status"] for update in state_updates] == ["paused", "running", "cancelling"]


def test_completed_step_does_not_overwrite_paused_runtime_snapshot(monkeypatch):
    runtime = AppRuntime()
    runtime.execution.execution_id = "exec_paused"
    runtime.execution.status = "paused"
    runtime.experiment_state.update({"executionId": "exec_paused", "status": "paused"})
    monkeypatch.setattr(app_runtime_module, "finish_step", lambda **_kwargs: None)

    asyncio.run(
        runtime.on_execution_step_finished(
            {
                "executionId": "exec_paused",
                "nodeIndex": 0,
                "unrolledIndex": 0,
                "status": "completed",
                "data": {"ok": True},
            }
        )
    )

    assert runtime.experiment_state["status"] == "paused"


def test_cancelled_execution_uses_cancelled_notification_copy(monkeypatch):
    runtime = AppRuntime()
    runtime.experiment_state.update(
        {"executionId": "exec_cancelled", "workflowId": "wf", "workflowName": "Test workflow"}
    )
    emitted = []

    async def capture(event, payload):
        emitted.append((event, payload))

    monkeypatch.setattr(runtime, "emit", capture)
    monkeypatch.setattr(app_runtime_module, "finish_execution", lambda *_args, **_kwargs: None)

    asyncio.run(
        runtime.on_execution_finished(
            {
                "executionId": "exec_cancelled",
                "status": "cancelled",
                "durationMs": 1200,
                "error": "Execution cancelled by user",
            }
        )
    )

    notification = next(payload for event, payload in emitted if event == "notification")
    assert notification["type"] == "info"
    assert notification["title"] == "执行已取消"
    assert "失败" not in notification["message"]
    assert "executionId" not in notification["details"]
    assert "workflowId" not in notification["details"]


def test_temperature_change_uses_reserved_segments_with_raw_tenths(monkeypatch):
    writes = []

    class FurnaceDevices:
        def __init__(self):
            self.status_reads = 0

        def furnace_status(self):
            self.status_reads += 1
            return {"connected": True, "pv": 25.0 if self.status_reads == 1 else 100.0}

        def furnace_write_param(self, code, value):
            writes.append((code, value))
            return {"value": value}

    async def on_experiment_state(_payload):
        return None

    runtime = SimpleNamespace(devices=FurnaceDevices(), on_experiment_state=on_experiment_state)
    engine = ExecutionEngine(runtime)
    monkeypatch.setattr("runtime.execution_engine.time.sleep", lambda _seconds: None)

    result = asyncio.run(
        engine._execute_change_temperature(
            {
                "targetTemperature": 100,
                "rate": 5,
                "tolerance": 0.5,
                "stabilizationTime": 0,
            }
        )
    )

    assert writes[:7] == [
        (0x50, 250),
        (0x51, 15),
        (0x52, 1000),
        (0x53, 5001),
        (0x54, 1000),
        (0x00, 28),
        (0x15, 0),
    ]
    assert result["reached"] is True


def test_execution_start_failure_closes_the_inserted_database_record(monkeypatch):
    nodes = [{"id": "delay", "type": "wait_delay", "config": {"duration": 1}}]
    plan = SimpleNamespace(nodes=nodes, start_from_unrolled_index=0)

    class FakeConnection:
        def execute(self, *_args, **_kwargs):
            return None

        def commit(self):
            return None

    class FailingRuntime:
        def __init__(self):
            self.experiment_state = {}

        async def start_execution(self, _payload):
            raise RuntimeError("task creation failed")

    closed_records = []
    monkeypatch.setattr(executions, "db", SimpleNamespace(conn=FakeConnection()))
    monkeypatch.setattr(executions, "runtime", FailingRuntime())
    monkeypatch.setattr(executions, "_runtime_has_active_execution", lambda: False)
    monkeypatch.setattr(
        executions,
        "_resolve_path_config",
        lambda *_args: {"basePath": "/tmp", "projectName": "p", "individualName": "s"},
    )
    monkeypatch.setattr(executions, "_build_execution_plan", lambda *_args, **_kwargs: plan)
    monkeypatch.setattr(
        workflows,
        "resolve_or_create_workflow",
        lambda *_args, **_kwargs: {"id": "wf", "name": "Workflow", "nodes": nodes},
    )
    monkeypatch.setattr(
        executions,
        "finish_execution",
        lambda *args: closed_records.append(args),
    )

    with pytest.raises(HTTPException, match="Failed to start execution"):
        asyncio.run(
            executions.create_execution(
                {
                    "nodes": nodes,
                    "ownerName": "operator",
                    "workflowName": "Workflow",
                    "pathConfig": {"projectName": "p", "individualName": "s"},
                }
            )
        )

    assert len(closed_records) == 1
    assert closed_records[0][1:] == ("failed", 0, "task creation failed")


def test_safety_stop_persists_result_warning_and_artifacts_for_list_and_report(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _create_execution_tables(conn)
    conn.execute(
        """
        INSERT INTO executions (
          id, workflow_id, status, start_time, end_time, duration, workflow_snapshot,
          path_config, environment_snapshot, summary_metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "exec_safety",
            "wf_safety",
            "completed",
            "2026-07-10T00:00:00Z",
            "2026-07-10T00:00:05Z",
            5000,
            json.dumps({"name": "Safety workflow"}),
            "{}",
            "{}",
            "{}",
        ),
    )
    conn.execute(
        """
        INSERT INTO execution_steps (
          execution_id, original_index, unrolled_index, node_id, node_type,
          status, params, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "exec_safety",
            0,
            0,
            "node_measure",
            "chronoamperometry",
            "running",
            "{}",
            "2026-07-10T00:00:00Z",
        ),
    )
    conn.commit()
    monkeypatch.setattr(execution_recorder, "db", SimpleNamespace(conn=conn))
    learned_durations = []
    monkeypatch.setattr(
        execution_recorder,
        "learn_successful_duration",
        lambda *args, **kwargs: learned_durations.append((args, kwargs)),
    )
    monkeypatch.setattr(executions, "db", SimpleNamespace(conn=conn))

    outcome = normalize_measurement_outcome(
        {
            "status": "stopped_safety",
            "reason": "Current limit exceeded",
            "statistics": {"avg": 0.1, "count": 4},
            "output_file": "/tmp/safety.csv",
            "csv_path": "/tmp/safety.csv",
            "data_points": 4,
        },
        output_dir="/tmp",
    )
    execution_recorder.finish_step(
        execution_id="exec_safety",
        unrolled_index=0,
        status=outcome.step_status,
        result=outcome.result,
        warnings=list(outcome.warnings),
        artifacts=list(outcome.artifacts),
    )

    listing = executions.get_executions_list()
    report = executions.get_execution_report("exec_safety")
    step_result = report["unrolledSteps"][0]["result"]

    assert listing["data"][0]["warningCount"] == 1
    assert listing["data"][0]["artifactCount"] == 2
    assert len(report["warningFlags"]) == 1
    assert len(report["artifacts"]) == 2
    assert step_result["measurementStatus"] == "stopped_safety"
    assert step_result["reason"] == "Current limit exceeded"
    assert step_result["statistics"] == {"avg": 0.1, "count": 4}
    assert learned_durations == []


def _create_execution_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE executions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT,
          status TEXT,
          start_time TEXT,
          end_time TEXT,
          duration INTEGER,
          error TEXT,
          logs_json TEXT,
          workflow_snapshot TEXT,
          path_config TEXT,
          environment_snapshot TEXT,
          summary_metrics TEXT
        );
        CREATE TABLE execution_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          execution_id TEXT NOT NULL,
          original_index INTEGER,
          unrolled_index INTEGER,
          node_id TEXT,
          node_type TEXT,
          status TEXT,
          params TEXT,
          params_hash TEXT,
          iteration_path TEXT,
          block_path TEXT,
          estimated_seconds REAL,
          eta_source TEXT,
          actual_seconds REAL,
          result TEXT,
          error TEXT,
          started_at TEXT,
          ended_at TEXT
        );
        CREATE TABLE execution_artifacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          execution_id TEXT NOT NULL,
          node_id TEXT,
          file_type TEXT,
          file_path TEXT,
          metadata TEXT,
          created_at TEXT
        );
        CREATE TABLE execution_warnings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          execution_id TEXT NOT NULL,
          warning_type TEXT,
          message TEXT,
          metadata TEXT,
          created_at TEXT
        );
        """
    )
