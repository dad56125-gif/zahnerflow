#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zahner 设备模拟器 - 用于无硬件环境下的工作流测试

端口: 8001 (与真实设备8000区分)
功能: 模拟所有测量类型，生成占位文件，推送流式数据
"""

import sys
import asyncio

# Windows 下使用 SelectorEventLoop 避免 ProactorEventLoop 资源限制问题
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import json
import time
import os
import csv
import random
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Zahner Simulator Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 模拟电池模型 (简化版)
# ==========================================

class BatteryModel:
    """简化的电池模型"""
    
    def __init__(self):
        self.ocv = 3.7           # 开路电压 (V)
        self.r_total = 0.15      # 总内阻 (Ω)
        self.noise = 0.001       # 噪声幅度
        self.soc = 0.5           # 荷电状态 (0-1)
        
    def get_voltage(self, current: float) -> float:
        """给定电流计算电压"""
        v = self.ocv - current * self.r_total + (self.soc - 0.5) * 0.4
        return v + random.gauss(0, self.noise)
    
    def get_current(self, voltage: float) -> float:
        """给定电压计算电流"""
        i = (self.ocv + (self.soc - 0.5) * 0.4 - voltage) / self.r_total
        return i + random.gauss(0, self.noise * 10)

# 全局状态
battery = BatteryModel()
ws_connections: List[WebSocket] = []
is_connected = False

# ==========================================
# WebSocket 广播
# ==========================================

async def broadcast(data: dict):
    if not ws_connections:
        return
    msg = json.dumps(data)
    dead_connections = []
    for ws in list(ws_connections):
        try:
            await ws.send_text(msg)
        except Exception:
            dead_connections.append(ws)
    # 清理失效连接
    for ws in dead_connections:
        if ws in ws_connections:
            ws_connections.remove(ws)

# ==========================================
# 文件生成工具
# ==========================================

def generate_placeholder_csv(filepath: str, headers: List[str], rows: int = 10):
    """生成占位CSV文件 (< 10KB)"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for i in range(rows):
            row = [round(random.uniform(0, 1), 6) for _ in headers]
            row[0] = i  # 第一列为序号/时间
            writer.writerow(row)
    print(f"[Simulator] Generated: {filepath}")

def generate_placeholder_ism(filepath: str):
    """生成占位ISM文件 (Zahner EIS格式)"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    content = """# Zahner Simulator ISM File
# This is a placeholder file for testing purposes
# Measurement Type: EIS
# Points: 10
# Simulated: True

Frequency/Hz   Z_Real/Ohm   Z_Imag/Ohm
100000.0       0.050        -0.001
10000.0        0.052        -0.005
1000.0         0.060        -0.020
100.0          0.080        -0.050
10.0           0.120        -0.080
1.0            0.150        -0.040
0.1            0.155        -0.010
"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"[Simulator] Generated: {filepath}")

# ==========================================
# API 路由
# ==========================================

@app.get("/health")
def health_check():
    return {"status": "healthy", "device_connected": is_connected, "mode": "simulator"}

@app.get("/status")
def get_status():
    return {
        "connected": is_connected,
        "mode": "simulator",
        "active_clients": len(ws_connections),
        "battery_model": {"ocv": battery.ocv, "r_total": battery.r_total, "soc": battery.soc}
    }

class ConnectRequest(BaseModel):
    host: str = "localhost"

@app.post("/connect")
def connect_device(req: ConnectRequest):
    global is_connected
    is_connected = True
    print(f"[Simulator] Connected (simulating {req.host})")
    return {"status": "success", "message": f"Simulator connected (host={req.host})"}

@app.post("/disconnect")
def disconnect_device():
    global is_connected
    is_connected = False
    print("[Simulator] Disconnected")
    return {"status": "success"}

class ConfigureRequest(BaseModel):
    ocv: Optional[float] = None
    r_total: Optional[float] = None
    soc: Optional[float] = None

@app.post("/configure")
def configure_battery(req: ConfigureRequest):
    """配置模拟电池参数"""
    if req.ocv is not None: battery.ocv = req.ocv
    if req.r_total is not None: battery.r_total = req.r_total
    if req.soc is not None: battery.soc = req.soc
    return {"status": "success", "battery_model": {"ocv": battery.ocv, "r_total": battery.r_total, "soc": battery.soc}}

class MeasureRequest(BaseModel):
    measurement_type: str
    parameters: Dict[str, Any] = {}

@app.post("/measure")
async def execute_measurement(req: MeasureRequest):
    """模拟测量执行"""
    m_type = req.measurement_type
    params = req.parameters
    
    print(f"[Simulator] Measurement: {m_type}, params: {list(params.keys())}")
    
    # 加速因子 (默认10倍速)
    speed = params.get("simulator_speed", 10)
    
    try:
        if m_type in ["ocp", "ocp_measurement"]:
            return await sim_ocp(params, speed)
        elif m_type == "chronoamperometry":
            return await sim_chrono_potentiostatic(params, speed)
        elif m_type == "chronopotentiometry":
            return await sim_chrono_galvanostatic(params, speed)
        elif m_type == "voltage_ramp":
            return await sim_voltage_ramp(params, speed)
        elif m_type == "current_ramp":
            return await sim_current_ramp(params, speed)
        elif m_type in ["eis_potentiostatic", "eis_galvanostatic"]:
            return await sim_eis(params, m_type)
        else:
            return {"status": "error", "error": f"Unknown measurement type: {m_type}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

# ==========================================
# 模拟测量实现
# ==========================================

async def sim_ocp(params: dict, speed: float):
    """模拟OCP测量"""
    duration = float(params.get("measurement_duration", 60)) / speed
    interval = max(0.1, float(params.get("sampling_interval", 1)) / speed)
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    
    # 生成占位文件
    filepath = os.path.join(output_path, f"OCP_sim_{int(time.time())}.csv")
    generate_placeholder_csv(filepath, ["time", "potential"], rows=min(20, int(duration/interval)))
    
    # 流式推送
    start = time.time()
    points = 0
    while time.time() - start < duration:
        t = (time.time() - start) * speed
        v = battery.ocv + random.gauss(0, 0.002)
        await broadcast({"t": round(t, 3), "v": round(v, 6), "i": 0})
        points += 1
        await asyncio.sleep(interval)
    
    return {"status": "success", "result": {"output_file": filepath, "data_points": points, "simulated": True}}

async def sim_chrono_potentiostatic(params: dict, speed: float):
    """模拟计时安培法"""
    duration = float(params.get("measurement_duration", 60)) / speed
    interval = max(0.1, float(params.get("sampling_interval", 1)) / speed)
    voltage = float(params.get("polarization_voltage", 1.0))
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    
    filepath = os.path.join(output_path, f"CA_sim_{int(time.time())}.csv")
    generate_placeholder_csv(filepath, ["time", "potential", "current"], rows=min(20, int(duration/interval)))
    
    start = time.time()
    points = 0
    while time.time() - start < duration:
        t = (time.time() - start) * speed
        i = battery.get_current(voltage)
        await broadcast({"t": round(t, 3), "v": voltage, "i": round(i, 9)})
        points += 1
        await asyncio.sleep(interval)
    
    return {"status": "success", "result": {"output_file": filepath, "data_points": points, "setpoint": voltage, "simulated": True}}

async def sim_chrono_galvanostatic(params: dict, speed: float):
    """模拟计时电位法"""
    duration = float(params.get("measurement_duration", 60)) / speed
    interval = max(0.1, float(params.get("sampling_interval", 1)) / speed)
    current = float(params.get("polarization_current", 0.01))
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    
    filepath = os.path.join(output_path, f"CP_sim_{int(time.time())}.csv")
    generate_placeholder_csv(filepath, ["time", "potential", "current"], rows=min(20, int(duration/interval)))
    
    start = time.time()
    points = 0
    while time.time() - start < duration:
        t = (time.time() - start) * speed
        v = battery.get_voltage(current)
        await broadcast({"t": round(t, 3), "v": round(v, 6), "i": current})
        points += 1
        await asyncio.sleep(interval)
    
    return {"status": "success", "result": {"output_file": filepath, "data_points": points, "setpoint": current, "simulated": True}}

async def sim_voltage_ramp(params: dict, speed: float):
    """模拟电压斜坡"""
    duration = float(params.get("measurement_duration", 60)) / speed
    interval = max(0.1, float(params.get("sampling_interval", 1)) / speed)
    start_v = float(params.get("start_voltage", 0))
    end_v = float(params.get("end_voltage", 1))
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    
    filepath = os.path.join(output_path, f"LSV_sim_{int(time.time())}.csv")
    generate_placeholder_csv(filepath, ["time", "voltage", "current", "setpoint"], rows=min(20, int(duration/interval)))
    
    slope = (end_v - start_v) / (duration * speed)
    start = time.time()
    points = 0
    while time.time() - start < duration:
        t = (time.time() - start) * speed
        v = start_v + slope * t
        i = battery.get_current(v)
        await broadcast({"t": round(t, 3), "v": round(v, 6), "i": round(i, 9)})
        points += 1
        await asyncio.sleep(interval)
    
    return {"status": "success", "result": {"output_file": filepath, "data_points": points, "scan_rate": slope, "simulated": True}}

async def sim_current_ramp(params: dict, speed: float):
    """模拟电流斜坡"""
    duration = float(params.get("measurement_duration", 60)) / speed
    interval = max(0.1, float(params.get("sampling_interval", 1)) / speed)
    start_i = float(params.get("start_current", 0))
    end_i = float(params.get("end_current", 0.01))
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    
    filepath = os.path.join(output_path, f"GSV_sim_{int(time.time())}.csv")
    generate_placeholder_csv(filepath, ["time", "voltage", "current", "setpoint"], rows=min(20, int(duration/interval)))
    
    slope = (end_i - start_i) / (duration * speed)
    start = time.time()
    points = 0
    while time.time() - start < duration:
        t = (time.time() - start) * speed
        i = start_i + slope * t
        v = battery.get_voltage(i)
        await broadcast({"t": round(t, 3), "v": round(v, 6), "i": round(i, 9)})
        points += 1
        await asyncio.sleep(interval)
    
    return {"status": "success", "result": {"output_file": filepath, "data_points": points, "scan_rate": slope, "simulated": True}}

async def sim_eis(params: dict, mode: str):
    """模拟EIS测量 (直接生成占位文件，无复杂计算)"""
    output_path = params.get("output_path", "c:/zahner_data/simulator")
    filename = f"EIS_sim_{int(time.time())}"
    
    ism_path = os.path.join(output_path, f"{filename}.ism")
    csv_path = os.path.join(output_path, f"{filename}.csv")
    
    generate_placeholder_ism(ism_path)
    generate_placeholder_csv(csv_path, ["frequency", "z_real", "z_imag"], rows=10)
    
    # 模拟短暂延迟
    await asyncio.sleep(0.5)
    
    return {"status": "success", "result": {
        "output_path": output_path,
        "filename": filename,
        "full_path": ism_path,
        "csv_path": csv_path,
        "simulated": True
    }}

# ==========================================
# WebSocket 路由
# ==========================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_connections.append(websocket)
    print(f"[Simulator WS] Client connected. Total: {len(ws_connections)}")
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass  # 正常断开
    except Exception as e:
        print(f"[Simulator WS] Error: {e}")
    finally:
        # 确保从连接列表中移除
        if websocket in ws_connections:
            ws_connections.remove(websocket)
        try:
            await websocket.close()
        except:
            pass
        print(f"[Simulator WS] Client disconnected. Total: {len(ws_connections)}")

# ==========================================
# 启动入口
# ==========================================

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("Zahner Simulator Service")
    print("Port: 8001 | Mode: Simulator | Speed: 10x default")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8001)
