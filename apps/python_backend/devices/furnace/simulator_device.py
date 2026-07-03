#!/usr/bin/env python3
"""
Internal Furnace simulator for the unified Python backend.
"""

from __future__ import annotations

import threading
import time
from typing import Dict, List, Optional


class FurnaceSimulator:
    def __init__(self, profile: str = "normal"):
        self.connected = False
        self.profile = profile
        self.pv = 25.0
        self.sv = 25.0
        self.mv = 0
        self.status_code = 12
        self.current_segment = 1
        self.segment_time = 0
        self.segment_time_set = 0
        self.segments: List[Dict] = [{"id": i, "temperature": 25.0, "time": 0} for i in range(1, 31)]
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start_simulation(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self._thread.start()

    def stop_simulation(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def disconnect(self):
        self.connected = False
        self.stop_simulation()

    def assert_available(self):
        if not self.connected or self.profile == "disconnect":
            raise RuntimeError("Furnace simulator disconnected")
        if self.profile == "timeout":
            raise TimeoutError("Furnace simulator serial read timeout")
        if self.profile == "invalid-response":
            raise RuntimeError("Invalid furnace simulator response length")

    def status_payload(self) -> dict:
        self.assert_available()
        seg_time_set = 0
        if 1 <= self.current_segment <= len(self.segments):
            seg_time_set = self.segments[self.current_segment - 1]["time"]
        return {
            "connected": True,
            "pv": round(self.pv, 1),
            "sv": round(self.sv, 1),
            "mv": self.mv,
            "statusCode": self.status_code,
            "segment": self.current_segment,
            "segmentTime": int(self.segment_time),
            "segmentTimeSet": seg_time_set,
        }

    def write_param(self, code: int, value: int) -> dict:
        self.assert_available()
        is_temperature_addr = code >= 0x1A and code <= 0x54 and ((code - 0x1A) % 2 == 0)
        if is_temperature_addr:
            segment_idx = (code - 0x1A) // 2
            if 0 <= segment_idx < len(self.segments):
                # AI-518P temperature parameters are raw tenths of a degree.
                self.segments[segment_idx]["temperature"] = float(value) / 10.0
        elif code >= 0x1B and code <= 0x55 and ((code - 0x1B) % 2 == 0):
            segment_idx = (code - 0x1B) // 2
            if 0 <= segment_idx < len(self.segments):
                self.segments[segment_idx]["time"] = value
        elif code == 0x15:
            self.status_code = value
        elif code == 0x00:
            self.current_segment = max(1, min(int(value), len(self.segments)))
            self.segment_time = 0
        return {
            **self.status_payload(),
            "value": value,
        }

    def read_segments(self) -> list[dict]:
        self.assert_available()
        return [
            {"id": i + 1, "temperature": seg["temperature"], "time": seg["time"]}
            for i, seg in enumerate(self.segments)
        ]

    def write_segments(self, segments: list[dict]) -> dict:
        self.assert_available()
        for seg in segments:
            idx = int(seg.get("id", 0)) - 1
            if 0 <= idx < len(self.segments):
                self.segments[idx]["temperature"] = float(seg.get("temperature", 0))
                self.segments[idx]["time"] = int(round(float(seg.get("time", 0))))
        return {"success": True, "count": len(segments)}

    def _simulation_loop(self):
        last_time = time.time()
        while self._running:
            now = time.time()
            dt = now - last_time
            last_time = now
            with self._lock:
                if self.connected and self.profile == "normal" and self.status_code == 0:
                    seg_idx = self.current_segment - 1
                    if seg_idx < 0 or seg_idx >= len(self.segments):
                        self.status_code = 12
                        continue

                    current_segment = self.segments[seg_idx]
                    next_segment = self.segments[min(seg_idx + 1, len(self.segments) - 1)]
                    duration_minutes = float(current_segment["time"] or 0)
                    self.segment_time_set = duration_minutes

                    if duration_minutes <= 0:
                        self.status_code = 12
                        continue

                    self.segment_time += dt / 60.0
                    progress = min(self.segment_time / duration_minutes, 1.0)
                    self.sv = current_segment["temperature"] + (
                        next_segment["temperature"] - current_segment["temperature"]
                    ) * progress

                    delta = self.sv - self.pv
                    self.mv = max(-100, min(100, int(delta * 4)))
                    if abs(delta) > 0.05:
                        self.pv += delta * min(dt * 0.5, 1.0)
                    else:
                        self.pv = self.sv

                    if progress >= 1.0:
                        self.current_segment = min(self.current_segment + 1, len(self.segments))
                        self.segment_time = 0

            time.sleep(0.2)
