"""数据库结构与首版迁移。列定义只维护于 TABLES，升级不改写历史实验数据。"""

import sqlite3

SCHEMA_VERSION = 1

TABLES: dict[str, tuple[str, ...]] = {
    'workflows': (
        'id TEXT PRIMARY KEY',
        'json_data TEXT NOT NULL',
        'fingerprint TEXT',
        'based_on_workflow_id TEXT',
        'feature_json TEXT',
        'feature_version INTEGER',
        'created_at TEXT',
        'updated_at TEXT',
    ),
    'counters': (
        'key TEXT PRIMARY KEY',
        'value INTEGER',
    ),
    'executions': (
        'id TEXT PRIMARY KEY',
        'workflow_id TEXT',
        'status TEXT',
        'start_time TEXT',
        'end_time TEXT',
        'duration INTEGER',
        'error TEXT',
        'logs_json TEXT',
        'workflow_snapshot TEXT',
        'path_config TEXT',
        'environment_snapshot TEXT',
        'summary_metrics TEXT',
    ),
    'execution_steps': (
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'execution_id TEXT NOT NULL',
        'original_index INTEGER',
        'unrolled_index INTEGER',
        'node_id TEXT',
        'node_type TEXT',
        'status TEXT',
        'params TEXT',
        'params_hash TEXT',
        'iteration_path TEXT',
        'block_path TEXT',
        'estimated_seconds REAL',
        'eta_source TEXT',
        'actual_seconds REAL',
        'result TEXT',
        'error TEXT',
        'started_at TEXT',
        'ended_at TEXT',
    ),
    'node_duration_estimates': (
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'node_type TEXT NOT NULL',
        'params_hash TEXT NOT NULL',
        'params_json TEXT NOT NULL',
        'sample_count INTEGER NOT NULL DEFAULT 0',
        'average_seconds REAL NOT NULL DEFAULT 0',
        'min_seconds REAL',
        'max_seconds REAL',
        'last_seconds REAL',
        'updated_at TEXT',
        'UNIQUE(node_type, params_hash)',
    ),
    'workflow_similarity_edges': (
        'source_workflow_id TEXT NOT NULL',
        'target_workflow_id TEXT NOT NULL',
        'score REAL NOT NULL',
        'reason_json TEXT',
        'updated_at TEXT',
        'PRIMARY KEY (source_workflow_id, target_workflow_id)',
    ),
    'execution_artifacts': (
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'execution_id TEXT NOT NULL',
        'node_id TEXT',
        'file_type TEXT',
        'file_path TEXT',
        'metadata TEXT',
        'created_at TEXT',
    ),
    'execution_warnings': (
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'execution_id TEXT NOT NULL',
        'warning_type TEXT',
        'message TEXT',
        'metadata TEXT',
        'created_at TEXT',
    ),
    'hooks': (
        'id TEXT PRIMARY KEY',
        'name TEXT',
        'enabled INTEGER',
        'rule_json TEXT',
    ),
    'files': (
        'id TEXT PRIMARY KEY',
        'user TEXT',
        'project_name TEXT',
        'individual_name TEXT',
        'test_type TEXT',
        'base_path TEXT',
        'dir_path TEXT',
        'filename TEXT',
        'created_at TEXT',
    ),
    'users': (
        'id TEXT PRIMARY KEY',
        'username TEXT UNIQUE NOT NULL',
        'email TEXT',
        'created_at TEXT NOT NULL',
    ),
    'user_settings': (
        'user TEXT PRIMARY KEY',
        'settings_json TEXT NOT NULL',
        'updated_at TEXT',
    ),
    'furnace_presets': (
        'name TEXT PRIMARY KEY',
        'segments_json TEXT',
        'summary TEXT',
        'created_at TEXT',
        'updated_at TEXT',
    ),
    'furnace_metrics_recent': (
        'timestamp INTEGER PRIMARY KEY',
        'pv REAL',
        'sv REAL',
        'mv REAL',
        'status_code INTEGER',
        'segment INTEGER',
        'segment_time REAL',
        'segment_time_set REAL',
    ),
    'furnace_events': (
        'timestamp INTEGER PRIMARY KEY',
        'status_code INTEGER',
        'segment INTEGER',
        'segment_time_set REAL',
    ),
    'furnace_metrics_archive': (
        'timestamp INTEGER PRIMARY KEY',
        'pv REAL',
        'tier INTEGER DEFAULT 1',
    ),
    'mfc_samples': (
        'timestamp INTEGER',
        'address INTEGER NOT NULL',
        'flow_sccm REAL',
        'flow_percent REAL',
        'setpoint REAL',
        'active_setpoint REAL',
    ),
    'device_runtime_state': (
        'device TEXT PRIMARY KEY',
        'state_json TEXT NOT NULL',
        'updated_at TEXT NOT NULL',
    ),
    'device_runtime_events': (
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'device TEXT NOT NULL',
        'event_type TEXT NOT NULL',
        'execution_id TEXT',
        'from_status TEXT',
        'to_status TEXT',
        'payload_json TEXT',
        'occurred_at TEXT NOT NULL',
    ),
}

SCHEMA_OBJECTS = (
    'CREATE VIEW IF NOT EXISTS furnace_history_view AS\n            SELECT timestamp, pv, sv, mv, status_code, segment, segment_time, segment_time_set, 0 as tier\n            FROM furnace_metrics_recent\n            UNION ALL\n            SELECT timestamp, pv, NULL, NULL, NULL, NULL, NULL, NULL, tier\n            FROM furnace_metrics_archive',
    'CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id)',
    'CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON execution_steps(execution_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_steps_identity ON execution_steps(execution_id, unrolled_index)',
    'CREATE INDEX IF NOT EXISTS idx_node_duration_estimates_lookup ON node_duration_estimates(node_type, params_hash)',
    'CREATE INDEX IF NOT EXISTS idx_workflow_similarity_source ON workflow_similarity_edges(source_workflow_id, score DESC)',
    'CREATE INDEX IF NOT EXISTS idx_workflow_similarity_target ON workflow_similarity_edges(target_workflow_id)',
    'CREATE INDEX IF NOT EXISTS idx_execution_artifacts_execution_id ON execution_artifacts(execution_id)',
    'CREATE INDEX IF NOT EXISTS idx_execution_warnings_execution_id ON execution_warnings(execution_id)',
    'CREATE INDEX IF NOT EXISTS idx_furnace_recent_time ON furnace_metrics_recent(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_furnace_events_time ON furnace_events(timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_mfc_samples_time_address ON mfc_samples(timestamp, address)',
    'CREATE INDEX IF NOT EXISTS idx_device_runtime_events_device_time ON device_runtime_events(device, occurred_at)',
    'CREATE INDEX IF NOT EXISTS idx_workflows_fingerprint ON workflows(fingerprint)',
)


def migrate(connection: sqlite3.Connection) -> int:
    """在一个事务中从未版本化数据库升级；拒绝以旧应用打开未来结构。"""
    version = connection.execute("PRAGMA user_version").fetchone()[0]
    if version > SCHEMA_VERSION:
        raise RuntimeError(f"数据库版本 {version} 高于应用支持的 {SCHEMA_VERSION}")
    if version == SCHEMA_VERSION:
        return version
    connection.execute("BEGIN IMMEDIATE")
    try:
        for table, definitions in TABLES.items():
            connection.execute(f"CREATE TABLE IF NOT EXISTS {table} ({', '.join(definitions)})")
            columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            for definition in definitions:
                name = definition.split()[0]
                if name.startswith(("UNIQUE", "PRIMARY", "FOREIGN", "CHECK")) or name in columns:
                    continue
                # 既有版本允许补齐可空列或有默认值的列；不猜测缺失主键/必填数据。
                if "PRIMARY KEY" in definition or "UNIQUE" in definition or ("NOT NULL" in definition and "DEFAULT" not in definition):
                    raise RuntimeError(f"无法无损补齐 {table}.{name}，请检查数据库来源")
                connection.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")
        # 必须在补列之后创建索引，旧库可能尚无被索引的新字段。
        for statement in SCHEMA_OBJECTS:
            connection.execute(statement)
        connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return SCHEMA_VERSION
