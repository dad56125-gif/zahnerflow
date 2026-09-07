"""CLI、Agent 与 App 的只读发现入口；命令仍使用现有业务路由。"""

import asyncio

from fastapi import APIRouter

from runtime.app_runtime import DEVICE_CAPABILITIES, runtime
from runtime.execution_semantics import (
    ADVANCED_MEASUREMENT_TYPES, STRUCTURAL_NODE_TYPES, NODE_EXECUTION_SPECS,
    EXECUTION_PHASES,
)
from shared.contracts.events import WORKFLOW_SNAPSHOT
from shared.contracts.protocol import API_VERSION, REPORT_VERSION
from shared.contracts.workflow import ExecutionSnapshot, ExecutionStartRequest, ExecutionPreviewRequest
from version import APP_VERSION

router = APIRouter(prefix="/api/runtime", tags=["runtime"])


@router.get("/snapshot", response_model=ExecutionSnapshot)
async def get_runtime_snapshot():
    return runtime.execution_snapshot()


@router.get("/devices")
async def get_runtime_devices():
    return await asyncio.gather(*(runtime.runtime_device_status(device) for device in DEVICE_CAPABILITIES))


@router.get("/capabilities")
def get_runtime_capabilities():
    return {
        "appVersion": APP_VERSION,
        "apiVersion": API_VERSION,
        "reportVersion": REPORT_VERSION,
        "openapi": "/openapi.json",
        "snapshot": "/api/runtime/snapshot",
        "events": {"transport": "socket.io", "path": "/socket.io", "snapshot": WORKFLOW_SNAPSHOT},
        "devices": DEVICE_CAPABILITIES,
        "nodes": {
            "executable": [{"type": name, "interruptible": spec.interruptible,
                "measurementType": spec.measurement_type, "automaticBoundary": name in {"startup", "shutdown"}}
                for name, spec in NODE_EXECUTION_SPECS.items()],
            "advanced": sorted(ADVANCED_MEASUREMENT_TYPES),
            "structural": sorted(STRUCTURAL_NODE_TYPES),
        },
        "phases": {name: [command for command in ("start", "pause", "resume", "cancel", "reset")
            if getattr(phase, f"can_{command}")] for name, phase in EXECUTION_PHASES.items()},
        "schemas": {
            "start": ExecutionStartRequest.model_json_schema(by_alias=True),
            "preview": ExecutionPreviewRequest.model_json_schema(by_alias=True),
        },
        "controlSemantics": {"pause": "Blocks before the next step; does not freeze a running device measurement or current wait", "cancel": "Cooperative; non-interruptible EIS completes its current measurement first", "reset": "Explicit and rejected while active"},
        "parameterConvention": {
            "nodeParameters": "config",
            "executionIndex": "startFromUnrolledIndex (zero-based)",
            "previewBeforeRun": "/api/executions/unroll-preview",
            "configValidation": "Node config is an object; planning and device drivers validate node-specific values. The JSON schema is not a complete device parameter schema.",
        },
    }
