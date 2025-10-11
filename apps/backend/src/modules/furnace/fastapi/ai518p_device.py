from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List
import serial
import serial.tools.list_ports
import time
from datetime import datetime

app = FastAPI(title="AI-518P Furnace FastAPI (basic IO only)")


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 9600
    address: int = 1
    stopbits: int = 2
    timeout: float = 1.0


class ProgramSegment(BaseModel):
    id: int
    temperature: float  # Celsius
    time: int  # seconds


class AI518PController:
    def __init__(self, port='COM4', baudrate=9600, address=1, stopbits=2, timeout=0.5):
        self.port = port
        self.baudrate = baudrate
        self.address = address
        self.stopbits = stopbits
        self.timeout = timeout
        self.serial = None

    def connect(self):
        self.serial = serial.Serial(
            port=self.port,
            baudrate=self.baudrate,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_TWO if self.stopbits == 2 else serial.STOPBITS_ONE,
            timeout=self.timeout,
        )
        return True

    def disconnect(self):
        if self.serial and self.serial.is_open:
            self.serial.close()

    def _checksum_read(self, param_code: int):
        checksum = param_code * 256 + 82 + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def _checksum_write(self, param_code: int, param_value: int):
        checksum = param_code * 256 + 67 + param_value + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def _cmd_read(self, param_code: int) -> bytes:
        addr = self.address + 0x80
        cs = self._checksum_read(param_code)
        return bytes([addr, addr, 0x52, param_code, 0x00, 0x00, cs[0], cs[1]])

    def _cmd_write(self, param_code: int, param_value: int) -> bytes:
        addr = self.address + 0x80
        cs = self._checksum_write(param_code, param_value)
        return bytes([addr, addr, 0x43, param_code, param_value & 0xFF, (param_value >> 8) & 0xFF, cs[0], cs[1]])

    def _send(self, cmd: bytes):
        self.serial.reset_input_buffer()
        self.serial.write(cmd)
        self.serial.flush()
        start = time.time()
        # wait up to timeout for 10 bytes
        while self.serial.in_waiting < 10 and (time.time() - start) < self.timeout:
            time.sleep(0.01)
        if self.serial.in_waiting >= 10:
            return self.serial.read(10)
        # read whatever available
        n = self.serial.in_waiting
        if n > 0:
            return self.serial.read(n)
        return None

    def read_parameter(self, code: int):
        resp = self._send(self._cmd_read(code))
        if resp and len(resp) >= 8:
            pv = resp[0] + (resp[1] << 8)
            sv = resp[2] + (resp[3] << 8)
            mv = resp[4] if resp[4] <= 127 else resp[4] - 256
            status_a = resp[5]
            param_value = resp[6] + (resp[7] << 8)
            return {"pv": pv / 10.0, "sv": sv / 10.0, "mv": mv, "status_a": status_a, "param_value": param_value}
        return None

    def write_parameter(self, code: int, value: int) -> bool:
        resp = self._send(self._cmd_write(code, value))
        if not resp or len(resp) < 8:
            return False
        returned = resp[6] + (resp[7] << 8)
        return returned == value

    def get_all_status(self):
        temp_data = self.read_parameter(0x00)
        if not temp_data:
            return None
        control = self.read_parameter(0x15)
        if not control:
            return None
        ctrl = control["param_value"]
        if ctrl == 12:
            status = "stop"
        elif ctrl == 4:
            status = "pause"
        elif ctrl == 0:
            status = "run"
        else:
            status = f"unknown({ctrl})"
        current_segment = temp_data["param_value"]
        time_data = self.read_parameter(0x56)
        segment_time = time_data["param_value"] if time_data else 0
        segment_time_set = self.get_segment_time_set(current_segment)
        return {
            "pv": temp_data["pv"],
            "sv": temp_data["sv"],
            "mv": temp_data["mv"],
            "status": status,
            "segment": current_segment,
            "segmentTime": segment_time,
            "segmentTimeSet": segment_time_set,
            "timestamp": datetime.now().isoformat(),
        }

    def get_segment_time_set(self, segment_num: int) -> int:
        if 1 <= segment_num <= 30:
            code = 0x1B + (segment_num - 1) * 2
            d = self.read_parameter(code)
            return d["param_value"] if d else 0
        return 0

    def set_program_run(self):
        return self.write_parameter(0x15, 0)

    def set_program_pause(self):
        return self.write_parameter(0x15, 4)

    def set_program_stop(self):
        return self.write_parameter(0x15, 12)

    def set_segment(self, seg: int):
        return self.write_parameter(0x00, seg)

    def set_sv(self, sv_celsius: float):
        return self.write_parameter(0x00, int(sv_celsius * 10))

    def read_program_segments(self) -> List[ProgramSegment]:
        segs: List[ProgramSegment] = []
        for i in range(30):
            seg_id = i + 1
            temp_code = 0x1A + i * 2
            time_code = 0x1B + i * 2
            td = self.read_parameter(temp_code)
            vd = self.read_parameter(time_code)
            temp_c = (td["param_value"] / 10.0) if td else 0.0
            t_min = vd["param_value"] if vd else 0
            segs.append(ProgramSegment(id=seg_id, temperature=temp_c, time=int(t_min * 60)))
        return segs

    def write_program_segments(self, items: List[ProgramSegment]):
        ok = True
        for it in items:
            idx = it.id - 1
            if idx < 0 or idx > 29:
                continue
            temp_code = 0x1A + idx * 2
            time_code = 0x1B + idx * 2
            temp_int = int(round(it.temperature * 10))
            time_min = int(round((it.time or 0) / 60))
            ok = self.write_parameter(temp_code, temp_int) and ok
            ok = self.write_parameter(time_code, time_min) and ok
        return ok


# Global controller
controller: AI518PController | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ports")
def ports():
    return [p.device for p in serial.tools.list_ports.comports()]


@app.post("/connect")
def connect(req: ConnectRequest):
    global controller
    controller = AI518PController(req.port, req.baudrate, req.address, req.stopbits, req.timeout)
    controller.connect()
    return {"connected": True, "port": req.port}


@app.post("/disconnect")
def disconnect():
    global controller
    if controller:
        controller.disconnect()
        controller = None
    return {"connected": False}


@app.get("/status")
def status():
    if not controller:
        return {"error": "not connected"}
    s = controller.get_all_status()
    return s or {"error": "no response"}


@app.post("/run")
def run():
    if not controller:
        return {"error": "not connected"}
    return {"ok": bool(controller.set_program_run())}


@app.post("/pause")
def pause():
    if not controller:
        return {"error": "not connected"}
    return {"ok": bool(controller.set_program_pause())}


@app.post("/stop")
def stop():
    if not controller:
        return {"error": "not connected"}
    return {"ok": bool(controller.set_program_stop())}


@app.post("/sv")
def set_sv(sv: float = Body(...)):  # Celsius
    if not controller:
        return {"error": "not connected"}
    return {"ok": bool(controller.set_sv(sv))}


@app.post("/segment/set")
def set_segment(segment: int = Body(...)):
    if not controller:
        return {"error": "not connected"}
    return {"ok": bool(controller.set_segment(segment))}


@app.get("/program/segments")
def get_program_segments():
    if not controller:
        return {"error": "not connected"}
    return [s.dict() for s in controller.read_program_segments()]


@app.post("/program/segments")
def set_program_segments(items: List[ProgramSegment]):
    if not controller:
        return {"error": "not connected"}
    ok = controller.write_program_segments(items)
    return {"ok": bool(ok), "count": len(items)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8011)
