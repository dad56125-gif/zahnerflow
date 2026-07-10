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

        final_params = _normalize_parameters(measurement_type, parameters)
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


def _normalize_parameters(measurement_type: str, raw_params: dict) -> dict:
    raw_params = raw_params or {}
    defaults = {
        "common": {
            "output_path": "c:/zahner_data",
            "filename": "measurement",
            "measurement_duration": 60.0,
            "sampling_interval": 1.0,
        },
        "chronoamperometry": {"polarization_voltage": 1.0, "min_current": -1.0, "max_current": 1.0},
        "chronopotentiometry": {"polarization_current": 0.01, "min_voltage": -4.0, "max_voltage": 4.0},
        "voltage_ramp": {"start_voltage": 0.0, "end_voltage": 1.0, "scan_rate": 0.01},
        "current_ramp": {"start_current": 0.0, "end_current": 0.01, "scan_rate": 0.0001},
        "eis_potentiostatic": {"potential": 0.0, "start_frequency": 100000.0, "end_frequency": 0.1, "points_per_decade": 10},
        "eis_galvanostatic": {"current": 0.01, "start_frequency": 100000.0, "end_frequency": 0.1, "points_per_decade": 10},
    }

    final_params = defaults["common"].copy()
    final_params.update(defaults.get(measurement_type, {}))
    final_params.update(raw_params)
    aliases = {
        "outputPath": "output_path",
        "measurementDuration": "measurement_duration",
        "samplingInterval": "sampling_interval",
        "eisLowerFrequency": "eis_lower_frequency",
        "eisStartFrequency": "eis_start_frequency",
        "eisUpperFrequency": "eis_upper_frequency",
        "eisAmplitude": "eis_amplitude",
        "eisPotential": "eis_potential",
        "eisCurrent": "eis_current",
        "eisLowerPeriods": "eis_lower_periods",
        "eisUpperPeriods": "eis_upper_periods",
        "eisLowerSteps": "eis_lower_steps",
        "eisUpperSteps": "eis_upper_steps",
        "eisScanDirection": "eis_scan_direction",
        "eisScanStrategy": "eis_scan_strategy",
    }
    for source, target in aliases.items():
        if source in raw_params and target not in raw_params:
            final_params[target] = raw_params[source]

    float_keys = {
        "polarization_voltage",
        "polarization_current",
        "measurement_duration",
        "sampling_interval",
        "min_current",
        "max_current",
        "min_voltage",
        "max_voltage",
        "start_voltage",
        "end_voltage",
        "scan_rate",
        "start_current",
        "end_current",
        "potential",
        "current",
        "eis_lower_frequency",
        "eis_start_frequency",
        "eis_upper_frequency",
        "eis_amplitude",
        "eis_potential",
        "eis_current",
        "start_frequency",
        "end_frequency",
    }
    for key in float_keys:
        if key in final_params:
            final_params[key] = float(final_params[key])
    if "points_per_decade" in final_params:
        final_params["points_per_decade"] = int(final_params["points_per_decade"])
    for key in ("eis_lower_periods", "eis_upper_periods", "eis_lower_steps", "eis_upper_steps"):
        if key in final_params:
            final_params[key] = int(final_params[key])

    if measurement_type in ("eis_potentiostatic", "eis_galvanostatic"):
        direction = final_params.get("eis_scan_direction", "START_TO_MIN")
        if direction not in ("START_TO_MAX", "START_TO_MIN"):
            raise ValueError(f"Unsupported EIS scan direction: {direction}")
        final_params["eis_scan_direction"] = direction

        lower = final_params.get("eis_lower_frequency")
        upper = final_params.get("eis_upper_frequency")
        if lower is not None and upper is not None:
            if lower > upper:
                raise ValueError("EIS lower frequency must not exceed upper frequency")
            final_params["eis_start_frequency"] = lower if direction == "START_TO_MAX" else upper
    return final_params


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
