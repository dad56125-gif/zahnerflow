"""Zahner/Thales simulator used by the local runtime."""

from __future__ import annotations

import csv
import math
import os
import random
import time
from typing import Callable

from devices.zahner import logic
from devices.zahner.real_device import _calculate_stats


class ZahnerSimulator:
    def __init__(self, profile: str = "normal"):
        self.connected = True
        self.profile = profile
        self.ocv = 0.82
        self.series_resistance = 0.15

    def disconnect(self):
        self.connected = False

    def _assert_available(self):
        if not self.connected or self.profile == "disconnect":
            raise RuntimeError("Zahner simulator disconnected")
        if self.profile == "timeout":
            raise TimeoutError("Zahner simulator measurement timeout")
        if self.profile == "measure-fail":
            raise RuntimeError("Zahner simulator measurement failed")

    def measure(self, measurement_type: str, parameters: dict, stream_callback: Callable | None = None) -> dict:
        self._assert_available()
        final_params = logic.normalize_measurement_parameters(measurement_type, parameters)

        if measurement_type in ("ocp", "open_circuit_potential"):
            measurement_type = "ocp_measurement"

        if measurement_type == "ocp_measurement":
            result = self._measure_dc(measurement_type, final_params, stream_callback, mode="ocp")
        elif measurement_type == "chronoamperometry":
            result = self._measure_dc(measurement_type, final_params, stream_callback, mode="ca")
        elif measurement_type == "chronopotentiometry":
            result = self._measure_dc(measurement_type, final_params, stream_callback, mode="cp")
        elif measurement_type == "voltage_ramp":
            result = self._measure_dc(measurement_type, final_params, stream_callback, mode="voltage_ramp")
        elif measurement_type == "current_ramp":
            result = self._measure_dc(measurement_type, final_params, stream_callback, mode="current_ramp")
        elif measurement_type in ("eis_potentiostatic", "eis_galvanostatic"):
            result = self._measure_eis(measurement_type, final_params)
        else:
            raise ValueError(f"Unknown measurement type: {measurement_type}")

        output_file = result.get("output_file") or result.get("full_path")
        if output_file and os.path.exists(output_file):
            stats = _calculate_stats(result.get("csv_path") or output_file)
            if stats:
                result["statistics"] = stats
        return result

    def _measure_dc(self, measurement_type: str, params: dict, callback: Callable | None, mode: str) -> dict:
        duration = max(0.0, float(params.get("measurement_duration", 60.0)))
        interval = max(0.001, float(params.get("sampling_interval", 1.0)))
        cancel_requested = params.get("_cancel_requested")
        output_file = self._output_file(params, measurement_type, ".csv")

        min_current = float(params.get("min_current", -2.0))
        max_current = float(params.get("max_current", 2.0))
        min_voltage = float(params.get("min_voltage", -5.0))
        max_voltage = float(params.get("max_voltage", 5.0))
        points = max(1, int(math.ceil(duration / interval)))
        records = []
        error_reason = None

        for point in range(points):
            if callable(cancel_requested) and cancel_requested():
                raise RuntimeError("Measurement cancelled by workflow stop")
            t = round(point * interval, 3)
            voltage, current, setpoint = self._dc_values(mode, params, t, duration)
            if callback:
                callback({"t": t, "v": round(voltage, 6), "i": round(current, 9)})

            record = {"time": t}
            if mode == "ocp":
                record["potential"] = voltage
            elif mode in ("voltage_ramp", "current_ramp"):
                record.update({"voltage": voltage, "current": current, "setpoint": setpoint})
            else:
                record.update({"potential": voltage, "current": current})
            records.append(record)

            if not (min_current <= current <= max_current):
                error_reason = f"Current limit exceeded: {current:.4e} A"
                break
            if not (min_voltage <= voltage <= max_voltage):
                error_reason = f"Voltage limit exceeded: {voltage:.4f} V"
                break
            self._simulated_sleep(interval, params)

        self._write_csv(output_file, records)
        status = "stopped_safety" if error_reason else "success"
        result = {
            "output_file": output_file,
            "csv_path": output_file,
            "status": status,
            "duration": duration,
            "data_points": len(records),
            "points": len(records),
        }
        if error_reason:
            result["reason"] = error_reason
        return result

    def _measure_eis(self, measurement_type: str, params: dict) -> dict:
        output_path = self._output_path(params)
        filename = logic.build_filename(measurement_type, params)
        full_path = os.path.join(output_path, f"{filename}.ism")
        csv_path = os.path.join(output_path, f"{filename}.csv")

        frequency = self._eis_frequencies(params)
        amplitude = float(params.get("eis_amplitude", 10e-3))
        bias = self._eis_bias(measurement_type, params)
        z_real, z_imag = [], []
        for freq in frequency:
            omega = 2 * math.pi * freq
            z = self.series_resistance + 0.5 / (1 + 1j * omega * 0.0005)
            z_real.append(z.real + random.gauss(0, 0.001))
            z_imag.append(z.imag + random.gauss(0, 0.001))

        self._write_csv(
            csv_path,
            [
                {"frequency": f, "z_real": zr, "z_imag": zi}
                for f, zr, zi in zip(frequency, z_real, z_imag)
            ],
        )
        with open(full_path, "w", encoding="utf-8") as f:
            f.write("# Zahner simulator ISM placeholder\n")
            f.write("# This file is not a binary Zahner Common Data Format export.\n")
            f.write(f"# CSV: {csv_path}\n")
            f.write(f"# Points: {len(frequency)}\n")

        return {
            "output_path": output_path,
            "filename": filename,
            "full_path": full_path,
            "output_file": full_path,
            "csv_path": csv_path,
            "status": "success",
            "points": len(frequency),
            "parameters": {"amplitude": amplitude, "bias": bias},
            "eis_data": {
                "frequency": frequency,
                "z_real": z_real,
                "z_imag": z_imag,
                "csv_path": csv_path,
                "point_count": len(frequency),
            },
        }

    def _dc_values(self, mode: str, params: dict, t: float, duration: float) -> tuple[float, float, float | None]:
        noise_v = random.gauss(0, 0.0008)
        noise_i = random.gauss(0, 0.00002)
        if mode == "ocp":
            return self.ocv + noise_v, 0.0, None
        if mode == "ca":
            voltage = float(params.get("polarization_voltage", 0.0))
            current = (voltage - self.ocv) / max(self.series_resistance, 1e-9) + noise_i
            return voltage + noise_v, current, voltage
        if mode == "cp":
            current = float(params.get("polarization_current", 0.0))
            voltage = self.ocv + current * self.series_resistance + noise_v
            return voltage, current + noise_i, current
        if mode == "voltage_ramp":
            start = float(params.get("start_voltage", 0.0))
            end = float(params.get("end_voltage", 1.0))
            setpoint = self._ramp_setpoint(start, end, t, duration)
            current = (setpoint - self.ocv) / max(self.series_resistance, 1e-9) + noise_i
            return setpoint + noise_v, current, setpoint
        if mode == "current_ramp":
            start = float(params.get("start_current", 0.0))
            end = float(params.get("end_current", 0.0))
            setpoint = self._ramp_setpoint(start, end, t, duration)
            voltage = self.ocv + setpoint * self.series_resistance + noise_v
            return voltage, setpoint + noise_i, setpoint
        raise ValueError(f"Unknown simulator mode: {mode}")

    def _ramp_setpoint(self, start: float, end: float, t: float, duration: float) -> float:
        if duration <= 0:
            return end
        return start + (end - start) * min(max(t / duration, 0.0), 1.0)

    def _eis_frequencies(self, params: dict) -> list[float]:
        lower = float(params.get("eis_lower_frequency", 10.0))
        upper = float(params.get("eis_upper_frequency", 100000.0))
        start = float(params.get("eis_start_frequency", upper))
        steps = int(params.get("eis_upper_steps", 10))
        lower = max(lower, 1e-9)
        upper = max(upper, lower)
        steps = max(1, steps)
        decades = max(0.0, math.log10(upper / lower))
        count = max(1, int(math.ceil(decades * steps)))
        direction = params.get("eis_scan_direction", "START_TO_MIN")
        if direction == "START_TO_MAX":
            base = min(start, upper)
            return [min(upper, base * (10 ** (i / steps))) for i in range(count)]
        base = min(max(start, lower), upper)
        return [max(lower, base * (10 ** (-i / steps))) for i in range(count)]

    def _eis_bias(self, measurement_type: str, params: dict):
        if not params.get("enable_dc_bias", measurement_type == "eis_galvanostatic"):
            return "OCP/Off"
        if measurement_type == "eis_potentiostatic":
            return float(params.get("eis_potential", 0.0))
        return float(params.get("eis_current", 0.0))

    def _output_path(self, params: dict) -> str:
        output_path = params.get("output_path") or "c:/zahner_data"
        os.makedirs(output_path, exist_ok=True)
        return output_path

    def _output_file(self, params: dict, measurement_type: str, suffix: str) -> str:
        output_path = self._output_path(params)
        filename = logic.build_filename(measurement_type, params)
        return os.path.join(output_path, f"{filename}{suffix}")

    def _write_csv(self, path: str, records: list[dict]) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        fieldnames = list(records[0].keys()) if records else ["time", "potential", "current"]
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)

    def _simulated_sleep(self, interval: float, params: dict) -> None:
        scale = float(params.get("simulation_time_scale", 50.0))
        if scale <= 0:
            return
        time.sleep(min(0.05, interval / scale))
