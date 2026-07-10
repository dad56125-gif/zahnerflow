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
from runtime.app_runtime import runtime
from runtime.execution_planner import (
    ExecutionPlanner,
    ExecutionPlanningError,
    WorkflowNotFoundError,
    database_workflow_loader,
)
from runtime.execution_semantics import (
    ExecutionIdMismatchError,
    InvalidExecutionTransitionError,
    NoActiveExecutionError,
    is_active_execution_status,
)
from runtime.execution_recorder import finish_execution
from shared.contracts.events import WORKFLOW_NODES_RESET, WORKFLOW_SNAPSHOT
from workflow_identity import workflow_fingerprint

router = APIRouter(prefix="/api/executions", tags=["executions"])
sio = None


def _execution_planner() -> ExecutionPlanner:
    return ExecutionPlanner(
        devices=getattr(runtime, "devices", None),
        workflow_loader=database_workflow_loader(db),
    )


def _resolve_execution_nodes(nodes: list[dict] | None, workflow_id: str | None) -> list[dict]:
    try:
        return _execution_planner().resolve_nodes(nodes, workflow_id)
    except WorkflowNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Workflow not found") from exc
    except ExecutionPlanningError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _load_execution_workflow(workflow_id: str) -> dict:
    try:
        return _execution_planner().load_workflow(workflow_id)
    except WorkflowNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Workflow not found") from exc
    except ExecutionPlanningError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _build_execution_plan(nodes: list[dict], auto_startup_config: dict | None = None, start_from_unrolled_index=0):
    try:
        return _execution_planner().plan(
            nodes,
            auto_startup_config=auto_startup_config or {},
            start_from_unrolled_index=start_from_unrolled_index,
        )
    except ExecutionPlanningError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _runtime_has_active_execution() -> bool:
    engine = getattr(runtime, "execution", None)
    return bool(engine and engine.is_running) or is_active_execution_status(runtime.experiment_state.get("status"))


def _string_value(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _user_path_config(owner_name: str | None) -> dict:
    if not _string_value(owner_name):
        return {}
    from routers.files import get_user_config

    config = get_user_config(owner_name or "").get("config") or {}
    return config if isinstance(config, dict) else {}


def _resolve_path_config(owner_name: str | None, request_path_config: dict | None) -> dict:
    resolved = _user_path_config(owner_name)
    incoming = request_path_config if isinstance(request_path_config, dict) else {}
    for key in ("basePath", "projectName", "individualName"):
        value = _string_value(incoming.get(key))
        if value:
            resolved[key] = value
    return {
        "basePath": _string_value(resolved.get("basePath")) or "C:\\data\\archive",
        "projectName": _string_value(resolved.get("projectName")),
        "individualName": _string_value(resolved.get("individualName")),
    }


def _missing_run_metadata(owner_name: str | None, path_config: dict) -> list[str]:
    missing = []
    if not _string_value(owner_name):
        missing.append("ownerName")
    if not _string_value(path_config.get("projectName")):
        missing.append("projectName")
    if not _string_value(path_config.get("individualName")):
        missing.append("individualName")
    return missing


def _run_metadata_message(missing_fields: list[str]) -> str:
    labels = {
        "ownerName": "用户",
        "projectName": "项目名称",
        "individualName": "样品名称",
    }
    missing_text = "、".join(labels[field] for field in missing_fields)
    return f"缺少{missing_text}，请填写后再运行；5 秒内再次点击运行将强制开始。"


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
    force_missing_metadata = bool(body.get("forceStartWithMissingRunMetadata"))
    path_config = _resolve_path_config(owner_name, body.get("pathConfig"))
    missing_metadata = _missing_run_metadata(owner_name, path_config)
    start_from_unrolled_index = 0

    if _runtime_has_active_execution():
        raise HTTPException(status_code=400, detail="An execution is already active")

    if missing_metadata and not force_missing_metadata:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "MISSING_RUN_METADATA",
                "missingFields": missing_metadata,
                "message": _run_metadata_message(missing_metadata),
            },
        )

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
        wf = _load_execution_workflow(workflow_id)
        nodes = wf["nodes"]
        workflow_name = wf["name"]
        resolved_workflow = wf

    exec_id = f"exec_{int(time.time() * 1000)}_{random.randint(100, 999)}"
    now = datetime.utcnow().isoformat() + "Z"

    plan = _build_execution_plan(
        nodes,
        auto_startup_config,
        body.get("startFromUnrolledIndex", 0),
    )
    nodes = plan.nodes
    start_from_unrolled_index = plan.start_from_unrolled_index
    wf_snapshot_payload = {
        **(resolved_workflow or {}),
        "id": workflow_id,
        "name": workflow_name or workflow_id,
        "nodes": nodes,
        "fingerprint": workflow_fingerprint(nodes),
    }
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
                "pathConfig": path_config or {},
                "executionPlan": plan,
            }
        )
    except Exception as e:
        # The execution row is created before the in-process task starts so its
        # steps can reference it. If startup itself fails, close that row rather
        # than leaving a permanently active-looking record in SQLite.
        finish_execution(exec_id, "failed", 0, str(e))
        raise HTTPException(status_code=500, detail=f"Failed to start execution: {e}")

    return {
        "executionId": exec_id,
        "workflowId": workflow_id,
        "status": "running",
        "startFromUnrolledIndex": start_from_unrolled_index,
    }


@router.post("/unroll-preview")
def preview_unrolled_execution(body: dict):
    workflow_id = body.get("workflowId")
    nodes = _resolve_execution_nodes(body.get("nodes"), workflow_id)
    auto_startup_config = body.get("autoStartupConfig") or {}
    plan = _build_execution_plan(nodes, auto_startup_config)
    return {
        "nodeCount": len(plan.nodes),
        "steps": plan.steps,
        "summary": plan.summary,
    }


@router.post("/estimate")
def estimate_execution(body: dict):
    workflow_id = body.get("workflowId")
    nodes = _resolve_execution_nodes(body.get("nodes"), workflow_id)
    auto_startup_config = body.get("autoStartupConfig") or {}
    plan = _build_execution_plan(nodes, auto_startup_config)
    return {
        "workflowId": workflow_id,
        "nodeCount": len(plan.nodes),
        "unrolledStepCount": len(plan.steps),
        "eta": plan.eta,
        "steps": plan.timeline["steps"],
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
    for artifact in artifacts:
        artifact["metadata"] = _json_loads(artifact.get("metadata")) or {}
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
            "source": "persisted",
            "dataPoints": (a.get("metadata") or {}).get("data_points"),
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
        return await runtime.pause_execution(id)
    except Exception as exc:
        raise _execution_command_http_error(exc) from exc


@router.put("/{id}/resume")
async def resume_execution(id: str):
    try:
        return await runtime.resume_execution(id)
    except Exception as exc:
        raise _execution_command_http_error(exc) from exc


@router.delete("/{id}")
async def cancel_execution(id: str):
    try:
        return await runtime.cancel_execution(id)
    except Exception as exc:
        raise _execution_command_http_error(exc) from exc


@router.post("/reset")
async def reset_execution():
    if _runtime_has_active_execution():
        raise HTTPException(status_code=400, detail="Cannot reset while running")
    runtime.reset_execution_state()
    if sio:
        timestamp = datetime.utcnow().isoformat() + "Z"
        await sio.emit(WORKFLOW_NODES_RESET, {"targetStatus": "ready", "timestamp": timestamp})
        snapshot = dict(runtime.experiment_state)
        snapshot["timestamp"] = timestamp
        await sio.emit(WORKFLOW_SNAPSHOT, snapshot)
    return {"success": True, "message": "Execution reset successfully", "timestamp": datetime.utcnow().isoformat() + "Z"}


def _execution_command_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, NoActiveExecutionError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, (ExecutionIdMismatchError, InvalidExecutionTransitionError)):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))
