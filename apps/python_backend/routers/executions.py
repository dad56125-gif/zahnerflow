"""
Executions — /api/executions routes.
"""

from __future__ import annotations

import json
import random
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException

from database import db
from runtime.execution_eta import estimate_workflow
from runtime.app_runtime import runtime
from workflow_identity import workflow_fingerprint

router = APIRouter(prefix="/api/executions", tags=["executions"])
sio = None


def _unroll_workflow_nodes(nodes: list[dict]) -> dict:
    from loop_unroller import WorkflowBlockError, unroll_loops

    try:
        return unroll_loops(nodes)
    except WorkflowBlockError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def set_sio(sio_instance):
    global sio
    sio = sio_instance


def _json_loads(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _artifact_key(artifact: dict) -> tuple:
    return (
        artifact.get("executionId") or artifact.get("execution_id"),
        artifact.get("nodeId") or artifact.get("node_id"),
        artifact.get("filePath") or artifact.get("file_path"),
        artifact.get("fileType") or artifact.get("file_type"),
    )


def _derive_artifacts_from_step_result(step: dict) -> list[dict]:
    result = step.get("result")
    if not isinstance(result, dict):
        return []

    data_points = result.get("data_points")
    base = {
        "execution_id": step.get("execution_id"),
        "executionId": step.get("execution_id"),
        "node_id": step.get("node_id"),
        "nodeId": step.get("node_id"),
        "created_at": step.get("ended_at") or step.get("started_at"),
        "createdAt": step.get("ended_at") or step.get("started_at"),
        "source": "stepResult",
        "dataPoints": data_points,
        "metadata": {"data_points": data_points} if data_points is not None else {},
    }
    artifacts = []
    for file_type, file_path in (
        ("output_file", result.get("outputFile") or result.get("output_file") or result.get("full_path")),
        ("csv", result.get("csvPath") or result.get("csv_path")),
        ("output_dir", result.get("outputDir") or result.get("output_dir")),
    ):
        if not file_path:
            continue
        artifacts.append({**base, "file_type": file_type, "fileType": file_type, "file_path": file_path, "filePath": file_path})
    return artifacts


@router.post("", status_code=201)
async def create_execution(body: dict):
    requested_workflow_id = body.get("workflowId")
    workflow_id = requested_workflow_id
    nodes = body.get("nodes")
    owner_name = body.get("ownerName")
    workflow_name = body.get("workflowName")
    workstation_type = body.get("workstationType") or "zahner-zennium"
    auto_startup_config = body.get("autoStartupConfig") or {}

    if runtime.experiment_state.get("status") in ("running", "paused", "cancelling"):
        raise HTTPException(status_code=400, detail="An execution is already active")

    resolved_workflow = None
    if nodes:
        wf_name = workflow_name or f"工作流 {datetime.now().strftime('%Y/%m/%d %H:%M:%S')}"
        from routers.workflows import resolve_or_create_workflow

        resolved_workflow = resolve_or_create_workflow(
            {"name": wf_name, "nodes": nodes, "ownerName": owner_name},
            based_on_workflow_id=requested_workflow_id,
        )
        workflow_id = resolved_workflow["id"]
        workflow_name = resolved_workflow.get("name") or wf_name
    elif not workflow_id:
        if not nodes:
            raise HTTPException(status_code=400, detail="Nodes array is required when workflowId is null")

    if not nodes:
        row = db.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
        wf = json.loads(row["json_data"])
        nodes = wf["nodes"]
        workflow_name = wf["name"]
        resolved_workflow = wf

    exec_id = f"exec_{int(time.time() * 1000)}_{random.randint(100, 999)}"
    now = datetime.utcnow().isoformat() + "Z"

    from routers.files import get_user_config

    path_config = get_user_config(owner_name or "")["config"] if owner_name else None
    wf_snapshot_payload = {
        **(resolved_workflow or {}),
        "id": workflow_id,
        "name": workflow_name or workflow_id,
        "nodes": nodes,
        "fingerprint": workflow_fingerprint(nodes),
    }
    _unroll_workflow_nodes(nodes)
    wf_snapshot = json.dumps(wf_snapshot_payload)

    db.conn.execute(
        "INSERT INTO executions (id, workflow_id, status, start_time, workflow_snapshot, path_config) VALUES (?, ?, 'running', ?, ?, ?)",
        (exec_id, workflow_id, now, wf_snapshot, json.dumps(path_config) if path_config else None),
    )
    db.conn.commit()

    runtime.experiment_state["workflowName"] = workflow_name or ""
    runtime.experiment_state["ownerName"] = owner_name or ""
    runtime.experiment_state["workstationType"] = workstation_type
    runtime.experiment_state["nodes"] = nodes or []

    try:
        await runtime.start_execution(
            {
                "workflowId": workflow_id,
                "executionId": exec_id,
                "nodes": nodes,
                "ownerName": owner_name or "",
                "workflowName": workflow_name or "",
                "workstationType": workstation_type,
                "autoStartupConfig": auto_startup_config,
                "pathConfig": path_config or {},
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start execution: {e}")

    return {"executionId": exec_id, "workflowId": workflow_id, "status": "running"}


@router.post("/estimate")
def estimate_execution(body: dict):
    workflow_id = body.get("workflowId")
    nodes = body.get("nodes")

    if not nodes and workflow_id:
        row = db.conn.execute("SELECT json_data FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
        workflow = json.loads(row["json_data"])
        nodes = workflow.get("nodes") or []

    if nodes is None:
        raise HTTPException(status_code=400, detail="Nodes array is required")
    if not isinstance(nodes, list):
        raise HTTPException(status_code=400, detail="Nodes must be an array")

    unrolled = _unroll_workflow_nodes(nodes)
    estimate = estimate_workflow(nodes, unrolled["steps"], runtime.devices)
    return {
        "workflowId": workflow_id,
        "nodeCount": len(nodes),
        "unrolledStepCount": len(unrolled["steps"]),
        **estimate,
    }


@router.get("")
def get_executions_list(page: int = 1, limit: int = 20, status: str = None, started_after: str = None, started_before: str = None, scope: str = None):
    offset = (page - 1) * limit
    conditions, params = [], []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if started_after:
        conditions.append("start_time >= ?")
        params.append(started_after)
    if started_before:
        conditions.append("start_time <= ?")
        params.append(started_before)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    is_wf_scope = scope == "workflow"

    if is_wf_scope:
        count_q = f"SELECT COUNT(*) as total FROM (SELECT workflow_id FROM executions {where} GROUP BY workflow_id)"
    else:
        count_q = f"SELECT COUNT(*) as total FROM executions {where}"
    total = db.conn.execute(count_q, params).fetchone()["total"]

    if is_wf_scope:
        query = f"""WITH latest AS (SELECT workflow_id, MAX(start_time) as latest_start FROM executions {where} GROUP BY workflow_id)
            SELECT e.id as execution_id, e.workflow_id, e.status, e.start_time as started_at, e.end_time as ended_at, e.duration as duration_ms, e.error, e.workflow_snapshot, e.path_config,
            (SELECT COUNT(*) FROM executions ex WHERE ex.workflow_id = e.workflow_id) as execution_count,
            (SELECT COUNT(*) FROM execution_warnings w WHERE w.execution_id = e.id) as warning_count,
            (SELECT COUNT(*) FROM execution_artifacts a WHERE a.execution_id = e.id) as artifact_count
            FROM executions e INNER JOIN latest l ON l.workflow_id = e.workflow_id AND l.latest_start = e.start_time
            ORDER BY e.start_time DESC LIMIT ? OFFSET ?"""
    else:
        query = f"""SELECT e.id as execution_id, e.workflow_id, e.status, e.start_time as started_at, e.end_time as ended_at, e.duration as duration_ms, e.error, e.workflow_snapshot, e.path_config,
            1 as execution_count,
            (SELECT COUNT(*) FROM execution_warnings w WHERE w.execution_id = e.id) as warning_count,
            (SELECT COUNT(*) FROM execution_artifacts a WHERE a.execution_id = e.id) as artifact_count
            FROM executions e {where} ORDER BY e.start_time DESC LIMIT ? OFFSET ?"""

    rows = db.conn.execute(query, params + [limit, offset]).fetchall()
    data = []
    for r in rows:
        try:
            wf_snapshot = json.loads(r["workflow_snapshot"]) if r["workflow_snapshot"] else {}
        except Exception:
            wf_snapshot = {}
        try:
            p_config = json.loads(r["path_config"]) if r["path_config"] else {}
        except Exception:
            p_config = {}
        data.append(
            {
                "executionId": r["execution_id"],
                "workflowId": r["workflow_id"],
                "workflowName": wf_snapshot.get("name") or r["workflow_id"],
                "projectName": p_config.get("projectName") or wf_snapshot.get("ownerName") or "",
                "individualName": p_config.get("individualName") or wf_snapshot.get("individualName") or "",
                "operatorName": wf_snapshot.get("ownerName") or "",
                "status": r["status"],
                "startedAt": r["started_at"],
                "endedAt": r["ended_at"],
                "durationMs": r["duration_ms"],
                "warningCount": r["warning_count"],
                "artifactCount": r["artifact_count"],
                "executionCount": r["execution_count"],
            }
        )
    return {"data": data, "total": total, "page": page, "limit": limit, "hasMore": offset + limit < total}


@router.get("/{id}")
def get_execution(id: str):
    if runtime.experiment_state.get("executionId") == id:
        return runtime.experiment_state
    row = db.conn.execute("SELECT * FROM executions WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Execution not found")
    return {
        "executionId": row["id"],
        "workflowId": row["workflow_id"],
        "status": row["status"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "error": row["error"],
        "logs": json.loads(row["logs_json"]) if row["logs_json"] else None,
    }


@router.get("/{id}/report")
def get_execution_report(id: str):
    exec_row = db.conn.execute("SELECT * FROM executions WHERE id = ?", (id,)).fetchone()
    if not exec_row:
        return {"error": "Execution not found", "executionId": id}
    steps = [dict(r) for r in db.conn.execute("SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY unrolled_index", (id,)).fetchall()]
    for s in steps:
        if s.get("params"):
            s["params"] = _json_loads(s["params"]) or s["params"]
        if s.get("iteration_path"):
            s["iteration_path"] = _json_loads(s["iteration_path"]) or s["iteration_path"]
        if s.get("block_path"):
            s["block_path"] = _json_loads(s["block_path"]) or s["block_path"]
        if s.get("result"):
            s["result"] = _json_loads(s["result"]) or s["result"]
    artifacts = [dict(r) for r in db.conn.execute("SELECT * FROM execution_artifacts WHERE execution_id = ? ORDER BY created_at", (id,)).fetchall()]
    warnings = [dict(r) for r in db.conn.execute("SELECT * FROM execution_warnings WHERE execution_id = ? ORDER BY created_at", (id,)).fetchall()]
    for w in warnings:
        if w.get("metadata"):
            try:
                w["metadata"] = json.loads(w["metadata"])
            except Exception:
                pass
    wf_snapshot = json.loads(exec_row["workflow_snapshot"]) if exec_row["workflow_snapshot"] else {}
    path_config = json.loads(exec_row["path_config"]) if exec_row["path_config"] else {}
    env_snapshot = json.loads(exec_row["environment_snapshot"]) if exec_row["environment_snapshot"] else {"furnace_samples": [], "mfc_samples": []}
    summary_metrics = json.loads(exec_row["summary_metrics"]) if exec_row["summary_metrics"] else {}
    steps_payload = [
        {
            "id": s.get("id"),
            "executionId": s.get("execution_id"),
            "originalIndex": s.get("original_index"),
            "unrolledIndex": s.get("unrolled_index"),
            "nodeId": s.get("node_id"),
            "nodeType": s.get("node_type"),
            "status": s.get("status"),
            "params": s.get("params"),
            "actualSeconds": s.get("actual_seconds"),
            "estimatedSeconds": s.get("estimated_seconds"),
            "etaSource": s.get("eta_source"),
            "iterationPath": s.get("iteration_path"),
            "blockPath": s.get("block_path"),
            "result": s.get("result"),
            "error": s.get("error"),
            "startedAt": s.get("started_at"),
            "endedAt": s.get("ended_at"),
        }
        for s in steps
    ]
    artifacts_payload = [
        {
            **a,
            "executionId": a.get("execution_id"),
            "nodeId": a.get("node_id"),
            "fileType": a.get("file_type"),
            "filePath": a.get("file_path"),
            "createdAt": a.get("created_at"),
        }
        for a in artifacts
    ]
    artifact_keys = {_artifact_key(a) for a in artifacts_payload}
    for step in steps:
        for artifact in _derive_artifacts_from_step_result(step):
            key = _artifact_key(artifact)
            if key not in artifact_keys:
                artifacts_payload.append(artifact)
                artifact_keys.add(key)
    warnings_payload = [{**w, "executionId": w.get("execution_id"), "createdAt": w.get("created_at")} for w in warnings]
    environment_snapshot_payload = {
        "furnaceSamples": env_snapshot.get("furnaceSamples") or env_snapshot.get("furnace_samples") or [],
        "mfcSamples": env_snapshot.get("mfcSamples") or env_snapshot.get("mfc_samples") or [],
    }
    return {
        "reportVersion": "2.0",
        "executionMetadata": {
            "id": exec_row["id"],
            "workflowId": exec_row["workflow_id"],
            "workflowName": wf_snapshot.get("name") or exec_row["workflow_id"] or "",
            "projectName": path_config.get("projectName") or "",
            "individualName": path_config.get("individualName") or "",
            "operator": {"name": wf_snapshot.get("ownerName", ""), "email": ""},
            "status": exec_row["status"],
            "startedAt": exec_row["start_time"],
            "endedAt": exec_row["end_time"],
            "durationMs": exec_row["duration"],
            "error": exec_row["error"],
        },
        "workflowSnapshot": wf_snapshot,
        "pathConfig": path_config,
        "unrolledSteps": steps_payload,
        "artifacts": artifacts_payload,
        "environmentSnapshot": environment_snapshot_payload,
        "warningFlags": warnings_payload,
        "summaryMetrics": summary_metrics,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
    }


@router.put("/{id}/pause")
async def pause_execution(id: str):
    try:
        return await runtime.pause_execution()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{id}/resume")
async def resume_execution(id: str):
    try:
        return await runtime.resume_execution()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{id}")
async def cancel_execution(id: str):
    current_id = runtime.experiment_state.get("executionId")
    current_status = runtime.experiment_state.get("status")
    if not current_id or current_status not in ("running", "paused", "cancelling"):
        raise HTTPException(status_code=404, detail="No active execution to cancel")
    if current_id != id:
        raise HTTPException(status_code=409, detail="Execution id does not match active execution")

    try:
        return await runtime.cancel_execution()
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reset")
async def reset_execution():
    if runtime.experiment_state.get("status") in ("running", "paused", "cancelling"):
        raise HTTPException(status_code=400, detail="Cannot reset while running")
    runtime.reset_execution_state()
    if sio:
        timestamp = datetime.utcnow().isoformat() + "Z"
        await sio.emit("nodesReset", {"targetStatus": "ready", "timestamp": timestamp})
        snapshot = dict(runtime.experiment_state)
        snapshot["timestamp"] = timestamp
        await sio.emit("systemStateSnapshot", snapshot)
    return {"success": True, "message": "Execution reset successfully", "timestamp": datetime.utcnow().isoformat() + "Z"}
