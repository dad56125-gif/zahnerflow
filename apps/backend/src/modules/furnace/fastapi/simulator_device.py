#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Furnace 设备模拟器 - 用于无硬件环境下的工作流测试

端口: 8012 (与真实设备8011区分)
功能: 模拟 AI-518P 温控器的所有功能
"""

import sys
import asyncio

# Windows 下使用 SelectorEventLoop 避免 ProactorEventLoop 资源限制问题
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import time
import random
import threading

app = FastAPI(title="Furnace Simulator Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 模拟温控器模型
# ==========================================

class FurnaceSimulator:
    """模拟 AI-518P 温控器"""
    
    def __init__(self):
        self.connected = False
        self.pv = 25.0           # 当前温度 (Process Value)
        self.sv = 25.0           # 设定温度 (Set Value)
        self.mv = 0              # 控制输出 (-100 ~ 100)
        self.status_code = 12    # 0=Run, 4=Pause, 12=Stop
        self.current_segment = 1
        self.segment_time = 0    # 当前段已运行时间（分钟）
        self.segment_time_set = 0  # 当前段设定时间
        
        # 程序段数据 (30段，支持 autoTemperatureControl 使用的段28-30)
        self.segments: List[Dict] = [
            {"id": i, "temperature": 25.0, "time": 0} for i in range(1, 31)
        ]
        
        # 温度变化速率 (℃/秒)
        self.heating_rate = 0.5
        self.cooling_rate = 0.3
        
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
        """
        后台温度模拟循环
        
        程序段运行逻辑：
        - 段 N 的温度 C(N) 是起点
        - 段 N+1 的温度 C(N+1) 是终点  
        - 在段 N 的时间 T(N) 内，温度从 C(N) 线性变化到 C(N+1)
        - 当 T(N) = 0 时，程序结束
        """
        last_time = time.time()
        
        while self._running:
            now = time.time()
            dt = now - last_time
            last_time = now
            
            with self._lock:
                if self.connected and self.status_code == 0:  # Running
                    seg_idx = self.current_segment - 1  # 0-indexed
                    
                    # 检查段索引有效性
                    if seg_idx < 0 or seg_idx >= 29:  # 最多到段29，因为需要读取下一段
                        self.status_code = 12  # Stop
                        continue
                    
                    # 获取当前段和下一段的数据
                    current_seg = self.segments[seg_idx]
                    next_seg = self.segments[seg_idx + 1]
                    
                    start_temp = current_seg["temperature"]  # C(N) - 起点温度
                    end_temp = next_seg["temperature"]       # C(N+1) - 终点温度
                    seg_duration = current_seg["time"]       # T(N) - 段持续时间（分钟）
                    
                    # 更新段设定时间
                    self.segment_time_set = seg_duration
                    
                    # 如果当前段时间为0，程序结束
                    if seg_duration <= 0:
                        self.status_code = 12  # Stop
                        print(f"[Furnace Simulator] Segment {self.current_segment} time=0, program ended")
                        continue
                    
                    # 计算目标温度（根据时间进度线性插值）
                    progress = min(1.0, self.segment_time / seg_duration)
                    target_temp = start_temp + (end_temp - start_temp) * progress
                    
                    # 更新 SV 为当前目标温度
                    self.sv = round(target_temp, 1)
                    
                    # 温度逐渐趋向目标（模拟温控器响应）
                    diff = target_temp - self.pv
                    if abs(diff) > 0.05:
                        if diff > 0:
                            # 加热
                            self.pv += min(self.heating_rate * dt, diff)
                            self.mv = min(100.0, max(0, abs(diff) * 3))
                        else:
                            # 冷却
                            self.pv += max(-self.cooling_rate * dt, diff)
                            self.mv = 0  # 自然冷却，无加热
                    else:
                        self.pv = target_temp
                        self.mv = 5.0  # 保温微调
                    
                    # 添加小幅度噪声
                    self.pv += random.gauss(0, 0.02)
                    
                    # 更新段时间
                    self.segment_time += dt / 60  # 转换为分钟
                    
                    # 检查是否需要切换到下一段
                    if self.segment_time >= seg_duration:
                        # 检查下一段的时间
                        if seg_idx + 1 < 29:  # 还有下一段
                            next_next_seg_time = self.segments[seg_idx + 2]["time"]
                            if self.segments[seg_idx + 1]["time"] > 0:
                                # 切换到下一段
                                self.current_segment += 1
                                self.segment_time = 0
                                print(f"[Furnace Simulator] Advanced to segment {self.current_segment}")
                            else:
                                # 下一段时间为0，程序结束
                                self.status_code = 12
                                print(f"[Furnace Simulator] Program completed at segment {self.current_segment}")
                        else:
                            # 已是最后一段
                            self.status_code = 12
                            print("[Furnace Simulator] Program completed (last segment)")
            
            time.sleep(0.5)  # 0.5秒更新一次

# 全局实例
furnace = FurnaceSimulator()

# ==========================================
# 数据模型
# ==========================================

class ConnectRequest(BaseModel):
    port: str = "COM_SIMULATOR"
    baudrate: int = 9600
    address: int = 1
    stopbits: int = 2
    timeout: float = 1.0

class ParameterRequest(BaseModel):
    code: int
    value: int

class SegmentRequest(BaseModel):
    segment: int

# ==========================================
# API 路由
# ==========================================

@app.get("/health")
def health():
    return {"status": "ok", "mode": "simulator", "connected": furnace.connected}

@app.get("/ports")
def ports():
    return ["COM_SIMULATOR", "COM1", "COM2", "COM3"]

@app.post("/connect")
def connect(req: ConnectRequest):
    furnace.connected = True
    furnace.start_simulation()
    print(f"[Furnace Simulator] Connected (port={req.port})")
    return {"status": "connected", "mode": "simulator"}

@app.post("/disconnect")
def disconnect():
    furnace.connected = False
    furnace.stop_simulation()
    print("[Furnace Simulator] Disconnected")
    return {"status": "disconnected"}

@app.get("/status")
def status():
    """读取当前状态"""
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    with furnace._lock:
        seg_time_set = 0
        if 1 <= furnace.current_segment <= 30:
            seg_time_set = furnace.segments[furnace.current_segment - 1]["time"]
        
        return {
            "pv": round(furnace.pv, 1),
            "sv": round(furnace.sv, 1),
            "mv": furnace.mv,
            "status_code": furnace.status_code,
            "segment": furnace.current_segment,
            "segment_time": int(furnace.segment_time),
            "segment_time_set": seg_time_set,
            "timestamp": time.time(),
            "mode": "simulator"
        }

@app.post("/run")
def run():
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    with furnace._lock:
        furnace.status_code = 0
        furnace.segment_time = 0
    print("[Furnace Simulator] RUN")
    return {"pv": furnace.pv, "sv": furnace.sv, "mv": furnace.mv, "status_code": 0}

@app.post("/pause")
def pause():
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    with furnace._lock:
        furnace.status_code = 4
    print("[Furnace Simulator] PAUSE")
    return {"pv": furnace.pv, "sv": furnace.sv, "mv": furnace.mv, "status_code": 4}

@app.post("/stop")
def stop():
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    with furnace._lock:
        furnace.status_code = 12
    print("[Furnace Simulator] STOP")
    return {"pv": furnace.pv, "sv": furnace.sv, "mv": furnace.mv, "status_code": 12}

@app.post("/segment/set")
def set_segment(req: SegmentRequest):
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    with furnace._lock:
        furnace.current_segment = req.segment
        furnace.segment_time = 0
        if 1 <= req.segment <= 30:
            furnace.segment_time_set = furnace.segments[req.segment - 1]["time"]
    print(f"[Furnace Simulator] Set segment to {req.segment}")
    return {"pv": furnace.pv, "sv": furnace.sv, "status_code": furnace.status_code}

@app.get("/program/segments/{segment_id}")
def get_segment_detail(segment_id: int):
    """读取单个程序段详情"""
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    if not (1 <= segment_id <= 30):
        raise HTTPException(status_code=400, detail="Segment ID must be 1-30")
    
    try:
        seg = furnace.segments[segment_id - 1]
        return {
            "segment_data": {
                "id": segment_id,
                "temperature": seg["temperature"],
                "time": seg["time"]
            },
            "device_status": {
                "pv": round(furnace.pv, 1),
                "sv": round(furnace.sv, 1),
                "mv": furnace.mv,
                "status_code": furnace.status_code,
                "timestamp": time.time()
            }
        }
    except Exception as e:
        print(f"[Furnace Simulator] Error reading segment {segment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/parameter/write")
def write_parameter(req: ParameterRequest):
    """写入参数 - 模拟器直接存储用户格式值"""
    if not furnace.connected:
        raise HTTPException(status_code=503, detail="Device not connected")
    
    try:
        code = req.code
        value = req.value
        
        print(f"[Furnace Simulator] write_param - code: 0x{code:02X}({code}), value: {value}")
        
        # 判断是否为温度地址 (0x1A-0x54 的偶数地址)
        is_temperature_addr = (
            code >= 0x1A and code <= 0x54 and
            ((code - 0x1A) % 2 == 0)
        )
        
        with furnace._lock:
            if is_temperature_addr:
                # 温度值 - 直接存储用户格式（模拟器不需要 ×10 转换）
                # 请求中的 value 已经是用户格式（如 800°C）
                segment_idx = (code - 0x1A) // 2
                if 0 <= segment_idx < 30:
                    furnace.segments[segment_idx]["temperature"] = float(value)
                    print(f"[Furnace Simulator] Segment {segment_idx + 1} temperature = {value}°C")
            else:
                # 时间值或其他参数
                if code >= 0x1B and code <= 0x55 and ((code - 0x1B) % 2 == 0):
                    segment_idx = (code - 0x1B) // 2
                    if 0 <= segment_idx < 30:
                        furnace.segments[segment_idx]["time"] = value
                        print(f"[Furnace Simulator] Segment {segment_idx + 1} time = {value} min")
                elif code == 0x15:
                    # 控制状态寄存器
                    furnace.status_code = value
                    print(f"[Furnace Simulator] Status code = {value}")
                elif code == 0x00:
                    # 当前段设置
                    furnace.current_segment = value
                    furnace.segment_time = 0
                    print(f"[Furnace Simulator] Current segment = {value}")
            
            # 返回格式与真实设备一致
            return {
                "pv": round(furnace.pv, 1),
                "sv": round(furnace.sv, 1),
                "mv": furnace.mv,
                "status_code": furnace.status_code,
                "value": value
            }
    except Exception as e:
        print(f"[Furnace Simulator] Error in write_parameter: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 启动入口
# ==========================================

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("Furnace Simulator Service")
    print("Port: 8012 | Mode: Simulator")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8012, timeout_keep_alive=120)
