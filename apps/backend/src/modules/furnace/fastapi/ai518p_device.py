from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
import serial
import serial.tools.list_ports
import time
import threading
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("FurnaceDriver")

app = FastAPI(title="Furnace Driver (Final Architecture)")

# --- 模型定义 ---
class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 9600
    address: int = 1
    stopbits: int = 2
    timeout: float = 1.0

class ParameterRequest(BaseModel):
    code: int
    value: int

class SegmentRequest(BaseModel):
    segment: int

class ProgramSegment(BaseModel):
    id: int
    temperature: float
    time: int

# --- 核心控制器 ---
class AI518PController:
    def __init__(self):
        self.serial: Optional[serial.Serial] = None
        self.lock = threading.Lock() # 保护串口 I/O 原子性
        self.address = 1

    def connect(self, req: ConnectRequest):
        with self.lock:
            if self.serial and self.serial.is_open:
                self.serial.close()
            
            self.address = req.address
            try:
                self.serial = serial.Serial(
                    port=req.port,
                    baudrate=req.baudrate,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_TWO if req.stopbits == 2 else serial.STOPBITS_ONE,
                    timeout=req.timeout
                )
                return True
            except Exception as e:
                logger.error(f"Connect error: {e}")
                raise HTTPException(status_code=500, detail=str(e))

    def disconnect(self):
        with self.lock:
            if self.serial and self.serial.is_open:
                self.serial.close()
            self.serial = None
            return True

    def _send(self, cmd: bytes) -> bytes:
        with self.lock:
            if not self.serial or not self.serial.is_open:
                raise HTTPException(status_code=503, detail="Device not connected")
            
            try:
                self.serial.reset_input_buffer()
                self.serial.write(cmd)
                self.serial.flush()

                target_len = 10
                response = bytearray()
                start_time = time.time()
                
                while len(response) < target_len:
                    if time.time() - start_time > 1.5:
                        raise TimeoutError("Serial read timeout")
                    
                    waiting = self.serial.in_waiting
                    if waiting:
                        response.extend(self.serial.read(waiting))
                    else:
                        time.sleep(0.01)
                
                return bytes(response)
            except Exception as e:
                logger.error(f"IO Error: {e}")
                raise HTTPException(status_code=500, detail=str(e))

    def _checksum(self, code: int, value: Optional[int] = None) -> bytes:
        if value is None: # Read
            checksum = code * 256 + 82 + self.address
        else: # Write
            checksum = code * 256 + 67 + value + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def read_param(self, code: int) -> dict:
        addr = self.address + 0x80
        cs = self._checksum(code)
        cmd = bytes([addr, addr, 0x52, code, 0x00, 0x00, cs[0], cs[1]])
        
        resp = self._send(cmd)
        if len(resp) < 10:
             raise HTTPException(status_code=500, detail="Invalid response length")

        pv = resp[0] + (resp[1] << 8)
        sv = resp[2] + (resp[3] << 8)
        mv = resp[4] if resp[4] <= 127 else resp[4] - 256
        status_a = resp[5]
        param_val = resp[6] + (resp[7] << 8)
        
        return {
            "pv": pv / 10.0,
            "sv": sv / 10.0,
            "mv": mv,
            "status_code": status_a,
            "value": param_val
        }

    def write_param(self, code: int, value: int) -> dict:
        """写入并顺便读取最新状态"""
        # 日志：显示设备最终收到的值
        print(f"[FURNACE] write_param - code: 0x{code:02X}({code}), value: {value}", flush=True)

        addr = self.address + 0x80
        cs = self._checksum(code, value)
        cmd = bytes([addr, addr, 0x43, code, value & 0xFF, (value >> 8) & 0xFF, cs[0], cs[1]])

        # 发送写入命令
        self._send(cmd)
        
        # 写入后读取最新状态返回
        return self.read_param(code) 

driver = AI518PController()

# --- API Endpoints ---

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/ports")
def ports():
    return [p.device for p in serial.tools.list_ports.comports()]

@app.post("/connect")
def connect(req: ConnectRequest):
    driver.connect(req)
    return {"status": "connected"}

@app.post("/disconnect")
def disconnect():
    driver.disconnect()
    return {"status": "disconnected"}

@app.get("/status")
def status():
    """一次性读取所有状态"""
    d_main = driver.read_param(0x00)
    current_seg = d_main["value"] 

    d_ctrl = driver.read_param(0x15)
    d_time = driver.read_param(0x56)

    seg_total_time = 0
    if 1 <= current_seg <= 30:
        time_set_code = 0x1B + (current_seg - 1) * 2
        d_set_time = driver.read_param(time_set_code)
        seg_total_time = d_set_time["value"]
    
    return {
        "pv": d_main["pv"],
        "sv": d_main["sv"],
        "mv": d_main["mv"],
        "status_code": d_ctrl["value"],   # 0=Run, 4=Pause, 12=Stop
        "segment": current_seg,
        "segment_time": d_time["value"],
        "segment_time_set": seg_total_time,
        "timestamp": time.time()
    }

@app.post("/parameter/write")
def write_parameter(req: ParameterRequest):
    """写入参数并读取最新状态 - 温度地址自动×10转换"""
    # 判断是否为可写的温度地址（基于0x1A偏移的偶数地址，i=0-29）
    is_temperature_addr = (
        req.code >= 0x1A and req.code <= 0x54 and
        ((req.code - 0x1A) % 2 == 0)
    )

    if is_temperature_addr:
        device_value = int(round(req.value * 10))  # 用户格式×10
    else:
        device_value = req.value  # 直接传递

    return driver.write_param(req.code, device_value)

@app.post("/run")
def run():
    return driver.write_param(0x15, 0)

@app.post("/pause")
def pause():
    return driver.write_param(0x15, 4)

@app.post("/stop")
def stop():
    return driver.write_param(0x15, 12)

@app.post("/segment/set")
def set_segment(req: SegmentRequest):
    return driver.write_param(0x00, req.segment)

# [前端专用] 单个段读取接口
@app.get("/program/segments/{segment_id}")
def get_segment_detail(segment_id: int):
    if not (1 <= segment_id <= 27):
        raise HTTPException(status_code=400, detail="Segment ID must be 1-27")
    
    t_code = 0x1A + (segment_id - 1) * 2
    v_code = 0x1B + (segment_id - 1) * 2
    
    t_resp = driver.read_param(t_code)
    v_resp = driver.read_param(v_code)
    
    return {
        "segment_data": {
            "id": segment_id,
            "temperature": t_resp["value"] / 10.0,
            "time": v_resp["value"]
        },
        # 顺便带回最新状态，供后端更新缓存
        "device_status": {
            "pv": v_resp["pv"],
            "sv": v_resp["sv"],
            "mv": v_resp["mv"],
            "status_code": v_resp["status_code"],
            "timestamp": time.time()
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8011)