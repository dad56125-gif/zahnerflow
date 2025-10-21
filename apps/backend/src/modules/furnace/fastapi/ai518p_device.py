from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import time
import threading
import random
from datetime import datetime, timedelta
import json

# AI-518P温控器模拟器FastAPI服务器
app = FastAPI(title="AI-518P温控器模拟器FastAPI接口")

# 通信日志缓冲区
comm_log = []  # 最多保存500条通信日志

# 调试信息缓冲区
debug_log = []  # 保存详细的调试信息


@app.middleware("http")
async def log_requests(request, call_next):
    """记录所有HTTP请求的调试信息"""
    import time
    start_time = time.time()

    # 记录请求信息
    request_info = f"请求: {request.method} {request.url.path}"
    if request.query_params:
        request_info += f"?{request.query_params}"

    add_debug_log(request_info, "INFO")

    # 处理请求
    response = await call_next(request)

    # 记录响应信息
    process_time = time.time() - start_time
    response_info = f"响应: {response.status_code} ({process_time:.3f}s)"
    add_debug_log(response_info, "INFO")

    return response


def add_comm_log(direction: str, data_hex: str, timestamp=None):
    """添加通信日志到缓冲区

    Args:
        direction: 通信方向 'TX' 或 'RX'
        data_hex: 16进制数据字符串
        timestamp: 时间戳，默认为当前时间
    """
    if timestamp is None:
        timestamp = datetime.now()

    log_entry = {
        'timestamp': timestamp.strftime('%H:%M:%S.%f')[:-3],  # 毫秒精度
        'direction': direction,
        'data': data_hex.upper()  # 统一转为大写
    }

    comm_log.append(log_entry)

    # 保持最多500条记录
    if len(comm_log) > 500:
        comm_log.pop(0)


def add_debug_log(message: str, level: str = "INFO"):
    """添加调试信息到缓冲区

    Args:
        message: 调试信息
        level: 日志级别 (INFO, DEBUG, WARNING, ERROR)
    """
    timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    log_entry = {
        'timestamp': timestamp,
        'level': level,
        'message': message
    }

    debug_log.append(log_entry)

    # 保持最多200条调试记录
    if len(debug_log) > 200:
        debug_log.pop(0)


class ConnectRequest(BaseModel):
    """连接请求模型"""
    port: str  # 串口号
    baudrate: int = 9600  # 波特率
    address: int = 1  # 设备地址
    stopbits: int = 2  # 停止位
    timeout: float = 1.0  # 超时时间


class ProgramSegment(BaseModel):
    """程序段模型"""
    id: int  # 程序段编号
    temperature: float  # 目标温度（摄氏度）
    time: int  # 持续时间（秒）


class MockSerialDevice:
    """模拟串口设备"""

    def __init__(self, port: str, baudrate: int = 9600):
        self.port = port
        self.baudrate = baudrate
        self.is_open = False
        self.in_waiting = 0
        self._buffer = bytearray()

    def open(self):
        """打开串口"""
        self.is_open = True
        add_debug_log(f"模拟串口 {self.port} 已打开，波特率 {self.baudrate}", "INFO")

    def close(self):
        """关闭串口"""
        self.is_open = False
        add_debug_log(f"模拟串口 {self.port} 已关闭", "INFO")

    def reset_input_buffer(self):
        """清空输入缓冲区"""
        self._buffer.clear()

    def write(self, data: bytes) -> int:
        """写入数据到串口"""
        if not self.is_open:
            raise Exception(f"Serial port {self.port} is not open")

        add_debug_log(f"模拟串口写入: {data.hex().upper()}", "DEBUG")
        return len(data)

    def flush(self):
        """刷新串口"""
        pass

    def read(self, size: int = 1) -> bytes:
        """从串口读取数据"""
        if not self.is_open:
            raise Exception(f"Serial port {self.port} is not open")

        if self.in_waiting > 0:
            data = self._buffer[:size]
            self._buffer = self._buffer[size:]
            self.in_waiting = len(self._buffer)
            add_debug_log(f"模拟串口读取: {data.hex().upper()}", "DEBUG")
            return data
        return bytes()


class AI518PController:
    """AI-518P温控器模拟器控制器类"""

    def __init__(self, port='COM4', baudrate=9600, address=1, stopbits=2, timeout=0.5):
        """初始化温控器模拟器

        Args:
            port: 串口号，默认COM4
            baudrate: 波特率，默认9600
            address: 设备地址，默认1
            stopbits: 停止位，默认2
            timeout: 超时时间，默认0.5秒
        """
        self.port = port
        self.baudrate = baudrate
        self.address = address
        self.stopbits = stopbits
        self.timeout = timeout
        self.serial = None
        self.lock = threading.Lock()  # 串口互斥锁，确保原子性操作

        # 模拟器状态
        self.is_connected = False

        # 温度模拟状态
        self.pv = 25.0  # 当前温度（Process Value）
        self.sv = 25.0  # 设定温度（Set Value）
        self.mv = 0     # 调整幅度（Manipulated Variable）

        # 程序控制状态
        self.program_status = "stop"  # run/pause/stop
        self.current_segment = 0      # 当前程序段
        self.segment_start_time = None  # 程序段开始时间
        self.segment_elapsed_time = 0   # 程序段已运行时间

        # 程序段存储（30段）
        self.program_segments = []
        for i in range(30):
            self.program_segments.append({
                'id': i + 1,
                'temperature': 25.0 + i * 2,  # 默认温度递增
                'time': 60  # 默认每段60秒
            })

        # 状态字节A（报警状态等）
        self.status_byte_a = 0

        # 历史数据存储
        self.temperature_history = []  # 保存最近1000个数据点
        self.max_history_points = 1000

        # 启动温度模拟线程
        self._temp_simulation_active = True
        self._temp_thread = threading.Thread(target=self._temperature_simulation, daemon=True)
        self._temp_thread.start()

        add_debug_log(f"AI-518P模拟器已初始化，地址: {address}, 端口: {port}", "INFO")

    def connect(self):
        """连接温控器设备（模拟）

        Returns:
            bool: 连接成功返回True

        Raises:
            Exception: 连接失败时抛出异常
        """
        try:
            # 模拟串口连接
            self.serial = MockSerialDevice(self.port, self.baudrate)
            self.serial.open()
            self.is_connected = True

            add_debug_log(f"设备连接成功: {self.port}", "INFO")
            return True

        except Exception as e:
            self.serial = None
            self.is_connected = False
            add_debug_log(f"设备连接失败: {str(e)}", "ERROR")
            raise Exception(f"Failed to connect to {self.port}: {str(e)}")

    def disconnect(self):
        """断开温控器连接"""
        if self.serial:
            self.serial.close()
            self.serial = None
        self.is_connected = False
        add_debug_log("设备已断开连接", "INFO")

    def _temperature_simulation(self):
        """温度模拟后台线程"""
        while self._temp_simulation_active:
            try:
                if self.is_connected and self.program_status == "run":
                    # 运行状态下，PV逐渐向SV靠近
                    diff = self.sv - self.pv
                    if abs(diff) > 0.1:
                        # 根据温差调整MV
                        self.mv = max(-100, min(100, int(diff * 5)))
                        # PV缓慢变化
                        self.pv += diff * 0.02  # 缓慢调节
                    else:
                        self.mv = random.randint(-5, 5)
                        # 添加随机波动
                        self.pv += random.uniform(-0.2, 0.2)
                else:
                    # 非运行状态下，温度向室温回归并添加波动
                    room_temp = 25.0
                    if abs(self.pv - room_temp) > 0.1:
                        self.pv += (room_temp - self.pv) * 0.01
                    self.pv += random.uniform(-0.2, 0.2)
                    self.mv = 0

                # 更新程序段时间
                if self.program_status == "run" and self.current_segment > 0:
                    if self.segment_start_time:
                        self.segment_elapsed_time = int((datetime.now() - self.segment_start_time).total_seconds())

                    # 检查程序段是否完成
                    current_seg_data = self.program_segments[self.current_segment - 1]
                    if self.segment_elapsed_time >= current_seg_data['time']:
                        self._advance_to_next_segment()

                # 记录历史数据点
                self._add_history_point()

                time.sleep(1)  # 每秒更新一次

            except Exception as e:
                add_debug_log(f"温度模拟线程异常: {str(e)}", "ERROR")
                time.sleep(1)

    def _advance_to_next_segment(self):
        """推进到下一个程序段"""
        if self.current_segment < 30:
            self.current_segment += 1
            self.segment_start_time = datetime.now()
            self.segment_elapsed_time = 0

            # 更新SV为当前程序段设定温度
            if self.current_segment <= 30:
                self.sv = self.program_segments[self.current_segment - 1]['temperature']

            add_debug_log(f"程序段切换到: {self.current_segment}, 设定温度: {self.sv}°C", "INFO")
        else:
            # 程序结束
            self.program_status = "stop"
            self.current_segment = 0
            add_debug_log("程序执行完毕，自动停止", "INFO")

    def _add_history_point(self):
        """添加历史数据点"""
        try:
            data_point = {
                "timestamp": datetime.now().isoformat(),
                "pv": round(self.pv, 1),
                "sv": round(self.sv, 1),
                "mv": self.mv,
                "segment": self.current_segment,
                "status": self.program_status
            }

            self.temperature_history.append(data_point)

            # 保持最多1000个数据点
            if len(self.temperature_history) > self.max_history_points:
                self.temperature_history.pop(0)

        except Exception as e:
            add_debug_log(f"添加历史数据点异常: {str(e)}", "ERROR")

    def get_temperature_history(self, from_time=None, to_time=None, limit=None, downsample=None):
        """获取温度历史数据

        Args:
            from_time: 开始时间 (ISO string)
            to_time: 结束时间 (ISO string)
            limit: 数据点数量限制
            downsample: 降采样因子

        Returns:
            list: 历史数据点列表
        """
        try:
            if not self.temperature_history:
                # 如果没有历史数据，生成一些模拟数据
                return self._generate_mock_history(limit or 100)

            # 过滤时间范围
            filtered_data = self.temperature_history.copy()

            if from_time:
                from_dt = datetime.fromisoformat(from_time.replace('Z', '+00:00'))
                filtered_data = [d for d in filtered_data if datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00')) >= from_dt]

            if to_time:
                to_dt = datetime.fromisoformat(to_time.replace('Z', '+00:00'))
                filtered_data = [d for d in filtered_data if datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00')) <= to_dt]

            # 应用限制
            if limit and limit > 0:
                filtered_data = filtered_data[-limit:]

            # 应用降采样
            if downsample and downsample > 1:
                filtered_data = filtered_data[::downsample]

            add_debug_log(f"返回历史数据: {len(filtered_data)} 个数据点", "DEBUG")
            return filtered_data

        except Exception as e:
            add_debug_log(f"获取历史数据异常: {str(e)}", "ERROR")
            return []

    def _generate_mock_history(self, count=100):
        """生成模拟历史数据"""
        try:
            now = datetime.now()
            mock_data = []

            for i in range(count):
                timestamp = now - timedelta(seconds=count - i)
                # 基于当前状态生成合理的温度值
                base_temp = 25.0

                # 模拟温度变化
                if i < count * 0.3:  # 前30%：升温阶段
                    pv = base_temp + (i / (count * 0.3)) * 15.0 + random.uniform(-0.5, 0.5)
                    sv = base_temp + (i / (count * 0.3)) * 18.0 + random.uniform(-0.2, 0.2)
                elif i < count * 0.7:  # 中间40%：稳定阶段
                    pv = base_temp + 15.0 + random.uniform(-0.8, 0.8)
                    sv = base_temp + 18.0 + random.uniform(-0.3, 0.3)
                else:  # 后30%：降温阶段
                    pv = base_temp + 15.0 * (1 - (i - count * 0.7) / (count * 0.3)) + random.uniform(-0.5, 0.5)
                    sv = base_temp + 18.0 * (1 - (i - count * 0.7) / (count * 0.3)) + random.uniform(-0.2, 0.2)

                mv = max(-100, min(100, int((sv - pv) * 5))) if pv < sv else random.randint(-5, 5)

                mock_data.append({
                    "timestamp": timestamp.isoformat(),
                    "pv": round(pv, 1),
                    "sv": round(sv, 1),
                    "mv": mv,
                    "segment": 1 if i > count * 0.2 else 0,
                    "status": "run" if i > count * 0.1 and i < count * 0.9 else "stop"
                })

            add_debug_log(f"生成模拟历史数据: {len(mock_data)} 个数据点", "DEBUG")
            return mock_data

        except Exception as e:
            add_debug_log(f"生成模拟历史数据异常: {str(e)}", "ERROR")
            return []

    def _checksum_read(self, param_code: int):
        """计算读取命令的校验和

        Args:
            param_code: 参数代码

        Returns:
            bytes: 2字节校验和
        """
        checksum = param_code * 256 + 82 + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def _checksum_write(self, param_code: int, param_value: int):
        """计算写入命令的校验和

        Args:
            param_code: 参数代码
            param_value: 参数值

        Returns:
            bytes: 2字节校验和
        """
        checksum = param_code * 256 + 67 + param_value + self.address
        return bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def _cmd_read(self, param_code: int) -> bytes:
        """构建读取命令帧

        Args:
            param_code: 参数代码

        Returns:
            bytes: 8字节命令帧
        """
        addr = self.address + 0x80
        cs = self._checksum_read(param_code)
        return bytes([addr, addr, 0x52, param_code, 0x00, 0x00, cs[0], cs[1]])

    def _cmd_write(self, param_code: int, param_value: int) -> bytes:
        """构建写入命令帧

        Args:
            param_code: 参数代码
            param_value: 参数值

        Returns:
            bytes: 8字节命令帧
        """
        addr = self.address + 0x80
        cs = self._checksum_write(param_code, param_value)
        return bytes([addr, addr, 0x43, param_code, param_value & 0xFF, (param_value >> 8) & 0xFF, cs[0], cs[1]])

    def _generate_response(self, param_code: int, param_value: int = None) -> bytes:
        """生成模拟响应数据

        Args:
            param_code: 参数代码
            param_value: 参数值（用于写操作验证）

        Returns:
            bytes: 10字节响应帧
        """
        # 获取当前状态
        pv_int = int(self.pv * 10)
        sv_int = int(self.sv * 10)

        # MV范围：-110到+110
        mv_int = max(-110, min(110, self.mv)) if self.mv >= 0 else max(-110, min(110, self.mv))
        mv_byte = mv_int & 0xFF if mv_int >= 0 else (256 + mv_int) & 0xFF

        # 状态字节A
        status_a = self.status_byte_a

        # 参数值
        if param_value is not None:
            response_param = param_value
        else:
            # 根据参数代码返回对应的值
            if param_code == 0x00:  # SV/程序段
                if self.program_status != "stop" and self.current_segment > 0:
                    response_param = self.current_segment
                else:
                    response_param = sv_int
            elif param_code == 0x15:  # 程序控制字
                if self.program_status == "run":
                    response_param = 0
                elif self.program_status == "pause":
                    response_param = 4
                else:  # stop
                    response_param = 12
            elif param_code == 0x56:  # 当前程序段时间
                response_param = self.segment_elapsed_time
            elif 0x1A <= param_code <= 0x56:  # 程序段相关参数
                segment_idx = (param_code - 0x1A) // 2
                if segment_idx < 30:
                    if param_code % 2 == 0:  # 温度参数
                        response_param = int(self.program_segments[segment_idx]['temperature'] * 10)
                    else:  # 时间参数
                        response_param = self.program_segments[segment_idx]['time']
                else:
                    response_param = 0
            else:
                response_param = 0

        # 构建响应帧
        response = bytes([
            pv_int & 0xFF, (pv_int >> 8) & 0xFF,  # PV
            sv_int & 0xFF, (sv_int >> 8) & 0xFF,  # SV
            mv_byte,                              # MV
            status_a,                             # 状态字节A
            response_param & 0xFF, (response_param >> 8) & 0xFF,  # 参数值
            self.address,                         # 地址
            status_a                              # 报警状态
        ])

        # 计算校验码
        checksum = 0
        for i in range(0, 8, 2):
            checksum += response[i] + (response[i+1] << 8)

        return response + bytes([checksum & 0xFF, (checksum >> 8) & 0xFF])

    def _send(self, cmd: bytes):
        """发送命令到温控器并等待响应（模拟）

        Args:
            cmd: 要发送的命令字节

        Returns:
            bytes: 接收到的响应数据，失败返回None

        Raises:
            Exception: 设备未连接时抛出异常
        """
        with self.lock:  # 串口互斥，避免多线程同时读写
            try:
                if not self.is_connected or not self.serial:
                    raise Exception(f"Device not connected on {self.port}")

                # 清空输入缓冲
                self.serial.reset_input_buffer()

                # 解析命令
                if len(cmd) == 8:
                    addr1, addr2, cmd_type, param_code = cmd[0], cmd[1], cmd[2], cmd[3]

                    if cmd_type == 0x52:  # 读命令
                        param_value = None
                        add_debug_log(f"模拟读命令: 参数代码 0x{param_code:02X}", "DEBUG")

                    elif cmd_type == 0x43:  # 写命令
                        param_value = cmd[4] + (cmd[5] << 8)
                        add_debug_log(f"模拟写命令: 参数代码 0x{param_code:02X}, 值 {param_value}", "DEBUG")

                        # 处理写操作
                        self._handle_write_operation(param_code, param_value)
                    else:
                        add_debug_log(f"未知命令类型: 0x{cmd_type:02X}", "WARNING")
                        return None

                    # 发送命令（模拟）
                    bytes_written = self.serial.write(cmd)
                    self.serial.flush()

                    # 记录发送的16进制数据
                    add_comm_log('TX', cmd.hex())

                    # 模拟响应延迟
                    time.sleep(0.02)  # 20ms响应延迟

                    # 生成并返回响应
                    response = self._generate_response(param_code, param_value)

                    # 模拟接收数据
                    self.serial._buffer.extend(response)
                    self.serial.in_waiting = len(response)

                    # 读取响应
                    response_data = self.serial.read(10)

                    if response_data:
                        # 记录接收的16进制数据
                        add_comm_log('RX', response_data.hex())
                        add_debug_log(f"模拟响应: {response_data.hex().upper()}", "DEBUG")
                        return response_data
                    else:
                        add_debug_log("模拟响应失败", "ERROR")
                        return None

                else:
                    add_debug_log(f"命令长度错误: {len(cmd)} 字节", "WARNING")
                    return None

            except Exception as e:
                add_debug_log(f"发送命令异常: {str(e)}", "ERROR")
                return None

    def _handle_write_operation(self, param_code: int, param_value: int):
        """处理写操作

        Args:
            param_code: 参数代码
            param_value: 参数值
        """
        try:
            if param_code == 0x00:  # SV/程序段设置
                if param_value <= 30:  # 程序段号
                    self.current_segment = param_value
                    if param_value > 0:
                        self.sv = self.program_segments[param_value - 1]['temperature']
                    add_debug_log(f"设置程序段: {param_value}, 设定温度: {self.sv}°C", "INFO")
                else:  # 温度值
                    self.sv = param_value / 10.0
                    add_debug_log(f"设定温度: {self.sv}°C", "INFO")

            elif param_code == 0x15:  # 程序控制
                if param_value == 0:  # 运行
                    self.program_status = "run"
                    if self.current_segment == 0:
                        self.current_segment = 1
                    self.segment_start_time = datetime.now()
                    self.segment_elapsed_time = 0
                    if self.current_segment <= 30:
                        self.sv = self.program_segments[self.current_segment - 1]['temperature']
                    add_debug_log("程序启动", "INFO")

                elif param_value == 4:  # 暂停
                    self.program_status = "pause"
                    add_debug_log("程序暂停", "INFO")

                elif param_value == 12:  # 停止
                    self.program_status = "stop"
                    self.current_segment = 0
                    self.segment_elapsed_time = 0
                    add_debug_log("程序停止", "INFO")

            elif 0x1A <= param_code <= 0x56:  # 程序段参数设置
                segment_idx = (param_code - 0x1A) // 2
                if segment_idx < 30:
                    if param_code % 2 == 0:  # 温度参数
                        old_temp = self.program_segments[segment_idx]['temperature']
                        self.program_segments[segment_idx]['temperature'] = param_value / 10.0
                        add_debug_log(f"程序段{segment_idx+1}温度: {old_temp}°C -> {param_value/10.0}°C", "INFO")
                    else:  # 时间参数
                        old_time = self.program_segments[segment_idx]['time']
                        self.program_segments[segment_idx]['time'] = param_value
                        add_debug_log(f"程序段{segment_idx+1}时间: {old_time}s -> {param_value}s", "INFO")

        except Exception as e:
            add_debug_log(f"写操作处理异常: {str(e)}", "ERROR")

    def read_parameter(self, code: int):
        """读取温控器参数

        Args:
            code: 参数代码

        Returns:
            dict: 包含pv、sv、mv、status_a、param_value的字典，失败返回None
        """
        resp = self._send(self._cmd_read(code))
        if resp and len(resp) >= 8:
            pv = resp[0] + (resp[1] << 8)
            sv = resp[2] + (resp[3] << 8)
            mv = resp[4] if resp[4] <= 127 else resp[4] - 256
            status_a = resp[5]
            param_value = resp[6] + (resp[7] << 8)

            result = {"pv": pv / 10.0, "sv": sv / 10.0, "mv": mv, "status_a": status_a, "param_value": param_value}
            add_debug_log(f"读取参数0x{code:02X}结果: PV={result['pv']}°C, SV={result['sv']}°C, MV={result['mv']}, 参数值={param_value}", "DEBUG")

            return result
        return None

    def write_parameter(self, code: int, value: int) -> bool:
        """写入温控器参数

        Args:
            code: 参数代码
            value: 参数值

        Returns:
            bool: 写入成功返回True，失败返回False
        """
        resp = self._send(self._cmd_write(code, value))
        if not resp or len(resp) < 8:
            add_debug_log(f"写入参数0x{code:02X}失败: 响应无效", "ERROR")
            return False
        returned = resp[6] + (resp[7] << 8)
        success = returned == value
        add_debug_log(f"写入参数0x{code:02X}: {value}, 验证: {returned}, 结果: {'成功' if success else '失败'}", "DEBUG")
        return success

    def get_all_status(self):
        """获取温控器所有状态信息

        Returns:
            dict: 包含pv、sv、mv、status、segment、segment_time、segment_time_set、timestamp的字典，失败返回None
        """
        temp_data = self.read_parameter(0x00)
        if not temp_data:
            return None
        control = self.read_parameter(0x15)
        if not control:
            return None
        ctrl = control["param_value"]
        if ctrl == 12:
            status = "stop"
        elif ctrl == 4:
            status = "pause"
        elif ctrl == 0:
            status = "run"
        else:
            status = f"unknown({ctrl})"
        # 处理参数0x00的值：在程序停止时可能是SV值，在运行时是程序段号
        raw_param_value = temp_data["param_value"]

        # 判断是否为程序段号（1-30）还是SV值（温度值）
        if status != "stop" and 1 <= raw_param_value <= 30:
            current_segment = raw_param_value
        elif raw_param_value > 100:  # 假设温度值大于10.0℃（即大于100的整数值）
            # 这可能是SV值，在停止状态下设置segment为0
            current_segment = 0
        else:
            current_segment = raw_param_value if 1 <= raw_param_value <= 30 else 0

        time_data = self.read_parameter(0x56)
        segment_time = time_data["param_value"] if time_data else 0
        segment_time_set = self.get_segment_time_set(current_segment)

        result = {
            "pv": temp_data["pv"],
            "sv": temp_data["sv"],
            "mv": temp_data["mv"],
            "status": status,
            "segment": current_segment,
            "segment_time": segment_time,
            "segment_time_set": segment_time_set,
            "timestamp": datetime.now().isoformat(),
        }

        add_debug_log(f"获取状态: PV={result['pv']}°C, SV={result['sv']}°C, 状态={status}, 原始参数值={raw_param_value}, 解析程序段={current_segment}", "DEBUG")
        return result

    def get_segment_time_set(self, segment_num: int) -> int:
        """获取指定程序段设定时间

        Args:
            segment_num: 程序段编号(1-30)

        Returns:
            int: 设定时间（分钟），无效段号返回0
        """
        if 1 <= segment_num <= 30:
            return self.program_segments[segment_num - 1]['time']
        return 0

    def set_program_run(self):
        """启动程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        add_debug_log("执行程序启动命令", "INFO")
        return self.write_parameter(0x15, 0)

    def set_program_pause(self):
        """暂停程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        add_debug_log("执行程序暂停命令", "INFO")
        return self.write_parameter(0x15, 4)

    def set_program_stop(self):
        """停止程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        add_debug_log("执行程序停止命令", "INFO")
        return self.write_parameter(0x15, 12)

    def set_segment(self, seg: int):
        """设置当前程序段

        Args:
            seg: 程序段编号

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        add_debug_log(f"设置程序段: {seg}", "INFO")
        return self.write_parameter(0x00, seg)

    def set_sv(self, sv_celsius: float):
        """设定目标温度

        Args:
            sv_celsius: 目标温度（摄氏度）

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        add_debug_log(f"设定温度: {sv_celsius}°C", "INFO")
        return self.write_parameter(0x00, int(sv_celsius * 10))

    def read_program_segments(self) -> List[ProgramSegment]:
        """读取所有程序段设置

        Returns:
            List[ProgramSegment]: 程序段列表，包含30个程序段的温度和时间设置
        """
        segs: List[ProgramSegment] = []
        for i in range(30):
            seg_id = i + 1
            temp_c = self.program_segments[i]['temperature']
            t_sec = self.program_segments[i]['time']
            segs.append(ProgramSegment(id=seg_id, temperature=temp_c, time=t_sec))

        add_debug_log("读取所有程序段设置", "DEBUG")
        return segs

    def write_program_segments(self, items: List[ProgramSegment]):
        """写入程序段设置

        Args:
            items: 程序段列表

        Returns:
            bool: 所有段都写入成功返回True，否则返回False
        """
        ok = True
        for it in items:
            idx = it.id - 1
            if idx < 0 or idx > 29:
                continue

            old_temp = self.program_segments[idx]['temperature']
            old_time = self.program_segments[idx]['time']

            self.program_segments[idx]['temperature'] = it.temperature
            self.program_segments[idx]['time'] = it.time

            add_debug_log(f"程序段{it.id}: 温度 {old_temp}°C->{it.temperature}°C, 时间 {old_time}s->{it.time}s", "INFO")

        add_debug_log(f"写入{len(items)}个程序段设置", "INFO")
        return ok


# 全局控制器实例
controller: AI518PController | None = None


@app.get("/health")
def health():
    """健康检查接口"""
    return {"status": "ok", "simulator": True}


@app.get("/comm-log")
def get_comm_log():
    """获取通信日志"""
    return {
        "logs": comm_log,
        "total": len(comm_log)
    }


@app.get("/debug-log")
def get_debug_log():
    """获取调试日志"""
    return {
        "logs": debug_log,
        "total": len(debug_log)
    }


@app.get("/ports")
def ports():
    """获取可用串口列表（模拟）"""
    # 模拟串口列表，包含COM4
    mock_ports = ["COM1", "COM2", "COM3", "COM4", "COM5"]
    add_debug_log("返回模拟串口列表", "DEBUG")
    return mock_ports


@app.post("/connect")
def connect(req: ConnectRequest):
    """连接温控器设备（模拟）"""
    global controller
    try:
        # 断开现有连接（如果存在）
        if controller:
            try:
                controller.disconnect()
            except Exception:
                pass  # 忽略断开时的异常

        # 建立新连接（模拟）
        controller = AI518PController(req.port, req.baudrate, req.address, req.stopbits, req.timeout)
        controller.connect()

        return {"connected": True, "port": req.port, "simulator": True}
    except Exception as e:
        controller = None
        add_debug_log(f"连接失败: {str(e)}", "ERROR")
        return {"connected": False, "error": str(e), "port": req.port}


@app.post("/disconnect")
def disconnect():
    """断开温控器连接"""
    global controller
    if controller:
        controller.disconnect()
        controller = None
    return {"connected": False}


@app.get("/status")
def status():
    """获取温控器状态"""
    if not controller:
        return {"error": "not connected"}
    try:
        s = controller.get_all_status()
        return s or {"error": "no response"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/run")
def run():
    """启动程序运行"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_program_run())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/pause")
def pause():
    """暂停程序运行"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_program_pause())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/stop")
def stop():
    """停止程序运行"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_program_stop())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/sv")
def set_sv(sv: float = Body(..., embed=True)):  # 摄氏度
    """设定目标温度"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_sv(sv))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/segment/set")
def set_segment(segment: int = Body(..., embed=True)):
    """设置当前程序段"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_segment(segment))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/program/segments")
def get_program_segments():
    """获取所有程序段设置"""
    if not controller:
        return {"error": "not connected"}
    try:
        return [s.model_dump() for s in controller.read_program_segments()]
    except Exception as e:
        return {"error": str(e)}


@app.post("/program/segments")
def set_program_segments(items: List[ProgramSegment]):
    """设置程序段"""
    if not controller:
        return {"error": "not connected"}
    try:
        ok = controller.write_program_segments(items)
        return {"ok": bool(ok), "count": len(items)}
    except Exception as e:
        return {"ok": False, "error": str(e), "count": len(items)}


@app.get("/logs/temperature")
def get_temperature_history(
    from_time: Optional[str] = None,
    to_time: Optional[str] = None,
    limit: Optional[int] = None,
    downsample: Optional[int] = None
):
    """获取温度历史数据"""
    try:
        # 参数验证
        if limit is not None and (limit < 1 or limit > 10000):
            return {"error": "Limit must be between 1 and 10000"}

        if downsample is not None and downsample < 1:
            return {"error": "Downsample must be positive"}

        if not controller:
            # 即使没有连接控制器，也返回一些模拟数据
            mock_data = []
            if limit and limit > 0:
                for i in range(min(limit, 100)):
                    mock_data.append({
                        "timestamp": (datetime.now() - timedelta(seconds=limit-i)).isoformat(),
                        "pv": round(25.0 + random.uniform(-2, 2), 1),
                        "sv": round(25.0 + random.uniform(-1, 1), 1),
                        "mv": random.randint(-5, 5),
                        "segment": 0,
                        "status": "stop"
                    })
            return mock_data

        # 获取历史数据
        history_data = controller.get_temperature_history(from_time, to_time, limit, downsample)

        add_debug_log(f"历史数据API请求: from={from_time}, to={to_time}, limit={limit}, downsample={downsample}, 返回{len(history_data)}条数据", "INFO")

        return history_data

    except Exception as e:
        add_debug_log(f"历史数据API异常: {str(e)}", "ERROR")
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    add_debug_log("AI-518P温控器模拟器启动中...", "INFO")
    uvicorn.run(app, host="127.0.0.1", port=8011)