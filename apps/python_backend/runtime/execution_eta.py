"""Execution ETA estimation and local duration learning.

This module does not control execution. It only estimates display time and
learns from successful completed steps stored on this machine.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any

from database import db
from runtime.execution_semantics import (
    node_execution_spec,
    parse_scheduled_at,
    resolve_scheduled_start,
)
from runtime.temperature_control import estimate_temperature_wait_seconds


VOLATILE_PARAM_KEYS = {
    "outputPath",
    "output_path",
    "basePath",
    "projectName",
    "individualName",
    "workflowId",
    "workflowTimestamp",
    "environment_context",
}


def canonical_params(params: dict | None) -> dict:
    """Return duration-relevant backend parameters for exact-match learning."""
    return _canonicalize(params or {})


def params_hash(params: dict | None) -> str:
    payload = json.dumps(canonical_params(params), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def params_for_eta(node_type: str | None, params: dict | None) -> dict:
    eta_params = dict(params or {})
    spec = node_execution_spec(node_type)
    if node_type == "measurement":
        eta_params["measurement_type"] = eta_params.get("measurement_type", "measurement")
    elif spec and spec.dispatch_kind == "measurement":
        eta_params.setdefault("measurement_type", spec.measurement_type or node_type)
    return eta_params


def node_for_eta(node: dict) -> dict:
    node_type = node.get("type")
    return {**node, "config": params_for_eta(node_type, node.get("config") or {})}


def estimate_node_seconds(
    node_type: str | None,
    params: dict | None,
    devices=None,
    *,
    scheduled_at: datetime | None = None,
    now: datetime | None = None,
) -> dict:
    node_type = node_type or "unknown"
    clean_params = canonical_params(params)
    digest = params_hash(clean_params)
    spec = node_execution_spec(node_type)
    historical = _lookup_historical_estimate(node_type, digest) if not spec or spec.learn_duration else None
    if historical:
        return historical

    rule_seconds = _rule_estimate_seconds(
        node_type,
        clean_params,
        devices,
        scheduled_at=scheduled_at,
        now=now,
    )
    if rule_seconds is not None:
        return {
            "seconds": max(0.0, float(rule_seconds)),
            "source": "rule",
            "confidence": 0.7,
            "sampleCount": 0,
            "paramsHash": digest,
        }

    return {
        "seconds": _fallback_seconds(node_type),
        "source": "fallback",
        "confidence": 0.2,
        "sampleCount": 0,
        "paramsHash": digest,
    }


def build_timeline(nodes: list[dict], steps: list[dict], devices=None, *, now: datetime | None = None) -> dict:
    timeline_steps = []
    total_seconds = 0.0
    planned_at = now or datetime.now()
    projected_at = planned_at
    eta_nodes = [node_for_eta(node) for node in nodes]
    for unrolled_index, step in enumerate(steps):
        node = node_for_eta(step.get("node") or eta_nodes[step["originalIndex"]])
        node_type = node.get("type")
        params = node.get("config") or {}
        scheduled_at = None
        if node_type == "scheduled_start":
            scheduled_value = step.get("scheduledAt")
            scheduled_at = (
                parse_scheduled_at(scheduled_value)
                if scheduled_value
                else resolve_scheduled_start(params, planned_at)
            )
        estimate = estimate_node_seconds(
            node_type,
            params,
            devices,
            scheduled_at=scheduled_at,
            now=projected_at,
        )
        seconds = float(estimate["seconds"])
        total_seconds += seconds
        projected_at += timedelta(seconds=seconds)
        timeline_steps.append(
            {
                "nodeId": node.get("id"),
                "nodeType": node_type,
                "index": step["originalIndex"],
                "total": len(nodes),
                "unrolledIndex": unrolled_index,
                "unrolledTotal": len(steps),
                "iterationPath": step.get("iterationPath", []),
                "blockPath": step.get("blockPath", []),
                "estimatedSeconds": seconds,
                "etaSource": estimate["source"],
                "etaConfidence": estimate["confidence"],
                "etaSampleCount": estimate["sampleCount"],
                "paramsHash": estimate["paramsHash"],
                **({"scheduledAt": scheduled_at.isoformat()} if scheduled_at else {}),
            }
        )
    return {"steps": timeline_steps, "estimatedTotalSeconds": total_seconds}


def build_eta_snapshot(timeline: dict, updated_at: str | None = None) -> dict:
    updated_at = updated_at or datetime.utcnow().isoformat() + "Z"
    steps = timeline.get("steps", [])
    total = float(timeline.get("estimatedTotalSeconds") or 0)
    confidences = [float(step.get("etaConfidence") or 0) for step in steps]
    sources = {step.get("etaSource") for step in steps}
    return {
        "estimatedTotalSeconds": total,
        "estimatedRemainingSeconds": total,
        "elapsedSeconds": 0.0,
        "currentStepEstimatedSeconds": None,
        "currentStepElapsedSeconds": None,
        "source": _combined_source(sources),
        "confidence": sum(confidences) / len(confidences) if confidences else 0,
        "updatedAt": updated_at,
    }


def estimate_workflow(
    nodes: list[dict],
    steps: list[dict],
    devices=None,
    *,
    now: datetime | None = None,
) -> dict:
    timeline = build_timeline(nodes, steps, devices, now=now)
    return {
        "eta": build_eta_snapshot(timeline),
        "steps": timeline["steps"],
    }


def learn_successful_duration(node_type: str, params: dict, actual_seconds: float) -> None:
    if actual_seconds <= 0:
        return

    clean_params = canonical_params(params)
    digest = params_hash(clean_params)
    params_json = json.dumps(clean_params, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    now = datetime.utcnow().isoformat() + "Z"
    row = db.conn.execute(
        """
        SELECT sample_count, average_seconds, min_seconds, max_seconds
        FROM node_duration_estimates
        WHERE node_type = ? AND params_hash = ?
        """,
        (node_type, digest),
    ).fetchone()
    if row:
        sample_count = int(row["sample_count"]) + 1
        average = ((float(row["average_seconds"]) * int(row["sample_count"])) + actual_seconds) / sample_count
        min_seconds = min(float(row["min_seconds"] or actual_seconds), actual_seconds)
        max_seconds = max(float(row["max_seconds"] or actual_seconds), actual_seconds)
        db.conn.execute(
            """
            UPDATE node_duration_estimates
            SET sample_count = ?, average_seconds = ?, min_seconds = ?, max_seconds = ?,
                last_seconds = ?, updated_at = ?, params_json = ?
            WHERE node_type = ? AND params_hash = ?
            """,
            (sample_count, average, min_seconds, max_seconds, actual_seconds, now, params_json, node_type, digest),
        )
    else:
        db.conn.execute(
            """
            INSERT INTO node_duration_estimates
              (node_type, params_hash, params_json, sample_count, average_seconds,
               min_seconds, max_seconds, last_seconds, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
            """,
            (node_type, digest, params_json, actual_seconds, actual_seconds, actual_seconds, actual_seconds, now),
        )
    db.conn.commit()


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _canonicalize(value[key])
            for key in sorted(value)
            if key not in VOLATILE_PARAM_KEYS
        }
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _lookup_historical_estimate(node_type: str, digest: str) -> dict | None:
    row = db.conn.execute(
        """
        SELECT sample_count, average_seconds
        FROM node_duration_estimates
        WHERE node_type = ? AND params_hash = ?
        """,
        (node_type, digest),
    ).fetchone()
    if not row or int(row["sample_count"]) <= 0:
        return None
    sample_count = int(row["sample_count"])
    return {
        "seconds": float(row["average_seconds"]),
        "source": "history",
        "confidence": min(0.95, 0.55 + sample_count * 0.08),
        "sampleCount": sample_count,
        "paramsHash": digest,
    }


def _combined_source(sources: set[str | None]) -> str:
    clean_sources = {source for source in sources if source}
    if not clean_sources:
        return "fallback"
    if clean_sources == {"history"}:
        return "history"
    if clean_sources <= {"rule", "actual"}:
        return "rule"
    return "mixed"


def _rule_estimate_seconds(
    node_type: str,
    params: dict,
    devices=None,
    *,
    scheduled_at: datetime | None = None,
    now: datetime | None = None,
) -> float | None:
    spec = node_execution_spec(node_type)
    eta_kind = spec.eta_kind if spec else node_type
    if eta_kind == "delay":
        return float(params.get("duration", 1))
    if eta_kind == "scheduled_start":
        reference = now or datetime.now()
        scheduled = scheduled_at or resolve_scheduled_start(params, reference)
        return max(0.0, (scheduled - reference).total_seconds())
    if eta_kind == "startup":
        return 3.0
    if eta_kind == "shutdown":
        return 3.0
    if eta_kind == "change_gas_flow":
        return float(params.get("stabilizationTime", 10))
    if eta_kind == "change_temperature":
        target = params.get("targetTemperature")
        rate = float(params.get("rate", 5) or 5)
        stabilization = float(params.get("stabilizationTime", 30) or 0)
        if target is None or rate <= 0:
            return stabilization
        current = 25.0
        if devices is not None:
            try:
                status = devices.furnace_status()
                if status.get("pv") is not None:
                    current = float(status["pv"])
            except Exception:
                pass
        return estimate_temperature_wait_seconds(
            current_temp=current,
            target_temp=float(target),
            rate=rate,
            stabilization_time=stabilization,
            ambient_temperature=float(params.get("ambientTemperature", 25) or 25),
            cooling_linear_floor=float(params.get("coolingLinearFloor", 500) or 500),
        )

    duration = (
        params.get("measurementDuration")
        or params.get("measurement_duration")
        or params.get("duration")
        or params.get("step_duration")
    )
    if duration is not None and node_type not in ("eis_potentiostatic", "eis_galvanostatic"):
        return float(duration)
    return None


def _fallback_seconds(node_type: str) -> float:
    spec = node_execution_spec(node_type)
    if spec and spec.measurement_type in ("eis_potentiostatic", "eis_galvanostatic"):
        return 300.0
    return 60.0
