from __future__ import annotations

import asyncio
import json
import sqlite3

import pytest
from fastapi import HTTPException

from routers import executions, workflows
from workflow_identity import workflow_fingerprint


class MemoryDb:
    def __init__(self) -> None:
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(
            """
            CREATE TABLE workflows (
              id TEXT PRIMARY KEY,
              json_data TEXT NOT NULL,
              fingerprint TEXT,
              based_on_workflow_id TEXT,
              feature_json TEXT,
              feature_version INTEGER,
              created_at TEXT,
              updated_at TEXT
            );
            CREATE TABLE counters (
              key TEXT PRIMARY KEY,
              value INTEGER
            );
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
            CREATE TABLE execution_warnings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              execution_id TEXT,
              warning_type TEXT,
              message TEXT,
              created_at TEXT
            );
            CREATE TABLE execution_artifacts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              execution_id TEXT,
              node_id TEXT,
              file_path TEXT,
              file_type TEXT,
              created_at TEXT,
              metadata TEXT
            );
            CREATE TABLE workflow_similarity_edges (
              source_workflow_id TEXT NOT NULL,
              target_workflow_id TEXT NOT NULL,
              score REAL NOT NULL,
              reason_json TEXT,
              updated_at TEXT,
              PRIMARY KEY (source_workflow_id, target_workflow_id)
            );
            """
        )

    def get_next_counter(self, key: str) -> int:
        self.conn.execute("INSERT OR IGNORE INTO counters (key, value) VALUES (?, 0)", (key,))
        self.conn.execute("UPDATE counters SET value = value + 1 WHERE key = ?", (key,))
        row = self.conn.execute("SELECT value FROM counters WHERE key = ?", (key,)).fetchone()
        self.conn.commit()
        return int(row["value"])


class RuntimeStub:
    def __init__(self) -> None:
        self.experiment_state = {"status": "idle"}
        self.payloads: list[dict] = []

    async def start_execution(self, payload: dict) -> None:
        self.payloads.append(payload)


def test_execution_resolves_workflow_by_fingerprint(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    first = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "延时测试",
                "nodes": [{"id": "temp_1", "type": "wait_delay", "config": {"duration": 1}}],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )
    second = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "另一个名字",
                "nodes": [{"id": "temp_2", "type": "wait_delay", "config": {"duration": 1}}],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )

    assert first["workflowId"] == "wf_000001"
    assert second["workflowId"] == first["workflowId"]
    assert db.conn.execute("SELECT COUNT(*) AS c FROM workflows").fetchone()["c"] == 1
    assert db.conn.execute("SELECT COUNT(*) AS c FROM executions").fetchone()["c"] == 2


def test_changed_nodes_create_new_workflow_and_execution_snapshot_uses_actual_nodes(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    original = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "延时测试",
                "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 1}}],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )
    changed = asyncio.run(
        executions.create_execution(
            {
                "workflowId": original["workflowId"],
                "workflowName": "延时测试 v2",
                "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 2}}],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )

    assert changed["workflowId"] == "wf_000002"
    stored_original = json.loads(
        db.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (original["workflowId"],)).fetchone()["json_data"]
    )
    stored_changed = json.loads(
        db.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (changed["workflowId"],)).fetchone()["json_data"]
    )
    assert stored_original["nodes"][0]["config"]["duration"] == 1
    assert stored_changed["nodes"][0]["config"]["duration"] == 2
    assert stored_changed["basedOnWorkflowId"] == original["workflowId"]

    execution_row = db.conn.execute(
        "SELECT workflow_snapshot FROM executions WHERE workflow_id = ?",
        (changed["workflowId"],),
    ).fetchone()
    snapshot = json.loads(execution_row["workflow_snapshot"])
    assert snapshot["id"] == changed["workflowId"]
    assert snapshot["nodes"][0]["config"]["duration"] == 2

    edge = db.conn.execute(
        """
        SELECT score, reason_json FROM workflow_similarity_edges
        WHERE source_workflow_id = ? AND target_workflow_id = ?
        """,
        (changed["workflowId"], original["workflowId"]),
    ).fetchone()
    assert edge is not None
    assert edge["score"] > 0.5
    reasons = json.loads(edge["reason_json"])
    assert any(reason["type"] == "lineage" for reason in reasons)


def test_runtime_connection_fields_do_not_change_workflow_identity(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    normal = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "连接字段测试",
                "nodes": [
                    {"id": "startup", "type": "startup", "config": {"host": "localhost", "port": "COM3"}},
                    {"id": "wait", "type": "wait_delay", "config": {"duration": 1}},
                ],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )
    simulator = asyncio.run(
        executions.create_execution(
            {
                "workflowId": normal["workflowId"],
                "workflowName": "连接字段测试",
                "nodes": [
                    {
                        "id": "startup",
                        "type": "startup",
                        "config": {"host": "simulator", "port": "COM_SIMULATOR", "simulatorProfile": "normal"},
                    },
                    {"id": "wait", "type": "wait_delay", "config": {"duration": 1}},
                ],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )

    assert simulator["workflowId"] == normal["workflowId"]
    assert db.conn.execute("SELECT COUNT(*) AS c FROM workflows").fetchone()["c"] == 1


def test_execution_requires_run_metadata_before_writes(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            executions.create_execution(
                {
                    "workflowId": None,
                    "workflowName": "元数据检查",
                    "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 1}}],
                }
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "MISSING_RUN_METADATA"
    assert exc_info.value.detail["missingFields"] == ["ownerName", "projectName", "individualName"]
    assert db.conn.execute("SELECT COUNT(*) AS c FROM workflows").fetchone()["c"] == 0
    assert db.conn.execute("SELECT COUNT(*) AS c FROM executions").fetchone()["c"] == 0
    assert runtime.payloads == []


def test_execution_reports_missing_project_and_individual_for_user(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)
    monkeypatch.setattr(
        "routers.files.get_user_config",
        lambda user: {"success": True, "config": {"basePath": "C:\\data\\archive", "projectName": "", "individualName": ""}},
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            executions.create_execution(
                {
                    "workflowId": None,
                    "workflowName": "元数据检查",
                    "ownerName": "operator",
                    "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 1}}],
                }
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["missingFields"] == ["projectName", "individualName"]


def test_execution_force_allows_missing_run_metadata(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    result = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "强制启动",
                "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 1}}],
                "forceStartWithMissingRunMetadata": True,
            }
        )
    )

    assert result["status"] == "running"
    assert db.conn.execute("SELECT COUNT(*) AS c FROM workflows").fetchone()["c"] == 1
    assert db.conn.execute("SELECT COUNT(*) AS c FROM executions").fetchone()["c"] == 1
    assert runtime.payloads[0]["pathConfig"]["projectName"] == ""
    assert runtime.payloads[0]["pathConfig"]["individualName"] == ""


def test_execution_request_path_config_overrides_saved_settings(monkeypatch):
    db = MemoryDb()
    runtime = RuntimeStub()
    monkeypatch.setattr(workflows, "db", db)
    monkeypatch.setattr(executions, "db", db)
    monkeypatch.setattr(executions, "runtime", runtime)

    def saved_config(user: str):
        return {
            "success": True,
            "config": {
                "basePath": "C:\\saved",
                "projectName": "SavedProject",
                "individualName": "SavedSample",
            },
        }

    monkeypatch.setattr("routers.files.get_user_config", saved_config)

    result = asyncio.run(
        executions.create_execution(
            {
                "workflowId": None,
                "workflowName": "路径优先级",
                "ownerName": "operator",
                "pathConfig": {
                    "basePath": "D:\\request",
                    "projectName": "RequestProject",
                    "individualName": "RequestSample",
                },
                "nodes": [{"id": "wait_1", "type": "wait_delay", "config": {"duration": 1}}],
            }
        )
    )

    assert result["status"] == "running"
    assert runtime.payloads[0]["pathConfig"] == {
        "basePath": "D:\\request",
        "projectName": "RequestProject",
        "individualName": "RequestSample",
    }


def test_workflow_block_identity_uses_stable_workflow_id_only():
    first = workflow_fingerprint(
        [
            {
                "id": "block_1",
                "type": "workflow_block",
                "config": {
                    "workflowId": "wf_child",
                    "workflowName": "旧名称",
                    "workflowShortId": "WF-001",
                    "nodeCount": 3,
                },
            }
        ]
    )
    renamed = workflow_fingerprint(
        [
            {
                "id": "block_2",
                "type": "workflow_block",
                "config": {
                    "workflowId": "wf_child",
                    "workflowName": "新名称",
                    "workflowShortId": "WF-999",
                    "nodeCount": 9,
                },
            }
        ]
    )
    changed_reference = workflow_fingerprint(
        [
            {
                "id": "block_3",
                "type": "workflow_block",
                "config": {
                    "workflowId": "wf_other",
                    "workflowName": "新名称",
                },
            }
        ]
    )

    assert renamed == first
    assert changed_reference != first


def test_workflow_name_update_only_changes_metadata(monkeypatch):
    db = MemoryDb()
    monkeypatch.setattr(workflows, "db", db)

    workflow = workflows.resolve_or_create_workflow(
        {
            "name": "旧名称",
            "nodes": [{"id": "wait_rename", "type": "wait_delay", "config": {"duration": 1}}],
        }
    )
    before = db.conn.execute(
        "SELECT fingerprint FROM workflows WHERE id = ?",
        (workflow["id"],),
    ).fetchone()["fingerprint"]

    response = workflows.update_workflow_name(workflow["id"], {"name": "新名称"})

    assert response["id"] == workflow["id"]
    assert response["name"] == "新名称"
    assert db.conn.execute("SELECT COUNT(*) AS c FROM workflows").fetchone()["c"] == 1

    row = db.conn.execute(
        "SELECT json_data, fingerprint FROM workflows WHERE id = ?",
        (workflow["id"],),
    ).fetchone()
    stored = json.loads(row["json_data"])
    assert stored["name"] == "新名称"
    assert row["fingerprint"] == before


def test_workflow_history_summaries_and_definition_use_zero_counts(monkeypatch):
    db = MemoryDb()
    monkeypatch.setattr(workflows, "db", db)

    empty = workflows.resolve_or_create_workflow(
        {
            "name": "未执行工作流",
            "nodes": [{"id": "wait_empty", "type": "wait_delay", "config": {"duration": 1}}],
        }
    )
    executed = workflows.resolve_or_create_workflow(
        {
            "name": "已执行工作流",
            "nodes": [{"id": "wait_done", "type": "wait_delay", "config": {"duration": 2}}],
        }
    )
    db.conn.executemany(
        """
        INSERT INTO executions (id, workflow_id, status, start_time, end_time, duration)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            ("exec_done_1", executed["id"], "completed", "2026-06-28T08:00:00Z", "2026-06-28T08:00:02Z", 2000),
            ("exec_done_2", executed["id"], "failed", "2026-06-28T09:00:00Z", "2026-06-28T09:00:01Z", 1000),
        ],
    )
    db.conn.commit()

    summaries = workflows.get_workflow_summaries()["items"]
    empty_summary = next(item for item in summaries if item["id"] == empty["id"])
    executed_summary = next(item for item in summaries if item["id"] == executed["id"])

    assert empty_summary["executionCount"] == 0
    assert empty_summary["successCount"] == 0
    assert empty_summary["failedCount"] == 0
    assert empty_summary["cancelledCount"] == 0
    assert empty_summary["hasFailedRecords"] is False
    assert empty_summary["latestExecution"] is None

    assert executed_summary["executionCount"] == 2
    assert executed_summary["successCount"] == 1
    assert executed_summary["failedCount"] == 1
    assert executed_summary["hasFailedRecords"] is True
    assert executed_summary["latestExecution"]["id"] == "exec_done_2"

    definition = workflows.get_workflow_definition(empty["id"])
    assert definition["executionCount"] == 0
    assert definition["successCount"] == 0
    assert definition["failedCount"] == 0
    assert definition["cancelledCount"] == 0


def test_workflow_map_returns_similarity_edges_without_fingerprint(monkeypatch):
    db = MemoryDb()
    monkeypatch.setattr(workflows, "db", db)

    base = workflows.resolve_or_create_workflow(
        {
            "name": "700度 EIS",
            "nodes": [
                {"id": "t1", "type": "change_temperature", "config": {"targetTemperature": 700}},
                {"id": "e1", "type": "eis_potentiostatic", "config": {"eisLowerFrequency": 0.1, "eisUpperFrequency": 300000, "eis_amplitude": 0.025}},
            ],
        }
    )
    variant = workflows.resolve_or_create_workflow(
        {
            "name": "710度 EIS",
            "nodes": [
                {"id": "t2", "type": "change_temperature", "config": {"targetTemperature": 710}},
                {"id": "e2", "type": "eis_potentiostatic", "config": {"eisLowerFrequency": 0.1, "eisUpperFrequency": 300000, "eis_amplitude": 0.025}},
            ],
        },
        based_on_workflow_id=base["id"],
    )
    db.conn.execute(
        "INSERT INTO executions (id, workflow_id, status, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?, ?)",
        ("exec_variant", variant["id"], "completed", "2026-06-29T10:00:00Z", "2026-06-29T10:30:00Z", 1800000),
    )
    db.conn.commit()

    payload = workflows.get_workflow_map()

    assert payload["total"] == 2
    assert {node["id"] for node in payload["nodes"]} == {base["id"], variant["id"]}
    assert all("fingerprint" not in node for node in payload["nodes"])
    variant_node = next(node for node in payload["nodes"] if node["id"] == variant["id"])
    assert variant_node["capabilities"]["hasEis"] is True
    assert variant_node["capabilities"]["hasTemperature"] is True
    assert variant_node["executionCount"] == 1
    assert payload["edges"]
    assert payload["edges"][0]["score"] > 0.5
