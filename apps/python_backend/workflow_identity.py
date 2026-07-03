"""Workflow identity helpers.

Workflow identity is based on the user-defined node sequence and parameters,
not on display metadata such as name, owner, timestamps, or generated node ids.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


RUNTIME_ONLY_CONFIG_KEYS = {
    "host",
    "port",
    "baudRate",
    "baud_rate",
    "simulatorProfile",
    "simulator_profile",
}

WORKFLOW_BLOCK_IDENTITY_KEYS = {"workflowId"}


def _normalize_scalar(value: Any) -> Any:
    if isinstance(value, float):
        return round(value, 12)
    return value


def _normalize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _normalize_value(value[key])
            for key in sorted(value)
            if key not in RUNTIME_ONLY_CONFIG_KEYS and value[key] is not None
        }
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    return _normalize_scalar(value)


def normalize_nodes_for_identity(nodes: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for node in nodes or []:
        node_type = node.get("type") or ""
        config = node.get("config") or node.get("parameters") or {}
        if not isinstance(config, dict):
            config = {}
        if node_type == "workflow_block":
            config = {
                key: config.get(key)
                for key in WORKFLOW_BLOCK_IDENTITY_KEYS
                if config.get(key) is not None
            }
        normalized.append(
            {
                "type": node_type,
                "config": _normalize_value(config),
            }
        )
    return normalized


def workflow_fingerprint(nodes: list[dict] | None) -> str:
    payload = json.dumps(
        normalize_nodes_for_identity(nodes),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
