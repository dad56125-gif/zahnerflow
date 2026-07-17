"""Persistence for execution facts.

The execution engine reports facts here; this module writes SQLite records and
delegates successful duration learning to execution_eta.
"""

from __future__ import annotations

import json
from datetime import datetime

from database import db
from runtime.execution_eta import canonical_params, learn_successful_duration, params_hash
from runtime.execution_semantics import node_execution_spec


def start_step(
    *,
    execution_id: str,
    original_index: int,
    unrolled_index: int,
    node_id: str,
    node_type: str,
    params: dict,
    iteration_path: list | None,
    block_path: list | None,
    estimated_seconds: float,
    eta_source: str,
) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    clean_params = canonical_params(params)
    db.conn.execute(
        """
        INSERT INTO execution_steps (
          execution_id, original_index, unrolled_index, node_id, node_type,
          status, params, params_hash, iteration_path, estimated_seconds,
          block_path, eta_source, started_at
        )
        VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(execution_id, unrolled_index) DO UPDATE SET
          original_index = excluded.original_index,
          node_id = excluded.node_id,
          node_type = excluded.node_type,
          status = 'running',
          params = excluded.params,
          params_hash = excluded.params_hash,
          iteration_path = excluded.iteration_path,
          block_path = excluded.block_path,
          estimated_seconds = excluded.estimated_seconds,
          eta_source = excluded.eta_source,
          started_at = excluded.started_at,
          ended_at = NULL,
          actual_seconds = NULL,
          result = NULL,
          error = NULL
        """,
        (
            execution_id,
            original_index,
            unrolled_index,
            node_id,
            node_type,
            json.dumps(clean_params, ensure_ascii=False, sort_keys=True),
            params_hash(clean_params),
            json.dumps(iteration_path or [], ensure_ascii=False),
            estimated_seconds,
            json.dumps(block_path or [], ensure_ascii=False),
            eta_source,
            now,
        ),
    )
    db.conn.commit()


def finish_step(
    *,
    execution_id: str,
    unrolled_index: int,
    status: str,
    result: dict | None,
    warnings: list[dict] | None = None,
    artifacts: list[dict] | None = None,
) -> dict | None:
    now = datetime.utcnow().isoformat() + "Z"
    row = db.conn.execute(
        """
        SELECT node_id, node_type, params, started_at
        FROM execution_steps
        WHERE execution_id = ? AND unrolled_index = ?
        """,
        (execution_id, unrolled_index),
    ).fetchone()
    actual_seconds = None
    node_id = None
    node_type = None
    params = {}
    if row:
        node_id = row["node_id"]
        node_type = row["node_type"]
        params = _json_loads(row["params"]) or {}
        actual_seconds = _seconds_between(row["started_at"], now)

    result_json = json.dumps(result, ensure_ascii=False) if result is not None else None
    error = (result.get("error") or result.get("reason")) if result and status == "failed" else None
    db.conn.execute(
        """
        UPDATE execution_steps
        SET status = ?, ended_at = ?, actual_seconds = ?, result = ?, error = ?
        WHERE execution_id = ? AND unrolled_index = ?
        """,
        (status, now, actual_seconds, result_json, error, execution_id, unrolled_index),
    )
    for warning in warnings or []:
        _persist_warning(
            execution_id=execution_id,
            unrolled_index=unrolled_index,
            warning=warning,
            created_at=now,
        )
    for artifact in artifacts or []:
        _persist_artifact(
            execution_id=execution_id,
            unrolled_index=unrolled_index,
            node_id=node_id,
            artifact=artifact,
            created_at=now,
        )
    db.conn.commit()

    spec = node_execution_spec(node_type)
    measurement_status = result.get("measurementStatus") if result else None
    learnable_outcome = not warnings and measurement_status in (None, "success", "completed")
    if (
        status == "completed"
        and node_type
        and actual_seconds is not None
        and (not spec or spec.learn_duration)
        and learnable_outcome
    ):
        learn_successful_duration(node_type, params, actual_seconds)

    return {
        "endedAt": now,
        "actualSeconds": actual_seconds,
        "nodeType": node_type,
        "params": params,
    }


def _persist_warning(
    *,
    execution_id: str,
    unrolled_index: int,
    warning: dict,
    created_at: str,
) -> None:
    warning_type = str(warning.get("warningType") or warning.get("warning_type") or "execution_warning")
    message = str(warning.get("message") or warning_type)
    metadata = dict(warning.get("metadata") or {})
    metadata["unrolledIndex"] = unrolled_index
    metadata_json = json.dumps(metadata, ensure_ascii=False, sort_keys=True)
    duplicate = db.conn.execute(
        """
        SELECT 1 FROM execution_warnings
        WHERE execution_id = ? AND warning_type = ? AND message = ? AND metadata = ?
        LIMIT 1
        """,
        (execution_id, warning_type, message, metadata_json),
    ).fetchone()
    if duplicate:
        return
    db.conn.execute(
        """
        INSERT INTO execution_warnings (execution_id, warning_type, message, metadata, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (execution_id, warning_type, message, metadata_json, created_at),
    )


def _persist_artifact(
    *,
    execution_id: str,
    unrolled_index: int,
    node_id: str | None,
    artifact: dict,
    created_at: str,
) -> None:
    file_type = str(artifact.get("fileType") or artifact.get("file_type") or "output_file")
    file_path = artifact.get("filePath") or artifact.get("file_path")
    if not file_path:
        return
    metadata = dict(artifact.get("metadata") or {})
    metadata["unrolledIndex"] = unrolled_index
    metadata_json = json.dumps(metadata, ensure_ascii=False, sort_keys=True)
    duplicate = db.conn.execute(
        """
        SELECT 1 FROM execution_artifacts
        WHERE execution_id = ? AND node_id IS ? AND file_type = ? AND file_path = ? AND metadata = ?
        LIMIT 1
        """,
        (execution_id, node_id, file_type, str(file_path), metadata_json),
    ).fetchone()
    if duplicate:
        return
    db.conn.execute(
        """
        INSERT INTO execution_artifacts (execution_id, node_id, file_type, file_path, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (execution_id, node_id, file_type, str(file_path), metadata_json, created_at),
    )


def finish_execution(exec_id: str, status: str, duration_ms: int, error: str | None) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    db.conn.execute(
        """
        UPDATE executions SET status = ?, end_time = ?, duration = ?, error = ?
        WHERE id = ?
        """,
        (status, now, duration_ms, error, exec_id),
    )
    db.conn.commit()


def fail_execution(exec_id: str, error: str) -> None:
    """将因运行时关闭而无法继续的执行及其活动步骤收口为失败。"""
    now = datetime.utcnow().isoformat() + "Z"
    row = db.conn.execute(
        "SELECT start_time FROM executions WHERE id = ?",
        (exec_id,),
    ).fetchone()
    duration_ms = 0
    if row and row["start_time"]:
        try:
            started = datetime.fromisoformat(row["start_time"].replace("Z", "+00:00"))
            ended = datetime.fromisoformat(now.replace("Z", "+00:00"))
            duration_ms = max(0, int((ended - started).total_seconds() * 1000))
        except (TypeError, ValueError):
            duration_ms = 0

    db.conn.execute(
        """
        UPDATE executions
        SET status = 'failed', end_time = ?, duration = ?, error = ?
        WHERE id = ? AND status IN ('running', 'paused', 'cancelling')
        """,
        (now, duration_ms, error, exec_id),
    )
    db.conn.execute(
        """
        UPDATE execution_steps
        SET status = 'failed', ended_at = ?, error = ?
        WHERE execution_id = ? AND status = 'running'
        """,
        (now, error, exec_id),
    )
    db.conn.commit()


def fail_orphaned_executions(error: str) -> int:
    """启动时收口上一个 Python 进程遗留的活动执行记录。"""
    rows = db.conn.execute(
        "SELECT id FROM executions WHERE status IN ('running', 'paused', 'cancelling')"
    ).fetchall()
    for row in rows:
        fail_execution(row["id"], error)
    return len(rows)


def _json_loads(value: str | None):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _seconds_between(start_iso: str | None, end_iso: str) -> float | None:
    if not start_iso:
        return None
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        return max(0.0, (end - start).total_seconds())
    except Exception:
        return None
