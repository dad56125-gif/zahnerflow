from fastapi import FastAPI, Body, Query, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import struct
import serial
import serial.tools.list_ports
import time
import threading
import uuid
from datetime import datetime
import logging
from enum import Enum

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("mfc_device")

class ErrorCategory(Enum):
    DEVICE = "DEVICE"
    TIMEOUT = "TIMEOUT"
    PROTOCOL = "PROTOCOL"
    SYSTEM = "SYSTEM"

class MfcError(Exception):
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = True, context: Optional[Dict] = None):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
        self.context = context or {}

app = FastAPI(title="MFC Device Driver (Serial)")

# ==================== 响应封装 ====================

class MfcResponse:
    @staticmethod
    def create_success_response(data: dict, operation_code: Optional[int] = None, operation_value: Optional[int] = None) -> dict:
        response = { "ok": True, "timestamp": datetime.now().isoformat(), **data }
        if operation_code is not None:
            response["operation"] = {"code": operation_code, "value": operation_value, "success": True}
        return response

    @staticmethod
    def create_error_response(message: str, category: str = "SYSTEM", retryable: bool = False) -> dict:
        return {
            "ok": False, "error_message": message, "error_category": category,
            "retryable": retryable, "timestamp": datetime.now().isoformat()
        }

# ==================== 数据模型 ====================

class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 19200
    timeout: float = 1.0

class ScanRequest(BaseModel):
    address: int

class SetpointRequest(BaseModel):
    address: int
    sccm: float

class DeviceInfo(BaseModel):
    device_address: int
    gas_type: str
    max_flow_sccm: int

# ==================== 异常处理 ====================

@app.exception_handler(MfcError)
async def mfc_error_handler(request: Request, exc: MfcError):
    logger.warning(f"MFC Error: {exc}")
    return JSONResponse(
        status_code=503 if exc.category == ErrorCategory.DEVICE else 400,
        content=MfcResponse.create_error_response(str(exc), exc.category.value, exc.retryable)
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"System Error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content=MfcResponse.create_error_response(f"Internal Error: {str(exc)}", "SYSTEM", False)
    )

# ==================== 核心逻辑类 ====================

class MfcCommLogManager:
    def __init__(self, max_size: int = 500):
        self._logs: List[Dict] = []
        self._max_size = max_size
        self._lock = threading.Lock()

    def add_log(self, direction: str, data: str, connection_id: Optional[str] = None, error: Optional[Exception] = None):
        entry = {
            'timestamp': datetime.now().strftime('%H:%M:%S.%f')[:-3],
            'direction': direction, 'data': data,
            'connection_id': connection_id, 'error': str(error) if error else None
        }
        with self._lock:
            self._logs.append(entry)
            if len(self._logs) > self._max_size: self._logs.pop(0)

    def get_logs(self) -> List[Dict]:
        with self._lock: return list(reversed(self._logs))

    def clear(self):
        with self._lock: self._logs.clear()

class MfcSession:
    def __init__(self, comm_log: MfcCommLogManager, connection_id: str):
        self.ser: Optional[serial.Serial] = None
        self.devices: Dict[int, DeviceInfo] = {} 
        self.comm_log = comm_log
        self.connection_id = connection_id
        self.lock = threading.Lock()

    def connect(self, port: str, baudrate: int, timeout: float):
        try:
            self.ser = serial.Serial(port=port, baudrate=baudrate, timeout=timeout)
            self.comm_log.add_log('CONNECT', f'Connected to {port}', self.connection_id)
        except Exception as e:
            raise MfcError(f"Connect failed: {e}", ErrorCategory.DEVICE)

    def disconnect(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.comm_log.add_log('DISCONNECT', 'Disconnected', self.connection_id)
        self.ser = None

    def _checksum(self, data: bytes) -> int:
        return sum(data) & 0xFF

    def _send(self, cmd: bytes) -> bytes:
        with self.lock:
            if not self.ser or not self.ser.is_open:
                raise MfcError("Device not connected", ErrorCategory.DEVICE)
            
            try:
                self.ser.reset_input_buffer()
                self.ser.write(cmd)
                self.comm_log.add_log('TX', cmd.hex().upper(), self.connection_id)

                response = bytearray()
                start = time.time()
                
                # 循环读取直到收到完整包或超时 (0.2s)
                while time.time() - start < 0.2: 
                    if self.ser.in_waiting:
                        response.extend(self.ser.read(self.ser.in_waiting))
                        # 基础长度检查: Header(8) + Data + Checksum(1)
                        # 第4字节(Index 3)通常是数据长度，但这取决于具体协议变种
                        # 这里使用保守策略：只要收到数据且静默了一小段时间就认为结束
                        if len(response) > 8: 
                             break
                    else:
                        time.sleep(0.005)
                
                if len(response) > 0:
                    self.comm_log.add_log('RX', response.hex().upper(), self.connection_id)
                    return bytes(response)
                else:
                    raise MfcError("Timeout: No response", ErrorCategory.TIMEOUT)
            except MfcError:
                raise
            except Exception as e:
                raise MfcError(f"Serial IO Error: {e}", ErrorCategory.DEVICE)

    def _parse_val(self, resp: bytes, idx: int) -> Optional[int]:
        if not resp or len(resp) < idx + 2: return None
        try:
            return struct.unpack('<H', resp[idx:idx+2])[0]
        except:
            return None

    def _parse_string(self, resp: bytes, start_idx: int = 8) -> str:
        """解析字符串，去除可能的空字节"""
        if not resp or len(resp) <= start_idx: return "Unknown"
        try:
            # 截取有效载荷部分
            payload = resp[start_idx:-1] # 去掉最后的 Checksum
            # 查找 0x00 结束符
            end = payload.find(b'\x00')
            if end != -1:
                payload = payload[:end]
            return payload.decode('ascii', errors='ignore').strip()
        except:
            return "Unknown"

    def _ufrac_to_pct(self, val: int) -> float:
        return ((val - 0x4000) / (0xC000 - 0x4000)) * 100.0

    def _pct_to_ufrac(self, pct: float) -> int:
        pct = max(0, min(100, pct))
        return int(pct * (0xC000 - 0x4000) / 100 + 0x4000)

    # --- 具体命令 ---

    def read_status(self, address: int) -> dict:
        info = self.devices.get(address)
        max_flow = info.max_flow_sccm if info else 0

        # 1. Flow (Class 0x68, Inst 0x01, Attr 0xB9)
        cmd_flow = bytes([address, 0x02, 0x80, 0x03, 0x68, 0x01, 0xB9, 0x00])
        cmd_flow += bytes([self._checksum(cmd_flow)])
        
        flow_pct = 0.0
        val_flow = None
        resp_flow = None
        try:
            resp_flow = self._send(cmd_flow)
            val_flow = self._parse_val(resp_flow, 8) # Data starts at index 8
            if val_flow is not None:
                flow_pct = self._ufrac_to_pct(val_flow)
            logger.debug(f"[FLOW] addr={address} | RX={resp_flow.hex().upper() if resp_flow else 'None'} | len={len(resp_flow) if resp_flow else 0} | UFRAC=0x{val_flow:04X if val_flow else 0} | pct={flow_pct:.2f}%")
        except MfcError as e:
            logger.warning(f"[FLOW] addr={address} | ERROR: {e}")

        # 2. Setpoint (Digital) (Class 0x69, Inst 0x01, Attr 0xA4)
        cmd_sp = bytes([address, 0x02, 0x80, 0x03, 0x69, 0x01, 0xA4, 0x00])
        cmd_sp += bytes([self._checksum(cmd_sp)])
        
        sp_pct = 0.0
        val_sp = None
        resp_sp = None
        try:
            resp_sp = self._send(cmd_sp)
            val_sp = self._parse_val(resp_sp, 8)
            if val_sp is not None:
                sp_pct = self._ufrac_to_pct(val_sp)
            logger.info(f"[SETPOINT] addr={address} | RX={resp_sp.hex().upper() if resp_sp else 'None'} | len={len(resp_sp) if resp_sp else 0} | UFRAC=0x{val_sp:04X if val_sp else 0} | pct={sp_pct:.2f}%")
        except MfcError as e:
            logger.warning(f"[SETPOINT] addr={address} | ERROR: {e}")

        return {
            "device_address": address,
            "flow_percent": round(flow_pct, 2),
            "flow_sccm": round(flow_pct * max_flow / 100.0, 2),
            "setpoint_sccm": round(sp_pct * max_flow / 100.0, 2),
            "connection_status": "connected",
            "last_communication": datetime.now().isoformat()
        }

    def read_gas_name(self, address: int) -> str:
        """发送指令读取真实气体名称"""
        # Cmd: Class 0x66, Inst 0x01, Attr 0x01 (Target Gas Name)
        cmd = bytes([address, 0x02, 0x80, 0x03, 0x66, 0x01, 0x01, 0x00])
        cmd += bytes([self._checksum(cmd)])
        try:
            resp = self._send(cmd)
            # 返回解析后的字符串
            name = self._parse_string(resp, 8)
            return name if name else "Unknown"
        except:
            return "Unknown"

    def set_setpoint(self, address: int, sccm: float) -> dict:
        info = self.devices.get(address)
        if not info: 
            raise MfcError(f"Device {address} not scanned (unknown max flow)", ErrorCategory.DEVICE)
        
        pct = (sccm / info.max_flow_sccm) * 100.0
        val = self._pct_to_ufrac(pct)
        
        data = bytes([val & 0xFF, (val >> 8) & 0xFF])
        cmd = bytes([address, 0x02, 0x81, 0x05, 0x69, 0x01, 0xA4]) + data + bytes([0x00])
        cmd += bytes([self._checksum(cmd)])
        
        self._send(cmd)
        return {"sccm": sccm, "percent": round(pct, 2)}

    def scan_address(self, address: int) -> Optional[DeviceInfo]:
        try:
            # 1. 尝试读流量，验证设备是否存在
            cmd = bytes([address, 0x02, 0x80, 0x03, 0x68, 0x01, 0xB9, 0x00])
            cmd += bytes([self._checksum(cmd)])
            self._send(cmd)

            # 2. 尝试读取满量程 (Class 0x66, Inst 0x01, Attr 0x03)
            max_flow = 200 # 默认 fallback
            try:
                cmd_fs = bytes([address, 0x02, 0x80, 0x03, 0x66, 0x01, 0x03, 0x00])
                cmd_fs += bytes([self._checksum(cmd_fs)])
                resp_fs = self._send(cmd_fs)
                val_fs = self._parse_val(resp_fs, 8) 
                if val_fs is not None: max_flow = val_fs
            except:
                pass

            # 3. 尝试读取气体名称
            gas_name = self.read_gas_name(address)

            # 更新内存缓存
            info = DeviceInfo(device_address=address, gas_type=gas_name, max_flow_sccm=max_flow)
            self.devices[address] = info
            return info
        except MfcError:
            return None

class MfcDeviceManager:
    def __init__(self):
        self.session: Optional[MfcSession] = None
        self.comm_log = MfcCommLogManager()
        self.conn_id: Optional[str] = None

    def ensure_session(self) -> MfcSession:
        if not self.session:
            raise MfcError("Not connected", ErrorCategory.DEVICE)
        return self.session

    def connect(self, req: ConnectRequest):
        if self.session: self.session.disconnect()
        self.conn_id = str(uuid.uuid4())
        self.session = MfcSession(self.comm_log, self.conn_id)
        self.session.connect(req.port, req.baudrate, req.timeout)
        return self.conn_id

    def disconnect(self):
        if self.session:
            self.session.disconnect()
            self.session = None
        self.conn_id = None

manager = MfcDeviceManager()

# ==================== FastAPI 依赖 ====================

def get_controller() -> MfcSession:
    return manager.ensure_session()

# ==================== 路由定义 ====================

@app.get("/health")
def health(): return {"status": "ok"}

@app.get("/ports")
def ports(): return [p.device for p in serial.tools.list_ports.comports()]

@app.post("/connect")
def connect_device(req: ConnectRequest):
    cid = manager.connect(req)
    return MfcResponse.create_success_response({"connection_id": cid, "connected": True})

@app.post("/disconnect")
def disconnect_device():
    manager.disconnect()
    return MfcResponse.create_success_response({"success": True})

@app.post("/scan")
def scan(req: ScanRequest, controller: MfcSession = Depends(get_controller)):
    device = controller.scan_address(req.address)
    return MfcResponse.create_success_response({
        "found": device is not None,
        "device": device.model_dump() if device else None
    })

@app.get("/status")
def status(address: int = Query(...), controller: MfcSession = Depends(get_controller)):
    data = controller.read_status(address)
    return MfcResponse.create_success_response(data)

@app.post("/setpoint")
def setpoint(req: SetpointRequest, controller: MfcSession = Depends(get_controller)):
    data = controller.set_setpoint(req.address, req.sccm)
    return MfcResponse.create_success_response(data)

@app.get("/comm-log")
def get_logs():
    return MfcResponse.create_success_response({"logs": manager.comm_log.get_logs()})

@app.delete("/comm-log")
def clear_logs():
    manager.comm_log.clear()
    return MfcResponse.create_success_response({"success": True})

@app.get("/connection/info")
def conn_info():
    return MfcResponse.create_success_response({
        "connected": manager.session is not None and manager.session.ser is not None,
        "connection_id": manager.conn_id
    })

@app.get("/gas-name")
def gas_name(address: int = Query(...), controller: MfcSession = Depends(get_controller)):
    name = controller.read_gas_name(address)
    return MfcResponse.create_success_response({"gas_name": name, "device_address": address})

@app.get("/active-setpoint")
def active_sp(address: int = Query(...), controller: MfcSession = Depends(get_controller)):
    status = controller.read_status(address)
    return MfcResponse.create_success_response({
        "active_setpoint_sccm": status["setpoint_sccm"],
        "active_setpoint_percent": 0,
        "device_address": address
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8010)