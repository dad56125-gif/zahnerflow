"""
ZahnerFlow single-process Python backend.
"""

from __future__ import annotations

import os
import time
from datetime import datetime

import fastapi
import socketio
import uvicorn

from runtime.app_runtime import runtime
from shared.contracts.events import (
    DEVICE_STATUS_UPDATE,
    RUNTIME_CONNECTED,
    RUNTIME_JOIN_WORKFLOW,
    RUNTIME_JOINED_WORKFLOW,
    RUNTIME_LEAVE_WORKFLOW,
    RUNTIME_LEFT_WORKFLOW,
    WORKFLOW_SNAPSHOT,
)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = fastapi.FastAPI(title="ZahnerFlow Python Backend")
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

runtime.set_sio(sio)
start_time = time.time()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))
connected_clients: dict[str, dict] = {}

from routers.executions import set_sio as set_executions_sio

set_executions_sio(sio)


@sio.event
async def connect(sid, environ):
    connected_clients[sid] = {
        "id": sid,
        "workflowIds": set(),
        "connectedAt": time.time(),
        "lastActivity": time.time(),
    }
    await sio.emit(
        RUNTIME_CONNECTED,
        {
            "message": "Welcome to ZahnerFlow WebSocket Gateway",
            "clientId": sid,
            "serverTime": int(time.time() * 1000),
            "connectedClients": len(connected_clients),
        },
        room=sid,
    )
    snapshot = dict(runtime.experiment_state)
    snapshot["timestamp"] = datetime.utcnow().isoformat() + "Z"
    await sio.emit(WORKFLOW_SNAPSHOT, snapshot, room=sid)
    for device in ("furnace", "mfc", "zahner"):
        await sio.emit(
            DEVICE_STATUS_UPDATE,
            await runtime.runtime_device_status(device),
            room=sid,
        )


@sio.event
async def disconnect(sid):
    connected_clients.pop(sid, None)


@sio.on(RUNTIME_JOIN_WORKFLOW)
async def handle_join_workflow(sid, data):
    wfid = data.get("workflowId") if isinstance(data, dict) else data
    if sid in connected_clients:
        connected_clients[sid]["workflowIds"].add(wfid)
    sio.enter_room(sid, f"workflow:{wfid}")
    await sio.emit(
        RUNTIME_JOINED_WORKFLOW,
        {"workflowId": wfid, "message": f"Successfully joined workflow {wfid}", "timestamp": datetime.utcnow().isoformat() + "Z"},
        room=sid,
    )


@sio.on(RUNTIME_LEAVE_WORKFLOW)
async def handle_leave_workflow(sid, data):
    wfid = data.get("workflowId") if isinstance(data, dict) else data
    if sid in connected_clients:
        connected_clients[sid]["workflowIds"].discard(wfid)
    sio.leave_room(sid, f"workflow:{wfid}")
    await sio.emit(
        RUNTIME_LEFT_WORKFLOW,
        {"workflowId": wfid, "message": f"Successfully left workflow {wfid}", "timestamp": datetime.utcnow().isoformat() + "Z"},
        room=sid,
    )


@app.get("/health")
def get_health():
    return {
        "status": "healthy",
        "runtime_running": runtime.is_running,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "uptime": time.time() - start_time,
    }


@app.get("/api")
def get_api_info():
    return {
        "message": "ZahnerFlow Backend API",
        "version": "3.0.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


from routers.workflows import router as workflows_router
from routers.executions import router as executions_router
from routers.devices import router as devices_router
from routers.users import router as users_router
from routers.files import router as files_router

app.include_router(workflows_router)
app.include_router(executions_router)
app.include_router(devices_router)
app.include_router(users_router)
app.include_router(files_router)


@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    if full_path.startswith("api/") or full_path == "api" or full_path.startswith("socket.io"):
        raise fastapi.HTTPException(status_code=404, detail="Not Found")
    static_file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(static_file_path) and os.path.isfile(static_file_path):
        return fastapi.responses.FileResponse(static_file_path)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return fastapi.responses.FileResponse(index_path)
    return fastapi.responses.HTMLResponse("Frontend build not found. Please build frontend first.", status_code=404)


@app.on_event("startup")
async def startup_event():
    await runtime.start()


@app.on_event("shutdown")
async def shutdown_event():
    await runtime.stop()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(socket_app, host="127.0.0.1", port=port, timeout_keep_alive=120)
