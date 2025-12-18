#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MFC 设备模拟器 - 用于无硬件环境下的工作流测试

端口: 8013 (与真实设备8010区分)
功能: 模拟 MFC (Mass Flow Controller) 的所有功能
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, List
import time
import random
import threading
import uuid
from datetime import datetime

app = FastAPI(title="MFC Simulator Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 模拟 MFC 设备
# ==========================================

class SimulatedMfcDevice:
    """模拟单个 MFC 设备"""
    
    def __init__(self, address: int, gas_type: str, max_flow_sccm: int):
        self.address = address
        self.gas_type = gas_type
        self.max_flow_sccm = max_flow_sccm
        self.setpoint_sccm = 0.0
        self.flow_sccm = 0.0
        self.last_communication = datetime.now().isoformat()
    
    def update_flow(self, dt: float):
        """更新实际流量（模拟响应延迟）"""
        diff = self.setpoint_sccm - self.flow_sccm
        if abs(diff) > 0.1:
            # 流量逐渐趋向设定值，响应时间约2秒
            self.flow_sccm += diff * min(1.0, dt * 0.5)
        else:
            self.flow_sccm = self.setpoint_sccm
        
        # 添加小幅度噪声
        if self.flow_sccm > 0:
            self.flow_sccm += random.gauss(0, self.max_flow_sccm * 0.001)
            self.flow_sccm = max(0, min(self.max_flow_sccm, self.flow_sccm))

class MfcSimulator:
    """MFC 模拟器管理器"""
    
    def __init__(self):
        self.connected = False
        self.connection_id: Optional[str] = None
        self.devices: Dict[int, SimulatedMfcDevice] = {}
        self.comm_logs: List[Dict] = []
        
        # 预定义的模拟设备
        self.preset_devices = [
            {"address": 32, "gas_type": "N2", "max_flow_sccm": 200},
            {"address": 33, "gas_type": "O2", "max_flow_sccm": 100},
            {"address": 34, "gas_type": "Ar", "max_flow_sccm": 500},
            {"address": 35, "gas_type": "H2", "max_flow_sccm": 50},
        ]
        
        # 后台线程
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
    
    def start_simulation(self):
        """启动后台模拟线程"""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()
    
    def stop_simulation(self):
        """停止模拟"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
    
    def _simulation_loop(self):
        """后台流量模拟循环"""
        last_time = time.time()
        
        while self._running:
            now = time.time()
            dt = now - last_time
            last_time = now
            
            with self._lock:
                for device in self.devices.values():
                    device.update_flow(dt)
            
            time.sleep(0.2)  # 200ms 更新一次
    
    def add_log(self, direction: str, data: str):
        """添加通信日志"""
        entry = {
            'timestamp': datetime.now().strftime('%H:%M:%S.%f')[:-3],
            'direction': direction,
            'data': data,
            'connection_id': self.connection_id
        }
        with self._lock:
            self.comm_logs.append(entry)
            if len(self.comm_logs) > 500:
                self.comm_logs.pop(0)

# 全局实例
mfc = MfcSimulator()

# ==========================================
# 响应封装
# ==========================================

def success_response(data: dict) -> dict:
    return {"ok": True, "timestamp": datetime.now().isoformat(), **data}

def error_response(message: str, category: str = "SYSTEM") -> dict:
    return {"ok": False, "error_message": message, "error_category": category, "timestamp": datetime.now().isoformat()}

# ==========================================
# 数据模型
# ==========================================

class ConnectRequest(BaseModel):
    port: str = "COM_SIMULATOR"
    baudrate: int = 19200
    timeout: float = 1.0

class ScanRequest(BaseModel):
    address: int

class SetpointRequest(BaseModel):
    address: int
    sccm: float

# ==========================================
# API 路由
# ==========================================

@app.get("/health")
def health():
    return {"status": "ok", "mode": "simulator", "connected": mfc.connected}

@app.get("/ports")
def ports():
    return ["COM_SIMULATOR", "COM1", "COM2", "COM3"]

@app.post("/connect")
def connect_device(req: ConnectRequest):
    mfc.connected = True
    mfc.connection_id = str(uuid.uuid4())
    mfc.start_simulation()
    mfc.add_log('CONNECT', f'Connected to {req.port} (simulator)')
    print(f"[MFC Simulator] Connected (port={req.port})")
    return success_response({"connection_id": mfc.connection_id, "connected": True, "mode": "simulator"})

@app.post("/disconnect")
def disconnect_device():
    mfc.connected = False
    mfc.stop_simulation()
    mfc.devices.clear()
    mfc.add_log('DISCONNECT', 'Disconnected')
    print("[MFC Simulator] Disconnected")
    return success_response({"success": True})

@app.post("/scan")
def scan(req: ScanRequest):
    """扫描单个地址"""
    if not mfc.connected:
        return JSONResponse(status_code=503, content=error_response("Not connected", "DEVICE"))
    
    mfc.add_log('TX', f'SCAN address={req.address}')
    
    # 检查是否在预设设备列表中
    preset = next((d for d in mfc.preset_devices if d["address"] == req.address), None)
    
    if preset:
        # 创建或更新设备
        with mfc._lock:
            if req.address not in mfc.devices:
                mfc.devices[req.address] = SimulatedMfcDevice(
                    address=preset["address"],
                    gas_type=preset["gas_type"],
                    max_flow_sccm=preset["max_flow_sccm"]
                )
        
        mfc.add_log('RX', f'FOUND device at {req.address}')
        print(f"[MFC Simulator] Found device at address {req.address}: {preset['gas_type']} {preset['max_flow_sccm']}sccm")
        
        return success_response({
            "found": True,
            "device": {
                "device_address": preset["address"],
                "gas_type": preset["gas_type"],
                "max_flow_sccm": preset["max_flow_sccm"]
            }
        })
    else:
        mfc.add_log('RX', f'No device at {req.address}')
        return success_response({"found": False, "device": None})

@app.get("/status")
def status(address: int = Query(...)):
    """获取设备状态"""
    if not mfc.connected:
        return JSONResponse(status_code=503, content=error_response("Not connected", "DEVICE"))
    
    with mfc._lock:
        device = mfc.devices.get(address)
        if not device:
            return JSONResponse(status_code=404, content=error_response(f"Device {address} not found", "DEVICE"))
        
        device.last_communication = datetime.now().isoformat()
        
        return success_response({
            "device_address": device.address,
            "flow_percent": round(device.flow_sccm / device.max_flow_sccm * 100, 2) if device.max_flow_sccm > 0 else 0,
            "flow_sccm": round(device.flow_sccm, 2),
            "setpoint_sccm": round(device.setpoint_sccm, 2),
            "gas_type": device.gas_type,
            "max_flow_sccm": device.max_flow_sccm,
            "connection_status": "connected",
            "last_communication": device.last_communication
        })

@app.post("/setpoint")
def setpoint(req: SetpointRequest):
    """设置流量"""
    if not mfc.connected:
        return JSONResponse(status_code=503, content=error_response("Not connected", "DEVICE"))
    
    with mfc._lock:
        device = mfc.devices.get(req.address)
        if not device:
            return JSONResponse(status_code=404, content=error_response(f"Device {req.address} not found", "DEVICE"))
        
        old_setpoint = device.setpoint_sccm
        device.setpoint_sccm = max(0, min(device.max_flow_sccm, req.sccm))
        device.last_communication = datetime.now().isoformat()
    
    mfc.add_log('TX', f'SETPOINT addr={req.address} sccm={req.sccm}')
    print(f"[MFC Simulator] Device {req.address} setpoint: {old_setpoint} -> {device.setpoint_sccm} sccm")
    
    return success_response({
        "sccm": device.setpoint_sccm,
        "percent": round(device.setpoint_sccm / device.max_flow_sccm * 100, 2) if device.max_flow_sccm > 0 else 0
    })

@app.get("/gas-name")
def gas_name(address: int = Query(...)):
    """读取气体名称"""
    if not mfc.connected:
        return JSONResponse(status_code=503, content=error_response("Not connected", "DEVICE"))
    
    with mfc._lock:
        device = mfc.devices.get(address)
        if not device:
            return success_response({"gas_name": "Unknown", "device_address": address})
        
        return success_response({"gas_name": device.gas_type, "device_address": address})

@app.get("/active-setpoint")
def active_setpoint(address: int = Query(...)):
    """读取当前设定点"""
    if not mfc.connected:
        return JSONResponse(status_code=503, content=error_response("Not connected", "DEVICE"))
    
    with mfc._lock:
        device = mfc.devices.get(address)
        if not device:
            return JSONResponse(status_code=404, content=error_response(f"Device {address} not found", "DEVICE"))
        
        return success_response({
            "active_setpoint_sccm": device.setpoint_sccm,
            "active_setpoint_percent": round(device.setpoint_sccm / device.max_flow_sccm * 100, 2) if device.max_flow_sccm > 0 else 0,
            "device_address": address
        })

@app.get("/comm-log")
def get_logs():
    """获取通信日志"""
    with mfc._lock:
        return success_response({"logs": list(reversed(mfc.comm_logs))})

@app.delete("/comm-log")
def clear_logs():
    """清除通信日志"""
    with mfc._lock:
        mfc.comm_logs.clear()
    return success_response({"success": True})

@app.get("/connection/info")
def connection_info():
    """获取连接信息"""
    return success_response({
        "connected": mfc.connected,
        "connection_id": mfc.connection_id,
        "device_count": len(mfc.devices),
        "mode": "simulator"
    })

# ==========================================
# 启动入口
# ==========================================

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("MFC Simulator Service")
    print("Port: 8013 | Mode: Simulator")
    print("Preset devices: 32(N2), 33(O2), 34(Ar), 35(H2)")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8013)
