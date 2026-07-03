"""In-process device registry for the single-port local backend."""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Callable

from devices.furnace.limits import validate_furnace_temperature
from devices.furnace.simulator_device import FurnaceSimulator
from devices.mfc.simulator_device import MfcSimulator
from devices.zahner.simulator_device import ZahnerSimulator


class DeviceManager:
    def __init__(self):
        self.furnace = None
        self.furnace_lock = threading.Lock()
        self.furnace_connected = False
        self._furnace_is_simulator = False

        self.mfc = None
        self.mfc_lock = threading.Lock()
        self.mfc_connected = False
        self._mfc_is_simulator = False

        self.zahner = None
        self.zahner_connected = False
        self._zahner_is_simulator = False

        self._diagnostics = {
            "furnace": {},
            "mfc": {},
            "zahner": {},
        }
        self._command_logs = {
            "furnace": [],
            "mfc": [],
            "zahner": [],
        }

    def _record_command(self, device: str, command: str, error: Exception | str | None = None, **extra) -> None:
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "direction": "ERROR" if error else "COMMAND",
            "data": command,
            "connection_id": None,
            "error": str(error) if error else None,
        }
        logs = self._command_logs.setdefault(device, [])
        logs.append(entry)
        if len(logs) > 500:
            del logs[:-500]
        diagnostics = self._diagnostics.setdefault(device, {})
        diagnostics["lastCommand"] = command
        diagnostics["lastError"] = str(error) if error else None
        diagnostics.update(extra)

    def _record_error(self, device: str, command: str, error: Exception | str, **extra) -> None:
        self._record_command(device, command, error=error, **extra)

    def _profile_for(self, device: str) -> str | None:
        target = getattr(self, device, None)
        return getattr(target, "profile", None) if target else None

    def device_profile(self, device: str) -> str | None:
        if self.device_mode(device) != "simulator":
            return None
        return self._profile_for(device)

    def device_diagnostics(self, device: str) -> dict:
        return {
            "lastCommand": None,
            "lastError": None,
            **self._diagnostics.get(device, {}),
        }

    def device_command_logs(self, device: str) -> list[dict]:
        device_logs = list(reversed(self._command_logs.get(device, [])))
        if device == "mfc" and self.mfc is not None and hasattr(self.mfc, "comm_log"):
            return self.mfc.comm_log.get_logs() + device_logs
        return device_logs

    def clear_device_command_logs(self, device: str) -> None:
        self._command_logs[device] = []
        if device == "mfc" and self.mfc is not None and hasattr(self.mfc, "comm_log"):
            self.mfc.comm_log.clear()

    def record_mfc_scan_range(self, start_address: int, end_address: int) -> None:
        self._diagnostics.setdefault("mfc", {})["lastScanRange"] = f"{start_address}-{end_address}"
        self._record_command("mfc", f"scan {start_address}-{end_address}", lastScanRange=f"{start_address}-{end_address}")

    def connect_furnace(self, config: dict) -> dict:
        port = config.get("port", "COM1")
        with self.furnace_lock:
            if self.furnace_connected:
                wants_simulator = port == "COM_SIMULATOR"
                current_profile = getattr(self.furnace, "profile", None) if self.furnace else None
                requested_profile = config.get("simulatorProfile", "normal") if wants_simulator else None
                if self._furnace_is_simulator == wants_simulator and current_profile == requested_profile:
                    return {"connected": True, "already": True, "mode": "simulator" if self._furnace_is_simulator else "real"}
                if self.furnace:
                    try:
                        self.furnace.disconnect()
                    except Exception:
                        pass
                self.furnace = None
                self.furnace_connected = False
                self._furnace_is_simulator = False

            if port == "COM_SIMULATOR":
                self.furnace = FurnaceSimulator(profile=config.get("simulatorProfile", "normal"))
                self.furnace.connected = True
                self.furnace.start_simulation()
                self._furnace_is_simulator = True
                self.furnace_connected = True
                self._record_command("furnace", f"connect COM_SIMULATOR profile={self.furnace.profile}")
                return {"connected": True, "mode": "simulator"}

            from devices.furnace.real_device import AI518PController, ConnectRequest

            self.furnace = AI518PController()
            self.furnace.connect(
                ConnectRequest(
                    port=port,
                    baudrate=int(config.get("baudrate", 9600)),
                    address=int(config.get("address", 1)),
                    stopbits=int(config.get("stopbits", 2)),
                    timeout=float(config.get("timeout", 1.0)),
                )
            )
            self._furnace_is_simulator = False
            self.furnace_connected = True
            self._record_command("furnace", f"connect {port}")
            return {"connected": True, "mode": "real"}

    def disconnect_furnace(self) -> None:
        with self.furnace_lock:
            if self.furnace:
                try:
                    self.furnace.disconnect()
                except Exception:
                    pass
            self.furnace = None
            self.furnace_connected = False
            self._furnace_is_simulator = False
            self._record_command("furnace", "disconnect")

    def furnace_status(self) -> dict:
        with self.furnace_lock:
            if not self.furnace_connected or not self.furnace:
                return {"connected": False}
            if self._furnace_is_simulator:
                with self.furnace._lock:
                    return self.furnace.status_payload()

            d_main = self.furnace.read_param(0x00)
            d_ctrl = self.furnace.read_param(0x15)
            d_time = self.furnace.read_param(0x56)
            current_seg = d_main["value"]
            seg_total_time = 0
            if 1 <= current_seg <= 30:
                d_set_time = self.furnace.read_param(0x1B + (current_seg - 1) * 2)
                seg_total_time = d_set_time["value"]
            return {
                "connected": True,
                "pv": d_main["pv"],
                "sv": d_main["sv"],
                "mv": d_main["mv"],
                "statusCode": d_ctrl["value"],
                "segment": current_seg,
                "segmentTime": d_time["value"],
                "segmentTimeSet": seg_total_time,
            }

    def furnace_write_param(self, code: int, value: int) -> dict:
        with self.furnace_lock:
            if not self.furnace:
                error = RuntimeError("Furnace not connected")
                self._record_error("furnace", f"write_param 0x{int(code):02X}={value}", error)
                raise error
            self._record_command("furnace", f"write_param 0x{int(code):02X}={value}")
            if self._furnace_is_simulator:
                with self.furnace._lock:
                    try:
                        return self.furnace.write_param(code, value)
                    except Exception as e:
                        self._record_error("furnace", f"write_param 0x{int(code):02X}={value}", e)
                        raise
            try:
                return self.furnace.write_param(code, value)
            except Exception as e:
                self._record_error("furnace", f"write_param 0x{int(code):02X}={value}", e)
                raise

    def furnace_read_segments(self) -> list[dict]:
        with self.furnace_lock:
            if not self.furnace:
                raise RuntimeError("Furnace not connected")
            self._record_command("furnace", "read_segments")
            if self._furnace_is_simulator:
                with self.furnace._lock:
                    return self.furnace.read_segments()
            return [
                {
                    "id": seg_id,
                    "temperature": self.furnace.read_param(0x1A + (seg_id - 1) * 2)["value"] / 10.0,
                    "time": self.furnace.read_param(0x1B + (seg_id - 1) * 2)["value"],
                }
                for seg_id in range(1, 31)
            ]

    def furnace_write_segments(self, segments: list[dict]) -> dict:
        with self.furnace_lock:
            if not self.furnace:
                raise RuntimeError("Furnace not connected")
            self._record_command("furnace", f"write_segments count={len(segments)}")
            for seg in segments:
                validate_furnace_temperature(seg["temperature"], "segment temperature")
            if self._furnace_is_simulator:
                with self.furnace._lock:
                    return self.furnace.write_segments(segments)
            for seg in segments:
                temperature = float(seg["temperature"])
                temp_code = 0x1A + (int(seg["id"]) - 1) * 2
                time_code = 0x1B + (int(seg["id"]) - 1) * 2
                self.furnace.write_param(temp_code, int(round(temperature * 10)))
                self.furnace.write_param(time_code, int(round(float(seg["time"]))))
            return {"success": True, "count": len(segments)}

    def connect_mfc(self, config: dict) -> dict:
        port = config.get("port", "COM1")
        with self.mfc_lock:
            if self.mfc_connected:
                wants_simulator = port == "COM_SIMULATOR"
                current_profile = getattr(self.mfc, "profile", None) if self.mfc else None
                requested_profile = config.get("simulatorProfile", "normal") if wants_simulator else None
                if self._mfc_is_simulator == wants_simulator and current_profile == requested_profile:
                    return {"connected": True, "already": True, "mode": "simulator" if self._mfc_is_simulator else "real"}
                if self.mfc:
                    try:
                        self.mfc.disconnect()
                    except Exception:
                        pass
                self.mfc = None
                self.mfc_connected = False
                self._mfc_is_simulator = False

            if port == "COM_SIMULATOR":
                self.mfc = MfcSimulator(profile=config.get("simulatorProfile", "normal"))
                self.mfc.connected = True
                self.mfc.start_simulation()
                self._mfc_is_simulator = True
                self.mfc_connected = True
                self._record_command("mfc", f"connect COM_SIMULATOR profile={self.mfc.profile}")
                return {"connected": True, "connection_id": "sim-001", "mode": "simulator"}

            from devices.mfc.real_device import ConnectRequest, MfcDeviceManager

            self.mfc = MfcDeviceManager()
            conn_id = self.mfc.connect(
                ConnectRequest(
                    port=port,
                    baudrate=int(config.get("baudrate", 19200)),
                    timeout=float(config.get("timeout", 1.0)),
                )
            )
            self._mfc_is_simulator = False
            self.mfc_connected = True
            self._record_command("mfc", f"connect {port}")
            return {"connected": True, "connection_id": conn_id, "mode": "real"}

    def disconnect_mfc(self) -> None:
        with self.mfc_lock:
            if self.mfc:
                try:
                    self.mfc.disconnect()
                except Exception:
                    pass
            self.mfc = None
            self.mfc_connected = False
            self._mfc_is_simulator = False
            self._record_command("mfc", "disconnect")

    def mfc_status(self) -> dict:
        with self.mfc_lock:
            if not self.mfc_connected or not self.mfc:
                return {"connected": False, "devices": []}
            if self._mfc_is_simulator:
                with self.mfc._lock:
                    return self.mfc.status_payload()

            devices = []
            session = self.mfc.session
            if session:
                for address in session.devices.keys():
                    devices.append(_normalize_mfc_status(session.read_status(address), session.devices[address]))
            return {"connected": True, "devices": devices}

    def mfc_scan(self, address: int) -> dict:
        with self.mfc_lock:
            if not self.mfc:
                error = RuntimeError("MFC not connected")
                self._record_error("mfc", f"scan {address}", error)
                raise error
            if self._mfc_is_simulator:
                with self.mfc._lock:
                    try:
                        result = self.mfc.scan_address(address)
                    except Exception as e:
                        self._record_error("mfc", f"scan {address}", e)
                        raise
                    if result.get("found"):
                        self._diagnostics.setdefault("mfc", {})["lastSuccessfulAddress"] = address
                    return result

            device = self.mfc.ensure_session().scan_address(address)
            if device is not None:
                self._diagnostics.setdefault("mfc", {})["lastSuccessfulAddress"] = address
            return {"found": device is not None, "device": device.model_dump() if device else None}

    def mfc_set_setpoint(self, address: int, sccm: float) -> dict:
        with self.mfc_lock:
            if not self.mfc:
                error = RuntimeError("MFC not connected")
                self._record_error("mfc", f"setpoint {address} {sccm}", error)
                raise error
            self._record_command("mfc", f"setpoint {address} {sccm}")
            if self._mfc_is_simulator:
                with self.mfc._lock:
                    try:
                        return self.mfc.set_setpoint(address, sccm)
                    except Exception as e:
                        self._record_error("mfc", f"setpoint {address} {sccm}", e)
                        raise
            try:
                return self.mfc.ensure_session().set_setpoint(address, sccm)
            except Exception as e:
                self._record_error("mfc", f"setpoint {address} {sccm}", e)
                raise

    def mfc_read_status(self, address: int) -> dict:
        with self.mfc_lock:
            if not self.mfc:
                raise RuntimeError("MFC not connected")
            if self._mfc_is_simulator:
                with self.mfc._lock:
                    return self.mfc.status_payload(address)
            session = self.mfc.ensure_session()
            info = session.devices.get(address)
            return _normalize_mfc_status(session.read_status(address), info)

    def device_mode(self, device: str) -> str:
        if device == "furnace":
            if not self.furnace_connected:
                return "disconnected"
            return "simulator" if self._furnace_is_simulator else "real"
        if device == "mfc":
            if not self.mfc_connected:
                return "disconnected"
            return "simulator" if self._mfc_is_simulator else "real"
        if device == "zahner":
            if not self.zahner_connected:
                return "disconnected"
            return "simulator" if self._zahner_is_simulator else "real"
        return "disconnected"

    def connect_zahner(self, config: dict) -> dict:
        host = config.get("host", "localhost")
        if self.zahner_connected:
            return {"connected": True, "already": True, "mode": "simulator" if self._zahner_is_simulator else "real"}
        if host == "simulator":
            profile = config.get("simulatorProfile", "normal")
            if profile == "connect-fail":
                raise RuntimeError("Zahner simulator connection rejected")
            self.zahner = ZahnerSimulator(profile=profile)
            self._zahner_is_simulator = True
            self.zahner_connected = True
            return {"connected": True, "mode": "simulator"}

        from devices.zahner.real_device import ZahnerDevice

        self.zahner = ZahnerDevice()
        self.zahner.connect(host)
        self._zahner_is_simulator = False
        self.zahner_connected = True
        return {"connected": True, "mode": "real"}

    def disconnect_zahner(self) -> None:
        if self.zahner:
            try:
                self.zahner.disconnect()
            except Exception:
                pass
        self.zahner = None
        self.zahner_connected = False
        self._zahner_is_simulator = False

    def zahner_status(self) -> dict:
        return {
            "connected": self.zahner_connected,
            "mode": "simulator" if self._zahner_is_simulator else ("real" if self.zahner_connected else "disconnected"),
        }

    def zahner_measure(self, measurement_type: str, parameters: dict, stream_callback: Callable | None = None) -> dict:
        if not self.zahner_connected or not self.zahner:
            raise RuntimeError("Zahner not connected")
        return self.zahner.measure(measurement_type, parameters, stream_callback)

    def disconnect_all(self) -> None:
        self.disconnect_zahner()
        self.disconnect_furnace()
        self.disconnect_mfc()


def _normalize_mfc_status(status: dict, info=None) -> dict:
    address = status.get("device_address", status.get("address"))
    max_flow = getattr(info, "max_flow_sccm", status.get("maxFlowSccm", 0))
    flow_sccm = status.get("flow_sccm", status.get("flowSccm", 0))
    setpoint_sccm = status.get("setpoint_sccm", status.get("setpointSccm", 0))
    return {
        "address": address,
        "gasType": getattr(info, "gas_type", status.get("gasType", "Unknown")),
        "maxFlowSccm": max_flow,
        "flowSccm": flow_sccm,
        "flowPercent": status.get("flow_percent", status.get("flowPercent", 0)),
        "setpointSccm": setpoint_sccm,
        "digitalSetpointPercent": round((setpoint_sccm / max_flow) * 100, 2) if max_flow else 0,
        "activeSetpointPercent": round((setpoint_sccm / max_flow) * 100, 2) if max_flow else 0,
        "connectionStatus": status.get("connection_status", "connected"),
        "lastCommunication": status.get("last_communication", datetime.utcnow().isoformat() + "Z"),
    }
