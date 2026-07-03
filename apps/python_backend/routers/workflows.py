"""Workflows routes backed by fingerprint-based definitions."""
import json
import threading
from datetime import datetime

from fastapi import APIRouter, HTTPException

from database import db
from workflow_identity import workflow_fingerprint
import workflow_features

router = APIRouter(prefix="/api/workflows", tags=["workflows"])
_workflow_map_lock = threading.Lock()


def _workflow_from_row(row):
    wf = json.loads(row["json_data"])
    if row["fingerprint"]:
        wf["fingerprint"] = row["fingerprint"]
    if row["based_on_workflow_id"]:
        wf["basedOnWorkflowId"] = row["based_on_workflow_id"]
    return wf


def _workflow_row_by_id(workflow_id: str):
    return db.conn.execute(
        "SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json FROM workflows WHERE id = ?",
        (workflow_id,),
    ).fetchone()


def _workflow_row_by_fingerprint(fingerprint: str):
    return db.conn.execute(
        """
        SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json
        FROM workflows
        WHERE fingerprint = ?
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (fingerprint,),
    ).fetchone()


def _process_nodes(nodes: list[dict]) -> list[dict]:
    processed_nodes = []
    for node in nodes:
        n_id = node.get("id")
        if not n_id or str(n_id).startswith("temp_"):
            node_counter = db.get_next_counter("node")
            n_id = f"n_{str(node_counter).rjust(8, '0')}"
        processed_nodes.append({**node, "id": n_id})
    return processed_nodes


def _validate_workflow_definition(data: dict):
    errors = []
    if not data.get('name', '').strip():
        errors.append("Workflow name is required")
    nodes = data.get('nodes')
    if not isinstance(nodes, list) or not nodes:
        errors.append("Workflow must have at least one node")
    if errors:
        raise HTTPException(status_code=400, detail=f"Workflow validation failed: {', '.join(errors)}")


def resolve_or_create_workflow(data: dict, based_on_workflow_id: str | None = None) -> dict:
    _validate_workflow_definition(data)
    fingerprint = workflow_fingerprint(data["nodes"])
    existing = _workflow_row_by_fingerprint(fingerprint)
    if existing:
        workflow = _workflow_from_row(existing)
        workflow_features.db = db
        workflow_features.ensure_workflow_feature(workflow["id"], workflow)
        db.conn.commit()
        return workflow

    next_counter = db.get_next_counter("workflow")
    wf_id = f"wf_{str(next_counter).rjust(6, '0')}"
    processed_nodes = _process_nodes(data["nodes"])

    now = datetime.utcnow().isoformat() + 'Z'
    wf = {
        **data,
        "id": wf_id,
        "nodes": processed_nodes,
        "fingerprint": fingerprint,
        "createdAt": now,
        "updatedAt": now,
    }
    if based_on_workflow_id:
        wf["basedOnWorkflowId"] = based_on_workflow_id
    workflow_features.db = db
    feature = workflow_features.build_workflow_feature(wf)
    db.conn.execute(
        """
        INSERT INTO workflows (id, json_data, fingerprint, based_on_workflow_id, feature_json, feature_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (wf_id, json.dumps(wf), fingerprint, based_on_workflow_id, json.dumps(feature, ensure_ascii=False), workflow_features.FEATURE_VERSION, now, now),
    )
    db.conn.commit()
    workflow_features.refresh_workflow_similarity_edges(wf_id)
    return wf


def _short_workflow_id(workflow_id: str) -> str:
    """从 wf_XXXXXX 格式生成短 ID，如 WF-016"""
    suffix = workflow_id.split("_")[-1] if "_" in workflow_id else workflow_id[-6:]
    try:
        num = int(suffix)
        return f"WF-{num:03d}"
    except (ValueError, TypeError):
        return f"WF-{suffix[-3:]}"


def _count_value(row, key: str) -> int:
    if not row:
        return 0
    return int(row[key] or 0)


@router.get("/summaries")
def get_workflow_summaries():
    """返回工作流级列表，聚合执行统计。"""
    wf_rows = db.conn.execute(
        "SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json FROM workflows"
    ).fetchall()

    summaries = []
    for row in wf_rows:
        wf = _workflow_from_row(row)
        wf_id = wf["id"]
        nodes = wf.get("nodes") or []
        node_count = len(nodes)
        loop_count = len([n for n in nodes if n.get("type") == "loop_start"])

        # 执行统计
        stats_row = db.conn.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
            FROM executions WHERE workflow_id = ?
            """,
            (wf_id,),
        ).fetchone()
        exec_total = _count_value(stats_row, "total")
        success_count = _count_value(stats_row, "success_count")
        failed_count = _count_value(stats_row, "failed_count")
        cancelled_count = _count_value(stats_row, "cancelled_count")

        # 最近一次执行
        latest_exec = db.conn.execute(
            "SELECT id, status, start_time, end_time, duration FROM executions WHERE workflow_id = ? ORDER BY start_time DESC LIMIT 1",
            (wf_id,),
        ).fetchone()

        summaries.append({
            "id": wf_id,
            "shortId": _short_workflow_id(wf_id),
            "name": wf.get("name", ""),
            "nodeCount": node_count,
            "loopCount": loop_count,
            "isFavorite": wf.get("isFavorite", False),
            "basedOnWorkflowId": wf.get("basedOnWorkflowId"),
            "executionCount": exec_total,
            "successCount": success_count,
            "failedCount": failed_count,
            "cancelledCount": cancelled_count,
            "hasFailedRecords": failed_count > 0,
            "latestExecution": {
                "id": latest_exec["id"],
                "status": latest_exec["status"],
                "startedAt": latest_exec["start_time"],
                "endedAt": latest_exec["end_time"],
                "durationMs": latest_exec["duration"] or 0,
            } if latest_exec else None,
            "createdAt": wf.get("createdAt", ""),
            "updatedAt": wf.get("updatedAt", ""),
        })

    # 按最近执行时间或创建时间降序
    summaries.sort(
        key=lambda s: (s["latestExecution"] or {}).get("startedAt") or s["createdAt"],
        reverse=True,
    )
    return {"items": summaries, "total": len(summaries)}


@router.get("/{id}/executions")
def get_workflow_executions(id: str, limit: int = 3, offset: int = 0):
    """返回指定工作流的执行历史。"""
    row = _workflow_row_by_id(id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    total_row = db.conn.execute(
        "SELECT COUNT(*) as total FROM executions WHERE workflow_id = ?", (id,)
    ).fetchone()
    total = total_row["total"] if total_row else 0

    rows = db.conn.execute(
        """
        SELECT e.id as execution_id, e.status, e.start_time, e.end_time, e.duration, e.error,
            (SELECT COUNT(*) FROM execution_warnings w WHERE w.execution_id = e.id) as warning_count,
            (SELECT COUNT(*) FROM execution_artifacts a WHERE a.execution_id = e.id) as artifact_count
        FROM executions e
        WHERE e.workflow_id = ?
        ORDER BY e.start_time DESC
        LIMIT ? OFFSET ?
        """,
        (id, limit, offset),
    ).fetchall()

    items = []
    for r in rows:
        items.append({
            "id": r["execution_id"],
            "status": r["status"],
            "startedAt": r["start_time"],
            "endedAt": r["end_time"],
            "durationMs": r["duration"] or 0,
            "error": r["error"],
            "warningCount": r["warning_count"],
            "artifactCount": r["artifact_count"],
        })

    return {
        "items": items,
        "total": total,
        "hasMore": offset + limit < total,
    }


@router.get("/{id}/definition")
def get_workflow_definition(id: str):
    """返回工作流定义和统计。"""
    row = _workflow_row_by_id(id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf = _workflow_from_row(row)

    # 执行统计
    stats_row = db.conn.execute(
        """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
        FROM executions WHERE workflow_id = ?
        """,
        (id,),
    ).fetchone()

    latest_exec = db.conn.execute(
        "SELECT id, status, start_time, end_time, duration FROM executions WHERE workflow_id = ? ORDER BY start_time DESC LIMIT 1",
        (id,),
    ).fetchone()

    return {
        "id": wf["id"],
        "shortId": _short_workflow_id(wf["id"]),
        "name": wf.get("name", ""),
        "nodes": wf.get("nodes", []),
        "nodeCount": len(wf.get("nodes") or []),
        "loopCount": len([n for n in (wf.get("nodes") or []) if n.get("type") == "loop_start"]),
        "isFavorite": wf.get("isFavorite", False),
        "basedOnWorkflowId": wf.get("basedOnWorkflowId"),
        "executionCount": _count_value(stats_row, "total"),
        "successCount": _count_value(stats_row, "success_count"),
        "failedCount": _count_value(stats_row, "failed_count"),
        "cancelledCount": _count_value(stats_row, "cancelled_count"),
        "latestExecution": {
            "id": latest_exec["id"],
            "status": latest_exec["status"],
            "startedAt": latest_exec["start_time"],
            "endedAt": latest_exec["end_time"],
            "durationMs": latest_exec["duration"] or 0,
        } if latest_exec else None,
        "createdAt": wf.get("createdAt", ""),
        "updatedAt": wf.get("updatedAt", ""),
    }


@router.get("/map")
def get_workflow_map(limit: int = 200, min_score: float = 0.5, edge_limit_per_node: int = 8):
    with _workflow_map_lock:
        return _build_workflow_map(limit, min_score, edge_limit_per_node)


def _build_workflow_map(limit: int = 200, min_score: float = 0.5, edge_limit_per_node: int = 8):
    """返回实验地图数据：workflow 节点和相似关系边。"""
    workflow_features.db = db
    rows = db.conn.execute(
        """
        SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json
        FROM workflows
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?
        """,
        (max(1, min(limit, 500)),),
    ).fetchall()
    if rows:
        missing_edges = db.conn.execute("SELECT COUNT(*) AS total FROM workflow_similarity_edges").fetchone()["total"] == 0
        for row in rows:
            workflow_features.ensure_workflow_feature(row["id"], _workflow_from_row(row))
        db.conn.commit()
        if missing_edges and len(rows) > 1:
            workflow_features.backfill_workflow_features_and_edges()

    workflow_ids = {row["id"] for row in rows}
    nodes = []
    for row in rows:
        wf = _workflow_from_row(row)
        feature = workflow_features.ensure_workflow_feature(wf["id"], wf)
        stats_row = db.conn.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
            FROM executions WHERE workflow_id = ?
            """,
            (wf["id"],),
        ).fetchone()
        latest_exec = db.conn.execute(
            "SELECT id, status, start_time, end_time, duration FROM executions WHERE workflow_id = ? ORDER BY start_time DESC LIMIT 1",
            (wf["id"],),
        ).fetchone()
        capabilities = feature.get("capabilities") or {}
        nodes.append({
            "id": wf["id"],
            "shortId": _short_workflow_id(wf["id"]),
            "name": wf.get("name", ""),
            "nodeCount": len(wf.get("nodes") or []),
            "loopCount": len([n for n in (wf.get("nodes") or []) if n.get("type") == "loop_start"]),
            "isFavorite": wf.get("isFavorite", False),
            "basedOnWorkflowId": wf.get("basedOnWorkflowId"),
            "executionCount": _count_value(stats_row, "total"),
            "successCount": _count_value(stats_row, "success_count"),
            "failedCount": _count_value(stats_row, "failed_count"),
            "cancelledCount": _count_value(stats_row, "cancelled_count"),
            "latestExecution": {
                "id": latest_exec["id"],
                "status": latest_exec["status"],
                "startedAt": latest_exec["start_time"],
                "endedAt": latest_exec["end_time"],
                "durationMs": latest_exec["duration"] or 0,
            } if latest_exec else None,
            "capabilities": capabilities,
            "createdAt": wf.get("createdAt", ""),
            "updatedAt": wf.get("updatedAt", ""),
        })

    edge_rows = db.conn.execute(
        """
        SELECT source_workflow_id, target_workflow_id, score, reason_json
        FROM workflow_similarity_edges
        WHERE source_workflow_id IN ({}) AND target_workflow_id IN ({}) AND score >= ?
        ORDER BY score DESC
        """.format(",".join("?" for _ in workflow_ids), ",".join("?" for _ in workflow_ids)),
        tuple(workflow_ids) + tuple(workflow_ids) + (max(0.0, min(min_score, 1.0)),),
    ).fetchall() if workflow_ids else []
    seen_pairs = set()
    degree_by_workflow_id = {workflow_id: 0 for workflow_id in workflow_ids}
    edges = []
    max_edges_per_node = max(1, min(edge_limit_per_node, 30))
    for row in edge_rows:
        pair = tuple(sorted((row["source_workflow_id"], row["target_workflow_id"])))
        if pair in seen_pairs:
            continue
        if degree_by_workflow_id.get(row["source_workflow_id"], 0) >= max_edges_per_node:
            continue
        if degree_by_workflow_id.get(row["target_workflow_id"], 0) >= max_edges_per_node:
            continue
        seen_pairs.add(pair)
        try:
            reasons = json.loads(row["reason_json"]) if row["reason_json"] else []
        except Exception:
            reasons = []
        edges.append({
            "source": row["source_workflow_id"],
            "target": row["target_workflow_id"],
            "score": round(float(row["score"] or 0), 3),
            "reasons": reasons,
        })
        degree_by_workflow_id[row["source_workflow_id"]] = degree_by_workflow_id.get(row["source_workflow_id"], 0) + 1
        degree_by_workflow_id[row["target_workflow_id"]] = degree_by_workflow_id.get(row["target_workflow_id"], 0) + 1

    return {"nodes": nodes, "edges": edges, "total": len(nodes)}


@router.get("/{id}")
def get_workflow(id: str):
    row = _workflow_row_by_id(id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Workflow {id} not found")
    return _workflow_from_row(row)


@router.post("/{id}/name")
def update_workflow_name(id: str, body: dict):
    row = _workflow_row_by_id(id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Workflow name is required")

    wf = _workflow_from_row(row)
    wf["name"] = name
    now = datetime.utcnow().isoformat() + 'Z'
    wf["updatedAt"] = now

    workflow_features.db = db
    feature = workflow_features.build_workflow_feature(wf)
    db.conn.execute(
        """
        UPDATE workflows
        SET json_data = ?, feature_json = ?, feature_version = ?, updated_at = ?
        WHERE id = ?
        """,
        (json.dumps(wf), json.dumps(feature, ensure_ascii=False), workflow_features.FEATURE_VERSION, now, id),
    )
    db.conn.commit()
    workflow_features.refresh_workflow_similarity_edges(id)
    return {"id": id, "name": name, "updatedAt": now}


@router.post("/{id}/favorite")
def toggle_favorite(id: str):
    row = _workflow_row_by_id(id)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf = _workflow_from_row(row)
    wf["isFavorite"] = not wf.get("isFavorite", False)
    now = datetime.utcnow().isoformat() + 'Z'
    wf["updatedAt"] = now
    db.conn.execute("UPDATE workflows SET json_data = ?, updated_at = ? WHERE id = ?", (json.dumps(wf), now, id))
    db.conn.commit()
    return {"id": id, "isFavorite": wf["isFavorite"]}
