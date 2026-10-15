"""工作流文件名的环境标签；不改设备状态或原始测量数据。"""

from decimal import Decimal, ROUND_HALF_UP
import math


def _number(value: object) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    return Decimal(str(value))


def _integer(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_HALF_UP))


def gas_filename_value(flow: object, setpoint: object) -> Decimal | None:
    """选择取整前的标签值；None 代表无效读数或确认为零设定下的零漂。"""
    q = _number(flow)
    if q is None:
        return None
    setting = _number(setpoint)
    if setting is None:
        return q
    if setting == 0:
        return None if Decimal(-10) <= q <= Decimal(10) else q
    # 仅设定读回恢复为标称整数；q 用十进制原值比较闭区间，最后才取整。
    nominal = Decimal(_integer(setting))
    return nominal if abs(q - nominal) <= abs(nominal) * Decimal("0.05") else q


def workflow_filename_environment(
    furnace_status: dict,
    mfc_status: dict,
    temperature_band: tuple[float, float] | None,
) -> dict:
    """返回既有 build_filename 消费的整数环境片段；无效字段独立省略。"""
    result = {}
    if isinstance(furnace_status, dict) and furnace_status.get("connected") is True:
        pv = _number(furnace_status.get("pv"))
        if pv is not None:
            label = pv
            if temperature_band is not None:
                target, tolerance = map(_number, temperature_band)
                if target is not None and tolerance is not None and tolerance >= 0:
                    if target - tolerance <= pv <= target + tolerance:
                        label = target
            result["furnace_temp"] = _integer(label)

    flows = {}
    if isinstance(mfc_status, dict) and mfc_status.get("connected") is True:
        devices = mfc_status.get("devices")
        for device in devices if isinstance(devices, list) else []:
            if not isinstance(device, dict) or device.get("connectionStatus") != "connected":
                continue
            gas = device.get("gasType")
            if not isinstance(gas, str) or not gas.strip() or gas.lower() == "unknown":
                continue
            label = gas_filename_value(device.get("flowSccm"), device.get("setpointSccm"))
            if label is not None:
                flows[gas] = _integer(label)
    if flows:
        result["mfc_flows"] = dict(sorted(flows.items()))
    return result
