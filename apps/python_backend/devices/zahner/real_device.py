"""Zahner/Thales driver used directly by the local runtime."""

from __future__ import annotations

import csv
import os
import statistics
from typing import Any, Callable


class ZahnerDevice:
    def __init__(self) -> None:
        self.connection: Any = None
        self.wrapper: Any = None

    @property
    def connected(self) -> bool:
        return self.wrapper is not None

    def connect(self, host: str = "localhost") -> None:
        from thales_remote.connection import ThalesRemoteConnection
        from thales_remote.script_wrapper import ThalesRemoteScriptWrapper

        if self.connection:
            try:
                if self.connection.isConnectedToTerm():
                    return
            except Exception:
                pass
            self.connection = None
            self.wrapper = None

        connection = ThalesRemoteConnection()
        success = connection.connectToTerm(host)
        if not success or not connection.isConnectedToTerm():
            raise RuntimeError("Zahner connection rejected")

        wrapper = ThalesRemoteScriptWrapper(connection)
        wrapper.forceThalesIntoRemoteScript()
        wrapper.calibrateOffsets()
        self.connection = connection
        self.wrapper = wrapper

    def disconnect(self) -> None:
        if self.connection:
            try:
                self.connection.disconnectFromTerm()
            except Exception:
                pass
        self.connection = None
        self.wrapper = None

    def get_wrapper(self):
        if not self.wrapper:
            raise RuntimeError("Zahner not connected")
        return self.wrapper

    def measure(self, measurement_type: str, parameters: dict, stream_callback: Callable | None = None) -> dict:
        from . import logic

        final_params = logic.normalize_measurement_parameters(measurement_type, parameters)
        wrapper = self.get_wrapper()

        if measurement_type in ("ocp", "open_circuit_potential", "ocp_measurement"):
            result = logic.measure_ocp(wrapper, final_params, stream_callback)
        elif measurement_type == "chronoamperometry":
            result = logic.measure_chrono(wrapper, final_params, "potentiostatic", stream_callback)
        elif measurement_type == "chronopotentiometry":
            result = logic.measure_chrono(wrapper, final_params, "galvanostatic", stream_callback)
        elif measurement_type == "voltage_ramp":
            result = logic.measure_ramp(wrapper, final_params, "potentiostatic", stream_callback)
        elif measurement_type == "current_ramp":
            result = logic.measure_ramp(wrapper, final_params, "galvanostatic", stream_callback)
        elif measurement_type == "eis_potentiostatic":
            result = logic.measure_eis(wrapper, final_params, "potentiostatic")
        elif measurement_type == "eis_galvanostatic":
            result = logic.measure_eis(wrapper, final_params, "galvanostatic")
        else:
            raise ValueError(f"Unknown measurement type: {measurement_type}")

        if isinstance(result, dict) and "output_file" in result and os.path.exists(result["output_file"]):
            stats = _calculate_stats(result["output_file"])
            if stats:
                result["statistics"] = stats
        return result

def _calculate_stats(file_path: str) -> dict:
    vals = []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                val = row.get("current") or row.get("potential")
                if val:
                    vals.append(float(val))
        if not vals:
            return {}
        return {"avg": statistics.mean(vals), "min": min(vals), "max": max(vals), "count": len(vals)}
    except Exception:
        return {}
