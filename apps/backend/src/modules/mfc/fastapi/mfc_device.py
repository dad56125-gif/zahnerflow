from fastapi import FastAPI, Body, Query
from pydantic import BaseModel
from typing import List, Optional, Dict
import struct
import serial
import serial.tools.list_ports
import time

app = FastAPI(title="MFC FastAPI (basic IO only)")


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 19200
    timeout: float = 1.0


class DeviceInfo(BaseModel):
    address: int
    gasType: str
    maxFlowSccm: int


class MfcSession:
    def __init__(self):
        self.ser: Optional[serial.Serial] = None
        self.devices: Dict[int, DeviceInfo] = {}

    def ports(self):
        return [p.device for p in serial.tools.list_ports.comports()]

    def connect(self, port: str, baudrate: int = 19200, timeout: float = 1.0):
        self.ser = serial.Serial(
            port=port,
            baudrate=baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=timeout,
        )
        return True

    def disconnect(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.ser = None

    def _checksum(self, data: bytes) -> int:
        return sum(data) & 0xFF

    def _read_cmd(self, address: int, class_byte: int, instance: int, attribute: int) -> bytes:
        cmd = bytes([address, 0x02, 0x80, 0x03, class_byte, instance, attribute, 0x00])
        return cmd + bytes([self._checksum(cmd)])

    def _write_cmd(self, address: int, class_byte: int, instance: int, attribute: int, data: bytes) -> bytes:
        if len(data) == 1:
            cmd = bytes([address, 0x02, 0x81, 0x04, class_byte, instance, attribute]) + data + bytes([0x00])
        elif len(data) == 2:
            cmd = bytes([address, 0x02, 0x81, 0x05, class_byte, instance, attribute]) + data + bytes([0x00])
        else:
            cmd = bytes([address, 0x02, 0x81, len(data) + 6, class_byte, instance, attribute]) + data + bytes([0x00])
        return cmd + bytes([self._checksum(cmd)])

    def _send(self, cmd: bytes):
        if not self.ser:
            return None
        self.ser.reset_input_buffer()
        self.ser.write(cmd)
        self.ser.flush()
        # small delay and read
        start = time.time()
        while self.ser.in_waiting < 6 and (time.time() - start) < (self.ser.timeout or 1.0):
            time.sleep(0.01)
        n = self.ser.in_waiting
        if n > 0:
            return self.ser.read(n)
        return None

    def _parse_uint16_from_resp(self, resp: bytes) -> Optional[int]:
        if not resp or len(resp) < 10:
            return None
        try:
            return struct.unpack('<H', resp[8:10])[0]
        except Exception:
            return None

    def _parse_uint8_from_resp(self, resp: bytes) -> Optional[int]:
        if not resp or len(resp) < 9:
            return None
        return resp[8]

    def scan(self, start: int = 32, end: int = 80) -> List[DeviceInfo]:
        out: List[DeviceInfo] = []
        if not self.ser:
            return out
        for addr in range(start, end + 1):
            # Try read gas name via class 0x66 instance 0x01 attribute 0x01
            resp = self._send(self._read_cmd(addr, 0x66, 0x01, 0x01))
            gas = ""
            if resp and len(resp) >= 8:
                try:
                    data_length = resp[4] if len(resp) > 4 else 0
                    text_len = max(0, data_length - 3)
                    if len(resp) >= 8 + text_len and text_len > 0:
                        gas = resp[8:8 + text_len].decode('ascii', errors='ignore').strip('\x00').strip()
                except Exception:
                    gas = ""
            # Try read full scale via 0x66/0x01/0x03 (if present)
            fs_sccm = 0
            resp2 = self._send(self._read_cmd(addr, 0x66, 0x01, 0x03))
            val = self._parse_uint16_from_resp(resp2)
            if val is not None:
                fs_sccm = val
            if gas or fs_sccm:
                info = DeviceInfo(address=addr, gasType=gas or "UNKNOWN", maxFlowSccm=int(fs_sccm or 0))
                self.devices[addr] = info
                out.append(info)
        return out

    def ufrac16_to_percent(self, value: int) -> float:
        return ((value - 0x4000) / (0xC000 - 0x4000)) * 100.0

    def percent_to_ufrac16(self, percent: float) -> int:
        if percent < 0: percent = 0
        if percent > 100: percent = 100
        return int(percent * (0xC000 - 0x4000) / 100 + 0x4000)

    def read_status(self, address: int):
        info = self.devices.get(address)
        # Flow percent from 0x68/0x01/0xB9 (UFRAC16)
        flow_percent = 0.0
        resp_flow = self._send(self._read_cmd(address, 0x68, 0x01, 0xB9))
        raw_flow = self._parse_uint16_from_resp(resp_flow)
        if raw_flow is not None:
            flow_percent = self.ufrac16_to_percent(raw_flow)
        # Digital setpoint percent
        digital_sp_percent = 0.0
        resp_dsp = self._send(self._read_cmd(address, 0x69, 0x01, 0xA4))
        raw_dsp = self._parse_uint16_from_resp(resp_dsp)
        if raw_dsp is not None:
            digital_sp_percent = self.ufrac16_to_percent(raw_dsp)
        # Active setpoint percent
        active_sp_percent = 0.0
        resp_asp = self._send(self._read_cmd(address, 0x69, 0x01, 0xA5))
        raw_asp = self._parse_uint16_from_resp(resp_asp)
        if raw_asp is not None:
            active_sp_percent = self.ufrac16_to_percent(raw_asp)
        # Hold/Follow
        hold_follow = None
        resp_hf = self._send(self._read_cmd(address, 0x69, 0x01, 0x05))
        raw_hf = self._parse_uint8_from_resp(resp_hf)
        if raw_hf is not None:
            hold_follow = int(raw_hf)
        # sccm
        flow_sccm = 0.0
        if info and info.maxFlowSccm:
            flow_sccm = flow_percent * info.maxFlowSccm / 100.0
        return {
            "address": address,
            "flowPercent": flow_percent,
            "flowSccm": flow_sccm,
            "digitalSetpointPercent": digital_sp_percent,
            "activeSetpointPercent": active_sp_percent,
            "holdFollow": hold_follow,
        }

    def write_setpoint_sccm(self, address: int, sccm: float):
        info = self.devices.get(address)
        if not info or not info.maxFlowSccm:
            # Cannot convert; accept and return
            return {"address": address, "sccm": sccm, "percent": None}
        percent = (sccm / info.maxFlowSccm) * 100.0
        value = self.percent_to_ufrac16(percent)
        cmd = self._write_cmd(address, 0x69, 0x01, 0xA4, bytes([value & 0xFF, (value >> 8) & 0xFF]))
        self._send(cmd)
        return {"address": address, "sccm": sccm, "percent": percent, "written": True}

    def write_hold_follow(self, address: int, follow: int):
        b = bytes([1 if follow else 0])
        cmd = self._write_cmd(address, 0x69, 0x01, 0x05, b)
        self._send(cmd)
        return {"address": address, "follow": int(bool(follow))}

    def write_delay(self, address: int, value: int):
        v = max(0, min(0x63CD, int(value)))
        cmd = self._write_cmd(address, 0x69, 0x01, 0xA6, bytes([v & 0xFF, (v >> 8) & 0xFF]))
        self._send(cmd)
        return {"address": address, "delay": v}

    def write_softstart(self, address: int, percent: float):
        val = self.percent_to_ufrac16(percent)
        cmd = self._write_cmd(address, 0x6A, 0x01, 0xA4, bytes([val & 0xFF, (val >> 8) & 0xFF]))
        self._send(cmd)
        return {"address": address, "softstartPercent": percent}

    def write_shutoff(self, address: int, percent: float):
        val = self.percent_to_ufrac16(percent)
        cmd = self._write_cmd(address, 0x6A, 0x01, 0xA2, bytes([val & 0xFF, (val >> 8) & 0xFF]))
        self._send(cmd)
        return {"address": address, "shutoffPercent": percent}


session = MfcSession()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ports")
def ports():
    return session.ports()


@app.post("/connect")
def connect(req: ConnectRequest):
    session.connect(req.port, req.baudrate, req.timeout)
    return {"connected": True, "port": req.port}


@app.post("/disconnect")
def disconnect():
    session.disconnect()
    return {"connected": False}


@app.post("/scan")
def scan(start: int = Body(32), end: int = Body(80)):
    return [d.dict() for d in session.scan(start, end)]


@app.get("/status")
def status(address: Optional[int] = Query(None)):
    if address is None:
        return [session.read_status(a) for a in list(session.devices.keys())]
    return session.read_status(address)


@app.post("/setpoint")
def setpoint(address: int = Body(...), sccm: float = Body(...)):
    return session.write_setpoint_sccm(address, sccm)


@app.post("/hold-follow")
def hold_follow(address: int = Body(...), follow: int = Body(...)):
    return session.write_hold_follow(address, follow)


@app.post("/delay")
def set_delay(address: int = Body(...), value: int = Body(...)):
    return session.write_delay(address, value)


@app.post("/softstart")
def set_softstart(address: int = Body(...), percent: float = Body(...)):
    return session.write_softstart(address, percent)


@app.post("/shutoff")
def set_shutoff(address: int = Body(...), percent: float = Body(...)):
    return session.write_shutoff(address, percent)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8010)
