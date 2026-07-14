from __future__ import annotations

import asyncio
import copy

import pytest

from runtime import app_runtime


@pytest.fixture
def isolated_runtime(monkeypatch):
    persisted: dict[str, dict] = {}

    monkeypatch.setattr(app_runtime, "load_runtime_state", lambda device: copy.deepcopy(persisted.get(device)))
    monkeypatch.setattr(
        app_runtime,
        "save_runtime_state",
        lambda device, state: persisted.__setitem__(device, copy.deepcopy(state)),
    )
    monkeypatch.setattr(app_runtime, "record_runtime_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(app_runtime.furnace_data, "add_sample", lambda **kwargs: None)
    monkeypatch.setattr(app_runtime.mfc_data, "add_flow_sample", lambda **kwargs: None)
    runtime = app_runtime.AppRuntime()
    yield runtime, persisted
    runtime.devices.disconnect_all()


def test_furnace_business_time_uses_confirmed_lifecycle_baselines(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        await runtime.connect_device("furnace", {"port": "COM_SIMULATOR"})

        runtime.devices.furnace_write_param(0x15, 0)
        await runtime._finish_furnace_action(
            "run",
            runtime.devices.furnace_status(),
            now="2026-07-14T00:00:00.000Z",
        )

        runtime.devices.furnace_write_param(0x15, 4)
        await runtime._finish_furnace_action(
            "pause",
            runtime.devices.furnace_status(),
            now="2026-07-14T00:01:00.000Z",
        )
        assert runtime._runtime_states["furnace"]["accumulatedRunSeconds"] == 60
        assert runtime._runtime_states["furnace"]["currentRunStartedAt"] is None

        runtime.devices.furnace_write_param(0x15, 0)
        await runtime._finish_furnace_action(
            "run",
            runtime.devices.furnace_status(),
            now="2026-07-14T00:02:00.000Z",
        )
        runtime.devices.furnace_write_param(0x15, 12)
        await runtime._finish_furnace_action(
            "stop",
            runtime.devices.furnace_status(),
            now="2026-07-14T00:03:00.000Z",
        )

    asyncio.run(scenario())
    state = runtime._runtime_states["furnace"]
    assert state["executionStatus"] == "stopped"
    assert state["accumulatedRunSeconds"] == 120
    assert state["currentRunStartedAt"] is None


def test_disconnect_and_stale_generation_cannot_restore_furnace_state(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        await runtime.connect_device("furnace", {"port": "COM_SIMULATOR"})
        await runtime.furnace_run()
        old_generation = runtime.devices.connection_generation("furnace")
        await runtime.disconnect_device("furnace")
        await runtime.on_device_status(
            "furnace",
            {"connected": True, "pv": 999, "sv": 999, "statusCode": 0, "segment": 1},
            generation=old_generation,
        )

    asyncio.run(scenario())
    state = runtime._runtime_states["furnace"]
    assert state["connectionStatus"] == "disconnected"
    assert state["executionStatus"] == "error"
    assert state["currentRunStartedAt"] is None
    assert state["deviceStatus"] is None


def test_mfc_single_scan_replaces_previous_snapshot_and_empty_scan_clears_it(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        await runtime.connect_device("mfc", {"port": "COM_SIMULATOR"})
        await runtime.mfc_scan_range(32, 34, "COM_SIMULATOR")
        assert [device["address"] for device in runtime._runtime_states["mfc"]["scannedDevices"]] == [32, 33, 34]
        await runtime.mfc_scan(99, reset=True)

    asyncio.run(scenario())
    assert runtime._runtime_states["mfc"]["scannedDevices"] == []
    assert runtime.devices.mfc_status()["devices"] == []


def test_mfc_scan_route_returns_the_current_snapshot_array(isolated_runtime, monkeypatch):
    runtime, _persisted = isolated_runtime
    from routers import devices as device_routes

    monkeypatch.setattr(device_routes, "runtime", runtime)

    async def scenario():
        await runtime.connect_device("mfc", {"port": "COM_SIMULATOR"})
        first = await device_routes._mfc_route(
            "scan",
            "POST",
            {"address": 32, "scanStartAddress": 32, "scanEndAddress": 34},
            {},
        )
        second = await device_routes._mfc_route(
            "scan",
            "POST",
            {"address": 33, "scanStartAddress": 32, "scanEndAddress": 34},
            {},
        )
        empty = await device_routes._mfc_route(
            "scan",
            "POST",
            {"address": 99, "scanStartAddress": 99, "scanEndAddress": 99},
            {},
        )
        return first, second, empty

    first, second, empty = asyncio.run(scenario())
    assert [device["address"] for device in first] == [32]
    assert [device["address"] for device in second] == [32, 33]
    assert empty == []


def test_workflow_worker_confirmation_enters_the_same_runtime_state(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        runtime.loop = asyncio.get_running_loop()
        await runtime.connect_device("furnace", {"port": "COM_SIMULATOR"})
        await asyncio.to_thread(runtime.confirm_furnace_action_from_worker, "run", "workflow-1")
        assert runtime._runtime_states["furnace"]["executionId"] == "workflow-1"
        assert runtime._runtime_states["furnace"]["executionStatus"] == "running"
        await asyncio.to_thread(runtime.confirm_furnace_action_from_worker, "stop", "workflow-1")

    asyncio.run(scenario())
    assert runtime._runtime_states["furnace"]["executionStatus"] == "stopped"


def test_stale_workflow_execution_confirmation_cannot_overwrite_current_furnace_run(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        runtime.loop = asyncio.get_running_loop()
        await runtime.connect_device("furnace", {"port": "COM_SIMULATOR"})
        await asyncio.to_thread(runtime.confirm_furnace_action_from_worker, "run", "workflow-current")

        with pytest.raises(RuntimeError, match="Stale Furnace execution event"):
            await asyncio.to_thread(runtime.confirm_furnace_action_from_worker, "run", "workflow-old")
        with pytest.raises(RuntimeError, match="Stale Furnace execution event"):
            await asyncio.to_thread(runtime.confirm_furnace_action_from_worker, "stop", "workflow-old")

        state = runtime._runtime_states["furnace"]
        assert state["executionId"] == "workflow-current"
        assert state["executionStatus"] == "running"

    asyncio.run(scenario())


def test_runtime_restart_does_not_restore_physical_connection_or_unknown_offline_time(isolated_runtime):
    runtime, _persisted = isolated_runtime

    async def scenario():
        await runtime.connect_device("furnace", {"port": "COM_SIMULATOR"})
        runtime.devices.furnace_write_param(0x15, 0)
        await runtime._finish_furnace_action(
            "run",
            runtime.devices.furnace_status(),
            now="2026-07-14T00:00:00.000Z",
        )

        restarted = app_runtime.AppRuntime()
        state = restarted._runtime_states["furnace"]
        assert state["connectionStatus"] == "disconnected"
        assert state["deviceStatus"] is None
        assert state["executionStatus"] == "error"
        assert state["currentRunStartedAt"] is None
        assert state["accumulatedRunSeconds"] == 0

    asyncio.run(scenario())
