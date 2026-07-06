"""
Devices — /api/devices/* routes backed by the in-process runtime.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from device_data_service import furnace_data, mfc_data
from runtime.app_runtime import runtime

router = APIRouter(tags=["devices"])


def _real_serial_ports(list_ports_func) -> list[str]:
    return [port for port in list_ports_func() if port != "COM_SIMULATOR"]


@router.get("/api/devices/furnace/samples")
def get_furnace_samples(from_ts: str = None, to: str = None, limit: int = None, downsample: int = None):
    return furnace_data.query_samples(from_ts=from_ts, to_ts=to, limit=limit, downsample=downsample)


@router.get("/api/devices/furnace/activity-summary")
def get_furnace_activity_summary(from_ts: str = None, to: str = None, slot_hours: int = 4):
    return furnace_data.query_activity_summary(from_ts=from_ts, to_ts=to, slot_hours=slot_hours)


@router.get("/api/devices/furnace/logs/temperature")
def get_furnace_temperature_logs(from_ts: str = None, to: str = None, limit: int = None, downsample: int = None):
    return furnace_data.query_samples(from_ts=from_ts, to_ts=to, limit=limit, downsample=downsample)


@router.get("/api/devices/mfc/logs/flow")
def get_mfc_flow_logs(address: int = None, from_ts: str = None, to: str = None, limit: int = None, downsample: int = None):
    return mfc_data.query_flow_history(device_address=address, from_ts=from_ts, to_ts=to, limit=limit, downsample=downsample)


@router.api_route("/api/devices/{device}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def device_api(device: str, path: str, request: Request):
    device_map = {"zahner-zennium": "zahner", "furnace": "furnace", "mfc": "mfc"}
    device_type = device_map.get(device, device)
    method = request.method
    body = await request.body() if method in ("POST", "PUT", "PATCH") else None
    body_json = json.loads(body) if body else {}
    query_params = dict(request.query_params) if request.query_params else {}

    try:
        if device_type == "furnace":
            return await _furnace_route(path, method, body_json, query_params)
        if device_type == "mfc":
            return await _mfc_route(path, method, body_json, query_params)
        if device_type == "zahner":
            return await _zahner_route(path, method, body_json, query_params)
        raise HTTPException(status_code=404, detail=f"Unknown device: {device}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _furnace_route(path: str, method: str, body_json: dict, query_params: dict):
    if path == "presets" and method == "GET":
        return furnace_data.list_presets()
    if path == "presets" and method == "POST":
        name = body_json.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Missing preset name")
        return furnace_data.create_preset(name, body_json.get("segments", []), body_json.get("summary", ""))
    if path.startswith("presets/"):
        return await _furnace_preset_route(path, method, body_json)
    if path == "connect" and method == "POST":
        return await runtime.connect_device("furnace", body_json)
    if path == "disconnect" and method == "POST":
        return await runtime.disconnect_device("furnace")
    if path == "status" and method == "GET":
        return await runtime.device_status("furnace")
    if path == "runtime/status" and method == "GET":
        return await runtime.runtime_device_status("furnace")
    if path == "command-logs" and method == "GET":
        return {"logs": runtime.devices.device_command_logs("furnace")}
    if path == "command-logs/clear" and method == "POST":
        runtime.devices.clear_device_command_logs("furnace")
        return {"logs": []}
    if path == "run" and method == "POST":
        return await runtime.furnace_run()
    if path == "stop" and method == "POST":
        return await runtime.furnace_stop()
    if path == "pause" and method == "POST":
        return await runtime.furnace_pause()
    if path == "segment/set" and method == "POST":
        return await runtime.furnace_set_segment(body_json.get("segment"))
    if path == "program/segments" and method == "GET":
        return {"segments": await runtime.furnace_read_segments()}
    if path == "program/segments" and method == "POST":
        return await runtime.furnace_write_segments(body_json.get("segments", []))
    if path == "ports" and method == "GET":
        try:
            from devices.furnace.real_device import list_ports

            return _real_serial_ports(list_ports)
        except Exception:
            return []
    if path == "parameter/write" and method == "POST":
        return await runtime.furnace_write_param(body_json.get("code"), body_json.get("value"))
    if path.startswith("program/segments/") and method == "GET":
        seg_id = int(path.split("/")[-1])
        segments = await runtime.furnace_read_segments()
        if 1 <= seg_id <= len(segments):
            return {"segmentData": segments[seg_id - 1]}
        raise HTTPException(status_code=404, detail="Segment not found")
    raise HTTPException(status_code=404, detail=f"Unknown furnace path: {path}")


async def _furnace_preset_route(path: str, method: str, body_json: dict):
    preset_path = path[len("presets/") :]
    preset_name, _, preset_action = preset_path.partition("/")
    if not preset_name:
        raise HTTPException(status_code=400, detail="Missing preset name")
    if not preset_action and method == "GET":
        preset = furnace_data.get_preset(preset_name)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")
        return preset
    if not preset_action and method == "PUT":
        updated = furnace_data.update_preset(preset_name, body_json.get("segments", []))
        if not updated:
            raise HTTPException(status_code=404, detail="Preset not found")
        return updated
    if not preset_action and method == "DELETE":
        if not furnace_data.delete_preset(preset_name):
            raise HTTPException(status_code=404, detail="Preset not found")
        return {"message": "Preset deleted"}
    if preset_action == "clone" and method == "POST":
        cloned = furnace_data.clone_preset(preset_name, body_json.get("newName"))
        if not cloned:
            raise HTTPException(status_code=404, detail="Source preset not found")
        return cloned
    if preset_action == "apply" and method == "POST":
        preset = furnace_data.get_preset(preset_name)
        if not preset:
            raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found")
        current_segments = await runtime.furnace_read_segments()
        preset_segments = preset.get("segments", [])
        if furnace_data.segments_equal(current_segments, preset_segments):
            return {"changed": False, "steps": ["No change (idempotent)."]}
        await runtime.furnace_write_segments(preset_segments)
        updated_segments = await runtime.furnace_read_segments()
        if not furnace_data.segments_equal(updated_segments, preset_segments):
            try:
                await runtime.furnace_write_segments(current_segments)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Verification failed after applying preset")
        return {"changed": True, "steps": ["Applied preset and verified."]}
    raise HTTPException(status_code=404, detail=f"Unknown furnace preset path: {path}")


async def _mfc_route(path: str, method: str, body_json: dict, query_params: dict):
    if path == "connect" and method == "POST":
        return await runtime.connect_device("mfc", body_json)
    if path == "disconnect" and method == "POST":
        return await runtime.disconnect_device("mfc")
    if path == "status" and method == "GET":
        status = await runtime.device_status("mfc")
        address = query_params.get("address")
        if address is None:
            return status
        matched = next((item for item in status.get("devices", []) if str(item.get("address")) == str(address)), None)
        if matched is None:
            raise HTTPException(status_code=404, detail=f"MFC device {address} not found")
        return matched
    if path == "runtime/status" and method == "GET":
        return await runtime.runtime_device_status("mfc")
    if path == "command-logs" and method == "GET":
        return {"logs": runtime.devices.device_command_logs("mfc")}
    if path == "command-logs/clear" and method == "POST":
        runtime.devices.clear_device_command_logs("mfc")
        return {"logs": []}
    if path == "setpoint" and method == "POST":
        return await runtime.mfc_setpoint(int(body_json.get("address")), float(body_json.get("sccm", 0)))
    if path == "scan" and method == "POST":
        start_address = int(body_json.get("startAddress", body_json.get("start_address", 32)))
        end_address = int(body_json.get("endAddress", body_json.get("end_address", 80)))
        diagnostic_start_address = int(
            body_json.get("scanStartAddress", body_json.get("scan_start_address", start_address))
        )
        diagnostic_end_address = int(
            body_json.get("scanEndAddress", body_json.get("scan_end_address", end_address))
        )
        if body_json.get("address") is not None:
            start_address = end_address = int(body_json["address"])
        return await runtime.mfc_scan_range(
            start_address,
            end_address,
            body_json.get("port"),
            diagnostic_start_address,
            diagnostic_end_address,
        )
    if path == "scan" and method == "DELETE":
        return await runtime.cancel_mfc_scan()
    if path == "ports" and method == "GET":
        try:
            from devices.mfc.real_device import list_ports

            return _real_serial_ports(list_ports)
        except Exception:
            return []
    if path == "devices" and method == "GET":
        return (await runtime.device_status("mfc")).get("devices", [])
    raise HTTPException(status_code=404, detail=f"Unknown MFC path: {path}")


async def _zahner_route(path: str, method: str, body_json: dict, query_params: dict):
    if path == "connect" and method == "POST":
        return await runtime.connect_device("zahner", body_json)
    if path == "disconnect" and method == "POST":
        return await runtime.disconnect_device("zahner")
    if path == "status" and method == "GET":
        return await runtime.device_status("zahner")
    if path == "runtime/status" and method == "GET":
        return await runtime.runtime_device_status("zahner")
    if path == "ports" and method == "GET":
        return ["localhost"]
    raise HTTPException(status_code=404, detail=f"Unknown Zahner path: {path}")
