from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

from routers import executions


def test_report_unrolled_steps_include_timing_and_result_artifacts(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _create_report_tables(conn)
    monkeypatch.setattr(executions, "db", SimpleNamespace(conn=conn))

    conn.execute(
        """
        INSERT INTO executions (
          id, workflow_id, status, start_time, end_time, duration, error,
          workflow_snapshot, path_config, environment_snapshot, summary_metrics
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "exec_report",
            "wf_report",
            "completed",
            "2026-06-26T00:00:00Z",
            "2026-06-26T00:00:03Z",
            3000,
            None,
            json.dumps({"name": "Report workflow", "ownerName": "operator"}),
            json.dumps({"projectName": "project", "individualName": "sample"}),
            json.dumps({"furnace_samples": [], "mfc_samples": []}),
            json.dumps({"stepCount": 1}),
        ),
    )
    conn.execute(
        """
        INSERT INTO execution_steps (
          execution_id, original_index, unrolled_index, node_id, node_type,
          status, params, iteration_path, estimated_seconds, eta_source,
          actual_seconds, result, error, started_at, ended_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "exec_report",
            0,
            0,
            "node_measure",
            "ocp_measurement",
            "completed",
            json.dumps({"measurement_duration": 1}),
            json.dumps([{"loopNodeId": "loop_1", "iteration": 2}]),
            4.5,
            "learned",
            3.25,
            json.dumps(
                {
                    "outputDir": "/tmp/report-output",
                    "outputFile": "/tmp/report-output/ocp.csv",
                    "csvPath": "/tmp/report-output/ocp_export.csv",
                    "data_points": 42,
                }
            ),
            None,
            "2026-06-26T00:00:00Z",
            "2026-06-26T00:00:03Z",
        ),
    )
    conn.commit()

    report = executions.get_execution_report("exec_report")

    step = report["unrolledSteps"][0]
    assert step["actualSeconds"] == 3.25
    assert step["estimatedSeconds"] == 4.5
    assert step["etaSource"] == "learned"
    assert step["iterationPath"] == [{"loopNodeId": "loop_1", "iteration": 2}]

    artifacts = report["artifacts"]
    assert {artifact["filePath"] for artifact in artifacts} == {
        "/tmp/report-output",
        "/tmp/report-output/ocp.csv",
        "/tmp/report-output/ocp_export.csv",
    }
    assert all(artifact["executionId"] == "exec_report" for artifact in artifacts)
    assert all(artifact["nodeId"] == "node_measure" for artifact in artifacts)
    assert all(artifact["dataPoints"] == 42 for artifact in artifacts)
    assert all(artifact["metadata"]["data_points"] == 42 for artifact in artifacts)


def test_report_result_artifacts_do_not_duplicate_persisted_artifacts(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    _create_report_tables(conn)
    monkeypatch.setattr(executions, "db", SimpleNamespace(conn=conn))

    conn.execute(
        """
        INSERT INTO executions (
          id, workflow_id, status, start_time, workflow_snapshot, path_config
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("exec_artifacts", "wf_report", "completed", "2026-06-26T00:00:00Z", "{}", "{}"),
    )
    conn.execute(
        """
        INSERT INTO execution_steps (
          execution_id, original_index, unrolled_index, node_id, node_type,
          status, result, ended_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "exec_artifacts",
            0,
            0,
            "node_measure",
            "eis_potentiostatic",
            "completed",
            json.dumps({"csvPath": "/tmp/eis.csv", "outputFile": "/tmp/eis.ism", "data_points": 12}),
            "2026-06-26T00:00:03Z",
        ),
    )
    conn.execute(
        """
        INSERT INTO execution_artifacts (
          execution_id, node_id, file_type, file_path, metadata, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("exec_artifacts", "node_measure", "csv", "/tmp/eis.csv", "{}", "2026-06-26T00:00:04Z"),
    )
    conn.commit()

    report = executions.get_execution_report("exec_artifacts")

    csv_artifacts = [
        artifact
        for artifact in report["artifacts"]
        if (artifact.get("filePath") or artifact.get("file_path")) == "/tmp/eis.csv"
    ]
    assert len(csv_artifacts) == 1
    assert csv_artifacts[0]["fileType"] == "csv"
    assert csv_artifacts[0]["nodeId"] == "node_measure"
    assert any(artifact["filePath"] == "/tmp/eis.ism" for artifact in report["artifacts"])


def _create_report_tables(conn: sqlite3.Connection) -> None:
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
