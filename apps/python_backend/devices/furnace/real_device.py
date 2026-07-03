"""AI-518P furnace serial driver used directly by the local runtime."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class ConnectRequest:
    port: str
    baudrate: int = 9600
    address: int = 1
    stopbits: int = 2
    timeout: float = 1.0


class AI518PController:
    def __init__(self) -> None:
        self.serial: Any = None
        self.lock = threading.Lock()
        self.address = 1

    def connect(self, req: ConnectRequest) -> bool:
        import serial

        with self.lock:
            if self.serial and self.serial.is_open:
                self.serial.close()

            self.address = req.address
            self.serial = serial.Serial(
                port=req.port,
                baudrate=req.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_TWO if req.stopbits == 2 else serial.STOPBITS_ONE,
                timeout=req.timeout,
            )
            return True

    def disconnect(self) -> bool:
        with self.lock:
            if self.serial and self.serial.is_open:
                self.serial.close()
            self.serial = None
            return True

    def _send(self, cmd: bytes) -> bytes:
        with self.lock:
            if not self.serial or not self.serial.is_open:
                raise RuntimeError("Furnace not connected")

            self.serial.reset_input_buffer()
            self.serial.write(cmd)
            self.serial.flush()

            target_len = 10
            response = bytearray()
            start_time = time.time()

            while len(response) < target_len:
                if time.time() - start_time > 1.5:
                    raise TimeoutError("Furnace serial read timeout")

                waiting = self.serial.in_waiting
                if waiting:
                    response.extend(self.serial.read(waiting))
                else:
                    time.sleep(0.01)

            return bytes(response)

    def _checksum(self, code: int, value: int | None = None) -> bytes:
        if value is None:
            checksum = code * 256 + 82 + self.address
        else:
            checksum = code * 256 + 67 + value + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def read_param(self, code: int) -> dict:
        addr = self.address + 0x80
        cs = self._checksum(code)
        cmd = bytes([addr, addr, 0x52, code, 0x00, 0x00, cs[0], cs[1]])

        resp = self._send(cmd)
        if len(resp) < 10:
            raise RuntimeError("Invalid furnace response length")

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
            "value": param_val,
        }

    def write_param(self, code: int, value: int) -> dict:
        addr = self.address + 0x80
        cs = self._checksum(code, value)
        cmd = bytes([addr, addr, 0x43, code, value & 0xFF, (value >> 8) & 0xFF, cs[0], cs[1]])
        self._send(cmd)
        return self.read_param(code)


def list_ports() -> list[str]:
    import serial.tools.list_ports

    return [p.device for p in serial.tools.list_ports.comports()]
