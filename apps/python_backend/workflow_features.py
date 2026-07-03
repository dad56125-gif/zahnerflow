"""Workflow feature extraction and similarity edges."""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import datetime
from typing import Any

from database import db
from workflow_identity import normalize_nodes_for_identity


FEATURE_VERSION = 1
DEFAULT_TOP_N = 20
MIN_EDGE_SCORE = 0.34

EIS_NODE_TYPES = {"eis_potentiostatic", "eis_galvanostatic"}
OCP_NODE_TYPES = {"ocp_measurement"}
TEMPERATURE_NODE_TYPES = {"change_temperature"}
GAS_NODE_TYPES = {"change_gas_flow"}
WAIT_NODE_TYPES = {"wait_delay", "delay"}
LOOP_NODE_TYPES = {"loop_start", "loop_end"}

PARAM_ALIASES = {
    "temperature": ("targetTemperature", "temperature", "target_temperature", "targetTemp"),
    "duration": ("duration", "measurementDuration", "holdTime", "stabilizationTime", "delay"),
    "frequency_low": ("eisLowerFrequency", "lowerFrequency", "minFrequency"),
    "frequency_high": ("eisUpperFrequency", "upperFrequency", "maxFrequency", "eisStartFrequency"),
    "amplitude": ("eis_amplitude", "eisAmplitude", "amplitude"),
    "gas_flow": ("flowRate", "flow", "sccm", "targetFlow", "setpoint"),
    "loop_count": ("loopCount",),
}


def build_workflow_feature(workflow: dict) -> dict:
    nodes = workflow.get("nodes") or []
    normalized_nodes = normalize_nodes_for_identity(nodes)
    node_types = [str(node.get("type") or "") for node in normalized_nodes]
    counts = Counter(node_types)
    numeric = {key: [] for key in PARAM_ALIASES}

    for node in normalized_nodes:
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        for bucket, aliases in PARAM_ALIASES.items():
            _collect_numeric_values(config, aliases, numeric[bucket])

    return {
        "schemaVersion": FEATURE_VERSION,
        "nodeCount": len(node_types),
        "nodeTypes": node_types,
        "nodeTypeCounts": dict(sorted(counts.items())),
        "nodeTypeSet": sorted(t for t in counts if t),
        "structureSignature": ">".join(node_types),
        "capabilities": {
            "hasEis": any(t in EIS_NODE_TYPES for t in node_types),
            "hasOcp": any(t in OCP_NODE_TYPES for t in node_types),
            "hasTemperature": any(t in TEMPERATURE_NODE_TYPES for t in node_types),
            "hasGasControl": any(t in GAS_NODE_TYPES for t in node_types),
            "hasWait": any(t in WAIT_NODE_TYPES for t in node_types),
            "hasLoop": any(t in LOOP_NODE_TYPES for t in node_types),
        },
        "parameters": {
            key: _numeric_summary(values)
            for key, values in numeric.items()
            if values
        },
        "loop": _loop_feature(normalized_nodes),
        "text": {
            "nameTokens": _tokenize_text(workflow.get("name") or ""),
            "ownerTokens": _tokenize_text(workflow.get("ownerName") or ""),
        },
    }


def refresh_workflow_similarity_edges(workflow_id: str, top_n: int = DEFAULT_TOP_N) -> None:
    source_row = db.conn.execute(
        "SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json FROM workflows WHERE id = ?",
        (workflow_id,),
    ).fetchone()
    if not source_row:
        return

    source_workflow = _workflow_from_row(source_row)
    source_feature = ensure_workflow_feature(workflow_id, source_workflow)
    candidates = []
    for row in db.conn.execute(
        """
        SELECT id, json_data, fingerprint, based_on_workflow_id, feature_json
        FROM workflows
        WHERE id != ?
        """,
        (workflow_id,),
    ).fetchall():
        target_workflow = _workflow_from_row(row)
        target_feature = ensure_workflow_feature(row["id"], target_workflow)
        score, reasons = score_workflow_similarity(source_workflow, source_feature, target_workflow, target_feature)
        if score >= MIN_EDGE_SCORE:
            candidates.append((row["id"], score, reasons))

    candidates.sort(key=lambda item: item[1], reverse=True)
    keep = candidates[:top_n]

    db.conn.execute(
        "DELETE FROM workflow_similarity_edges WHERE source_workflow_id = ? OR target_workflow_id = ?",
        (workflow_id, workflow_id),
    )
    now = _now_iso()
    for target_id, score, reasons in keep:
        _insert_edge(workflow_id, target_id, score, reasons, now)
        _insert_edge(target_id, workflow_id, score, reasons, now)
    _trim_all_edges(top_n)
    db.conn.commit()


def ensure_workflow_feature(workflow_id: str, workflow: dict | None = None) -> dict:
    row = db.conn.execute(
        "SELECT json_data, feature_json, feature_version FROM workflows WHERE id = ?",
        (workflow_id,),
    ).fetchone()
    if not row:
        return {}
    if row["feature_json"] and int(row["feature_version"] or 0) == FEATURE_VERSION:
        try:
            feature = json.loads(row["feature_json"])
            if isinstance(feature, dict):
                return feature
        except Exception:
            pass

    workflow = workflow or json.loads(row["json_data"])
    feature = build_workflow_feature(workflow)
    db.conn.execute(
        "UPDATE workflows SET feature_json = ?, feature_version = ? WHERE id = ?",
        (json.dumps(feature, ensure_ascii=False), FEATURE_VERSION, workflow_id),
    )
    return feature


def backfill_workflow_features_and_edges(top_n: int = DEFAULT_TOP_N) -> None:
    rows = db.conn.execute("SELECT id, json_data FROM workflows").fetchall()
    for row in rows:
        ensure_workflow_feature(row["id"], json.loads(row["json_data"]))
    db.conn.commit()
    for row in rows:
        refresh_workflow_similarity_edges(row["id"], top_n=top_n)


def score_workflow_similarity(source_workflow: dict, source_feature: dict, target_workflow: dict, target_feature: dict) -> tuple[float, list[dict]]:
    reasons: list[dict] = []
    score = 0.0

    if source_workflow.get("basedOnWorkflowId") == target_workflow.get("id") or target_workflow.get("basedOnWorkflowId") == source_workflow.get("id"):
        score += 0.34
        reasons.append({"type": "lineage", "label": "同源变体", "score": 0.34})

    source_sequence = source_feature.get("nodeTypes") or []
    target_sequence = target_feature.get("nodeTypes") or []
    if source_sequence and source_sequence == target_sequence:
        score += 0.24
        reasons.append({"type": "structure", "label": "节点顺序相同", "score": 0.24})
    else:
        sequence_score = _sequence_similarity(source_sequence, target_sequence)
        if sequence_score > 0:
            value = 0.18 * sequence_score
            score += value
            reasons.append({"type": "sequence", "label": "节点顺序接近", "score": round(value, 3)})

    type_score = _jaccard(source_feature.get("nodeTypeSet") or [], target_feature.get("nodeTypeSet") or [])
    if type_score > 0:
        value = 0.18 * type_score
        score += value
        reasons.append({"type": "node_types", "label": "节点类型集合相似", "score": round(value, 3)})

    capability_score = _capability_similarity(source_feature.get("capabilities") or {}, target_feature.get("capabilities") or {})
    if capability_score > 0:
        value = 0.12 * capability_score
        score += value
        reasons.append({"type": "capabilities", "label": "实验能力组合相似", "score": round(value, 3)})

    parameter_score, parameter_reasons = _parameter_similarity(source_feature.get("parameters") or {}, target_feature.get("parameters") or {})
    if parameter_score > 0:
        value = 0.20 * parameter_score
        score += value
        reasons.extend(parameter_reasons)

    text_score = _jaccard(
        source_feature.get("text", {}).get("nameTokens") or [],
        target_feature.get("text", {}).get("nameTokens") or [],
    )
    if text_score > 0:
        value = 0.04 * text_score
        score += value
        reasons.append({"type": "name", "label": "名称关键词接近", "score": round(value, 3)})

    score = min(1.0, score)
    reasons.sort(key=lambda item: item.get("score", 0), reverse=True)
    return round(score, 3), reasons[:6]


def _workflow_from_row(row) -> dict:
    workflow = json.loads(row["json_data"])
    if row["fingerprint"]:
        workflow["fingerprint"] = row["fingerprint"]
    if row["based_on_workflow_id"]:
        workflow["basedOnWorkflowId"] = row["based_on_workflow_id"]
    return workflow


def _collect_numeric_values(value: Any, aliases: tuple[str, ...], target: list[float]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in aliases:
                numeric = _to_float(child)
                if numeric is not None:
                    target.append(numeric)
            _collect_numeric_values(child, aliases, target)
    elif isinstance(value, list):
        for child in value:
            _collect_numeric_values(child, aliases, target)


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        try:
            numeric = float(value.strip())
            return numeric if math.isfinite(numeric) else None
        except ValueError:
            return None
    return None


def _numeric_summary(values: list[float]) -> dict:
    values = sorted(values)
    return {
        "count": len(values),
        "min": values[0],
        "max": values[-1],
        "mean": sum(values) / len(values),
    }


def _loop_feature(nodes: list[dict]) -> dict:
    loop_counts = []
    for node in nodes:
        if node.get("type") != "loop_start":
            continue
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        count = _to_float(config.get("loopCount"))
        if count is not None:
            loop_counts.append(count)
    return {
        "count": sum(1 for node in nodes if node.get("type") == "loop_start"),
        "iterations": _numeric_summary(loop_counts) if loop_counts else None,
    }


def _sequence_similarity(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    lcs = _lcs_length(left, right)
    return lcs / max(len(left), len(right))


def _lcs_length(left: list[str], right: list[str]) -> int:
    previous = [0] * (len(right) + 1)
    for left_item in left:
        current = [0]
        for index, right_item in enumerate(right, start=1):
            if left_item == right_item:
                current.append(previous[index - 1] + 1)
            else:
                current.append(max(previous[index], current[-1]))
        previous = current
    return previous[-1]


def _jaccard(left: list[str], right: list[str]) -> float:
    left_set = set(left)
    right_set = set(right)
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def _capability_similarity(left: dict, right: dict) -> float:
    enabled = [key for key, value in left.items() if value or right.get(key)]
    if not enabled:
        return 0.0
    matches = sum(1 for key in enabled if bool(left.get(key)) == bool(right.get(key)))
    return matches / len(enabled)


def _parameter_similarity(left: dict, right: dict) -> tuple[float, list[dict]]:
    scores = []
    reasons = []
    labels = {
        "temperature": "温度接近",
        "duration": "持续时间接近",
        "frequency_low": "低频范围接近",
        "frequency_high": "高频范围接近",
        "amplitude": "扰动幅值接近",
        "gas_flow": "气体流量接近",
        "loop_count": "循环次数接近",
    }
    for key, left_summary in left.items():
        right_summary = right.get(key)
        if not isinstance(left_summary, dict) or not isinstance(right_summary, dict):
            continue
        similarity = _number_closeness(float(left_summary.get("mean", 0)), float(right_summary.get("mean", 0)))
        if similarity <= 0:
            continue
        scores.append(similarity)
        if similarity >= 0.72:
            reasons.append({"type": f"param_{key}", "label": labels.get(key, "关键参数接近"), "score": round(0.20 * similarity, 3)})
    if not scores:
        return 0.0, []
    return sum(scores) / len(scores), reasons[:3]


def _number_closeness(left: float, right: float) -> float:
    if left == right:
        return 1.0
    scale = max(abs(left), abs(right), 1.0)
    ratio = abs(left - right) / scale
    return max(0.0, 1.0 - ratio)


def _tokenize_text(text: str) -> list[str]:
    return sorted({token.lower() for token in re.findall(r"[\w\u4e00-\u9fff]+", text) if len(token) > 1})


def _insert_edge(source_id: str, target_id: str, score: float, reasons: list[dict], now: str) -> None:
    db.conn.execute(
        """
        INSERT OR REPLACE INTO workflow_similarity_edges
            (source_workflow_id, target_workflow_id, score, reason_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (source_id, target_id, score, json.dumps(reasons, ensure_ascii=False), now),
    )


def _trim_all_edges(top_n: int) -> None:
    source_ids = [row["source_workflow_id"] for row in db.conn.execute("SELECT DISTINCT source_workflow_id FROM workflow_similarity_edges").fetchall()]
    for source_id in source_ids:
        stale = db.conn.execute(
            """
            SELECT target_workflow_id FROM workflow_similarity_edges
            WHERE source_workflow_id = ?
            ORDER BY score DESC, target_workflow_id ASC
            LIMIT -1 OFFSET ?
            """,
            (source_id, top_n),
        ).fetchall()
        for row in stale:
            db.conn.execute(
                "DELETE FROM workflow_similarity_edges WHERE source_workflow_id = ? AND target_workflow_id = ?",
                (source_id, row["target_workflow_id"]),
            )


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"
