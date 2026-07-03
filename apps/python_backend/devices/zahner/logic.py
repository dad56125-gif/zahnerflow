# -*- coding: utf-8 -*-
import time
import datetime
import os
import csv
import math
from typing import Optional, Callable, Dict, Any

# ISM 文件解析器
from .ism_parser import parse_ism_file

# 引入 Zahner 官方库。模拟器只需要本文件的命名/工具函数，不能被真机 SDK 依赖卡住。
try:
    from thales_remote.script_wrapper import (
        PotentiostatMode,
        FileNaming,
        ScanDirection,
        ScanStrategy,
        ThalesRemoteScriptWrapper,
    )
except ImportError:
    PotentiostatMode = None
    FileNaming = None
    ScanDirection = None
    ScanStrategy = None
    ThalesRemoteScriptWrapper = Any

# ==========================================
# 1. 辅助工具函数
# ==========================================

def accurate_timer(duration: float, interval: float):
    """
    高精度生成器定时器，用于消除长时间测量的累积误差。
    """
    start_time = time.monotonic()
    next_tick = start_time
    # 稍微增加一点缓冲，确保最后一个点能覆盖
    end_time = start_time + duration + (interval * 0.1)

    while True:
        now = time.monotonic()
        if now > end_time:
            break
        
        yield
        
        next_tick += interval
        sleep_duration = next_tick - time.monotonic()
        if sleep_duration > 0:
            time.sleep(sleep_duration)


def _raise_if_cancel_requested(params: dict):
    cancel_requested = params.get("_cancel_requested")
    if callable(cancel_requested) and cancel_requested():
        raise RuntimeError("Measurement cancelled by workflow stop")

def _save_data_chunk(filename: str, data: list, mode='a'):
    """
    将缓冲数据写入 CSV 文件。
    """
    if not data:
        return
    
    # 检查文件状态以决定是否写入表头
    file_exists = os.path.exists(filename) and os.path.getsize(filename) > 0
    fieldnames = data[0].keys()
    
    try:
        # 自动创建父目录
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        with open(filename, mode, newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerows(data)
    except Exception as e:
        print(f"[Logic Error] Save CSV failed: {e}")

def format_voltage_for_filename(value: float) -> str:
    """
    智能电压格式化 (用于文件名，无小数点)
    """
    if value == 0:
        return "0mV"
    
    abs_val = abs(value)
    
    # 检查是否为整数伏特
    if abs_val >= 1 and value == int(value):
        return f"{int(value)}V"
    
    # 毫伏范围 (>= 1mV)
    if abs_val >= 0.001:
        mv = round(value * 1000)
        return f"{mv}mV"
    
    # 微伏范围
    uv = round(value * 1e6)
    return f"{uv}uV"

def format_current_for_filename(value: float) -> str:
    """
    智能电流格式化 (用于文件名，无小数点)
    """
    if value == 0:
        return "0mA"
    
    abs_val = abs(value)
    
    # 检查是否为整数安培
    if abs_val >= 1 and value == int(value):
        return f"{int(value)}A"
    
    # 毫安范围 (>= 1mA)
    if abs_val >= 0.001:
        ma = round(value * 1000)
        return f"{ma}mA"
    
    # 微安范围 (>= 1uA)
    if abs_val >= 1e-6:
        ua = round(value * 1e6)
        return f"{ua}uA"
    
    # 纳安范围
    na = round(value * 1e9)
    return f"{na}nA"

def build_filename(measurement_type: str, params: dict) -> str:
    """
    根据测量类型和参数构建文件名 (无小数点)
    支持环境上下文：furnace_temp, mfc_flows
    """
    timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
    
    # 构建基础文件名（根据测量类型）
    if measurement_type == "eis_potentiostatic":
        if not params.get("enable_dc_bias", False):
            param_str = "OCV"
        else:
            param_str = format_voltage_for_filename(params.get('eis_potential', 0))
        base_name = f"EIS_{param_str}"
    
    elif measurement_type == "eis_galvanostatic":
        param_str = format_current_for_filename(params.get("eis_current", 0))
        base_name = f"EIS_{param_str}"
    
    elif measurement_type in ["ocp", "ocp_measurement"]:
        duration = int(params.get("measurement_duration", 60))
        base_name = f"OCP_{duration}s"
    
    elif measurement_type == "chronoamperometry":
        param_str = format_voltage_for_filename(params.get("polarization_voltage", 0))
        base_name = f"CA_{param_str}"
    
    elif measurement_type == "chronopotentiometry":
        param_str = format_current_for_filename(params.get("polarization_current", 0))
        base_name = f"CP_{param_str}"
    
    elif measurement_type == "voltage_ramp":
        start_v = params.get("start_voltage", 0)
        end_v = params.get("end_voltage", 0)
        start_ref = params.get("start_voltage_reference", "absolute")
        end_ref = params.get("end_voltage_reference", "absolute")
        
        def fmt_v(v, ref):
            if ref == "ocv":
                if v == 0: 
                    return "OCV"
                elif v > 0: 
                    return f"OCV+{format_voltage_for_filename(v)}"
                else: 
                    return f"OCV{format_voltage_for_filename(v)}"
            else:
                return format_voltage_for_filename(v)
        
        base_name = f"LSV_{fmt_v(start_v, start_ref)}to{fmt_v(end_v, end_ref)}"
    
    elif measurement_type == "current_ramp":
        start_i = format_current_for_filename(params.get("start_current", 0))
        end_i = format_current_for_filename(params.get("end_current", 0))
        base_name = f"GSV_{start_i}to{end_i}"
    
    else:
        base_name = measurement_type
    
    # ✅ 新增：环境上下文（Furnace 温度 + MFC 流量）
    env_parts = []
    env_ctx = params.get("environment_context", {})
    
    # Furnace 温度
    if env_ctx.get("furnace_temp") is not None:
        temp = int(env_ctx["furnace_temp"])
        env_parts.append(f"{temp}C")
    
    # MFC 流量
    mfc_flows = env_ctx.get("mfc_flows", {})
    if mfc_flows:
        # 按气体名称排序，确保文件名一致性
        for gas_name in sorted(mfc_flows.keys()):
            flow = int(mfc_flows[gas_name])
            env_parts.append(f"{flow}sccm{gas_name}")
    
    # 组合最终文件名
    if env_parts:
        env_str = "_".join(env_parts)
        return f"{base_name}_{env_str}_{timestamp}"
    else:
        return f"{base_name}_{timestamp}"

def _prepare_output_path(params: dict, measurement_type: str) -> str:
    """
    准备输出文件路径 (含智能文件名)
    """
    output_path = params.get("output_path", "c:/zahner_data/default")
    
    # 使用新的命名函数
    filename = build_filename(measurement_type, params)
    
    # 规范化路径 (Windows/Zahner 偏好)
    if output_path.startswith('/'):
        output_path = 'c:' + output_path
    else:
        # 确保是绝对路径或者是 C 盘路径
        if not output_path[1:2] == ':':
             output_path = os.path.abspath(output_path)
             
    output_path = output_path.replace('/', '\\')
    os.makedirs(output_path, exist_ok=True)
    
    full_path = os.path.join(output_path, f"{filename}.csv")
    return full_path

# ==========================================
# 2. 核心测量逻辑 (DC 类 - 支持流式推送)
# ==========================================

def measure_ocp(device: ThalesRemoteScriptWrapper, params: dict, callback: Optional[Callable] = None) -> dict:
    """
    开路电位 (OCP) 测量逻辑
    """
    duration = float(params.get("measurement_duration", 60.0))
    interval = float(params.get("sampling_interval", 1.0))
    
    output_file = _prepare_output_path(params, "ocp_measurement")
    
    print(f"[Logic] Starting OCP: {duration}s, interval: {interval}s")
    
    # OCP 测量需关闭恒电位仪
    device.disablePotentiostat()
    
    start_time = time.monotonic()
    data_buffer = []
    points_count = 0
    v = 0.0  # 初始化 v，防止未定义错误

    try:
        for _ in accurate_timer(duration, interval):
            _raise_if_cancel_requested(params)
            now = time.monotonic()
            t = now - start_time

            # 测量
            v = device.getPotential()
            i = 0.0 # OCP 模式下电流视为 0 或无效
            
            # 1. 实时推送 (WebSocket)
            if callback:
                # 格式必需为 {t, v, i}
                callback({"t": round(t, 3), "v": round(v, 6), "i": 0})

            # 2. 数据缓冲
            record = {"time": t, "potential": v}
            data_buffer.append(record)
            points_count += 1

            # 3. 分块保存 (每 10 个点写一次)
            if len(data_buffer) >= 10:
                _save_data_chunk(output_file, data_buffer)
                data_buffer = []
    finally:
        # 保存剩余数据
        _save_data_chunk(output_file, data_buffer)
    
    print(f"[Logic] OCP Finished. Points: {points_count}")
    
    return {
        "output_file": output_file,
        "duration": duration,
        "data_points": points_count,
        "final_potential": v
    }

def measure_chrono(device: ThalesRemoteScriptWrapper, params: dict, mode: str, callback: Optional[Callable] = None) -> dict:
    """
    通用计时方法逻辑 (计时电流 CA / 计时电位 CP)
    
    :param mode: 'potentiostatic' (CA) or 'galvanostatic' (CP)
    """
    duration = float(params.get("measurement_duration", 60.0))
    interval = float(params.get("sampling_interval", 1.0))
    
    is_potentiostatic = (mode == 'potentiostatic')
    measurement_type = "chronoamperometry" if is_potentiostatic else "chronopotentiometry"
    output_file = _prepare_output_path(params, measurement_type)
    
    # 安全限制
    min_safe_i = float(params.get("min_current", -2.0))
    max_safe_i = float(params.get("max_current", 2.0))
    min_safe_v = float(params.get("min_voltage", -5.0))
    max_safe_v = float(params.get("max_voltage", 5.0))
    
    # 设置设备模式
    if is_potentiostatic:
        device.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)
        setpoint = float(params.get("polarization_voltage", 0.0))
        device.setPotential(setpoint)
        print(f"[Logic] CA Mode: {setpoint}V")
    else:
        device.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)
        setpoint = float(params.get("polarization_current", 0.0))
        device.setCurrent(setpoint)
        print(f"[Logic] CP Mode: {setpoint}A")
        
    # 开启设备
    device.enablePotentiostat()
    
    start_time = time.monotonic()
    data_buffer = []
    points_count = 0
    error_reason = None
    
    try:
        for _ in accurate_timer(duration, interval):
            _raise_if_cancel_requested(params)
            now = time.monotonic()
            t = now - start_time
            
            # 读取读数
            curr_v = device.getPotential()
            curr_i = device.getCurrent()
            
            # 1. 实时推送
            if callback:
                callback({"t": round(t, 3), "v": round(curr_v, 6), "i": round(curr_i, 9)})
                
            # 2. 数据缓冲
            record = {"time": t, "potential": curr_v, "current": curr_i}
            data_buffer.append(record)
            points_count += 1
            
            # 3. 安全检查
            if not (min_safe_i <= curr_i <= max_safe_i):
                error_reason = f"Current limit exceeded: {curr_i:.4e} A"
                break
            if not (min_safe_v <= curr_v <= max_safe_v):
                error_reason = f"Voltage limit exceeded: {curr_v:.4f} V"
                break
                
            # 4. 分块保存
            if len(data_buffer) >= 10:
                _save_data_chunk(output_file, data_buffer)
                data_buffer = []
                
    finally:
        # 确保最后保存并关闭设备
        _save_data_chunk(output_file, data_buffer)
        device.disablePotentiostat()
        
    print(f"[Logic] Chrono Finished. Reason: {error_reason or 'Time limit'}")
    
    if error_reason:
        # 即使是安全中断，我们也视为一次成功的“部分”测量，但返回警告
        return {
            "output_file": output_file,
            "status": "stopped_safety",
            "reason": error_reason,
            "data_points": points_count
        }
    
    return {
        "output_file": output_file,
        "status": "success",
        "setpoint": setpoint,
        "data_points": points_count
    }

def measure_ramp(device: ThalesRemoteScriptWrapper, params: dict, mode: str, callback: Optional[Callable] = None) -> dict:
    """
    通用斜坡/线性扫描逻辑 (LSV / Current Ramp)
    
    :param mode: 'potentiostatic' (Voltage Ramp) or 'galvanostatic' (Current Ramp)
    """
    duration = float(params.get("measurement_duration", 60.0))
    interval = float(params.get("sampling_interval", 1.0))
    
    is_potentiostatic = (mode == 'potentiostatic')
    measurement_type = "voltage_ramp" if is_potentiostatic else "current_ramp"
    output_file = _prepare_output_path(params, measurement_type)
    
    # 提取起始和结束值
    if is_potentiostatic:
        # 支持 "start_voltage" 或通用 "start_value"
        start_val = float(params.get("start_voltage", params.get("start_value", 0.0)))
        end_val = float(params.get("end_voltage", params.get("end_value", 1.0)))
        
        # 处理 OCV 参考 (仅适用于电位模式)
        ref_mode_start = params.get("start_voltage_reference", "absolute").lower()
        ref_mode_end = params.get("end_voltage_reference", "absolute").lower()
        
        ocv = 0.0
        if "ocv" in ref_mode_start or "ocv" in ref_mode_end:
            device.disablePotentiostat()
            time.sleep(1) # 稳定一下
            ocv = device.getPotential()
            print(f"[Logic] Measured OCV: {ocv} V")
            
        if ref_mode_start == "ocv": start_val += ocv
        if ref_mode_end == "ocv": end_val += ocv
            
        device.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)
        print(f"[Logic] Voltage Ramp: {start_val}V -> {end_val}V over {duration}s")
    else:
        start_val = float(params.get("start_current", params.get("start_value", 0.0)))
        end_val = float(params.get("end_current", params.get("end_value", 0.0)))
        device.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)
        print(f"[Logic] Current Ramp: {start_val}A -> {end_val}A over {duration}s")

    # 安全限制
    min_safe_i = float(params.get("min_current", -2.0))
    max_safe_i = float(params.get("max_current", 2.0))
    min_safe_v = float(params.get("min_voltage", -5.0))
    max_safe_v = float(params.get("max_voltage", 5.0))

    # 开启设备
    device.enablePotentiostat()
    
    start_time = time.monotonic()
    slope = (end_val - start_val) / duration
    data_buffer = []
    points_count = 0
    error_reason = None
    
    try:
        for _ in accurate_timer(duration, interval):
            _raise_if_cancel_requested(params)
            now = time.monotonic()
            t = now - start_time
            
            # 计算当前设定值
            current_setpoint = start_val + slope * t
            
            # 执行设定与测量
            if is_potentiostatic:
                device.setPotential(current_setpoint)
                curr_v = current_setpoint # 或者读回 device.getPotential()
                curr_i = device.getCurrent()
            else:
                device.setCurrent(current_setpoint)
                curr_i = current_setpoint
                curr_v = device.getPotential()
            
            # 1. 实时推送
            if callback:
                callback({"t": round(t, 3), "v": round(curr_v, 6), "i": round(curr_i, 9)})
                
            # 2. 数据缓冲
            record = {"time": t, "voltage": curr_v, "current": curr_i, "setpoint": current_setpoint}
            data_buffer.append(record)
            points_count += 1
            
            # 3. 安全检查
            if not (min_safe_i <= curr_i <= max_safe_i):
                error_reason = f"Current limit exceeded: {curr_i:.4e} A"
                break
            if not (min_safe_v <= curr_v <= max_safe_v):
                error_reason = f"Voltage limit exceeded: {curr_v:.4f} V"
                break
                
            # 4. 分块保存
            if len(data_buffer) >= 10:
                _save_data_chunk(output_file, data_buffer)
                data_buffer = []
                
    finally:
        _save_data_chunk(output_file, data_buffer)
        device.disablePotentiostat()
        
    print(f"[Logic] Ramp Finished. Reason: {error_reason or 'Complete'}")
    
    if error_reason:
        return {
            "output_file": output_file,
            "status": "stopped_safety",
            "reason": error_reason,
            "data_points": points_count
        }

    return {
        "output_file": output_file,
        "status": "success",
        "scan_rate": slope,
        "data_points": points_count
    }

# ==========================================
# 3. EIS 测量逻辑 (无实时流，走内部文件)
# ==========================================

def measure_eis(device: ThalesRemoteScriptWrapper, params: dict, mode: str) -> dict:
    """
    统一 EIS 测量逻辑
    
    :param mode: 'potentiostatic' or 'galvanostatic'
    """
    is_potentiostatic = (mode == 'potentiostatic')
    
    # 路径处理
    output_path = params.get("output_path", "c:/zahner_data/eis")
    # 确保是 Windows 路径格式，且尽可能短，Thales 对路径长度敏感
    if output_path.startswith('/'): output_path = 'c:' + output_path
    output_path = output_path.replace('/', '\\').lower() 
    
    # 使用智能文件名构建
    measurement_type = "eis_potentiostatic" if is_potentiostatic else "eis_galvanostatic"
    full_filename = build_filename(measurement_type, params)  # 注意：Thales 不需要扩展名
    
    print(f"[Logic] EIS ({mode}) -> Path: {output_path}, File: {full_filename}")

    # 配置 Thales 文件系统
    try:
        os.makedirs(output_path, exist_ok=True)
        device.setEISOutputPath(output_path)
        device.setEISNaming(FileNaming.INDIVIDUAL)
        device.setEISOutputFileName(full_filename)
    except Exception as e:
        print(f"[Logic] EIS Setup Error: {e}")
        raise e

    # 参数映射
    # 频率
    device.setLowerFrequencyLimit(float(params.get("eis_lower_frequency", 10)))
    device.setStartFrequency(float(params.get("eis_start_frequency", 1000)))
    device.setUpperFrequencyLimit(float(params.get("eis_upper_frequency", 100000)))
    
    # 精度/点数
    device.setLowerNumberOfPeriods(int(params.get("eis_lower_periods", 4)))
    device.setUpperNumberOfPeriods(int(params.get("eis_upper_periods", 20)))
    device.setLowerStepsPerDecade(int(params.get("eis_lower_steps", 5)))
    device.setUpperStepsPerDecade(int(params.get("eis_upper_steps", 10)))
    
    # 扫描控制
    direction_str = params.get("eis_scan_direction", "START_TO_MIN")
    strategy_str = params.get("eis_scan_strategy", "SINGLE_SINE")
    
    # 映射枚举
    if direction_str == "START_TO_MAX":
        device.setScanDirection(ScanDirection.START_TO_MAX)
    else:
        device.setScanDirection(ScanDirection.START_TO_MIN)
        
    if strategy_str == "MULTI_SINE":
        device.setScanStrategy(ScanStrategy.MULTI_SINE)
    else:
        device.setScanStrategy(ScanStrategy.SINGLE_SINE)

    # 幅值与偏置
    amplitude = float(params.get("eis_amplitude", 10e-3))
    device.setAmplitude(amplitude)

    if is_potentiostatic:
        device.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)
        dc_bias = float(params.get("eis_potential", 0.0))
        enable_bias = params.get("enable_dc_bias", False)
        
        if enable_bias:
            device.setPotential(dc_bias)
            device.enablePotentiostat()
            print(f"[Logic] EIS Potentiostatic with Bias: {dc_bias}V")
        else:
            print(f"[Logic] EIS Potentiostatic at OCP")
    else:
        device.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)
        dc_bias = float(params.get("eis_current", 0.0))
        enable_bias = params.get("enable_dc_bias", True) # 恒流通常需要偏置
        
        if enable_bias:
            device.setCurrent(dc_bias)
            device.enablePotentiostat()
            print(f"[Logic] EIS Galvanostatic with Bias: {dc_bias}A")
        else:
            print(f"[Logic] EIS Galvanostatic at 0A")

    # 执行测量 (阻塞调用)
    print("[Logic] Running EIS...")
    try:
        device.measureEIS()
    except Exception as e:
        print(f"[Logic] EIS Execution Failed: {e}")
        device.disablePotentiostat()
        raise e
        
    device.disablePotentiostat()
    print("[Logic] EIS Completed")

    # 返回结果路径 (Zahner 会生成 .txt 和 .ism 文件)
    final_path = os.path.join(output_path, full_filename + ".ism")
    
    # 解析 ISM 文件，提取核心数据
    eis_data = None
    csv_path = None
    try:
        if os.path.exists(final_path):
            eis_data = parse_ism_file(final_path)
            csv_path = eis_data.get("csv_path")
            print(f"[Logic] Parsed EIS data: {eis_data.get('point_count', 0)} points")
        else:
            print(f"[Logic] ISM file not found: {final_path}")
    except Exception as e:
        print(f"[Logic] ISM parse error: {e}")
    
    return {
        "output_path": output_path,
        "filename": full_filename,
        "full_path": final_path,
        "csv_path": csv_path,
        "status": "success",
        "parameters": {
            "amplitude": amplitude,
            "bias": dc_bias if enable_bias else "OCP/Off"
        },
        "eis_data": eis_data  # { frequency, z_real, z_imag, csv_path, point_count }
    }
