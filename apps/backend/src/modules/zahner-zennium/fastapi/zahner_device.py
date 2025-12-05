#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

# 引入硬件驱动
from thales_remote.connection import ThalesRemoteConnection
from thales_remote.script_wrapper import ThalesRemoteScriptWrapper

# 引入我们刚才写的精简逻辑层
import logic

# ==========================================
# 1. FastAPI 初始化与配置
# ==========================================

app = FastAPI(title="Zahner Device Service (Refactored)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生产环境建议指定具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2. 全局状态与连接管理
# ==========================================

class DeviceManager:
    """管理 Thales 连接的单例"""
    def __init__(self):
        self.connection: Optional[ThalesRemoteConnection] = None
        self.wrapper: Optional[ThalesRemoteScriptWrapper] = None

    def connect(self, host: str):
        if self.connection:
            return # Already connected
        try:
            self.connection = ThalesRemoteConnection()
            self.connection.connectToTerm(host)
            self.wrapper = ThalesRemoteScriptWrapper(self.connection)
            self.wrapper.forceThalesIntoRemoteScript()
            self.wrapper.calibrateOffsets()
            print(f"[System] Connected to Zahner at {host}")
        except Exception as e:
            self.connection = None
            self.wrapper = None
            raise Exception(f"Connection failed: {str(e)}")

    def disconnect(self):
        if self.connection:
            try:
                self.connection.disconnectFromTerm()
            except:
                pass
        self.connection = None
        self.wrapper = None
        print("[System] Disconnected")

    def get_wrapper(self) -> ThalesRemoteScriptWrapper:
        if not self.wrapper:
            raise HTTPException(status_code=400, detail="Device not connected")
        return self.wrapper

class WebSocketManager:
    """管理 WebSocket 连接与广播"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WS] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        data_str = json.dumps(message)
        # 广播给所有客户端
        for connection in self.active_connections:
            try:
                await connection.send_text(data_str)
            except Exception:
                # 发送失败通常意味着连接断开，稍后由 disconnect 处理
                pass

device_manager = DeviceManager()
ws_manager = WebSocketManager()

# ==========================================
# 3. 核心桥接器 (Sync Logic -> Async Stream)
# ==========================================

def get_stream_callback():
    """
    生成一个回调函数。
    当同步的 logic.py 调用这个函数时，数据会被放入 asyncio 循环中通过 WS 发送。
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None

    def callback(data: dict):
        # 将 t/v/i 数据直接推送到 WS
        asyncio.run_coroutine_threadsafe(ws_manager.broadcast(data), loop)

    return callback

# ==========================================
# 4. 数据模型 (Pydantic Models)
# ==========================================

class ConnectRequest(BaseModel):
    host: str = "localhost"

class MeasureRequest(BaseModel):
    measurement_type: str
    parameters: Dict[str, Any] = {}

# ==========================================
# 5. API 路由
# ==========================================

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "device_connected": device_manager.wrapper is not None
    }

@app.get("/status")
def get_device_status():
    return {
        "connected": device_manager.wrapper is not None,
        "active_clients": len(ws_manager.active_connections)
    }

@app.post("/connect")
def connect_device(req: ConnectRequest):
    try:
        device_manager.connect(req.host)
        return {"status": "success", "message": f"Connected to {req.host}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/disconnect")
def disconnect_device():
    device_manager.disconnect()
    return {"status": "success"}

@app.post("/measure")
async def execute_measurement(req: MeasureRequest):
    """
    统一测量入口：
    1. 解析类型
    2. 获取设备实例
    3. 准备 WS 回调
    4. 将阻塞操作扔到线程池 (run_in_threadpool)
    """
    wrapper = device_manager.get_wrapper()
    m_type = req.measurement_type
    params = req.parameters
    
    # 获取用于流式传输的回调函数
    stream_cb = get_stream_callback()
    
    print(f"[API] Request: {m_type}")

    try:
        # ==========================================
        # 核心调度逻辑：将 API 请求映射到 Logic 函数
        # ==========================================
        
        if m_type == "ocp" or m_type == "open_circuit_potential":
            result = await run_in_threadpool(
                logic.measure_ocp, 
                wrapper, params, stream_cb
            )

        # ------------------------------------------
        # 计时类 (CA / CP)
        # ------------------------------------------
        elif m_type == "chronoamperometry":
            result = await run_in_threadpool(
                logic.measure_chrono,
                wrapper, params, "potentiostatic", stream_cb
            )
        elif m_type == "chronopotentiometry":
            result = await run_in_threadpool(
                logic.measure_chrono,
                wrapper, params, "galvanostatic", stream_cb
            )

        # ------------------------------------------
        # 扫描类 (LSV / CV / Ramp)
        # ------------------------------------------
        elif m_type in ["voltage_ramp", "lsv", "linear_sweep_voltammetry"]:
            result = await run_in_threadpool(
                logic.measure_ramp,
                wrapper, params, "potentiostatic", stream_cb
            )
        elif m_type == "current_ramp":
            result = await run_in_threadpool(
                logic.measure_ramp,
                wrapper, params, "galvanostatic", stream_cb
            )

        # ------------------------------------------
        # EIS 类 (不走 Stream，只生成文件)
        # ------------------------------------------
        elif m_type == "eis_potentiostatic":
            result = await run_in_threadpool(
                logic.measure_eis,
                wrapper, params, "potentiostatic"
            )
        elif m_type == "eis_galvanostatic":
            result = await run_in_threadpool(
                logic.measure_eis,
                wrapper, params, "galvanostatic"
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unknown measurement type: {m_type}")

        return {"status": "success", "result": result}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "error": str(e)}

# ==========================================
# 6. WebSocket 路由
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # 必须 await receive 才能保持连接活跃
            # 虽然我们目前只发送不接收，但未来可以扩展接收 "STOP" 指令
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS] Error: {e}")
        ws_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    # 启动服务，0.0.0.0 允许局域网访问
    uvicorn.run(app, host="0.0.0.0", port=8000)