"""MFC serial driver used directly by the local runtime."""

from __future__ import annotations

import struct
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class ErrorCategory(Enum):
    DEVICE = "DEVICE"
    TIMEOUT = "TIMEOUT"
    PROTOCOL = "PROTOCOL"
    SYSTEM = "SYSTEM"


class MfcError(Exception):
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = True, context: dict | None = None):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
        self.context = context or {}


@dataclass
class ConnectRequest:
    port: str
    baudrate: int = 19200
    timeout: float = 1.0


@dataclass
class DeviceInfo:
    device_address: int
    gas_type: str
    max_flow_sccm: int

    def model_dump(self) -> dict:
        return {
            "device_address": self.device_address,
            "gas_type": self.gas_type,
            "max_flow_sccm": self.max_flow_sccm,
        }


class MfcCommLogManager:
    def __init__(self, max_size: int = 500):
        self._logs: list[dict] = []
        self._max_size = max_size
        self._lock = threading.Lock()

    def add_log(self, direction: str, data: str, connection_id: str | None = None, error: Exception | None = None):
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "direction": direction,
            "data": data,
            "connection_id": connection_id,
            "error": str(error) if error else None,
        }
        with self._lock:
            self._logs.append(entry)
            if len(self._logs) > self._max_size:
                self._logs.pop(0)

    def get_logs(self) -> list[dict]:
        with self._lock:
            return list(reversed(self._logs))

    def clear(self) -> None:
        with self._lock:
            self._logs.clear()


class MfcSession:
    def __init__(self, comm_log: MfcCommLogManager, connection_id: str):
        self.ser: Any = None
        self.devices: dict[int, DeviceInfo] = {}
        self.comm_log = comm_log
        self.connection_id = connection_id
        self.lock = threading.Lock()

    def connect(self, port: str, baudrate: int, timeout: float) -> None:
        import serial

        try:
            self.ser = serial.Serial(port=port, baudrate=baudrate, timeout=timeout)
            self.comm_log.add_log("CONNECT", f"Connected to {port}", self.connection_id)
        except Exception as e:
            raise MfcError(f"Connect failed: {e}", ErrorCategory.DEVICE) from e

    def disconnect(self) -> None:
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.comm_log.add_log("DISCONNECT", "Disconnected", self.connection_id)
        self.ser = None

    def _checksum(self, data: bytes) -> int:
        return sum(data) & 0xFF

    def _send(self, cmd: bytes) -> bytes:
        with self.lock:
            if not self.ser or not self.ser.is_open:
                raise MfcError("Device not connected", ErrorCategory.DEVICE)

            try:
                drain_start = time.time()
                while time.time() - drain_start < 0.05:
                    if self.ser.in_waiting:
                        self.ser.read(self.ser.in_waiting)
                        drain_start = time.time()
                    else:
                        time.sleep(0.005)

                self.ser.reset_input_buffer()
                self.ser.write(cmd)
                self.comm_log.add_log("TX", cmd.hex().upper(), self.connection_id)

                response = bytearray()
                start = time.time()
                while time.time() - start < 0.2:
                    if self.ser.in_waiting:
                        response.extend(self.ser.read(self.ser.in_waiting))
                        if len(response) >= 11:
                            time.sleep(0.01)
                            if self.ser.in_waiting:
                                response.extend(self.ser.read(self.ser.in_waiting))
                            break
                    else:
                        time.sleep(0.005)

                if len(response) == 0:
                    raise MfcError("Timeout: No response", ErrorCategory.TIMEOUT)

                self.comm_log.add_log("RX", response.hex().upper(), self.connection_id)
                expected_pattern = bytes([0x00, 0x02, 0x80, 0x05])
                pattern_offset = response.find(expected_pattern)
                if pattern_offset > 1:
                    response = response[pattern_offset - 1 :]
                return bytes(response)
            except MfcError:
                raise
            except Exception as e:
                raise MfcError(f"Serial IO Error: {e}", ErrorCategory.DEVICE) from e

    def _parse_val(self, resp: bytes, idx: int) -> int | None:
        if not resp or len(resp) < idx + 2:
            return None
        try:
            return struct.unpack("<H", resp[idx : idx + 2])[0]
        except Exception:
            return None

    def _parse_string(self, resp: bytes, start_idx: int = 8) -> str:
        if not resp or len(resp) <= start_idx:
            return "Unknown"
        try:
            payload = resp[start_idx:-1]
            end = payload.find(b"\x00")
            if end != -1:
                payload = payload[:end]
            return payload.decode("ascii", errors="ignore").strip()
        except Exception:
            return "Unknown"

    def _ufrac_to_pct(self, val: int) -> float:
        return ((val - 0x4000) / (0xC000 - 0x4000)) * 100.0

    def _pct_to_ufrac(self, pct: float) -> int:
        pct = max(0, min(100, pct))
        return int(pct * (0xC000 - 0x4000) / 100 + 0x4000)

    def read_status(self, address: int) -> dict:
        info = self.devices.get(address)
        max_flow = info.max_flow_sccm if info else 0

        cmd_flow = bytes([address, 0x02, 0x80, 0x03, 0x68, 0x01, 0xB9, 0x00])
        cmd_flow += bytes([self._checksum(cmd_flow)])
        flow_pct = 0.0
        try:
            resp_flow = self._send(cmd_flow)
            val_flow = self._parse_val(resp_flow, 8)
            if val_flow is not None:
                flow_pct = self._ufrac_to_pct(val_flow)
        except MfcError:
            pass

        cmd_sp = bytes([address, 0x02, 0x80, 0x03, 0x69, 0x01, 0xA4, 0x00])
        cmd_sp += bytes([self._checksum(cmd_sp)])
        sp_pct = 0.0
        try:
            resp_sp = self._send(cmd_sp)
            val_sp = self._parse_val(resp_sp, 8)
            if val_sp is not None:
                sp_pct = self._ufrac_to_pct(val_sp)
        except MfcError:
            pass

        return {
            "device_address": address,
            "flow_percent": round(flow_pct, 2),
            "flow_sccm": round(flow_pct * max_flow / 100.0, 2),
            "setpoint_sccm": round(sp_pct * max_flow / 100.0, 2),
            "connection_status": "connected",
            "last_communication": datetime.now().isoformat(),
        }

    def read_gas_name(self, address: int) -> str:
        cmd = bytes([address, 0x02, 0x80, 0x03, 0x66, 0x01, 0x01, 0x00])
        cmd += bytes([self._checksum(cmd)])
        try:
            return self._parse_string(self._send(cmd), 8) or "Unknown"
        except Exception:
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

    def scan_address(self, address: int) -> DeviceInfo | None:
        try:
            cmd = bytes([address, 0x02, 0x80, 0x03, 0x68, 0x01, 0xB9, 0x00])
            cmd += bytes([self._checksum(cmd)])
            self._send(cmd)

            max_flow = 200
            try:
                cmd_fs = bytes([address, 0x02, 0x80, 0x03, 0x66, 0x01, 0x03, 0x00])
                cmd_fs += bytes([self._checksum(cmd_fs)])
                val_fs = self._parse_val(self._send(cmd_fs), 8)
                if val_fs is not None:
                    max_flow = val_fs
            except Exception:
                pass

            info = DeviceInfo(device_address=address, gas_type=self.read_gas_name(address), max_flow_sccm=max_flow)
            self.devices[address] = info
            return info
        except MfcError:
            return None


class MfcDeviceManager:
    def __init__(self):
        self.session: MfcSession | None = None
        self.comm_log = MfcCommLogManager()
        self.conn_id: str | None = None

    def ensure_session(self) -> MfcSession:
        if not self.session:
            raise MfcError("Not connected", ErrorCategory.DEVICE)
        return self.session

    def connect(self, req: ConnectRequest) -> str:
        if self.session:
            self.session.disconnect()
        self.conn_id = str(uuid.uuid4())
        self.session = MfcSession(self.comm_log, self.conn_id)
        self.session.connect(req.port, req.baudrate, req.timeout)
        return self.conn_id

    def disconnect(self) -> None:
        if self.session:
            self.session.disconnect()
            self.session = None
        self.conn_id = None


def list_ports() -> list[str]:
    import serial.tools.list_ports

    return [p.device for p in serial.tools.list_ports.comports()]
