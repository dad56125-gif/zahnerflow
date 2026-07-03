from __future__ import annotations

import asyncio
import os

import pytest

from devices.mfc.real_device import ErrorCategory, MfcError
from runtime.device_manager import DeviceManager


def test_device_manager_initial_disconnected_contract():
    devices = DeviceManager()

    assert devices.furnace_status() == {"connected": False}
    assert devices.mfc_status() == {"connected": False, "devices": []}
    assert devices.zahner_status() == {"connected": False, "mode": "disconnected"}
    assert devices.device_mode("furnace") == "disconnected"
    assert devices.device_mode("mfc") == "disconnected"
    assert devices.device_mode("zahner") == "disconnected"


def test_furnace_simulator_status_segments_and_raw_temperature_contract():
    devices = DeviceManager()
    try:
        assert devices.connect_furnace({"port": "COM_SIMULATOR"}) == {"connected": True, "mode": "simulator"}
        assert devices.connect_furnace({"port": "COM_SIMULATOR"}) == {
            "connected": True,
            "already": True,
            "mode": "simulator",
        }

        status = devices.furnace_status()
        assert {"connected", "pv", "sv", "mv", "statusCode", "segment", "segmentTime", "segmentTimeSet"} <= status.keys()
        assert status["connected"] is True
        assert status["statusCode"] == 12

        assert devices.furnace_write_param(0x15, 0)["statusCode"] == 0
        assert devices.furnace_write_param(0x15, 4)["statusCode"] == 4
        assert devices.furnace_write_param(0x15, 12)["statusCode"] == 12
        assert devices.furnace_write_param(0x00, 3)["segment"] == 3

        devices.furnace_write_param(0x1A, 750)
        first_segment = devices.furnace_read_segments()[0]
        assert first_segment == {"id": 1, "temperature": 75.0, "time": 0}

        result = devices.furnace_write_segments([{"id": 1, "temperature": 80.0, "time": 5}])
        assert result == {"success": True, "count": 1}
        assert devices.furnace_read_segments()[0] == {"id": 1, "temperature": 80.0, "time": 5}
    finally:
        devices.disconnect_all()


def test_furnace_simulator_failure_profiles():
    devices = DeviceManager()
    try:
        devices.connect_furnace({"port": "COM_SIMULATOR", "simulatorProfile": "timeout"})
        with pytest.raises(TimeoutError):
            devices.furnace_status()
    finally:
        devices.disconnect_all()


def test_mfc_simulator_scan_setpoint_status_and_failure_contract():
    devices = DeviceManager()
    try:
        result = devices.connect_mfc({"port": "COM_SIMULATOR"})
        assert result["connected"] is True
        assert result["mode"] == "simulator"
        assert result["connection_id"].startswith("sim-")

        assert devices.mfc_scan(32)["found"] is True
        assert devices.mfc_set_setpoint(32, 500) == {"sccm": 200.0, "percent": 100.0}

        status = devices.mfc_read_status(32)
        assert {
            "address",
            "gasType",
            "maxFlowSccm",
            "flowSccm",
            "flowPercent",
            "setpointSccm",
            "digitalSetpointPercent",
            "activeSetpointPercent",
            "connectionStatus",
            "lastCommunication",
        } <= status.keys()
        assert status["address"] == 32
        assert status["gasType"] == "N2"
        assert status["maxFlowSccm"] == 200
        assert status["setpointSccm"] == 200.0

        all_status = devices.mfc_status()
        assert all_status["connected"] is True
        assert len(all_status["devices"]) == 1

        with pytest.raises(MfcError) as exc_info:
            devices.mfc_read_status(99)
        assert exc_info.value.category == ErrorCategory.DEVICE
    finally:
        devices.disconnect_all()


def test_mfc_simulator_reconnect_switches_profile_and_preserves_scan_contract():
    devices = DeviceManager()
    try:
        devices.connect_mfc({"port": "COM_SIMULATOR", "simulatorProfile": "scan-empty"})
        assert devices.mfc_scan(32) == {"found": False, "device": None}

        result = devices.connect_mfc({"port": "COM_SIMULATOR", "simulatorProfile": "normal"})
        assert result["connected"] is True
        assert result["mode"] == "simulator"

        scan_result = devices.mfc_scan(32)
        assert scan_result["found"] is True
        assert scan_result["device"]["gasType"] == "N2"
        assert scan_result["device"]["maxFlowSccm"] == 200
    finally:
        devices.disconnect_all()


def test_mfc_simulator_timeout_profile_uses_real_error_shape():
    devices = DeviceManager()
    try:
        devices.connect_mfc({"port": "COM_SIMULATOR", "simulatorProfile": "timeout"})
        with pytest.raises(MfcError) as exc_info:
            devices.mfc_scan(32)
        assert exc_info.value.category == ErrorCategory.TIMEOUT
    finally:
        devices.disconnect_all()


def test_zahner_simulator_dc_and_eis_measurement_contract(tmp_path):
    devices = DeviceManager()
    callbacks = []
    try:
        assert devices.connect_zahner({"host": "simulator"}) == {"connected": True, "mode": "simulator"}

        dc = devices.zahner_measure(
            "ocp_measurement",
            {
                "outputPath": str(tmp_path),
                "measurement_duration": 0.03,
                "sampling_interval": 0.01,
                "simulation_time_scale": 0,
                "environment_context": {"furnace_temp": 750, "mfc_flows": {"N2": 20}},
            },
            callbacks.append,
        )
        assert dc["status"] == "success"
        assert dc["points"] == dc["data_points"] >= 1
        assert os.path.exists(dc["output_file"])
        assert dc["csv_path"] == dc["output_file"]
        assert os.path.commonpath([str(tmp_path), dc["output_file"]]) == str(tmp_path)
        assert callbacks and {"t", "v", "i"} <= callbacks[0].keys()
        assert "750C" in os.path.basename(dc["output_file"])
        assert "20sccmN2" in os.path.basename(dc["output_file"])

        eis = devices.zahner_measure(
            "eis_potentiostatic",
            {
                "outputPath": str(tmp_path),
                "eis_lower_frequency": 10,
                "eis_start_frequency": 1000,
                "eis_upper_frequency": 1000,
                "eis_upper_steps": 4,
                "simulation_time_scale": 0,
            },
        )
        assert eis["status"] == "success"
        assert os.path.exists(eis["full_path"])
        assert os.path.exists(eis["csv_path"])
        assert eis["output_file"] == eis["full_path"]
        assert os.path.commonpath([str(tmp_path), eis["full_path"]]) == str(tmp_path)
        assert eis["eis_data"]["point_count"] == len(eis["eis_data"]["frequency"])
        assert len(eis["eis_data"]["frequency"]) == len(eis["eis_data"]["z_real"]) == len(eis["eis_data"]["z_imag"])
    finally:
        devices.disconnect_all()


def test_zahner_simulator_failure_profiles():
    devices = DeviceManager()
    with pytest.raises(RuntimeError, match="connection rejected"):
        devices.connect_zahner({"host": "simulator", "simulatorProfile": "connect-fail"})

    try:
        devices.connect_zahner({"host": "simulator", "simulatorProfile": "measure-fail"})
        with pytest.raises(RuntimeError, match="measurement failed"):
            devices.zahner_measure("ocp_measurement", {})
    finally:
        devices.disconnect_all()


def test_app_runtime_device_status_envelope_and_sampling_side_effects(monkeypatch):
    from runtime import app_runtime

    class FakeSio:
        def __init__(self):
            self.events = []

        async def emit(self, event, payload):
            self.events.append((event, payload))

    class FakeFurnaceData:
        def __init__(self):
            self.samples = []

        def add_sample(self, **sample):
            self.samples.append(sample)

    class FakeMfcData:
        def __init__(self):
            self.samples = []

        def add_flow_sample(self, **sample):
            self.samples.append(sample)

    fake_sio = FakeSio()
    fake_furnace = FakeFurnaceData()
    fake_mfc = FakeMfcData()
    monkeypatch.setattr(app_runtime, "furnace_data", fake_furnace)
    monkeypatch.setattr(app_runtime, "mfc_data", fake_mfc)

    runtime = app_runtime.AppRuntime()
    runtime.set_sio(fake_sio)
    runtime.devices.connect_furnace({"port": "COM_SIMULATOR"})
    runtime.devices.connect_mfc({"port": "COM_SIMULATOR"})
    runtime.devices.mfc_scan(32)

    try:
        furnace_status = runtime.devices.furnace_status()
        envelope = runtime._device_status_envelope("furnace", furnace_status)
        assert {"device", "connected", "mode", "timestamp", "payload", "connectionState", "capabilities", "deviceCount", "error"} <= envelope.keys()
        assert envelope["device"] == "furnace"
        assert envelope["connected"] is True
        assert envelope["mode"] == "simulator"
        assert "connected" not in envelope["payload"]

        asyncio.run(runtime.on_device_status("furnace", furnace_status))
        asyncio.run(runtime.on_device_status("mfc", runtime.devices.mfc_status()))

        assert fake_sio.events[0][0] == "deviceStatusUpdate"
        assert fake_furnace.samples[0]["pv"] == furnace_status["pv"]
        assert fake_mfc.samples[0]["address"] == 32
        envelope = runtime._device_status_envelope("mfc", runtime.devices.mfc_status())
        assert envelope["mode"] == "simulator"
        assert envelope["profile"] == "normal"
        assert "diagnostics" in envelope
    finally:
        runtime.devices.disconnect_all()


def test_mfc_runtime_exposes_diagnostics_and_command_logs():
    from runtime import app_runtime

    runtime = app_runtime.AppRuntime()
    runtime.devices.connect_mfc({"port": "COM_SIMULATOR"})

    try:
        runtime.devices.record_mfc_scan_range(32, 35)
        runtime.devices.mfc_scan(32)
        logs = runtime.devices.device_command_logs("mfc")
        diagnostics = runtime.devices.device_diagnostics("mfc")

        assert diagnostics["lastScanRange"] == "32-35"
        assert diagnostics["lastSuccessfulAddress"] == 32
        assert any(log["direction"] == "RX" and "FOUND 32" in log["data"] for log in logs)
    finally:
        runtime.devices.disconnect_all()


def test_app_runtime_mfc_scan_range_can_be_cancelled():
    from runtime import app_runtime

    runtime = app_runtime.AppRuntime()
    calls = []

    async def slow_scan(address: int):
        calls.append(address)
        await asyncio.sleep(0.01)
        return {
            "found": address == 32,
            "device": {
                "address": address,
                "gasType": "N2",
                "maxFlowSccm": 200,
                "name": "MFC",
            } if address == 32 else None,
        }

    runtime.mfc_scan = slow_scan

    async def scenario():
        task = asyncio.create_task(runtime.mfc_scan_range(32, 35, "COM_SIMULATOR"))
        await asyncio.sleep(0.015)
        cancel_result = await runtime.cancel_mfc_scan()
        scan_result = await task
        idle_cancel_result = await runtime.cancel_mfc_scan()
        return cancel_result, scan_result, idle_cancel_result

    cancel_result, scan_result, idle_cancel_result = asyncio.run(scenario())

    assert cancel_result["active"] is True
    assert idle_cancel_result["active"] is False
    assert 1 <= len(calls) < 4
    assert scan_result == [
        {
            "address": 32,
            "gasType": "N2",
            "maxFlowSccm": 200,
            "name": "MFC",
            "port": "COM_SIMULATOR",
        }
    ]


def test_execution_measurement_environment_context_includes_furnace_and_mfc(tmp_path):
    from runtime import app_runtime

    runtime = app_runtime.AppRuntime()
    runtime.devices.connect_furnace({"port": "COM_SIMULATOR"})
    runtime.devices.connect_mfc({"port": "COM_SIMULATOR"})
    runtime.devices.mfc_scan(32)
    with runtime.devices.mfc._lock:
        runtime.devices.mfc.devices[32].flow_sccm = 12.3

    captured = {}

    def fake_zahner_measure(measurement_type, parameters, stream_callback=None):
        captured["measurement_type"] = measurement_type
        captured["parameters"] = parameters
        return {"output_file": str(tmp_path / "fake.csv"), "csv_path": str(tmp_path / "fake.csv"), "points": 0}

    runtime.devices.zahner_measure = fake_zahner_measure
    runtime.execution.workflow_id = "wf_test"
    runtime.execution.execution_id = "exec_test"

    try:
        asyncio.run(
            runtime.execution._execute_measurement(
                {"id": "node_1"},
                "ocp_measurement",
                {"outputPath": str(tmp_path), "projectName": "proj"},
                {"originalIndex": 0, "iterationPath": []},
            )
        )
        env_context = captured["parameters"]["environment_context"]
        assert env_context["furnace_temp"] == 25
        assert env_context["mfc_flows"] == {"N2": 12.3}
    finally:
        runtime.devices.disconnect_all()
