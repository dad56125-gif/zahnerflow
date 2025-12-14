#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import time
import statistics
import csv
import os
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
        # 验证现有连接是否真的在线
        if self.connection:
            if self.connection.isConnectedToTerm():
                print(f"[System] Already connected to Zahner")
                return  # 真的已连接
            else:
                # 连接已失效，清理后重连
                print(f"[System] Previous connection invalid, reconnecting...")
                self.connection = None
                self.wrapper = None

        try:
            self.connection = ThalesRemoteConnection()
            success = self.connection.connectToTerm(host)
            if not success:
                self.connection = None
                raise Exception("connectToTerm() returned False - connection rejected")

            # 二次验证连接状态
            if not self.connection.isConnectedToTerm():
                self.connection = None
                raise Exception("isConnectedToTerm() returned False after connect")

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
# 辅助函数：计算CSV文件的统计信息
# ==========================================
def calculate_stats(file_path: str) -> Dict[str, Any]:
    """读取CSV文件并计算统计信息"""
    vals = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # 尝试获取 current 或 potential
                val = row.get('current') or row.get('potential')
                if val:
                    vals.append(float(val))
        if not vals:
            return {}
        return {
            "avg": statistics.mean(vals),
            "min": min(vals),
            "max": max(vals),
            "count": len(vals)
        }
    except Exception as e:
        print(f"[Stats] Error calculating stats: {e}")
        return {}

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
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/disconnect")
def disconnect_device():
    device_manager.disconnect()
    return {"status": "success"}

@app.post("/measure")
async def execute_measurement(req: MeasureRequest):
    """
    统一测量入口（适配器模式）：
    1. 参数清洗和默认值填充
    2. 类型转换和验证
    3. 调用 Logic 层
    4. 结果增强（统计信息等）
    """
    wrapper = device_manager.get_wrapper()
    m_type = req.measurement_type
    raw_params = req.parameters  # 原始参数字典

    # 获取用于流式传输的回调函数
    stream_cb = get_stream_callback()

    # 【日志】设备层 API 接收的测量参数
    print(f"[设备层 Zahner] 接收测量参数 - 测量类型: {m_type}")
    print(f"[设备层 Zahner] 原始参数: {raw_params}")

    # ====================================================
    # 适配器层 1: 默认值配置表
    # ====================================================
    DEFAULTS = {
        "common": {
            "output_path": "c:/zahner_data",
            "filename": "measurement",
            "measurement_duration": 60.0,
            "sampling_interval": 1.0
        },
        "chronoamperometry": {
            "polarization_voltage": 1.0,  # 恢复为 1.0V
            "min_current": -1.0,
            "max_current": 1.0
        },
        "chronopotentiometry": {
            "polarization_current": 0.01,  # 恢复为 10mA
            "min_voltage": -4.0,
            "max_voltage": 4.0
        },
        "voltage_ramp": {
            "start_voltage": 0.0,
            "end_voltage": 1.0,
            "scan_rate": 0.01
        },
        "current_ramp": {
            "start_current": 0.0,
            "end_current": 0.01,
            "scan_rate": 0.0001
        },
        "eis_potentiostatic": {
            "potential": 0.0,
            "start_frequency": 100000.0,
            "end_frequency": 0.1,
            "points_per_decade": 10
        },
        "eis_galvanostatic": {
            "current": 0.01,
            "start_frequency": 100000.0,
            "end_frequency": 0.1,
            "points_per_decade": 10
        }
    }

    # ====================================================
    # 适配器层 2: 参数合并（用户 > 特定类型 > 通用）
    # ====================================================
    final_params = DEFAULTS["common"].copy()
    if m_type in DEFAULTS:
        final_params.update(DEFAULTS[m_type])
    final_params.update(raw_params)  # 用户传入的参数优先级最高

    # 【日志】适配器处理后的最终参数
    print(f"[设备层 Zahner] 最终参数 - 测量类型: {m_type}")
    print(f"[设备层 Zahner] 最终参数字典: {final_params}")

    # ====================================================
    # 适配器层 3: 类型转换和简单验证
    # ====================================================
    for k, v in final_params.items():
        if k in [
            "polarization_voltage", "polarization_current",
            "measurement_duration", "sampling_interval",
            "min_current", "max_current", "min_voltage", "max_voltage",
            "start_voltage", "end_voltage", "scan_rate",
            "start_current", "end_current", "potential", "current",
            "start_frequency", "end_frequency"
        ]:
            try:
                final_params[k] = float(v)
            except (ValueError, TypeError):
                print(f"[Adapter] Warning: Could not convert {k} to float, keeping original value")

        if k in ["points_per_decade"]:
            try:
                final_params[k] = int(v)
            except (ValueError, TypeError):
                print(f"[Adapter] Warning: Could not convert {k} to int, keeping original value")

    try:
        # ====================================================
        # 核心调度逻辑：将适配后的参数映射到 Logic 函数
        # ====================================================

        if m_type == "ocp" or m_type == "open_circuit_potential" or m_type == "ocp_measurement":
            result = await run_in_threadpool(
                logic.measure_ocp,
                wrapper, final_params, stream_cb
            )

        # ------------------------------------------
        # 计时类 (CA / CP)
        # ------------------------------------------
        elif m_type == "chronoamperometry":
            result = await run_in_threadpool(
                logic.measure_chrono,
                wrapper, final_params, "potentiostatic", stream_cb
            )
        elif m_type == "chronopotentiometry":
            result = await run_in_threadpool(
                logic.measure_chrono,
                wrapper, final_params, "galvanostatic", stream_cb
            )

        # ------------------------------------------
        # 扫描类 (LSV / CV / Ramp)
        # ------------------------------------------
        elif m_type == "voltage_ramp":
            result = await run_in_threadpool(
                logic.measure_ramp,
                wrapper, final_params, "potentiostatic", stream_cb
            )
        elif m_type == "current_ramp":
            result = await run_in_threadpool(
                logic.measure_ramp,
                wrapper, final_params, "galvanostatic", stream_cb
            )

        # ------------------------------------------
        # EIS 类 (不走 Stream，只生成文件)
        # ------------------------------------------
        elif m_type == "eis_potentiostatic":
            result = await run_in_threadpool(
                logic.measure_eis,
                wrapper, final_params, "potentiostatic"
            )
        elif m_type == "eis_galvanostatic":
            result = await run_in_threadpool(
                logic.measure_eis,
                wrapper, final_params, "galvanostatic"
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unknown measurement type: {m_type}")

        # ====================================================
        # 适配器层 4: 结果增强（Result Enrichment）
        # ====================================================
        # 如果结果包含输出文件，计算统计信息
        if isinstance(result, dict) and "output_file" in result and os.path.exists(result["output_file"]):
            stats = await run_in_threadpool(calculate_stats, result["output_file"])
            if stats:
                result["statistics"] = stats
                print(f"[Adapter] Statistics calculated and added to result")

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