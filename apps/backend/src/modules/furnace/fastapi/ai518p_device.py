from fastapi import FastAPI, Body, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import serial
import serial.tools.list_ports
import time
import threading
import uuid
from datetime import datetime
import logging
from enum import Enum

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ErrorCategory(Enum):
    DEVICE = "DEVICE"
    TIMEOUT = "TIMEOUT"
    SYSTEM = "SYSTEM"

class FurnaceError(Exception):
    """熔炉设备专用错误类"""
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = True, context: Optional[Dict] = None):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
        self.context = context or {}
        self.timestamp = datetime.now()




class FurnaceResponse:
    """熔炉响应包装器类 - 统一数据解析和响应格式"""

    @staticmethod
    def create_from_parameter_data(param_data: dict, operation_success: bool = True,
                                 operation_code: Optional[int] = None, operation_value: Optional[int] = None) -> dict:
        """从参数数据创建统一的响应格式

        Args:
            param_data: 从read_parameter或write_parameter获得的数据
            operation_success: 操作是否成功
            operation_code: 操作的参数代码
            operation_value: 操作的参数值

        Returns:
            dict: 统一格式的响应数据
        """
        if not param_data or "error" in param_data:
            return FurnaceResponse.create_error_response(param_data.get("error", "Unknown error") if param_data else "No data")

        base_response = {
            "ok": operation_success,
            "pv": param_data.get("pv", 0.0),
            "sv": param_data.get("sv", 0.0),
            "mv": param_data.get("mv", 0),
            "status_a": param_data.get("status_a", 0),
            "param_value": param_data.get("param_value", 0),
            "timestamp": datetime.now().isoformat()
        }

        if operation_code is not None and operation_value is not None:
            base_response["operation"] = {
                "code": operation_code,
                "value": operation_value,
                "success": operation_success
            }

        return base_response

    @staticmethod
    def create_error_response(error_message: str) -> dict:
        """创建错误响应

        Args:
            error_message: 错误信息

        Returns:
            dict: 错误响应格式
        """
        return {
            "ok": False,
            "error": error_message,
            "pv": 0.0,
            "sv": 0.0,
            "mv": 0,
            "status_a": 0,
            "param_value": 0,
            "timestamp": datetime.now().isoformat()
        }



class EnhancedCommLogManager:
    """增强的通信日志管理器，包含错误分类和统计"""
    def __init__(self, max_size: int = 500):
        self._logs = []
        self._max_size = max_size
        self._lock = threading.Lock()
        self._error_counts = {}
        self._last_error_time = None

    def add_log(self, direction: str, data_hex: str, timestamp=None, connection_id: Optional[str] = None, error: Optional[Exception] = None):
        """添加通信日志到缓冲区"""
        if timestamp is None:
            timestamp = datetime.now()

        log_entry = {
            'timestamp': timestamp.strftime('%H:%M:%S.%f')[:-3],
            'direction': direction,
            'data': data_hex.upper(),
            'connection_id': connection_id,
            'error': str(error) if error else None,
            'error_category': error.category.value if isinstance(error, FurnaceError) else None
        }

        with self._lock:
            self._logs.append(log_entry)
            if len(self._logs) > self._max_size:
                self._logs.pop(0)

            # 错误统计
            if error:
                self._last_error_time = timestamp
                category = error.category.value if isinstance(error, FurnaceError) else "UNKNOWN"
                self._error_counts[category] = self._error_counts.get(category, 0) + 1

    def get_error_stats(self):
        """获取错误统计信息"""
        recent_errors = [log for log in self._logs if log['error'] and
                         (datetime.now() - datetime.strptime(log['timestamp'], '%H:%M:%S.%f')).seconds < 300]

        return {
            "total_errors": len([log for log in self._logs if log['error']]),
            "recent_errors_5min": len(recent_errors),
            "error_categories": dict(self._error_counts),
            "last_error_time": self._last_error_time.strftime('%H:%M:%S.%f')[:-3] if self._last_error_time else None
        }

    def get_logs(self, connection_id: Optional[str] = None) -> List[Dict]:
        """获取日志"""
        with self._lock:
            if connection_id:
                return [log for log in self._logs if log.get('connection_id') == connection_id]
            return self._logs.copy()

    def clear_logs(self, connection_id: Optional[str] = None):
        """清空日志"""
        with self._lock:
            if connection_id:
                self._logs = [log for log in self._logs if log.get('connection_id') != connection_id]
            else:
                self._logs.clear()
            self._error_counts.clear()
            self._last_error_time = None

# AI-518P温控器FastAPI服务器
app = FastAPI(title="AI-518P温控器FastAPI接口")


@app.exception_handler(FurnaceError)
async def furnace_exception_handler(request: Request, exc: FurnaceError):
    """
    捕获所有自定义的FurnaceError异常，并返回标准化的错误响应
    """
    error_message = str(exc)  # 从Exception基类获取错误消息
    logger.error(f"FurnaceError caught: {error_message} | Category: {exc.category.value} | Context: {exc.context}")

    # 使用FurnaceResponse工具生成响应
    error_response = FurnaceResponse.create_error_response(error_message)

    # 添加更多结构化信息
    error_response["error_details"] = {
        "category": exc.category.value,
        "retryable": exc.retryable,
        "context": exc.context
    }

    # 根据错误类型决定HTTP状态码
    status_code = 503 if exc.category == ErrorCategory.DEVICE else 400

    return JSONResponse(
        status_code=status_code,
        content=error_response
    )




@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    捕获所有未处理的通用异常，防止服务器返回500错误
    """
    logger.critical(f"Unhandled exception for request {request.url}: {exc}", exc_info=True)

    error_response = FurnaceResponse.create_error_response("An unexpected internal server error occurred.")

    return JSONResponse(
        status_code=500,
        content=error_response
    )


# 使用增强的日志管理器
CommLogManager = EnhancedCommLogManager


class FurnaceDeviceManager:
    """简化的熔炉设备管理器 - 单连接模式，移除过度设计的复杂性"""

    def __init__(self):
        self._controller: Optional['AI518PController'] = None
        self._connection_id: Optional[str] = None
        self._lock = threading.Lock()
        self.comm_log = CommLogManager()

    def connect(self, port: str, baudrate: int = 9600, address: int = 1,
                stopbits: int = 2, timeout: float = 1.0) -> str:
        """连接设备（单连接模式）

        Args:
            port: 串口号
            baudrate: 波特率
            address: 设备地址
            stopbits: 停止位
            timeout: 超时时间

        Returns:
            connection_id: 连接ID

        Raises:
            FurnaceError: 连接失败时抛出异常
        """
        with self._lock:
            # 如果已有连接，先断开
            if self._controller:
                try:
                    self._controller.disconnect()
                except Exception:
                    pass
                self.comm_log.clear_logs(self._connection_id)

            # 生成新的连接ID
            self._connection_id = str(uuid.uuid4())

            # 创建新控制器实例
            self._controller = AI518PController(
                port=port,
                baudrate=baudrate,
                address=address,
                stopbits=stopbits,
                timeout=timeout,
                comm_log=self.comm_log,
                connection_id=self._connection_id
            )

            # 尝试连接
            try:
                self._controller.connect()
                logger.info(f"成功连接到设备: {port}:{address}")
                return self._connection_id
            except Exception as e:
                self._controller = None
                self._connection_id = None
                furnace_error = FurnaceError(
                    f"连接失败 {port}:{address}: {str(e)}",
                    ErrorCategory.DEVICE,
                    retryable=True
                )
                self.comm_log.add_log('ERROR', 'CONNECTION_FAILED', connection_id=self._connection_id, error=furnace_error)
                raise furnace_error

    def disconnect(self) -> bool:
        """断开设备连接

        Returns:
            是否成功断开
        """
        with self._lock:
            if not self._controller:
                return False

            try:
                self._controller.disconnect()
                self.comm_log.clear_logs(self._connection_id)
                logger.info("设备已断开连接")
                return True
            except Exception as e:
                logger.error(f"断开连接时发生错误: {str(e)}")
                return False
            finally:
                self._controller = None
                self._connection_id = None

    def get_connection_id(self) -> Optional[str]:
        """获取当前连接ID

        Returns:
            连接ID，如果没有连接返回None
        """
        return self._connection_id

    def get_connection_info(self) -> Optional[Dict]:
        """获取连接信息

        Returns:
            连接信息字典，如果没有连接返回None
        """
        with self._lock:
            if not self._controller:
                return None

            return {
                'connection_id': self._connection_id,
                'port': self._controller.port,
                'address': self._controller.address,
                'baudrate': self._controller.baudrate,
                'connected': self._controller.serial is not None and self._controller.serial.is_open if self._controller.serial else False
            }

    def get_controller(self) -> Optional['AI518PController']:
        """获取控制器实例

        Returns:
            控制器实例，如果没有连接返回None
        """
        with self._lock:
            if not self._controller:
                return None

            # 简单的连接健康检查
            if not self._is_connection_healthy():
                try:
                    # 尝试重新连接
                    self._controller.connect()
                    self.comm_log.add_log('RECONNECT', f"Reconnected {self._connection_id}", connection_id=self._connection_id)
                except Exception as e:
                    self.comm_log.add_log('ERROR', f"Reconnect failed: {str(e)}", connection_id=self._connection_id)
                    return None

            return self._controller

    def _is_connection_healthy(self) -> bool:
        """检查连接是否健康

        Returns:
            连接是否健康
        """
        if not self._controller:
            return False

        try:
            return (self._controller.serial is not None and
                   self._controller.serial.is_open)
        except Exception:
            return False


# 全局设备管理器实例
device_manager = FurnaceDeviceManager()


def get_active_controller() -> 'AI518PController':
    """
    FastAPI依赖项：获取活动的控制器
    如果获取失败，抛出FurnaceError异常

    Returns:
        AI518PController: 可用的控制器实例

    Raises:
        FurnaceError: 当没有活动连接时
    """
    controller = device_manager.get_controller()
    if not controller:
        raise FurnaceError(
            "No active connection to the device. Please connect first.",
            ErrorCategory.DEVICE,
            retryable=False
        )
    return controller


def get_optional_controller() -> Optional['AI518PController']:
    """
    FastAPI依赖项：获取可选的控制器
    如果获取失败，返回None而不是抛出异常

    Returns:
        Optional[AI518PController]: 可用的控制器实例，或None
    """
    return device_manager.get_controller()


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


class AI518PController:
    """AI-518P温控器控制器类 - 无状态设计，支持多线程安全操作"""

    def __init__(self, port='COM4', baudrate=9600, address=1, stopbits=2, timeout=0.5,
                 comm_log: Optional[CommLogManager] = None, connection_id: Optional[str] = None):
        """初始化温控器控制器

        Args:
            port: 串口号，默认COM4
            baudrate: 波特率，默认9600
            address: 设备地址，默认1
            stopbits: 停止位，默认2
            timeout: 超时时间，默认0.5秒
            comm_log: 通信日志管理器
            connection_id: 连接ID
        """
        self.port = port
        self.baudrate = baudrate
        self.address = address
        self.stopbits = stopbits
        self.timeout = timeout
        self.serial = None
        self.lock = threading.Lock()  # 串口互斥锁，确保原子性操作
        self.comm_log = comm_log or CommLogManager()
        self.connection_id = connection_id

    def connect(self):
        """连接温控器设备

        Returns:
            bool: 连接成功返回True

        Raises:
            FurnaceError: 连接失败时抛出异常
        """
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_TWO if self.stopbits == 2 else serial.STOPBITS_ONE,
                timeout=self.timeout,
            )

            # 测试连接是否正常
            if self.serial.is_open:
                logger.info(f"成功连接到设备 {self.port} (地址: {self.address})")
                return True
            else:
                raise FurnaceError(f"串口打开失败 {self.port}", ErrorCategory.DEVICE)

        except serial.SerialException as e:
            self.serial = None
            raise FurnaceError(f"串口连接失败 {self.port}: {str(e)}", ErrorCategory.DEVICE, retryable=True)
        except Exception as e:
            self.serial = None
            raise FurnaceError(f"设备连接失败 {self.port}: {str(e)}", ErrorCategory.DEVICE, retryable=True)

    def disconnect(self):
        """断开温控器连接"""
        if self.serial and self.serial.is_open:
            self.serial.close()

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

    def _send(self, cmd: bytes):
        """发送命令到温控器并等待响应（严格一发一收：收到完整响应/超时才返回）

        Args:
            cmd: 要发送的命令字节

        Returns:
            bytes: 接收到的响应数据，失败返回None

        Raises:
            FurnaceError: 设备通信错误时抛出异常
        """
        with self.lock:  # 串口互斥，避免多线程同时读写
            try:
                if not self.serial or not self.serial.is_open:
                    error = FurnaceError(f"设备未连接 {self.port}", ErrorCategory.DEVICE, retryable=True)
                    self.comm_log.add_log('ERROR', 'DEVICE_NOT_CONNECTED', connection_id=self.connection_id, error=error)
                    raise error

                # 清空输入缓冲，避免上一次残留数据干扰
                self.serial.reset_input_buffer()

                # 发送
                bytes_written = self.serial.write(cmd)
                self.serial.flush()

                # 记录发送的16进制数据
                self.comm_log.add_log('TX', cmd.hex(), connection_id=self.connection_id)

                # 期望响应长度（协议固定为10字节）
                target_len = 10
                response = bytearray()

                # 堵塞等待直到收齐或超时（独立于串口自身 timeout）
                start_time = time.time()
                max_wait = 1.0  # 最多等1秒

                while time.time() - start_time < max_wait and len(response) < target_len:
                    waiting = self.serial.in_waiting
                    if waiting > 0:
                        chunk = self.serial.read(waiting)
                        if chunk:
                            response.extend(chunk)
                    else:
                        time.sleep(0.01)  # 轻量轮询

                if len(response) >= target_len:
                    # 记录接收的16进制数据
                    response_bytes = bytes(response[:target_len])
                    self.comm_log.add_log('RX', response_bytes.hex(), connection_id=self.connection_id)
                    return response_bytes
                else:
                    # 读取所有可用数据
                    n = self.serial.in_waiting
                    if n > 0:
                        partial_response = self.serial.read(n)
                        self.comm_log.add_log('RX', partial_response.hex(), connection_id=self.connection_id)
                        return partial_response

                    # 超时错误
                    timeout_error = FurnaceError(
                        f"通信超时 {self.port}, 命令: {cmd.hex()}, 等待{max_wait}秒无响应",
                        ErrorCategory.TIMEOUT,
                        retryable=True
                    )
                    self.comm_log.add_log('ERROR', 'COMMUNICATION_TIMEOUT', connection_id=self.connection_id, error=timeout_error)
                    raise timeout_error

            except serial.SerialTimeoutException as e:
                error = FurnaceError(f"串口超时 {self.port}: {str(e)}", ErrorCategory.TIMEOUT, retryable=True)
                self.comm_log.add_log('ERROR', 'SERIAL_TIMEOUT', connection_id=self.connection_id, error=error)
                raise error
            except serial.SerialException as e:
                error = FurnaceError(f"串口通信错误 {self.port}: {str(e)}", ErrorCategory.DEVICE, retryable=True)
                self.comm_log.add_log('ERROR', 'SERIAL_ERROR', connection_id=self.connection_id, error=error)
                raise error
            except FurnaceError:
                # 重新抛出已知的FurnaceError
                raise
            except Exception as e:
                error = FurnaceError(f"未知通信错误 {self.port}: {str(e)}", ErrorCategory.SYSTEM, retryable=False)
                self.comm_log.add_log('ERROR', 'UNKNOWN_ERROR', connection_id=self.connection_id, error=error)
                raise error

    def read_parameter(self, code: int):
        """读取温控器参数

        Args:
            code: 参数代码

        Returns:
            dict: 包含pv、sv、mv、status_a、param_value的字典

        Raises:
            FurnaceError: 读取失败时抛出异常
        """
        try:
            resp = self._send(self._cmd_read(code))
            if resp and len(resp) >= 8:
                pv = resp[0] + (resp[1] << 8)
                sv = resp[2] + (resp[3] << 8)
                mv = resp[4] if resp[4] <= 127 else resp[4] - 256
                status_a = resp[5]
                param_value = resp[6] + (resp[7] << 8)
                return {"pv": pv / 10.0, "sv": sv / 10.0, "mv": mv, "status_a": status_a, "param_value": param_value}
            else:
                error = FurnaceError(
                    f"参数读取失败，响应数据不完整 (代码: 0x{code:02X})",
                    ErrorCategory.SYSTEM,
                    retryable=True
                )
                self.comm_log.add_log('ERROR', 'PROTOCOL_ERROR', connection_id=self.connection_id, error=error)
                raise error
        except FurnaceError:
            raise
        except Exception as e:
            error = FurnaceError(
                f"参数读取异常 (代码: 0x{code:02X}): {str(e)}",
                ErrorCategory.SYSTEM,
                retryable=False
            )
            self.comm_log.add_log('ERROR', 'READ_PARAMETER_ERROR', connection_id=self.connection_id, error=error)
            raise error

    def write_parameter(self, code: int, value: int) -> dict:
        """写入温控器参数

        Args:
            code: 参数代码
            value: 参数值

        Returns:
            dict: 包含pv、sv、mv、status_a、param_value的字典，以及操作结果
        """
        try:
            resp = self._send(self._cmd_write(code, value))
            if resp and len(resp) >= 8:
                # 解析响应数据，与read_parameter方法保持一致
                pv = resp[0] + (resp[1] << 8)
                sv = resp[2] + (resp[3] << 8)
                mv = resp[4] if resp[4] <= 127 else resp[4] - 256
                status_a = resp[5]
                param_value = resp[6] + (resp[7] << 8)
                
                # 检查写入是否成功
                operation_success = param_value == value
                
                # 使用FurnaceResponse包装器创建统一格式响应
                param_data = {
                    "pv": pv / 10.0,
                    "sv": sv / 10.0,
                    "mv": mv,
                    "status_a": status_a,
                    "param_value": param_value
                }
                
                return FurnaceResponse.create_from_parameter_data(
                    param_data, operation_success, code, value
                )
            else:
                error = FurnaceError(
                    f"参数写入失败，响应数据不完整 (代码: 0x{code:02X})",
                    ErrorCategory.SYSTEM,
                    retryable=True
                )
                self.comm_log.add_log('ERROR', 'PROTOCOL_ERROR', connection_id=self.connection_id, error=error)
                return FurnaceResponse.create_error_response(str(error))
        except FurnaceError:
            return FurnaceResponse.create_error_response("设备通信错误")
        except Exception as e:
            error = FurnaceError(
                f"参数写入异常 (代码: 0x{code:02X}): {str(e)}",
                ErrorCategory.SYSTEM,
                retryable=False
            )
            self.comm_log.add_log('ERROR', 'WRITE_PARAMETER_ERROR', connection_id=self.connection_id, error=error)
            return FurnaceResponse.create_error_response(str(error))

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
        current_segment = temp_data["param_value"]
        time_data = self.read_parameter(0x56)
        segment_time = time_data["param_value"] if time_data else 0
        segment_time_set = self.get_segment_time_set(current_segment)
        return {
            "pv": temp_data["pv"],
            "sv": temp_data["sv"],
            "mv": temp_data["mv"],
            "status": status,
            "segment": current_segment,
            "segment_time": segment_time,
            "segment_time_set": segment_time_set,
            "timestamp": datetime.now().isoformat(),
        }

    def get_segment_time_set(self, segment_num: int) -> int:
        """获取指定程序段设定时间

        Args:
            segment_num: 程序段编号(1-30)

        Returns:
            int: 设定时间（分钟），无效段号返回0
        """
        if 1 <= segment_num <= 30:
            code = 0x1B + (segment_num - 1) * 2
            d = self.read_parameter(code)
            return d["param_value"] if d else 0
        return 0

    def set_program_run(self):
        """启动程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        return self.write_parameter(0x15, 0)

    def set_program_pause(self):
        """暂停程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        return self.write_parameter(0x15, 4)

    def set_program_stop(self):
        """停止程序运行

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        return self.write_parameter(0x15, 12)

    def set_segment(self, seg: int):
        """设置当前程序段

        Args:
            seg: 程序段编号

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        return self.write_parameter(0x00, seg)

    
    def read_program_segments(self) -> List[ProgramSegment]:
        """读取所有程序段设置"""
        segs: List[ProgramSegment] = []

        for i in range(30):
            seg_id = i + 1
            temp_code = 0x1A + i * 2
            time_code = 0x1B + i * 2

            # 读取温度和时间参数
            td = self.read_parameter(temp_code)
            vd = self.read_parameter(time_code)

            temp_c = (td["param_value"] / 10.0) if td else 0.0
            t_min = vd["param_value"] if vd else 0

            segs.append(ProgramSegment(id=seg_id, temperature=temp_c, time=t_min))

        return segs

    def write_program_segments(self, items: List[ProgramSegment]):
        """写入程序段设置"""
        ok = True

        for it in items:
            idx = it.id - 1
            if idx < 0 or idx > 29:
                continue

            temp_code = 0x1A + idx * 2
            time_code = 0x1B + idx * 2
            temp_int = int(round(it.temperature * 10))
            time_min = int(round(it.time or 0))

            # 写入温度和时间参数
            temp_ok = self.write_parameter(temp_code, temp_int)
            time_ok = self.write_parameter(time_code, time_min)

            segment_ok = temp_ok and time_ok
            ok = ok and segment_ok

        return ok


@app.post("/connect")
def connect(request: ConnectRequest):
    """连接熔炉设备"""
    connection_id = device_manager.connect(
        port=request.port,
        baudrate=request.baudrate,
        address=request.address,
        stopbits=request.stopbits,
        timeout=request.timeout
    )
    logger.info(f"设备连接成功: {connection_id} ({request.port}:{request.address})")
    return {
        "connection_id": connection_id,
        "connected": True,
        "port": request.port,
        "error": None
    }


@app.post("/disconnect")
def disconnect():
    """断开熔炉设备连接"""
    success = device_manager.disconnect()
    if success:
        logger.info("设备已断开连接")
    return {
        "success": success,
        "disconnected_count": 1 if success else 0,
        "error": None
    }


@app.get("/status")
def get_status(controller: 'AI518PController' = Depends(get_active_controller)):
    """获取温控器状态"""
    s = controller.get_all_status()
    return s or {"error": "no response"}


@app.post("/run")
def run_program(controller: 'AI518PController' = Depends(get_active_controller)):
    """启动程序运行"""
    # 直接调用，异常由全局异常处理器处理
    return controller.set_program_run()


@app.post("/pause")
def pause_program(controller: 'AI518PController' = Depends(get_active_controller)):
    """暂停程序运行"""
    # 直接调用，异常由全局异常处理器处理
    return controller.set_program_pause()


@app.post("/stop")
def stop_program(controller: 'AI518PController' = Depends(get_active_controller)):
    """停止程序运行"""
    # 直接调用，异常由全局异常处理器处理
    return controller.set_program_stop()




@app.post("/segment/set")
def set_segment(request: dict = Body(...), controller: 'AI518PController' = Depends(get_active_controller)):
    """设置当前程序段"""
    segment = request.get('segment')
    return controller.set_segment(segment)


@app.get("/program/segments")
def get_program_segments(controller: 'AI518PController' = Depends(get_active_controller)):
    """获取所有程序段设置"""
    segments = controller.read_program_segments()
    return [s.model_dump() for s in segments]


@app.post("/program/segments")
def set_program_segments(items: List[ProgramSegment], controller: Optional['AI518PController'] = Depends(get_optional_controller)):
    """设置程序段"""
    if not controller:
        error_response = FurnaceResponse.create_error_response("No active connection")
        error_response["count"] = len(items)
        return error_response

    # 执行程序段写入操作
    ok = controller.write_program_segments(items)

    # 如果写入失败，返回错误
    if not ok:
        error_response = FurnaceResponse.create_error_response("Failed to write program segments")
        error_response["count"] = len(items)
        error_response["segments_written"] = 0
        return error_response

    # 读取最新状态作为响应
    latest_status = controller.read_parameter(0x00)
    if latest_status:
        result = FurnaceResponse.create_from_parameter_data(
            latest_status,
            True,
            operation_code=None,
            operation_value=len(items)
        )
        result["count"] = len(items)
        result["segments_written"] = len(items)
        return result
    else:
        # 写入成功但无法读取验证状态
        error_response = FurnaceResponse.create_error_response("Program segments written but failed to read verification status")
        error_response["count"] = len(items)
        error_response["segments_written"] = len(items)
        error_response["warning"] = "Write operation completed successfully, but status verification failed"
        return error_response


@app.get("/health")
def health():
    """健康检查接口"""
    return {"status": "ok"}


@app.get("/comm-log")
def get_comm_log():
    """获取通信日志"""
    connection_id = device_manager.get_connection_id()
    logs = device_manager.comm_log.get_logs(connection_id)
    return {
        "logs": logs,
        "total": len(logs),
        "connection_id": connection_id
    }

@app.get("/ports")
def ports():
    """获取可用串口列表"""
    return [p.device for p in serial.tools.list_ports.comports()]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8011)
