#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zahner设备模拟FastAPI服务 - 用于测试和开发
支持状态控制和模拟数据返回
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import math
import datetime
import os
import csv
import json
import random
from typing import Dict, Any, List, Optional
from enum import Enum

# 定义可用的枚举选项供前端选择
class DeviceStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"

class FunctionStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"

class PotentiostatMode(str, Enum):
    POTMODE_POTENTIOSTATIC = "POTMODE_POTENTIOSTATIC"
    POTMODE_GALVANOSTATIC = "POTMODE_GALVANOSTATIC"
    POTMODE_PSEUDOGALVANOSTATIC = "POTMODE_PSEUDOGALVANOSTATIC"

class ScanDirection(str, Enum):
    START_TO_MAX = "START_TO_MAX"
    START_TO_MIN = "START_TO_MIN"

class ScanStrategy(str, Enum):
    SINGLE_SINE = "SINGLE_SINE"
    MULTI_SINE = "MULTI_SINE"

class FileNaming(str, Enum):
    COUNTER = "COUNTER"
    DATE_TIME = "DATE_TIME"
    INDIVIDUAL = "INDIVIDUAL"

app = FastAPI(title="Zahner设备模拟API")

# 添加CORS中间件以支持跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8083", "http://localhost:8081", "http://localhost:3000", "http://127.0.0.1:8083"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局状态控制
device_connection_status = DeviceStatus.DISCONNECTED
function_status_override: Dict[str, FunctionStatus] = {}

# 模拟数据生成器
class DataGenerator:
    """模拟电化学数据生成器"""

    @staticmethod
    def generate_eis_data(frequencies: List[float], amplitude: float, mode: str) -> List[Dict[str, float]]:
        """生成EIS测量数据"""
        data = []
        for freq in frequencies:
            # 模拟阻抗谱的典型形状
            real_z = amplitude * (1 + 0.1 * math.sin(freq / 1000)) / (1 + freq / 10000)
            imag_z = amplitude * 0.5 * math.cos(freq / 1000) / (1 + freq / 10000)

            data.append({
                "frequency": freq,
                "real_z": real_z,
                "imag_z": imag_z,
                "magnitude": math.sqrt(real_z**2 + imag_z**2),
                "phase": math.degrees(math.atan2(imag_z, real_z))
            })
        return data

    @staticmethod
    def generate_time_series(duration: float, interval: float, value_type: str, base_value: float = 0.0) -> List[Dict[str, float]]:
        """生成时间序列数据"""
        data = []
        num_points = int(duration / interval)

        for i in range(num_points):
            t = i * interval
            noise = random.gauss(0, base_value * 0.05) if base_value != 0 else random.gauss(0, 1e-6)

            if value_type == "current":
                # 模拟电流响应
                value = base_value * (1 + 0.1 * math.sin(t * 0.5) + noise)
            elif value_type == "potential":
                # 模拟电位响应
                value = base_value + 0.01 * math.cos(t * 0.3) + noise
            else:
                value = noise

            data.append({
                "time": t,
                "value": value
            })

        return data

    @staticmethod
    def generate_ramp_data(start_val: float, end_val: float, duration: float, interval: float,
                          response_type: str) -> List[Dict[str, float]]:
        """生成斜坡扫描数据"""
        data = []
        num_points = int(duration / interval)
        rate = (end_val - start_val) / duration

        for i in range(num_points):
            t = i * interval
            set_value = start_val + rate * t

            # 模拟响应值
            if response_type == "current":
                # 电位扫描时的电流响应
                response = set_value * 0.001 + random.gauss(0, 1e-6)
            else:  # voltage
                # 电流扫描时的电位响应
                response = set_value * 1000 + random.gauss(0, 0.001)

            data.append({
                "time": t,
                "set_value": set_value,
                "response": response
            })

        return data

# 状态控制模型
class StatusControlRequest(BaseModel):
    """状态控制请求"""
    device_status: Optional[DeviceStatus] = None
    function_status: Optional[Dict[str, FunctionStatus]] = None

class FunctionControlRequest(BaseModel):
    """功能状态控制请求"""
    function_name: str
    status: FunctionStatus

# API请求模型（与原文件保持一致）
class ConnectRequest(BaseModel):
    host: str = "localhost"

class UnifiedMeasureRequest(BaseModel):
    """统一测量请求模型"""
    measurement_type: str
    parameters: dict = {}

class MeasureRequest(BaseModel):
    # ===================================================================
    # 通用参数 - 所有测量方法共享
    # ===================================================================
    # 输出配置（必需）
    output_path: str
    naming_mode: str = "INDIVIDUAL"
    counter: int = 1
    filename: str = "spectra"

    # 通用时间参数
    measurement_duration: float = 60.0    # 测量持续时间 [s]
    sampling_interval: float = 1.0       # 采样间隔 [s]（非EIS方法使用）

    # 通用直流偏置参数
    enable_dc_bias: bool = False         # 是否启用直流偏置

    # ===================================================================
    # EIS测量参数 - 恒电位和恒流EIS共享
    # ===================================================================
    # EIS频率参数
    eis_lower_frequency: float = 0.2        # 下限频率 [Hz]
    eis_upper_frequency: float = 100000      # 上限频率 [Hz]
    eis_start_frequency: float = 1000       # 起始频率 [Hz]

    # EIS扫描参数
    eis_lower_periods: int = 4               # 低频区测量周期数
    eis_upper_periods: int = 20              # 高频区测量周期数
    eis_lower_steps: int = 5                 # 低频区每十倍频程扫描点数
    eis_upper_steps: int = 10                # 高频区每十倍频程扫描点数
    eis_scan_direction: str = "START_TO_MIN" # 扫描方向
    eis_scan_strategy: str = "SINGLE_SINE"   # 扫描策略

    # ===================================================================
    # EIS测量参数 - 恒电位和恒流EIS共享
    # ===================================================================
    eis_amplitude: float = 25e-3             # 交流扰动幅值 [V或A] (25mV或1mA)
    eis_potential: float = 0.0                # 直流偏置电位 [V] (恒电位模式)
    eis_current: float = 0.0                 # 直流偏置电流 [A] (恒流模式)

    # ===================================================================
    # 开路电位测量专用参数
    # ===================================================================
    # 记录时间使用通用的 measurement_duration，单位为秒

    # ===================================================================
    # 计时安培法专用参数
    # ===================================================================
    polarization_voltage: float = 1.0        # 极化电压 [V]
    min_current: float = -1.0                # 最小电流安全限 [A]
    max_current: float = 1.0                 # 最大电流安全限 [A]

    # ===================================================================
    # 计时电位法专用参数
    # ===================================================================
    polarization_current: float = 10e-3      # 极化电流 [A]
    min_voltage: float = -4.0                 # 最小电位安全限 [V]
    max_voltage: float = 4.0                  # 最大电位安全限 [V]

    # ===================================================================
    # 电压斜坡测量专用参数（线性扫描伏安法 LSV）
    # ===================================================================
    start_voltage: float = -0.5               # 起始电位 [V]
    end_voltage: float = 0.8                  # 结束电位 [V]
    voltage_reference: str = "absolute"       # 电位参考模式: "absolute" 或 "ocv"

    # ===================================================================
    # 电流斜坡测量专用参数（电位动态扫描）
    # ===================================================================
    start_current: float = -10e-3             # 起始电流 [A]
    end_current: float = 10e-3                # 结束电流 [A]

# 状态控制功能
@app.post("/control/status")
def control_status(request: StatusControlRequest):
    """控制设备和功能状态"""
    global device_connection_status, function_status_override

    if request.device_status:
        device_connection_status = request.device_status
        print(f"设备状态已设置为: {device_connection_status}")

    if request.function_status:
        function_status_override.update(request.function_status)
        print(f"功能状态已更新: {function_status_override}")

    return {
        "status": "success",
        "measurement_type": "status_control",
        "data": {
            "device_status": device_connection_status,
            "function_status": function_status_override
        },
        "timestamp": time.time(),
        "parameters": request.model_dump() if hasattr(request, 'model_dump') else request.dict()
    }

@app.post("/control/function")
def control_function(request: FunctionControlRequest):
    """控制单个功能的状态"""
    global function_status_override

    function_status_override[request.function_name] = request.status
    print(f"功能 {request.function_name} 状态已设置为: {request.status}")

    return {
        "status": "success",
        "measurement_type": "function_control",
        "data": {
            "function_name": request.function_name,
            "function_status": request.status
        },
        "timestamp": time.time(),
        "parameters": request.model_dump() if hasattr(request, 'model_dump') else request.dict()
    }

@app.get("/control/status")
def get_control_status():
    """获取当前状态配置"""
    return {
        "status": "success",
        "measurement_type": "control_status",
        "data": {
            "device_status": device_connection_status,
            "function_status": function_status_override
        },
        "timestamp": time.time(),
        "parameters": {}
    }

# 模拟设备功能
def get_function_status(function_name: str) -> FunctionStatus:
    """获取功能状态"""
    return function_status_override.get(function_name, FunctionStatus.SUCCESS)

def check_device_connection():
    """检查设备连接状态"""
    if device_connection_status != DeviceStatus.CONNECTED:
        return {
            "status": "error",
            "measurement_type": "device_connection",
            "error": "设备未连接",
            "timestamp": time.time(),
            "parameters": {}
        }
    return None

def save_eis_file(output_path: str, filename: str, data: List[Dict[str, float]], params: dict) -> str:
    """保存EIS数据文件（模仿原文件机制）"""
    # 确保路径是C盘路径且格式正确
    if not output_path.lower().startswith('c:'):
        if output_path.startswith('/'):
            output_path = 'c:' + output_path
        else:
            output_path = 'c:\\' + output_path.lstrip('\\/')

    output_path = output_path.lower()
    os.makedirs(output_path, exist_ok=True)

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

    # 写入CSV文件
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=['frequency', 'real_z', 'imag_z', 'magnitude', 'phase'])
        writer.writeheader()
        for row in data:
            writer.writerow(row)

    return output_file

def save_time_series_file(output_path: str, filename: str, data: List[Dict[str, float]],
                         columns: List[str], params: dict) -> str:
    """保存时间序列数据文件"""
    # 确保路径是C盘路径且格式正确
    if not output_path.lower().startswith('c:'):
        if output_path.startswith('/'):
            output_path = 'c:' + output_path
        else:
            output_path = 'c:\\' + output_path.lstrip('\\/')

    output_path = output_path.lower()
    os.makedirs(output_path, exist_ok=True)

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

    # 写入CSV文件
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columns)
        writer.writeheader()
        for row in data:
            writer.writerow({col: round(row.get(col, 0), 6) for col in columns})

    return output_file

# 设备连接功能
@app.post("/connect")
def connect(request: ConnectRequest):
    """连接设备"""
    global device_connection_status

    connection_error = check_device_connection()
    if connection_error and device_connection_status == DeviceStatus.ERROR:
        return connection_error

    device_connection_status = DeviceStatus.CONNECTED
    print(f"正在连接到Zahner设备 ({request.host})...")

    return {
        "status": "success",
        "measurement_type": "device_connection",
        "data": {
            "message": "设备连接并初始化成功",
            "device_info": {
                "host": request.host,
                "model": "ZENNIUM",
                "connected": True
            }
        },
        "timestamp": time.time(),
        "parameters": {"host": request.host}
    }

@app.post("/disconnect")
def disconnect():
    """断开设备"""
    global device_connection_status

    device_connection_status = DeviceStatus.DISCONNECTED
    print("正在断开Zahner设备连接...")

    return {
        "status": "success",
        "measurement_type": "device_disconnection",
        "data": {
            "message": "设备已断开"
        },
        "timestamp": time.time(),
        "parameters": {}
    }

# EIS测量功能
@app.post("/measure/eis/potentiostatic")
def measure_eis_potentiostatic(request: MeasureRequest):
    """恒电位EIS测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("eis_potentiostatic")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "eis_potentiostatic",
            "error": "恒电位EIS测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行恒电位EIS测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "eis_potentiostatic",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成频率点
        lower_freq = params.get("eis_lower_frequency", 0.2)
        upper_freq = params.get("eis_upper_frequency", 100000)
        frequencies = [lower_freq * (10**(i/5)) for i in range(int(5 * math.log10(upper_freq/lower_freq)) + 1)]

        # 生成EIS数据
        amplitude = params.get("eis_amplitude", 25e-3)
        eis_data = DataGenerator.generate_eis_data(frequencies, amplitude, "potentiostatic")

        # 保存文件
        filename = params.get("filename", "eis_potentiostatic")
        output_file = save_eis_file(output_path, filename, eis_data, params)

        # 构建成功消息
        enable_dc_bias = params.get("enable_dc_bias", False)
        mode_desc = "直流偏置" if enable_dc_bias else "OCP下测量"
        if enable_dc_bias:
            mode_desc += f" ({params.get('eis_potential', 0.0)}V)"

        success_msg = f"恒电位EIS测量完成 ({mode_desc})"
        success_msg += f"\n频率范围: {lower_freq}-{upper_freq} Hz"
        success_msg += f"\n交流幅值: {amplitude * 1000} mV"
        success_msg += f"\n数据已保存到: {output_file}"

        print(f"恒电位EIS测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "eis_potentiostatic",
            "data": {
                "message": success_msg,
                "output_path": output_path,
                "mode": "POTMODE_POTENTIOSTATIC",
                "eis_data": eis_data,  # 包含模拟数据
                "parameters": {
                    "frequency_range": f"{lower_freq}-{upper_freq} Hz",
                    "amplitude_v": amplitude,
                    "dc_potential": params.get("eis_potential", 0.0) if enable_dc_bias else None,
                    "enable_dc_bias": enable_dc_bias,
                    "scan_direction": params.get("eis_scan_direction", "START_TO_MIN"),
                    "scan_strategy": params.get("eis_scan_strategy", "SINGLE_SINE")
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"恒电位EIS测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "eis_potentiostatic",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

@app.post("/measure/eis/galvanostatic")
def measure_eis_galvanostatic(request: MeasureRequest):
    """恒流EIS测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("eis_galvanostatic")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "eis_galvanostatic",
            "error": "恒流EIS测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行恒流EIS测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "eis_galvanostatic",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成频率点
        lower_freq = params.get("eis_lower_frequency", 10)
        upper_freq = params.get("eis_upper_frequency", 10000)
        frequencies = [lower_freq * (10**(i/5)) for i in range(int(5 * math.log10(upper_freq/lower_freq)) + 1)]

        # 生成EIS数据
        amplitude = params.get("eis_amplitude", 1e-3)
        eis_data = DataGenerator.generate_eis_data(frequencies, amplitude, "galvanostatic")

        # 保存文件
        filename = params.get("filename", "eis_galvanostatic")
        output_file = save_eis_file(output_path, filename, eis_data, params)

        # 构建成功消息
        enable_dc_bias = params.get("enable_dc_bias", False)
        mode_desc = "直流偏置" if enable_dc_bias else "OCP下测量"
        if enable_dc_bias:
            mode_desc += f" ({params.get('eis_current', 0.0) * 1000}mA)"

        success_msg = f"恒流EIS测量完成 ({mode_desc})"
        success_msg += f"\n频率范围: {lower_freq}-{upper_freq} Hz"
        success_msg += f"\n交流幅值: {amplitude * 1000} mA"
        success_msg += f"\n数据已保存到: {output_file}"

        print(f"恒流EIS测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "eis_galvanostatic",
            "data": {
                "message": success_msg,
                "output_path": output_path,
                "mode": "POTMODE_GALVANOSTATIC",
                "eis_data": eis_data,  # 包含模拟数据
                "parameters": {
                    "frequency_range": f"{lower_freq}-{upper_freq} Hz",
                    "amplitude_a": amplitude,
                    "dc_current": params.get("eis_current", 0.0) if enable_dc_bias else None,
                    "enable_dc_bias": enable_dc_bias,
                    "scan_direction": params.get("eis_scan_direction", "START_TO_MAX"),
                    "scan_strategy": params.get("eis_scan_strategy", "SINGLE_SINE")
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"恒流EIS测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "eis_galvanostatic",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 开路电位测量
@app.post("/measure/ocp")
def measure_ocp(request: MeasureRequest):
    """开路电位测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("open_circuit_potential")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "open_circuit_potential",
            "error": "开路电位测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行开路电位测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "open_circuit_potential",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成时间序列数据
        recording_time = params.get("measurement_duration", 60.0)
        scan_interval = params.get("sampling_interval", 1.0)

        # 模拟开路电位数据（相对稳定的小幅波动）
        base_potential = 0.5  # 基准电位 0.5V
        ocp_data = DataGenerator.generate_time_series(recording_time, scan_interval, "potential", base_potential)

        # 保存文件
        filename = params.get("filename", "ocp_measurement")
        output_file = save_time_series_file(output_path, filename, ocp_data, ["time", "potential"], params)

        # 计算统计信息
        potentials = [point["value"] for point in ocp_data]
        avg_potential = sum(potentials) / len(potentials)
        min_potential = min(potentials)
        max_potential = max(potentials)

        success_msg = f"开路电位测量完成，数据已保存到 {output_file}"
        success_msg += f"\n平均电位: {avg_potential:.6f}V"
        success_msg += f"\n电位范围: {min_potential:.6f}V - {max_potential:.6f}V"
        success_msg += f"\n数据点数: {len(ocp_data)}"

        print(f"开路电位测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "open_circuit_potential",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "time_series_data": ocp_data,  # 包含模拟数据
                "statistics": {
                    "average_potential": avg_potential,
                    "min_potential": min_potential,
                    "max_potential": max_potential,
                    "data_points": len(ocp_data),
                    "recording_time": recording_time,
                    "scan_interval": scan_interval
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"开路电位测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "open_circuit_potential",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 计时安培法测量
@app.post("/measure/chronoamperometry")
def measure_chronoamperometry(request: MeasureRequest):
    """计时安培法测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("chronoamperometry")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "chronoamperometry",
            "error": "计时安培法测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行计时安培法测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "chronoamperometry",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成时间序列数据
        polarization_voltage = params.get("polarization_voltage", 1.0)
        polarization_time = params.get("measurement_duration", 60.0)
        sampling_time = params.get("sampling_interval", 1.0)

        # 模拟电流响应数据
        current_data = DataGenerator.generate_time_series(polarization_time, sampling_time, "current", polarization_voltage * 0.001)

        # 保存文件
        filename = params.get("filename", "chronoamperometry")
        output_file = save_time_series_file(output_path, filename, current_data, ["time", "current"], params)

        # 计算统计信息
        currents = [point["value"] for point in current_data]
        avg_current = sum(currents) / len(currents)
        min_current_measured = min(currents)
        max_current_measured = max(currents)

        success_msg = f"计时安培法测量完成，数据已保存到 {output_file}"
        success_msg += f"\n平均电流: {avg_current:.6e}A"
        success_msg += f"\n电流范围: {min_current_measured:.6e}A - {max_current_measured:.6e}A"
        success_msg += f"\n数据点数: {len(current_data)}"
        success_msg += f"\n极化电压: {polarization_voltage}V"
        success_msg += f"\n极化时间: {polarization_time}s"

        print(f"计时安培法测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "chronoamperometry",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "time_series_data": current_data,  # 包含模拟数据
                "statistics": {
                    "average_current": avg_current,
                    "min_current": min_current_measured,
                    "max_current": max_current_measured,
                    "data_points": len(current_data),
                    "polarization_voltage": polarization_voltage,
                    "polarization_time": polarization_time,
                    "sampling_time": sampling_time
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"计时安培法测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "chronoamperometry",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 计时电位法测量
@app.post("/measure/chronopotentiometry")
def measure_chronopotentiometry(request: MeasureRequest):
    """计时电位法测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("chronopotentiometry")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "chronopotentiometry",
            "error": "计时电位法测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行计时电位法测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "chronopotentiometry",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成时间序列数据
        polarization_current = params.get("polarization_current", 10e-3)
        polarization_time = params.get("measurement_duration", 60.0)
        scan_interval = params.get("sampling_interval", 1.0)

        # 模拟电位响应数据
        potential_data = DataGenerator.generate_time_series(polarization_time, scan_interval, "potential", polarization_current * 100)

        # 保存文件
        filename = params.get("filename", "chronopotentiometry")
        output_file = save_time_series_file(output_path, filename, potential_data, ["time", "potential"], params)

        # 计算统计信息
        potentials = [point["value"] for point in potential_data]
        avg_potential = sum(potentials) / len(potentials)
        min_potential_measured = min(potentials)
        max_potential_measured = max(potentials)

        success_msg = f"计时电位法测量完成，数据已保存到 {output_file}"
        success_msg += f"\n平均电位: {avg_potential:.6f}V"
        success_msg += f"\n电位范围: {min_potential_measured:.6f}V - {max_potential_measured:.6f}V"
        success_msg += f"\n数据点数: {len(potential_data)}"
        success_msg += f"\n极化电流: {polarization_current * 1000}mA"
        success_msg += f"\n极化时间: {polarization_time}s"

        print(f"计时电位法测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "chronopotentiometry",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "time_series_data": potential_data,  # 包含模拟数据
                "statistics": {
                    "average_potential": avg_potential,
                    "min_potential": min_potential_measured,
                    "max_potential": max_potential_measured,
                    "data_points": len(potential_data),
                    "polarization_current": polarization_current,
                    "polarization_time": polarization_time,
                    "scan_interval": scan_interval
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"计时电位法测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "chronopotentiometry",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 电压斜坡测量
@app.post("/measure/voltage/ramp")
def measure_voltage_ramp(request: MeasureRequest):
    """电压斜坡测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("voltage_ramp")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "voltage_ramp",
            "error": "电压斜坡测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行电压斜坡测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "voltage_ramp",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成斜坡数据
        start_voltage = params.get("start_voltage", -0.5)
        end_voltage = params.get("end_voltage", 0.8)
        ramp_duration = params.get("measurement_duration", 130.0)
        sampling_interval = params.get("sampling_interval", 1.0)

        ramp_data = DataGenerator.generate_ramp_data(start_voltage, end_voltage, ramp_duration, sampling_interval, "current")

        # 保存文件
        filename = params.get("filename", "voltage_ramp")
        output_file = save_time_series_file(output_path, filename, ramp_data, ["time", "voltage", "current"], params)

        # 计算统计信息
        currents = [point["response"] for point in ramp_data]
        avg_current = sum(currents) / len(currents)
        min_current_measured = min(currents)
        max_current_measured = max(currents)

        scan_rate = (end_voltage - start_voltage) / ramp_duration

        success_msg = f"电压斜坡测量完成，数据已保存到 {output_file}"
        success_msg += f"\n扫描范围: {start_voltage:.4f}V - {end_voltage:.4f}V"
        success_msg += f"\n扫描速率: {scan_rate * 1000:.3f} mV/s"
        success_msg += f"\n平均电流: {avg_current:.6e}A"
        success_msg += f"\n电流范围: {min_current_measured:.6e}A - {max_current_measured:.6e}A"
        success_msg += f"\n数据点数: {len(ramp_data)}"

        print(f"电压斜坡测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "voltage_ramp",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "ramp_data": ramp_data,  # 包含模拟数据
                "statistics": {
                    "voltage_reference_mode": params.get("voltage_reference", "absolute"),
                    "start_voltage": start_voltage,
                    "end_voltage": end_voltage,
                    "scan_rate_mv_s": scan_rate * 1000,
                    "average_current": avg_current,
                    "min_current": min_current_measured,
                    "max_current": max_current_measured,
                    "data_points": len(ramp_data),
                    "ramp_duration": ramp_duration,
                    "sampling_interval": sampling_interval
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"电压斜坡测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "voltage_ramp",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 电流斜坡测量
@app.post("/measure/current/ramp")
def measure_current_ramp(request: MeasureRequest):
    """电流斜坡测量"""
    params = request.model_dump() if hasattr(request, 'model_dump') else request.dict()

    connection_error = check_device_connection()
    if connection_error:
        return connection_error

    function_status = get_function_status("current_ramp")
    if function_status == FunctionStatus.FAILED:
        return {
            "status": "error",
            "measurement_type": "current_ramp",
            "error": "电流斜坡测量失败（模拟失败）",
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行电流斜坡测量...")

        output_path = params.get("output_path")
        if not output_path:
            return {
                "status": "error",
                "measurement_type": "current_ramp",
                "error": "缺少必需参数: output_path",
                "timestamp": time.time(),
                "parameters": params
            }

        # 生成斜坡数据
        start_current = params.get("start_current", -10e-3)
        end_current = params.get("end_current", 10e-3)
        ramp_duration = params.get("measurement_duration", 60.0)
        sampling_interval = params.get("sampling_interval", 1.0)

        ramp_data = DataGenerator.generate_ramp_data(start_current, end_current, ramp_duration, sampling_interval, "voltage")

        # 保存文件
        filename = params.get("filename", "current_ramp")
        output_file = save_time_series_file(output_path, filename, ramp_data, ["time", "current", "voltage"], params)

        # 计算统计信息
        voltages = [point["response"] for point in ramp_data]
        avg_voltage = sum(voltages) / len(voltages)
        min_voltage_measured = min(voltages)
        max_voltage_measured = max(voltages)

        scan_rate = (end_current - start_current) / ramp_duration

        success_msg = f"电流斜坡测量完成，数据已保存到 {output_file}"
        success_msg += f"\n扫描范围: {start_current * 1000}mA - {end_current * 1000}mA"
        success_msg += f"\n扫描速率: {scan_rate * 1000:.3f} mA/s"
        success_msg += f"\n平均电位: {avg_voltage:.6f}V"
        success_msg += f"\n电位范围: {min_voltage_measured:.6f}V - {max_voltage_measured:.6f}V"
        success_msg += f"\n数据点数: {len(ramp_data)}"

        print(f"电流斜坡测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "current_ramp",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "ramp_data": ramp_data,  # 包含模拟数据
                "statistics": {
                    "start_current": start_current,
                    "end_current": end_current,
                    "scan_rate_ma_s": scan_rate * 1000,
                    "average_voltage": avg_voltage,
                    "min_voltage": min_voltage_measured,
                    "max_voltage": max_voltage_measured,
                    "data_points": len(ramp_data),
                    "ramp_duration": ramp_duration,
                    "sampling_interval": sampling_interval
                }
            },
            "timestamp": time.time(),
            "parameters": params
        }
    except Exception as e:
        error_msg = f"电流斜坡测量失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "current_ramp",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

# 统一测量端点
@app.post("/measure")
def measure_unified(request: UnifiedMeasureRequest):
    """统一测量端点"""
    measurement_type = request.measurement_type
    parameters = request.parameters

    # 根据测量类型调用相应的测量函数
    if measurement_type == "eis_potentiostatic":
        return measure_eis_potentiostatic(MeasureRequest(**parameters))
    elif measurement_type == "eis_galvanostatic":
        return measure_eis_galvanostatic(MeasureRequest(**parameters))
    elif measurement_type == "ocp":
        return measure_ocp(MeasureRequest(**parameters))
    elif measurement_type == "chronoamperometry":
        return measure_chronoamperometry(MeasureRequest(**parameters))
    elif measurement_type == "chronopotentiometry":
        return measure_chronopotentiometry(MeasureRequest(**parameters))
    elif measurement_type == "voltage_ramp":
        return measure_voltage_ramp(MeasureRequest(**parameters))
    elif measurement_type == "current_ramp":
        return measure_current_ramp(MeasureRequest(**parameters))
    elif measurement_type == "lsv":
        return measure_voltage_ramp(MeasureRequest(**parameters))
    else:
        return {
            "status": "error",
            "measurement_type": "unified_measure",
            "error": f"不支持的测量类型: {measurement_type}",
            "timestamp": time.time(),
            "parameters": parameters
        }

# 其他API端点
@app.post("/measure/lsv")
def measure_lsv_api(request: MeasureRequest):
    return measure_voltage_ramp(request)

@app.get("/status")
def status():
    """获取状态"""
    return {
        "status": "success",
        "measurement_type": "device_status",
        "data": {
            "connected": device_connection_status == DeviceStatus.CONNECTED,
            "model": "ZENNIUM" if device_connection_status == DeviceStatus.CONNECTED else None,
            "host": "localhost" if device_connection_status == DeviceStatus.CONNECTED else None,
            "device_status": device_connection_status
        },
        "timestamp": time.time(),
        "parameters": {}
    }

@app.get("/health")
def health():
    """健康检查"""
    return {
        "status": "success",
        "measurement_type": "health_check",
        "data": {
            "status": "healthy",
            "device_connected": device_connection_status == DeviceStatus.CONNECTED,
            "device_status": device_connection_status
        },
        "timestamp": time.time(),
        "parameters": {}
    }

@app.get("/options")
def get_options():
    """获取可用的枚举选项"""
    return {
        "potentiostat_modes": [mode.value for mode in PotentiostatMode],
        "scan_directions": [direction.value for direction in ScanDirection],
        "scan_strategies": [strategy.value for strategy in ScanStrategy],
        "naming_modes": [naming.value for naming in FileNaming]
    }

if __name__ == "__main__":
    import uvicorn
    print("启动Zahner设备模拟FastAPI服务...")
    print("状态控制端点:")
    print("  POST /control/status - 控制设备和功能状态")
    print("  POST /control/function - 控制单个功能状态")
    print("  GET /control/status - 获取当前状态配置")
    print("\n默认状态:")
    print(f"  设备状态: {device_connection_status}")
    print(f"  功能状态: {function_status_override}")
    print("\n服务运行在 http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)