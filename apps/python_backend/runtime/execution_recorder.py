"""Persistence for execution facts.

The execution engine reports facts here; this module writes SQLite records and
delegates successful duration learning to execution_eta.
"""

from __future__ import annotations

import json
from datetime import datetime

from database import db
from runtime.execution_eta import canonical_params, learn_successful_duration, params_hash


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


def finish_step(*, execution_id: str, unrolled_index: int, status: str, result: dict | None) -> dict | None:
    now = datetime.utcnow().isoformat() + "Z"
    row = db.conn.execute(
        """
        SELECT node_type, params, started_at
        FROM execution_steps
        WHERE execution_id = ? AND unrolled_index = ?
        """,
        (execution_id, unrolled_index),
    ).fetchone()
    actual_seconds = None
    node_type = None
    params = {}
    if row:
        node_type = row["node_type"]
        params = _json_loads(row["params"]) or {}
        actual_seconds = _seconds_between(row["started_at"], now)

    result_json = json.dumps(result, ensure_ascii=False) if result else None
    error = result.get("error") if result and status == "failed" else None
    db.conn.execute(
        """
        UPDATE execution_steps
        SET status = ?, ended_at = ?, actual_seconds = ?, result = ?, error = ?
        WHERE execution_id = ? AND unrolled_index = ?
        """,
        (status, now, actual_seconds, result_json, error, execution_id, unrolled_index),
    )
    db.conn.commit()

    if status == "completed" and node_type and actual_seconds is not None:
        learn_successful_duration(node_type, params, actual_seconds)

    return {
        "endedAt": now,
        "actualSeconds": actual_seconds,
        "nodeType": node_type,
        "params": params,
    }


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
