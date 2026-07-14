"""
SQLite bootstrap for the unified Python backend.

This module gives `apps/python_backend` a self-contained database layer so it
can run without the legacy NestJS backend services.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent
DATA_DIR = Path(os.getenv("ZAHNERFLOW_DATA_DIR", PROJECT_ROOT / "data"))
DB_PATH = DATA_DIR / "app.db"


class Database:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._ensure_tables()

    def get_next_counter(self, key: str) -> int:
        self.conn.execute(
            "INSERT OR IGNORE INTO counters (key, value) VALUES (?, 0)",
            (key,),
        )
        self.conn.execute(
            "UPDATE counters SET value = value + 1 WHERE key = ?",
            (key,),
        )
        row = self.conn.execute(
            "SELECT value FROM counters WHERE key = ?",
            (key,),
        ).fetchone()
        self.conn.commit()
        return int(row["value"])

    def _ensure_tables(self) -> None:
        schema_statements = [
            """
            CREATE TABLE IF NOT EXISTS workflows (
              id TEXT PRIMARY KEY,
              json_data TEXT NOT NULL,
              fingerprint TEXT,
              based_on_workflow_id TEXT,
              feature_json TEXT,
              feature_version INTEGER,
              created_at TEXT,
              updated_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS counters (
              key TEXT PRIMARY KEY,
              value INTEGER
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS executions (
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
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS execution_steps (
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
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS node_duration_estimates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              node_type TEXT NOT NULL,
              params_hash TEXT NOT NULL,
              params_json TEXT NOT NULL,
              sample_count INTEGER NOT NULL DEFAULT 0,
              average_seconds REAL NOT NULL DEFAULT 0,
              min_seconds REAL,
              max_seconds REAL,
              last_seconds REAL,
              updated_at TEXT,
              UNIQUE(node_type, params_hash)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS workflow_similarity_edges (
              source_workflow_id TEXT NOT NULL,
              target_workflow_id TEXT NOT NULL,
              score REAL NOT NULL,
              reason_json TEXT,
              updated_at TEXT,
              PRIMARY KEY (source_workflow_id, target_workflow_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS execution_artifacts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              execution_id TEXT NOT NULL,
              node_id TEXT,
              file_type TEXT,
              file_path TEXT,
              metadata TEXT,
              created_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS execution_warnings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              execution_id TEXT NOT NULL,
              warning_type TEXT,
              message TEXT,
              metadata TEXT,
              created_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS hooks (
              id TEXT PRIMARY KEY,
              name TEXT,
              enabled INTEGER,
              rule_json TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS files (
              id TEXT PRIMARY KEY,
              user TEXT,
              project_name TEXT,
              individual_name TEXT,
              test_type TEXT,
              base_path TEXT,
              dir_path TEXT,
              filename TEXT,
              created_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              email TEXT,
              created_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS user_settings (
              user TEXT PRIMARY KEY,
              settings_json TEXT NOT NULL,
              updated_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS furnace_presets (
              name TEXT PRIMARY KEY,
              segments_json TEXT,
              summary TEXT,
              created_at TEXT,
              updated_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS furnace_metrics_recent (
              timestamp INTEGER PRIMARY KEY,
              pv REAL,
              sv REAL,
              mv REAL,
              status_code INTEGER,
              segment INTEGER,
              segment_time REAL,
              segment_time_set REAL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS furnace_events (
              timestamp INTEGER PRIMARY KEY,
              status_code INTEGER,
              segment INTEGER,
              segment_time_set REAL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS furnace_metrics_archive (
              timestamp INTEGER PRIMARY KEY,
              pv REAL,
              tier INTEGER DEFAULT 1
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS mfc_samples (
              timestamp INTEGER,
              address INTEGER NOT NULL,
              flow_sccm REAL,
              flow_percent REAL,
              setpoint REAL,
              active_setpoint REAL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS device_runtime_state (
              device TEXT PRIMARY KEY,
              state_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS device_runtime_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              device TEXT NOT NULL,
              event_type TEXT NOT NULL,
              execution_id TEXT,
              from_status TEXT,
              to_status TEXT,
              payload_json TEXT,
              occurred_at TEXT NOT NULL
            )
            """,
            """
            CREATE VIEW IF NOT EXISTS furnace_history_view AS
            SELECT timestamp, pv, sv, mv, status_code, segment, segment_time, segment_time_set, 0 as tier
            FROM furnace_metrics_recent
            UNION ALL
            SELECT timestamp, pv, NULL, NULL, NULL, NULL, NULL, NULL, tier
            FROM furnace_metrics_archive
            """,
            "CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id)",
            "CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON execution_steps(execution_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_steps_identity ON execution_steps(execution_id, unrolled_index)",
            "CREATE INDEX IF NOT EXISTS idx_node_duration_estimates_lookup ON node_duration_estimates(node_type, params_hash)",
            "CREATE INDEX IF NOT EXISTS idx_workflow_similarity_source ON workflow_similarity_edges(source_workflow_id, score DESC)",
            "CREATE INDEX IF NOT EXISTS idx_workflow_similarity_target ON workflow_similarity_edges(target_workflow_id)",
            "CREATE INDEX IF NOT EXISTS idx_execution_artifacts_execution_id ON execution_artifacts(execution_id)",
            "CREATE INDEX IF NOT EXISTS idx_execution_warnings_execution_id ON execution_warnings(execution_id)",
            "CREATE INDEX IF NOT EXISTS idx_furnace_recent_time ON furnace_metrics_recent(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_furnace_events_time ON furnace_events(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_mfc_samples_time_address ON mfc_samples(timestamp, address)",
            "CREATE INDEX IF NOT EXISTS idx_device_runtime_events_device_time ON device_runtime_events(device, occurred_at)",
        ]

        for statement in schema_statements:
            self.conn.execute(statement)

        self._ensure_workflow_columns()
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_workflows_fingerprint ON workflows(fingerprint)")
        self._ensure_execution_step_columns()
        self.conn.commit()

    def _ensure_workflow_columns(self) -> None:
        existing = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(workflows)").fetchall()
        }
        columns = {
            "fingerprint": "TEXT",
            "based_on_workflow_id": "TEXT",
            "feature_json": "TEXT",
            "feature_version": "INTEGER",
        }
        for name, sql_type in columns.items():
            if name not in existing:
                self.conn.execute(f"ALTER TABLE workflows ADD COLUMN {name} {sql_type}")

    def _ensure_execution_step_columns(self) -> None:
        existing = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(execution_steps)").fetchall()
        }
        columns = {
            "params_hash": "TEXT",
            "iteration_path": "TEXT",
            "block_path": "TEXT",
            "estimated_seconds": "REAL",
            "eta_source": "TEXT",
            "actual_seconds": "REAL",
        }
        for name, sql_type in columns.items():
            if name not in existing:
                self.conn.execute(f"ALTER TABLE execution_steps ADD COLUMN {name} {sql_type}")


db = Database()
