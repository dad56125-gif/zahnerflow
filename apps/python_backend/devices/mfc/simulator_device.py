#!/usr/bin/env python3
"""
Internal MFC simulator for the unified Python backend.
"""

from __future__ import annotations

import random
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from devices.mfc.real_device import ErrorCategory, MfcCommLogManager, MfcError


class SimulatedMfcDevice:
    def __init__(self, address: int, gas_type: str, max_flow_sccm: int):
        self.address = address
        self.gas_type = gas_type
        self.max_flow_sccm = max_flow_sccm
        self.setpoint_sccm = 0.0
        self.flow_sccm = 0.0

    def update_flow(self, dt: float):
        delta = self.setpoint_sccm - self.flow_sccm
        if abs(delta) > 0.05:
            self.flow_sccm += delta * min(1.0, dt * 0.7)
        else:
            self.flow_sccm = self.setpoint_sccm
        if self.flow_sccm > 0:
            self.flow_sccm += random.gauss(0, self.max_flow_sccm * 0.001)
            self.flow_sccm = max(0.0, min(float(self.max_flow_sccm), self.flow_sccm))

    def status_payload(self) -> dict:
        flow_percent = round((self.flow_sccm / self.max_flow_sccm) * 100, 2) if self.max_flow_sccm else 0
        setpoint_percent = round((self.setpoint_sccm / self.max_flow_sccm) * 100, 2) if self.max_flow_sccm else 0
        return {
            "address": self.address,
            "gasType": self.gas_type,
            "maxFlowSccm": self.max_flow_sccm,
            "flowSccm": round(self.flow_sccm, 2),
            "flowPercent": flow_percent,
            "setpointSccm": round(self.setpoint_sccm, 2),
            "digitalSetpointPercent": setpoint_percent,
            "activeSetpointPercent": setpoint_percent,
            "connectionStatus": "connected",
            "lastCommunication": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }


class MfcSimulator:
    def __init__(self, profile: str = "normal"):
        self.connected = False
        self.profile = profile
        self.connection_id: Optional[str] = None
        self.comm_log = MfcCommLogManager()
        self.devices: Dict[int, SimulatedMfcDevice] = {}
        self.preset_devices: List[Dict] = [
            {"address": 32, "gas_type": "N2", "max_flow_sccm": 200},
            {"address": 33, "gas_type": "O2", "max_flow_sccm": 100},
            {"address": 34, "gas_type": "Ar", "max_flow_sccm": 500},
            {"address": 35, "gas_type": "H2", "max_flow_sccm": 50},
        ]
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start_simulation(self):
        if self._running:
            return
        if not self.connection_id:
            self.connection_id = f"sim-{uuid.uuid4()}"
        self.comm_log.add_log("CONNECT", "Connected to MFC simulator", self.connection_id)
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()

    def stop_simulation(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def disconnect(self):
        if self.connection_id:
            self.comm_log.add_log("DISCONNECT", "Disconnected", self.connection_id)
        self.connected = False
        self.stop_simulation()

    def assert_available(self):
        if not self.connected or self.profile == "disconnect":
            raise MfcError("Simulator device not connected", ErrorCategory.DEVICE)
        if self.profile == "timeout":
            raise MfcError("Timeout: No response", ErrorCategory.TIMEOUT)
        if self.profile == "protocol-error":
            raise MfcError("Simulator protocol error", ErrorCategory.PROTOCOL)

    def scan_address(self, address: int) -> dict:
        self.assert_available()
        self.comm_log.add_log("TX", f"SCAN {address}", self.connection_id)
        if self.profile == "scan-empty":
            self.comm_log.add_log("RX", "NO RESPONSE", self.connection_id)
            return {"found": False, "device": None}

        preset = next((d for d in self.preset_devices if d["address"] == address), None)
        if not preset:
            self.comm_log.add_log("RX", "NOT FOUND", self.connection_id)
            return {"found": False, "device": None}
        if address not in self.devices:
            self.devices[address] = SimulatedMfcDevice(
                address=preset["address"],
                gas_type=preset["gas_type"],
                max_flow_sccm=preset["max_flow_sccm"],
            )
        self.comm_log.add_log("RX", f"FOUND {address}", self.connection_id)
        return {
            "found": True,
            "device": {
                "address": preset["address"],
                "gasType": preset["gas_type"],
                "gas_type": preset["gas_type"],
                "maxFlowSccm": preset["max_flow_sccm"],
                "max_flow_sccm": preset["max_flow_sccm"],
                "name": "MFC",
            },
        }

    def status_payload(self, address: int | None = None) -> dict:
        self.assert_available()
        if address is not None:
            device = self.devices.get(address)
            if not device:
                raise MfcError(f"Device {address} not scanned", ErrorCategory.DEVICE)
            return device.status_payload()
        return {"connected": True, "devices": [d.status_payload() for d in self.devices.values()]}

    def set_setpoint(self, address: int, sccm: float) -> dict:
        self.assert_available()
        device = self.devices.get(address)
        if not device:
            raise MfcError(f"Device {address} not scanned", ErrorCategory.DEVICE)
        clamped_sccm = max(0.0, min(float(device.max_flow_sccm), float(sccm)))
        device.setpoint_sccm = clamped_sccm
        percent = round((clamped_sccm / device.max_flow_sccm) * 100, 2) if device.max_flow_sccm else 0
        self.comm_log.add_log("TX", f"SET {address} {clamped_sccm:.3f}sccm", self.connection_id)
        self.comm_log.add_log("RX", "OK", self.connection_id)
        return {"sccm": clamped_sccm, "percent": percent}

    def _simulation_loop(self):
        last_time = time.time()
        while self._running:
            now = time.time()
            dt = now - last_time
            last_time = now
            with self._lock:
                if self.profile == "normal":
                    for device in self.devices.values():
                        device.update_flow(dt)
            time.sleep(0.2)
