#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zahner设备FastAPI服务 - KISS原则
若无必要，勿增实体
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import math
import datetime
from thales_remote.connection import ThalesRemoteConnection
from thales_remote.script_wrapper import (
    PotentiostatMode,
    ThalesRemoteScriptWrapper,
    ScanStrategy,
    ScanDirection,
    FileNaming,
)

# 定义可用的枚举选项供前端选择
AVAILABLE_POTENTIOSTAT_MODES = {
    "POTMODE_POTENTIOSTATIC": PotentiostatMode.POTMODE_POTENTIOSTATIC,
    "POTMODE_GALVANOSTATIC": PotentiostatMode.POTMODE_GALVANOSTATIC,
    "POTMODE_PSEUDOGALVANOSTATIC": PotentiostatMode.POTMODE_PSEUDOGALVANOSTATIC
}

AVAILABLE_SCAN_DIRECTIONS = {
    "START_TO_MAX": ScanDirection.START_TO_MAX,
    "START_TO_MIN": ScanDirection.START_TO_MIN
}

AVAILABLE_SCAN_STRATEGIES = {
    "SINGLE_SINE": ScanStrategy.SINGLE_SINE,
    "MULTI_SINE": ScanStrategy.MULTI_SINE
}

# AVAILABLE_NAMING_MODES = {
#     "COUNTER": FileNaming.COUNTER,
#     "DATE_TIME": FileNaming.DATE_TIME,
#     "INDIVIDUAL": FileNaming.INDIVIDUAL
# }

app = FastAPI(title="Zahner设备API")

# 添加CORS中间件以支持跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8083", "http://localhost:3000", "http://127.0.0.1:8083"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局设备连接状态
device_connection = None
device_wrapper = None

# Python模板层 - 专注测量逻辑，无通知调用
# 根据架构优化计划阶段3.2重构

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




def accurate_timer(duration: float, interval: float):
    """
    一个通过 Python 生成器实现的高精度时钟。

    这个函数会在每个指定的时间间隔“让出”一次控制权给 for 循环，
    并通过动态计算休眠时间来确保长时间运行时不会累积计时误差。

    :param duration: 时钟应该运行的总秒数。
    :param interval: 每次“滴答”之间期望的间隔秒数。
    """
    # 使用 time.monotonic()，因为它是一个单调递增的时钟，不受系统时间调整的影响。
    start_time = time.monotonic()
    next_tick = start_time
    
    # 循环直到达到总运行时长
    while time.monotonic() - start_time < duration:
        # yield 关键字是生成器的核心。它会暂停函数，并将控制权返回给 for 循环。
        # 当 for 循环下一次迭代时，代码会从这里恢复执行。
        yield
        
        # 计算下一个目标“滴答”时间点
        next_tick += interval
        
        # 计算为了正好在目标时间点醒来，需要休眠多久
        sleep_duration = next_tick - time.monotonic()
        
        # 只有在没有超时的情况下才休眠
        if sleep_duration > 0:
            time.sleep(sleep_duration)

def connect_device(host: str = "localhost"):
    """连接设备 - 返回结构化结果"""
    global device_connection, device_wrapper

    try:
        print(f"正在连接到Zahner设备 ({host})...")

        device_connection = ThalesRemoteConnection()
        device_connection.connectToTerm(host)

        device_wrapper = ThalesRemoteScriptWrapper(device_connection)
        device_wrapper.forceThalesIntoRemoteScript()

        # 校准设备
        device_wrapper.calibrateOffsets()

        print("Zahner设备连接并初始化成功")

        return {
            "status": "success",
            "measurement_type": "device_connection",
            "data": {
                "message": "设备连接并初始化成功",
                "device_info": {
                    "host": host,
                    "model": "ZENNIUM",
                    "connected": True
                }
            },
            "timestamp": time.time(),
            "parameters": {"host": host}
        }
    except Exception as e:
        error_msg = f"设备连接失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "device_connection",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": {"host": host}
        }

def disconnect_device():
    """断开设备 - 返回结构化结果"""
    global device_connection, device_wrapper

    try:
        print("正在断开Zahner设备连接...")

        if device_connection:
            device_connection.disconnectFromTerm()
            device_connection = None
            device_wrapper = None

        print("Zahner设备已成功断开")

        return {
            "status": "success",
            "measurement_type": "device_disconnection",
            "data": {
                "message": "设备已断开"
            },
            "timestamp": time.time(),
            "parameters": {}
        }
    except Exception as e:
        error_msg = f"断开连接失败: {str(e)}"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "device_disconnection",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": {}
        }


def measure_eis_potentiostatic(params):
    """
    恒电位EIS测量 - 支持直流偏置或OCP下测量，返回结构化结果
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "eis_potentiostatic",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行恒电位EIS测量...")

        # 配置输出文件
        output_path = params.get("output_path")
        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "eis_potentiostatic",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 配置输出路径 - 确保路径格式符合Thales要求
        import os
        # 确保路径是C盘路径且格式正确
        if not output_path.lower().startswith('c:'):
            # 如果不是C盘路径，转换为C盘路径
            if output_path.startswith('/'):
                output_path = 'c:' + output_path
            else:
                output_path = 'c:\\' + output_path.lstrip('\\/')

        # 确保路径小写（Thales要求）
        output_path = output_path.lower()

        # 创建目录（如果不存在）
        os.makedirs(output_path, exist_ok=True)

        print(f"[INFO] 设置EIS输出路径: {output_path}")
        device_wrapper.setEISOutputPath(output_path)

        # 设置命名模式 - 直接使用INDIVIDUAL模式
        device_wrapper.setEISNaming(FileNaming.INDIVIDUAL)

        # 设置文件名
        device_wrapper.setEISOutputFileName(params.get("filename", "eis_potentiostatic"))

        # 设置恒电位模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)
        print("[INFO] 设置模式为: POTMODE_POTENTIOSTATIC")

        # 设置交流扰动幅值
        amplitude = params.get("eis_amplitude", 25e-3)  # 默认25mV
        device_wrapper.setAmplitude(amplitude)
        print(f"[INFO] 设置交流幅值: {amplitude * 1000} mV")

        # 设置频率参数
        lower_freq = params.get("eis_lower_frequency", 0.2)      # 默认200mHz
        start_freq = params.get("eis_start_frequency", 100000)   # 默认100KHz
        upper_freq = params.get("eis_upper_frequency", 100000)   # 默认100KHz

        device_wrapper.setLowerFrequencyLimit(lower_freq)
        device_wrapper.setStartFrequency(start_freq)
        device_wrapper.setUpperFrequencyLimit(upper_freq)
        print(f"[INFO] 频率范围: {lower_freq} Hz - {start_freq} Hz - {upper_freq} Hz")

        # 设置测量参数（精细控制高/低频区）
        lower_periods = params.get("eis_lower_periods", 4)        # 低频区默认4周期
        upper_periods = params.get("eis_upper_periods", 20)       # 高频区默认20周期
        lower_steps = params.get("eis_lower_steps", 5)            # 低频区默认5点
        upper_steps = params.get("eis_upper_steps", 10)           # 高频区默认10点

        device_wrapper.setLowerNumberOfPeriods(lower_periods)
        device_wrapper.setUpperNumberOfPeriods(upper_periods)
        device_wrapper.setLowerStepsPerDecade(lower_steps)
        device_wrapper.setUpperStepsPerDecade(upper_steps)
        print(f"[INFO] 高频区: {upper_steps} 点/十倍频程, {upper_periods} 周期")
        print(f"[INFO] 低频区: {lower_steps} 点/十倍频程, {lower_periods} 周期")

        # 设置扫描方向和策略
        scan_dir = AVAILABLE_SCAN_DIRECTIONS.get(params.get("eis_scan_direction", "START_TO_MIN"))
        scan_strat = AVAILABLE_SCAN_STRATEGIES.get(params.get("eis_scan_strategy", "SINGLE_SINE"))

        if scan_dir:
            device_wrapper.setScanDirection(scan_dir)
        if scan_strat:
            device_wrapper.setScanStrategy(scan_strat)

        print(f"[INFO] 扫描策略: {scan_strat}, 方向: {scan_dir}")

        # 根据模式启动测量
        enable_dc_bias = params.get("enable_dc_bias", False)
        if enable_dc_bias:
            dc_potential = params.get("eis_potential", 0.0)
            device_wrapper.setPotential(dc_potential)
            device_wrapper.enablePotentiostat()
            print(f"[INFO] 恒电位模式 - 启用直流偏置: {dc_potential} V")
        else:
            print(f"[INFO] 恒电位模式 - 在开路电位(OCP)下测量")

        # 执行测量
        print(f"[INFO] 开始执行恒电位EIS测量...")
        device_wrapper.measureEIS()
        print("[SUCCESS] 恒电位EIS测量已完成")

        # 禁用恒电位仪
        device_wrapper.disablePotentiostat()
        print("[INFO] 恒电位仪已关闭")

        # 构建成功消息
        mode_desc = "直流偏置" if enable_dc_bias else "OCP下测量"
        if enable_dc_bias:
            mode_desc += f" ({params.get('eis_potential', 0.0)}V)"

        success_msg = f"恒电位EIS测量完成 ({mode_desc})"
        success_msg += f"\n频率范围: {lower_freq}-{upper_freq} Hz"
        success_msg += f"\n交流幅值: {amplitude * 1000} mV"
        success_msg += f"\n数据已保存到: {output_path}"

        print(f"恒电位EIS测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "eis_potentiostatic",
            "data": {
                "message": success_msg,
                "output_path": output_path,
                "mode": "POTMODE_POTENTIOSTATIC",
                "parameters": {
                    "frequency_range": f"{lower_freq}-{upper_freq} Hz",
                    "amplitude_v": amplitude,
                    "dc_potential": params.get("eis_potential", 0.0) if enable_dc_bias else None,
                    "enable_dc_bias": enable_dc_bias,
                    "scan_direction": scan_dir,
                    "scan_strategy": scan_strat
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
    finally:
        # 确保恒电位仪被禁用
        try:
            if device_wrapper:
                device_wrapper.setAmplitude(0)  # 必须将交流幅值设为0
                device_wrapper.disablePotentiostat()
        except Exception as e:
            print(f"关闭恒电位仪时出错: {str(e)}")


def measure_eis_galvanostatic(params):
    """
    恒流EIS测量 - 支持直流偏置或OCP下测量
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "eis_galvanostatic",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行恒流EIS测量...")

        # 配置输出文件
        output_path = params.get("output_path")
        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "eis_galvanostatic",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 配置输出路径 - 确保路径格式符合Thales要求
        import os
        # 确保路径是C盘路径且格式正确
        if not output_path.lower().startswith('c:'):
            # 如果不是C盘路径，转换为C盘路径
            if output_path.startswith('/'):
                output_path = 'c:' + output_path
            else:
                output_path = 'c:\\' + output_path.lstrip('\\/')

        # 确保路径小写（Thales要求）
        output_path = output_path.lower()

        # 创建目录（如果不存在）
        os.makedirs(output_path, exist_ok=True)

        print(f"[INFO] 设置EIS输出路径: {output_path}")
        device_wrapper.setEISOutputPath(output_path)

        # 设置命名模式 - 直接使用INDIVIDUAL模式
        device_wrapper.setEISNaming(FileNaming.INDIVIDUAL)

        # 设置文件名
        device_wrapper.setEISOutputFileName(params.get("filename", "eis_galvanostatic"))

        # 设置恒电流模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)
        print("[INFO] 设置模式为: POTMODE_GALVANOSTATIC")

        # 设置交流扰动幅值
        amplitude = params.get("eis_amplitude", 1e-3)  # 默认1mA
        device_wrapper.setAmplitude(amplitude)
        print(f"[INFO] 设置交流幅值: {amplitude * 1000} mA")

        # 设置频率参数
        lower_freq = params.get("eis_lower_frequency", 10)      # 默认10Hz
        start_freq = params.get("eis_start_frequency", 100)     # 默认100Hz
        upper_freq = params.get("eis_upper_frequency", 10000)   # 默认10KHz

        device_wrapper.setLowerFrequencyLimit(lower_freq)
        device_wrapper.setStartFrequency(start_freq)
        device_wrapper.setUpperFrequencyLimit(upper_freq)
        print(f"[INFO] 频率范围: {lower_freq} Hz - {start_freq} Hz - {upper_freq} Hz")

        # 设置测量参数（精细控制高/低频区）
        lower_periods = params.get("eis_lower_periods", 20)      # 低频区默认20周期
        upper_periods = params.get("eis_upper_periods", 4)     # 高频区默认4周期
        lower_steps = params.get("eis_lower_steps", 10)       # 低频区默认10点
        upper_steps = params.get("eis_upper_steps", 5)        # 高频区默认5点

        device_wrapper.setLowerNumberOfPeriods(lower_periods)
        device_wrapper.setUpperNumberOfPeriods(upper_periods)
        device_wrapper.setLowerStepsPerDecade(lower_steps)
        device_wrapper.setUpperStepsPerDecade(upper_steps)
        print(f"[INFO] 高频区: {upper_steps} 点/十倍频程, {upper_periods} 周期")
        print(f"[INFO] 低频区: {lower_steps} 点/十倍频程, {lower_periods} 周期")

        # 设置扫描方向和策略
        scan_dir = AVAILABLE_SCAN_DIRECTIONS.get(params.get("eis_scan_direction", "START_TO_MAX"))
        scan_strat = AVAILABLE_SCAN_STRATEGIES.get(params.get("eis_scan_strategy", "SINGLE_SINE"))

        if scan_dir:
            device_wrapper.setScanDirection(scan_dir)
        if scan_strat:
            device_wrapper.setScanStrategy(scan_strat)

        print(f"[INFO] 扫描策略: {scan_strat}, 方向: {scan_dir}")

        # 根据模式启动测量
        enable_dc_bias = params.get("enable_dc_bias", False)
        if enable_dc_bias:
            dc_current = params.get("eis_current", 0.0)
            device_wrapper.setCurrent(dc_current)
            device_wrapper.enablePotentiostat()
            print(f"[INFO] 恒流模式 - 启用直流偏置: {dc_current * 1000} mA")
        else:
            print(f"[INFO] 恒流模式 - 在开路电位(OCP)下测量")

        # 执行测量
        print(f"[INFO] 开始执行恒流EIS测量...")
        device_wrapper.measureEIS()
        print("[SUCCESS] 恒流EIS测量已完成")

        # 禁用恒电位仪
        device_wrapper.disablePotentiostat()
        print("[INFO] 恒电流源已关闭")

        # 构建成功消息
        mode_desc = "直流偏置" if enable_dc_bias else "OCP下测量"
        if enable_dc_bias:
            mode_desc += f" ({params.get('eis_current', 0.0) * 1000}mA)"

        success_msg = f"恒流EIS测量完成 ({mode_desc})"
        success_msg += f"\n频率范围: {lower_freq}-{upper_freq} Hz"
        success_msg += f"\n交流幅值: {amplitude * 1000} mA"
        success_msg += f"\n数据已保存到: {output_path}"

        print(f"恒流EIS测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "eis_galvanostatic",
            "data": {
                "message": success_msg,
                "output_path": output_path,
                "mode": "POTMODE_GALVANOSTATIC",
                "parameters": {
                    "frequency_range": f"{lower_freq}-{upper_freq} Hz",
                    "amplitude_a": amplitude,
                    "dc_current": params.get("eis_current", 0.0) if enable_dc_bias else None,
                    "enable_dc_bias": enable_dc_bias,
                    "scan_direction": scan_dir,
                    "scan_strategy": scan_strat
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
    finally:
        # 确保恒电位仪被禁用
        try:
            if device_wrapper:
                device_wrapper.setAmplitude(0)  # 必须将交流幅值设为0
                device_wrapper.disablePotentiostat()
        except Exception as e:
            print(f"关闭恒电流源时出错: {str(e)}")




def measure_chronoamperometry(params):
    """
    执行计时安培法测量的主要函数。

    :param params: 包含测量参数的字典
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "chronoamperometry",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行计时安培法测量...")

        # 获取参数
        polarization_voltage = params.get("polarization_voltage", 1.0)
        polarization_time = params.get("measurement_duration", 60.0)
        sampling_time = params.get("sampling_interval", 1.0)
        min_current = params.get("min_current", -1.0)
        max_current = params.get("max_current", 1.0)
        output_path = params.get("output_path")

        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "chronoamperometry",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 创建输出目录
        import os
        from datetime import datetime
        os.makedirs(output_path, exist_ok=True)

        # 生成输出文件名
        filename = params.get("filename", "chronoamperometry")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

        # 设置为恒电位模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)

        # 设置目标电位（绝对值）
        device_wrapper.setPotential(polarization_voltage)
        print(f"参数设置：恒电位模式，目标电位 = {polarization_voltage} V")

        # 开启恒电位仪，电位阶跃从这一刻开始生效
        device_wrapper.enablePotentiostat()
        print("恒电位仪已开启，开始计时安培法测量...")
        print("-" * 50)

        # 使用高精度时钟执行测量循环
        start_time_measurement = time.monotonic()
        measurement_data = []

        for _ in accurate_timer(duration=polarization_time, interval=sampling_time):

            # 读取电流值
            current = device_wrapper.getCurrent()
            elapsed_time = time.monotonic() - start_time_measurement

            measurement_data.append({
                "time": elapsed_time,
                "current": current
            })

            print(f"时间: {elapsed_time:9.2f} s | 电流: {current:12.6e} A")

            # 检查电流是否在安全范围内
            if not (min_current <= current <= max_current):
                print(f"\n警告：电流 ({current:.3e} A) 超出安全范围 [{min_current}, {max_current}] A。")
                print("实验自动中止。")
                break
        else:
            # 如果 for 循环正常结束（没有被 break），则执行此块
            print("-" * 50)
            print("已达到预设记录时间，测量完成。")

        # 写入CSV文件
        import csv
        with open(output_file, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['time', 'current'])
            writer.writeheader()
            for point in measurement_data:
                writer.writerow({
                    "time": round(point["time"], 3),
                    "current": round(point["current"], 9)
                })

        # 计算统计信息
        currents = [point["current"] for point in measurement_data]
        avg_current = sum(currents) / len(currents) if currents else 0
        min_current_measured = min(currents) if currents else 0
        max_current_measured = max(currents) if currents else 0

        success_msg = f"计时安培法测量完成，数据已保存到 {output_file}"
        success_msg += f"\n平均电流: {avg_current:.6e}A"
        success_msg += f"\n电流范围: {min_current_measured:.6e}A - {max_current_measured:.6e}A"
        success_msg += f"\n数据点数: {len(measurement_data)}"
        success_msg += f"\n极化电压: {polarization_voltage}V"
        success_msg += f"\n极化时间: {polarization_time}s"

        print(f"计时安培法测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "chronoamperometry",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "statistics": {
                    "average_current": avg_current,
                    "min_current": min_current_measured,
                    "max_current": max_current_measured,
                    "data_points": len(measurement_data),
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

    finally:
        # 无论成功或失败，都尝试关闭恒电位仪
        try:
            if device_wrapper:
                device_wrapper.disablePotentiostat()
                print("恒电位仪已关闭")
        except Exception as e:
            print(f"关闭恒电位仪时出错: {str(e)}")


def measure_chronopotentiometry(params):
    """
    执行计时电位法测量的主要函数。

    :param params: 包含测量参数的字典
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "chronopotentiometry",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行计时电位法测量...")

        # 获取参数
        polarization_current = params.get("polarization_current", 10e-3)
        polarization_time = params.get("measurement_duration", 60.0)
        scan_interval = params.get("sampling_interval", 1.0)
        min_voltage = params.get("min_voltage", -4.0)
        max_voltage = params.get("max_voltage", 4.0)
        output_path = params.get("output_path")

        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "chronopotentiometry",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 创建输出目录
        import os
        from datetime import datetime
        os.makedirs(output_path, exist_ok=True)

        # 生成输出文件名
        filename = params.get("filename", "chronopotentiometry")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

        # 设置为恒电流模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)

        # 设置目标电流
        device_wrapper.setCurrent(polarization_current)
        print(f"参数设置：恒电流模式，目标电流 = {polarization_current * 1000} mA")

        # 开启恒电位仪（即恒电流源），电流阶跃从这一刻开始生效
        device_wrapper.enablePotentiostat()
        print("恒电流源已开启，开始计时电位法测量...")
        print("-" * 50)

        # 使用高精度时钟执行测量循环
        start_time_measurement = time.monotonic()
        measurement_data = []

        for _ in accurate_timer(duration=polarization_time, interval=scan_interval):

            # 读取电位值
            potential = device_wrapper.getPotential()
            elapsed_time = time.monotonic() - start_time_measurement

            measurement_data.append({
                "time": elapsed_time,
                "potential": potential
            })

            print(f"时间: {elapsed_time:9.2f} s | 电位: {potential:11.6f} V")

            # 检查电位是否在安全范围内
            if not (min_voltage <= potential <= max_voltage):
                print(f"\n警告：电位 ({potential:.3f} V) 超出安全范围 [{min_voltage}, {max_voltage}] V。")
                print("实验自动中止。")
                break
        else:
            # 如果 for 循环正常结束（没有被 break），则执行此块
            print("-" * 50)
            print("已达到预设记录时间，测量完成。")

        # 写入CSV文件
        import csv
        with open(output_file, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['time', 'potential'])
            writer.writeheader()
            for point in measurement_data:
                writer.writerow({
                    "time": round(point["time"], 3),
                    "potential": round(point["potential"], 6)
                })

        # 计算统计信息
        potentials = [point["potential"] for point in measurement_data]
        avg_potential = sum(potentials) / len(potentials) if potentials else 0
        min_potential_measured = min(potentials) if potentials else 0
        max_potential_measured = max(potentials) if potentials else 0

        success_msg = f"计时电位法测量完成，数据已保存到 {output_file}"
        success_msg += f"\n平均电位: {avg_potential:.6f}V"
        success_msg += f"\n电位范围: {min_potential_measured:.6f}V - {max_potential_measured:.6f}V"
        success_msg += f"\n数据点数: {len(measurement_data)}"
        success_msg += f"\n极化电流: {polarization_current * 1000}mA"
        success_msg += f"\n极化时间: {polarization_time}s"

        print(f"计时电位法测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "chronopotentiometry",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "statistics": {
                    "average_potential": avg_potential,
                    "min_potential": min_potential_measured,
                    "max_potential": max_potential_measured,
                    "data_points": len(measurement_data),
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

    finally:
        # 无论成功或失败，都尝试关闭恒电位仪
        try:
            if device_wrapper:
                device_wrapper.disablePotentiostat()
                print("恒电流源已关闭")
        except Exception as e:
            print(f"关闭恒电流源时出错: {str(e)}")


def measure_voltage_ramp(params):
    """
    电压斜坡测量 - 线性扫描电位，测量电流（线性扫描伏安法 LSV）
    此版本增加了 voltage_reference 参数，支持绝对电位和相对于OCV的电位设置。
    """
    global device_wrapper
    measured_ocv = None  # 用于记录OCV值

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "voltage_ramp",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行电压斜坡测量...")

        # 获取参数
        start_voltage_param = params.get("start_voltage", -0.5)   # 起始电位参数 [V]
        end_voltage_param = params.get("end_voltage", 0.8)       # 结束电位参数 [V]
        ramp_duration = params.get("measurement_duration", 130.0) # 扫描持续时间 [s]
        sampling_interval = params.get("sampling_interval", 1.0)  # 采样间隔 [s]
        min_current = params.get("min_current", -1.0)            # 电流安全下限 [A]
        max_current = params.get("max_current", 1.0)             # 电流安全上限 [A]
        output_path = params.get("output_path")

        # 新增参数: voltage_reference，默认为 'absolute' 以保证向后兼容
        voltage_reference = params.get("voltage_reference", "absolute").lower()

        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "voltage_ramp",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 创建输出目录
        import os
        from datetime import datetime
        os.makedirs(output_path, exist_ok=True)

        # 生成输出文件名
        filename = params.get("filename", "voltage_ramp")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

        # 设置恒电位模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_POTENTIOSTATIC)

        # 根据 voltage_reference 计算最终的绝对电位
        print(f"[INFO] 电位参考模式: {voltage_reference.upper()}")

        final_start_voltage = 0
        final_end_voltage = 0

        if voltage_reference == 'absolute':
            final_start_voltage = start_voltage_param
            final_end_voltage = end_voltage_param

        elif voltage_reference == 'ocv':
            print("[INFO] 正在测量开路电位 (OCV)...")
            # 测量OCV的标准方法：关闭恒电位仪，然后读取电位
            device_wrapper.disablePotentiostat()
            time.sleep(1)  # 等待稳定
            measured_ocv = device_wrapper.getPotential()
            print(f"[SUCCESS] 测得 OCV = {measured_ocv:.4f} V")

            # 计算绝对电位
            final_start_voltage = measured_ocv + start_voltage_param
            final_end_voltage = measured_ocv + end_voltage_param
            print(f"[INFO] 起始电位相对于OCV ({start_voltage_param:+.3f} V), 绝对起始电位: {final_start_voltage:.4f} V")
            print(f"[INFO] 结束电位相对于OCV ({end_voltage_param:+.3f} V), 绝对结束电位: {final_end_voltage:.4f} V")

        else:
            raise ValueError(f"无效的 'voltage_reference' 参数: '{voltage_reference}'. "
                           f"有效值为 'absolute' 或 'ocv'。")

        # 计算扫描速率
        scan_rate = (final_end_voltage - final_start_voltage) / ramp_duration

        print("\n--- 最终扫描参数 ---")
        print(f"绝对起始电位: {final_start_voltage:.4f} V")
        print(f"绝对结束电位: {final_end_voltage:.4f} V")
        print(f"扫描速率: {scan_rate * 1000:.3f} mV/s")
        print(f"扫描时间: {ramp_duration} s")
        print(f"安全电流范围: [{min_current}, {max_current}] A\n")

        # 开启恒电位仪
        device_wrapper.enablePotentiostat()
        print("恒电位仪已开启，开始电压斜坡测量...")
        print("-" * 60)

        # 执行扫描
        start_time_measurement = time.monotonic()
        measurement_data = []

        for _ in accurate_timer(duration=ramp_duration, interval=sampling_interval):
            elapsed_time = time.monotonic() - start_time_measurement

            # 计算当前时间点的目标电位
            target_voltage = final_start_voltage + scan_rate * elapsed_time

            # 设置目标电位
            device_wrapper.setPotential(target_voltage)

            # 测量电流响应
            measured_current = device_wrapper.getCurrent()

            measurement_data.append({
                "time": elapsed_time,
                "voltage": target_voltage,
                "current": measured_current
            })

            print(f"{elapsed_time:12.3f} | {target_voltage:12.6f} V | {measured_current:12.6e} A")

            # 检查电流安全范围
            if not (min_current <= measured_current <= max_current):
                print(f"\n警告：电流 ({measured_current:.3e} A) 超出安全范围 [{min_current}, {max_current}] A。")
                print("实验自动中止。")
                break
        else:
            print("-" * 60)
            print("已达到预设扫描时间，测量完成。")

        # 写入CSV文件
        import csv
        with open(output_file, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['time', 'voltage', 'current'])
            writer.writeheader()
            for point in measurement_data:
                writer.writerow({
                    "time": round(point["time"], 3),
                    "voltage": round(point["voltage"], 6),
                    "current": round(point["current"], 9)
                })

        # 计算统计信息
        currents = [point["current"] for point in measurement_data]
        voltages = [point["voltage"] for point in measurement_data]
        avg_current = sum(currents) / len(currents) if currents else 0
        min_current_measured = min(currents) if currents else 0
        max_current_measured = max(currents) if currents else 0

        success_msg = f"电压斜坡测量完成，数据已保存到 {output_file}"
        success_msg += f"\n扫描范围: {final_start_voltage:.4f}V - {final_end_voltage:.4f}V"
        success_msg += f"\n扫描速率: {scan_rate * 1000:.3f} mV/s"
        success_msg += f"\n平均电流: {avg_current:.6e}A"
        success_msg += f"\n电流范围: {min_current_measured:.6e}A - {max_current_measured:.6e}A"
        success_msg += f"\n数据点数: {len(measurement_data)}"

        if voltage_reference == 'ocv':
            success_msg += f"\n参考模式: OCV参考 ({measured_ocv:.4f}V)"
        else:
            success_msg += f"\n参考模式: 绝对电位"

        print(f"电压斜坡测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "voltage_ramp",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "statistics": {
                    "voltage_reference_mode": voltage_reference,
                    "measured_ocv": measured_ocv,
                    "absolute_start_voltage": final_start_voltage,
                    "absolute_end_voltage": final_end_voltage,
                    "parameter_start_voltage": start_voltage_param,
                    "parameter_end_voltage": end_voltage_param,
                    "scan_rate_mv_s": scan_rate * 1000,
                    "average_current": avg_current,
                    "min_current": min_current_measured,
                    "max_current": max_current_measured,
                    "data_points": len(measurement_data),
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

    finally:
        # 无论成功或失败，都尝试关闭恒电位仪
        try:
            if device_wrapper:
                device_wrapper.disablePotentiostat()
                print("恒电位仪已关闭")
        except Exception as e:
            print(f"关闭恒电位仪时出错: {str(e)}")


def measure_current_ramp(params):
    """
    电流斜坡测量 - 线性扫描电流，测量电位（电位动态扫描）
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "current_ramp",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行电流斜坡测量...")

        # 获取参数
        start_current = params.get("start_current", -10e-3)     # 起始电流 [A]
        end_current = params.get("end_current", 10e-3)         # 结束电流 [A]
        ramp_duration = params.get("measurement_duration", 60.0)   # 扫描持续时间 [s]
        sampling_interval = params.get("sampling_interval", 1.0)  # 采样间隔 [s]
        min_voltage = params.get("min_voltage", -4.0)          # 电压安全下限 [V]
        max_voltage = params.get("max_voltage", 4.0)           # 电压安全上限 [V]
        output_path = params.get("output_path")

        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "current_ramp",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 创建输出目录
        import os
        from datetime import datetime
        os.makedirs(output_path, exist_ok=True)

        # 生成输出文件名
        filename = params.get("filename", "current_ramp")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

        # 设置恒电流模式
        device_wrapper.setPotentiostatMode(PotentiostatMode.POTMODE_GALVANOSTATIC)

        # 计算扫描速率
        scan_rate = (end_current - start_current) / ramp_duration

        print(f"参数设置：电流斜坡模式")
        print(f"起始电流: {start_current * 1000} mA")
        print(f"结束电流: {end_current * 1000} mA")
        print(f"扫描速率: {scan_rate * 1000:.3f} mA/s")
        print(f"扫描时间: {ramp_duration} s")
        print(f"安全电压范围: [{min_voltage}, {max_voltage}] V")

        # 开启恒电流源
        device_wrapper.enablePotentiostat()
        print("恒电流源已开启，开始电流斜坡测量...")
        print("-" * 60)

        # 执行扫描
        start_time_measurement = time.monotonic()
        measurement_data = []

        for _ in accurate_timer(duration=ramp_duration, interval=sampling_interval):
            elapsed_time = time.monotonic() - start_time_measurement

            # 计算当前时间点的目标电流
            target_current = start_current + scan_rate * elapsed_time

            # 设置目标电流
            device_wrapper.setCurrent(target_current)

            # 测量电位响应
            measured_voltage = device_wrapper.getPotential()

            measurement_data.append({
                "time": elapsed_time,
                "current": target_current,
                "voltage": measured_voltage
            })

            print(f"{elapsed_time:12.3f} | {target_current * 1000:12.6f} mA | {measured_voltage:12.6f} V")

            # 检查电压安全范围
            if not (min_voltage <= measured_voltage <= max_voltage):
                print(f"\n警告：电压 ({measured_voltage:.3f} V) 超出安全范围 [{min_voltage}, {max_voltage}] V。")
                print("实验自动中止。")
                break
        else:
            print("-" * 60)
            print("已达到预设扫描时间，测量完成。")

        # 写入CSV文件
        import csv
        with open(output_file, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['time', 'current', 'voltage'])
            writer.writeheader()
            for point in measurement_data:
                writer.writerow({
                    "time": round(point["time"], 3),
                    "current": round(point["current"], 9),
                    "voltage": round(point["voltage"], 6)
                })

        # 计算统计信息
        voltages = [point["voltage"] for point in measurement_data]
        currents = [point["current"] for point in measurement_data]
        avg_voltage = sum(voltages) / len(voltages) if voltages else 0
        min_voltage_measured = min(voltages) if voltages else 0
        max_voltage_measured = max(voltages) if voltages else 0

        success_msg = f"电流斜坡测量完成，数据已保存到 {output_file}"
        success_msg += f"\n扫描范围: {start_current * 1000}mA - {end_current * 1000}mA"
        success_msg += f"\n扫描速率: {scan_rate * 1000:.3f} mA/s"
        success_msg += f"\n平均电位: {avg_voltage:.6f}V"
        success_msg += f"\n电位范围: {min_voltage_measured:.6f}V - {max_voltage_measured:.6f}V"
        success_msg += f"\n数据点数: {len(measurement_data)}"

        print(f"电流斜坡测量完成 - {success_msg}")

        return {
            "status": "success",
            "measurement_type": "current_ramp",
            "data": {
                "message": success_msg,
                "output_file": output_file,
                "statistics": {
                    "start_current": start_current,
                    "end_current": end_current,
                    "scan_rate_ma_s": scan_rate * 1000,
                    "average_voltage": avg_voltage,
                    "min_voltage": min_voltage_measured,
                    "max_voltage": max_voltage_measured,
                    "data_points": len(measurement_data),
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

    finally:
        # 无论成功或失败，都尝试关闭恒电流源
        try:
            if device_wrapper:
                device_wrapper.disablePotentiostat()
                print("恒电流源已关闭")
        except Exception as e:
            print(f"关闭恒电流源时出错: {str(e)}")


def measure_linear_sweep_voltammetry(params):
    """线性扫描伏安法（Linear Sweep Voltammetry）测量 - 别名，指向电压斜坡"""
    return measure_voltage_ramp(params)


def measure_open_circuit_potential(params):
    """
    使用封装好的 accurate_timer 来测量 OCP。
    代码的核心逻辑非常简洁，只专注于测量本身。

    :param params: 包含测量参数的字典
    """
    global device_wrapper

    if not device_wrapper:
        error_msg = "设备未连接"
        print(error_msg)
        return {
            "status": "error",
            "measurement_type": "open_circuit_potential",
            "error": error_msg,
            "timestamp": time.time(),
            "parameters": params
        }

    try:
        print("开始执行开路电位测量...")

        # 获取参数
        recording_time = params.get("measurement_duration", 60.0)
        scan_interval = params.get("sampling_interval", 1.0)
        output_path = params.get("output_path")

        if not output_path:
            error_msg = "缺少必需参数: output_path"
            print(error_msg)
            return {
                "status": "error",
                "measurement_type": "open_circuit_potential",
                "error": error_msg,
                "timestamp": time.time(),
                "parameters": params
            }

        # 记录时间直接使用秒数
        recording_time = float(recording_time)

        # 创建输出目录
        import os
        from datetime import datetime
        os.makedirs(output_path, exist_ok=True)

        # 生成输出文件名
        filename = params.get("filename", "ocp_measurement")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join(output_path, f"{filename}_{timestamp}.csv")

        # 为了测量开路电位，必须关闭恒电位仪
        device_wrapper.disablePotentiostat()
        print("恒电位仪已关闭，即将开始高精度 OCP 测量...")
        print("-" * 50)

        # 记录开路电位数据
        ocp_data = []

        # 使用高精度时钟执行测量循环
        # `accurate_timer` 封装了所有复杂的计时工作。
        # for 循环的结构使得代码非常直观易读。
        start_time_measurement = time.monotonic()

        # `_` 是一个占位符，表示我们不关心 accurate_timer 返回的具体值
        for _ in accurate_timer(duration=recording_time, interval=scan_interval):

            # 这个代码块在每个时间间隔内会精确地执行一次。
            # 你在这里唯一的工作就是进行测量。
            potential = device_wrapper.getPotential()
            elapsed_time = time.monotonic() - start_time_measurement

            ocp_data.append({
                "time": elapsed_time,
                "potential": potential
            })

            # 打印格式化的输出，使得数据对齐，便于观察
            print(f"时间: {elapsed_time:9.2f} s | 开路电位: {potential:11.6f} V")

        print("-" * 50)
        print("已达到预设记录时间，测量完成。")

        # 写入CSV文件
        import csv
        with open(output_file, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['time', 'potential'])
            writer.writeheader()
            for point in ocp_data:
                writer.writerow({
                    "time": round(point["time"], 3),
                    "potential": round(point["potential"], 6)
                })

        # 计算统计信息
        potentials = [point["potential"] for point in ocp_data]
        avg_potential = sum(potentials) / len(potentials) if potentials else 0
        min_potential = min(potentials) if potentials else 0
        max_potential = max(potentials) if potentials else 0

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





def get_status():
    """获取状态 - 返回结构化结果"""
    return {
        "status": "success",
        "measurement_type": "device_status",
        "data": {
            "connected": device_connection is not None,
            "model": "ZENNIUM" if device_connection else None,
            "host": "localhost" if device_connection else None
        },
        "timestamp": time.time(),
        "parameters": {}
    }

# API接口
@app.post("/connect")
def connect(request: ConnectRequest):
    return connect_device(request.host)

@app.post("/disconnect")
def disconnect():
    return disconnect_device()


@app.post("/measure")
def measure_unified(request: UnifiedMeasureRequest):
    """统一测量端点"""
    measurement_type = request.measurement_type
    parameters = request.parameters

    # 根据测量类型调用相应的测量函数
    if measurement_type == "eis_potentiostatic":
        return measure_eis_potentiostatic(parameters)
    elif measurement_type == "eis_galvanostatic":
        return measure_eis_galvanostatic(parameters)
    elif measurement_type == "ocp":
        return measure_open_circuit_potential(parameters)
    elif measurement_type == "chronoamperometry":
        return measure_chronoamperometry(parameters)
    elif measurement_type == "chronopotentiometry":
        return measure_chronopotentiometry(parameters)
    elif measurement_type == "voltage_ramp":
        return measure_voltage_ramp(parameters)
    elif measurement_type == "current_ramp":
        return measure_current_ramp(parameters)
    elif measurement_type == "lsv":
        return measure_linear_sweep_voltammetry(parameters)
    else:
        return {
            "status": "error",
            "measurement_type": "unified_measure",
            "error": f"不支持的测量类型: {measurement_type}",
            "timestamp": time.time(),
            "parameters": parameters
        }

@app.post("/measure/eis/potentiostatic")
def measure_eis_pot(request: MeasureRequest):
    return measure_eis_potentiostatic(request.model_dump())


@app.post("/measure/eis/galvanostatic")
def measure_eis_gal(request: MeasureRequest):
    return measure_eis_galvanostatic(request.model_dump())


@app.post("/measure/ocp")
def measure_ocp(request: MeasureRequest):
    return measure_open_circuit_potential(request.model_dump())


@app.post("/measure/chronoamperometry")
def measure_chrono(request: MeasureRequest):
    return measure_chronoamperometry(request.model_dump())


@app.post("/measure/chronopotentiometry")
def measure_chrono_pot(request: MeasureRequest):
    return measure_chronopotentiometry(request.model_dump())


@app.post("/measure/voltage/ramp")
def measure_voltage_ramp_api(request: MeasureRequest):
    return measure_voltage_ramp(request.model_dump())


@app.post("/measure/current/ramp")
def measure_current_ramp_api(request: MeasureRequest):
    return measure_current_ramp(request.model_dump())


@app.post("/measure/lsv")
def measure_lsv_api(request: MeasureRequest):
    return measure_linear_sweep_voltammetry(request.model_dump())


@app.get("/status")
def status():
    return get_status()

@app.get("/health")
def health():
    return {
        "status": "success",
        "measurement_type": "health_check",
        "data": {
            "status": "healthy",
            "device_connected": device_connection is not None
        },
        "timestamp": time.time(),
        "parameters": {}
    }

@app.get("/options")
def get_options():
    """获取可用的枚举选项"""
    return {
        "potentiostat_modes": list(AVAILABLE_POTENTIOSTAT_MODES.keys()),
        "scan_directions": list(AVAILABLE_SCAN_DIRECTIONS.keys()),
        "scan_strategies": list(AVAILABLE_SCAN_STRATEGIES.keys()),
        # "naming_modes": list(AVAILABLE_NAMING_MODES.keys())
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)