from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List, Optional, Dict
import serial
import serial.tools.list_ports
import time
import threading
import uuid
from datetime import datetime
from contextlib import contextmanager
import random
import logging
from enum import Enum

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ErrorCategory(Enum):
    NETWORK = "NETWORK"
    DEVICE = "DEVICE"
    PROTOCOL = "PROTOCOL"
    TIMEOUT = "TIMEOUT"
    VALIDATION = "VALIDATION"
    BUSINESS = "BUSINESS"
    SYSTEM = "SYSTEM"

class FurnaceError(Exception):
    """熔炉设备专用错误类"""
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = True, context: Optional[Dict] = None):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
        self.context = context or {}
        self.timestamp = datetime.now()

class RetryHandler:
    """重试处理器 - 实现指数退避算法"""
    def __init__(self, max_attempts: int = 3, base_delay: float = 1.0, max_delay: float = 30.0, backoff_factor: float = 2.0):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor

    def execute(self, operation, is_retryable=None):
        """执行操作，在失败时自动重试"""
        last_error = None

        for attempt in range(1, self.max_attempts + 1):
            try:
                return operation()
            except Exception as e:
                last_error = e

                # 如果是最后一次尝试，直接抛出错误
                if attempt >= self.max_attempts:
                    break

                # 检查是否可重试
                if is_retryable and not is_retryable(e):
                    break

                # 默认重试条件
                if not self._is_retryable_error(e):
                    break

                # 计算延迟时间
                delay = self._calculate_delay(attempt)
                logger.warning(f"操作失败，{delay:.1f}秒后重试 (尝试 {attempt}/{self.max_attempts}): {str(e)}")
                time.sleep(delay)

        raise last_error

    def _calculate_delay(self, attempt: int) -> float:
        """计算指数退避延迟时间"""
        delay = min(self.base_delay * (self.backoff_factor ** (attempt - 1)), self.max_delay)
        # 添加随机抖动，避免雷群效应
        delay = delay * (0.5 + random.random() * 0.5)
        return delay

    def _is_retryable_error(self, error: Exception) -> bool:
        """判断错误是否可重试"""
        if isinstance(error, FurnaceError):
            return error.retryable

        # 串口通信错误通常可重试
        if "serial" in str(type(error)).lower():
            return True

        # 超时错误可重试
        if "timeout" in str(error).lower():
            return True

        # 连接相关错误可重试
        if any(keyword in str(error).lower() for keyword in ["connection", "disconnected", "refused"]):
            return True

        return False

class CircuitBreaker:
    """熔断器实现"""
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN

    def execute(self, operation):
        """在熔断器保护下执行操作"""
        if self.state == "OPEN":
            if self._should_attempt_reset():
                self.state = "HALF_OPEN"
                logger.info("熔断器进入半开状态")
            else:
                raise FurnaceError("熔断器开启，拒绝执行操作", ErrorCategory.SYSTEM, retryable=False)

        try:
            result = operation()
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise e

    def _on_success(self):
        """操作成功时的处理"""
        self.failure_count = 0
        if self.state == "HALF_OPEN":
            self.state = "CLOSED"
            logger.info("熔断器已关闭")

    def _on_failure(self):
        """操作失败时的处理"""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            logger.warning(f"熔断器已开启 (失败次数: {self.failure_count})")

    def _should_attempt_reset(self) -> bool:
        """判断是否应该尝试重置熔断器"""
        if self.last_failure_time is None:
            return False
        return time.time() - self.last_failure_time >= self.recovery_timeout

    def get_state(self):
        """获取熔断器状态"""
        return {
            "state": self.state,
            "failure_count": self.failure_count,
            "last_failure_time": self.last_failure_time
        }

    def reset(self):
        """重置熔断器"""
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "CLOSED"
        logger.info("熔断器已重置")

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


# 使用增强的日志管理器替代原来的简单版本
CommLogManager = EnhancedCommLogManager


class ConnectionPool:
    """连接池管理器 - 线程安全的连接管理，集成错误处理"""

    def __init__(self):
        self._connections: Dict[str, 'AI518PController'] = {}
        self._lock = threading.Lock()
        self.comm_log = CommLogManager()
        # 为不同类型的操作创建重试处理器和熔断器
        self.retry_handler = RetryHandler(max_attempts=3, base_delay=1.0, max_delay=10.0)
        self.connection_circuit_breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=30.0)
        self.operation_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=15.0)

    def create_connection(self, port: str, baudrate: int = 9600, address: int = 1,
                         stopbits: int = 2, timeout: float = 1.0) -> str:
        """创建新连接

        Args:
            port: 串口号
            baudrate: 波特率
            address: 设备地址
            stopbits: 停止位
            timeout: 超时时间

        Returns:
            connection_id: 连接ID

        Raises:
            Exception: 连接失败时抛出异常
        """
        connection_id = str(uuid.uuid4())
        context = {"port": port, "address": address, "baudrate": baudrate}

        def _create_connection():
            with self._lock:
                # 检查是否已存在相同端口的连接
                for existing_id, controller in self._connections.items():
                    if controller.port == port and controller.address == address:
                        # 关闭现有连接
                        try:
                            controller.disconnect()
                        except Exception:
                            pass
                        del self._connections[existing_id]
                        self.comm_log.clear_logs(existing_id)
                        break

                # 创建新控制器实例
                controller = AI518PController(
                    port=port,
                    baudrate=baudrate,
                    address=address,
                    stopbits=stopbits,
                    timeout=timeout,
                    comm_log=self.comm_log,
                    connection_id=connection_id
                )

                # 尝试连接
                try:
                    controller.connect()
                    self._connections[connection_id] = controller
                    logger.info(f"成功创建连接: {connection_id} ({port}:{address})")
                    return connection_id
                except Exception as e:
                    # 转换为FurnaceError并添加到日志
                    furnace_error = FurnaceError(
                        f"连接失败 {port}:{address}: {str(e)}",
                        ErrorCategory.DEVICE,
                        retryable=True,
                        context=context
                    )
                    self.comm_log.add_log('ERROR', 'CONNECTION_FAILED', connection_id=connection_id, error=furnace_error)
                    raise furnace_error

        # 使用熔断器和重试机制保护连接操作
        try:
            return self.connection_circuit_breaker.execute(
                lambda: self.retry_handler.execute(_create_connection)
            )
        except Exception as e:
            logger.error(f"创建连接最终失败: {connection_id}, 错误: {str(e)}")
            raise

    def get_connection(self, connection_id: str) -> Optional['AI518PController']:
        """获取连接

        Args:
            connection_id: 连接ID

        Returns:
            控制器实例，如果不存在返回None
        """
        with self._lock:
            return self._connections.get(connection_id)

    def remove_connection(self, connection_id: str) -> bool:
        """移除连接

        Args:
            connection_id: 连接ID

        Returns:
            是否成功移除
        """
        with self._lock:
            controller = self._connections.pop(connection_id, None)
            if controller:
                try:
                    controller.disconnect()
                except Exception:
                    pass
                self.comm_log.clear_logs(connection_id)
                return True
            return False

    def get_all_connections(self) -> Dict[str, Dict]:
        """获取所有连接信息

        Returns:
            连接信息字典
        """
        with self._lock:
            result = {}
            for conn_id, controller in self._connections.items():
                result[conn_id] = {
                    'port': controller.port,
                    'address': controller.address,
                    'baudrate': controller.baudrate,
                    'connected': controller.serial is not None and controller.serial.is_open if controller.serial else False
                }
            return result

    @contextmanager
    def get_controller(self, connection_id: str):
        """上下文管理器，用于安全地获取和使用控制器

        Args:
            connection_id: 连接ID

        Yields:
            控制器实例

        Raises:
            Exception: 连接不存在或连接失败时抛出异常
        """
        controller = self.get_connection(connection_id)
        if not controller:
            raise Exception(f"Connection {connection_id} not found")

        # 检查连接健康状态
        if not self._is_connection_healthy(controller):
            try:
                # 尝试重新连接
                controller.connect()
                self.comm_log.add_log('RECONNECT', f"Reconnected {connection_id}", connection_id=connection_id)
            except Exception as e:
                self.comm_log.add_log('ERROR', f"Reconnect failed {connection_id}: {str(e)}", connection_id=connection_id)
                raise Exception(f"Connection {connection_id} lost and reconnect failed: {str(e)}")

        try:
            yield controller
        except Exception as e:
            # 记录错误但不关闭连接，让调用者决定
            self.comm_log.add_log('ERROR', f"Operation failed {connection_id}: {str(e)}", connection_id=connection_id)
            raise

    def _is_connection_healthy(self, controller: 'AI518PController') -> bool:
        """检查连接是否健康

        Args:
            controller: 控制器实例

        Returns:
            连接是否健康
        """
        try:
            return (controller.serial is not None and
                   controller.serial.is_open and
                   self._is_connection_available(controller))
        except Exception:
            return False

    def _is_connection_available(self, controller: 'AI518PController') -> bool:
        """检查连接是否超时（通过简单的读取测试）

        Args:
            controller: 控制器实例

        Returns:
            连接是否超时
        """
        try:
            # 使用一个安全的参数（如状态参数）进行测试读取
            # 设置较短的超时时间
            original_timeout = controller.timeout
            controller.timeout = 0.3  # 300ms超时

            # 尝试读取参数0x00（通常总是可读的状态参数）
            result = controller.read_parameter(0x00)

            # 恢复原始超时时间
            controller.timeout = original_timeout

            return result is not None
        except Exception:
            # 恢复原始超时时间
            try:
                controller.timeout = original_timeout
            except Exception:
                pass
            return False

    def cleanup_dead_connections(self) -> int:
        """清理死亡连接

        Returns:
            清理的连接数量
        """
        dead_connections = []

        with self._lock:
            for conn_id, controller in list(self._connections.items()):
                if not self._is_connection_healthy(controller):
                    dead_connections.append(conn_id)

        # 移除死亡连接
        cleaned_count = 0
        for conn_id in dead_connections:
            if self.remove_connection(conn_id):
                cleaned_count += 1
                self.comm_log.add_log('CLEANUP', f"Removed dead connection {conn_id}", connection_id=conn_id)

        return cleaned_count

    def get_connection_stats(self) -> Dict:
        """获取连接统计信息

        Returns:
            连接统计信息
        """
        with self._lock:
            stats = {
                "total_connections": len(self._connections),
                "healthy_connections": 0,
                "unhealthy_connections": 0,
                "connections": {}
            }

            for conn_id, controller in self._connections.items():
                is_healthy = self._is_connection_healthy(controller)
                if is_healthy:
                    stats["healthy_connections"] += 1
                else:
                    stats["unhealthy_connections"] += 1

                stats["connections"][conn_id] = {
                    "port": controller.port,
                    "address": controller.address,
                    "baudrate": controller.baudrate,
                    "healthy": is_healthy,
                    "connected": controller.serial is not None and controller.serial.is_open if controller.serial else False
                }

            return stats


# 全局连接池实例
connection_pool = ConnectionPool()




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
                    ErrorCategory.PROTOCOL,
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
            return False
        returned = resp[6] + (resp[7] << 8)
        return returned == value

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

    def set_sv(self, sv_celsius: float):
        """设定目标温度

        Args:
            sv_celsius: 目标温度（摄氏度）

        Returns:
            bool: 设置成功返回True，失败返回False
        """
        return self.write_parameter(0x00, int(sv_celsius * 10))

    def read_program_segments(self) -> List[ProgramSegment]:
        """读取所有程序段设置

        Returns:
            List[ProgramSegment]: 程序段列表，包含30个程序段的温度和时间设置
        """
        print(f"[FURNACE API] 开始读取程序段 (设备地址: {self.address}, 串口: {self.port})")
        start_time = time.time()

        segs: List[ProgramSegment] = []
        success_count = 0
        error_count = 0

        for i in range(30):
            seg_id = i + 1
            temp_code = 0x1A + i * 2
            time_code = 0x1B + i * 2

            # 读取温度参数
            td = self.read_parameter(temp_code)
            # 读取时间参数
            vd = self.read_parameter(time_code)

            temp_c = (td["param_value"] / 10.0) if td else 0.0
            t_min = vd["param_value"] if vd else 0

            # 记录每个段的读取结果
            if td and vd:
                success_count += 1
                if temp_c > 0 or t_min > 0:  # 只记录有效的程序段
                    print(f"[FURNACE API] 段{seg_id}: 温度={temp_c}°C, 时间={t_min}分钟")
            else:
                error_count += 1
                print(f"[FURNACE API] 段{seg_id}: 读取失败 (温度码:0x{temp_code:02X}, 时间码:0x{time_code:02X})")

            segs.append(ProgramSegment(id=seg_id, temperature=temp_c, time=int(t_min * 60)))

        end_time = time.time()
        duration = (end_time - start_time) * 1000  # 转换为毫秒

        print(f"[FURNACE API] 程序段读取完成 - 成功:{success_count}/30, 失败:{error_count}/30, 耗时:{duration:.1f}ms")
        return segs

    def write_program_segments(self, items: List[ProgramSegment]):
        """写入程序段设置

        Args:
            items: 程序段列表

        Returns:
            bool: 所有段都写入成功返回True，否则返回False
        """
        print(f"[FURNACE API] 开始写入程序段 (设备地址: {self.address}, 串口: {self.port}, 段数: {len(items)})")
        start_time = time.time()

        ok = True
        success_count = 0
        error_count = 0

        # 先打印要写入的所有段信息
        print(f"[FURNACE API] 准备写入的程序段:")
        for it in items:
            print(f"  段{it.id}: 温度={it.temperature}°C, 时间={it.time//60}分钟")

        for it in items:
            idx = it.id - 1
            if idx < 0 or idx > 29:
                print(f"[FURNACE API] 段{it.id}: 跳过无效段号")
                continue

            temp_code = 0x1A + idx * 2
            time_code = 0x1B + idx * 2
            temp_int = int(round(it.temperature * 10))
            time_min = int(round((it.time or 0) / 60))

            print(f"[FURNACE API] 段{it.id}: 写入温度={it.temperature}°C (编码:{temp_int}), 时间={time_min}分钟")

            # 写入温度参数
            temp_ok = self.write_parameter(temp_code, temp_int)
            if temp_ok:
                print(f"[FURNACE API] 段{it.id}: 温度写入成功 (代码:0x{temp_code:02X}, 值:{temp_int})")
            else:
                print(f"[FURNACE API] 段{it.id}: 温度写入失败 (代码:0x{temp_code:02X}, 值:{temp_int})")

            # 写入时间参数
            time_ok = self.write_parameter(time_code, time_min)
            if time_ok:
                print(f"[FURNACE API] 段{it.id}: 时间写入成功 (代码:0x{time_code:02X}, 值:{time_min})")
            else:
                print(f"[FURNACE API] 段{it.id}: 时间写入失败 (代码:0x{time_code:02X}, 值:{time_min})")

            segment_ok = temp_ok and time_ok
            if segment_ok:
                success_count += 1
                print(f"[FURNACE API] 段{it.id}: 写入完成 ✓")
            else:
                error_count += 1
                print(f"[FURNACE API] 段{it.id}: 写入失败 ✗")

            ok = ok and segment_ok

        end_time = time.time()
        duration = (end_time - start_time) * 1000  # 转换为毫秒

        print(f"[FURNACE API] 程序段写入完成 - 成功:{success_count}/{len(items)}, 失败:{error_count}/{len(items)}, 耗时:{duration:.1f}ms")
        return ok


@app.get("/health")
def health():
    """健康检查接口"""
    return {"status": "ok"}


@app.get("/comm-log")
def get_comm_log(connection_id: Optional[str] = None):
    """获取通信日志"""
    logs = connection_pool.comm_log.get_logs(connection_id)
    return {
        "logs": logs,
        "total": len(logs),
        "connection_id": connection_id
    }


@app.get("/connections")
def get_connections():
    """获取所有连接信息"""
    return connection_pool.get_all_connections()


@app.post("/connection")
def create_connection(req: ConnectRequest):
    """创建新连接"""
    try:
        connection_id = connection_pool.create_connection(
            port=req.port,
            baudrate=req.baudrate,
            address=req.address,
            stopbits=req.stopbits,
            timeout=req.timeout
        )
        return {"connection_id": connection_id, "connected": True, "port": req.port}
    except Exception as e:
        return {"connected": False, "error": str(e), "port": req.port}


@app.delete("/connection/{connection_id}")
def delete_connection(connection_id: str):
    """删除连接"""
    success = connection_pool.remove_connection(connection_id)
    return {"success": success, "connection_id": connection_id}


@app.get("/connection/stats")
def get_connection_stats():
    """获取连接统计信息"""
    return connection_pool.get_connection_stats()


@app.post("/connection/cleanup")
def cleanup_dead_connections():
    """清理死亡连接"""
    cleaned_count = connection_pool.cleanup_dead_connections()
    return {"cleaned_count": cleaned_count}


@app.get("/connection/{connection_id}/health")
def check_connection_health(connection_id: str):
    """检查单个连接的健康状态"""
    controller = connection_pool.get_connection(connection_id)
    if not controller:
        return {"healthy": False, "error": "Connection not found", "connection_id": connection_id}

    is_healthy = connection_pool._is_connection_healthy(controller)
    return {
        "healthy": is_healthy,
        "connection_id": connection_id,
        "port": controller.port,
        "address": controller.address
    }


@app.get("/ports")
def ports():
    """获取可用串口列表"""
    return [p.device for p in serial.tools.list_ports.comports()]


@app.get("/status/{connection_id}")
def get_status(connection_id: str):
    """获取温控器状态"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            s = controller.get_all_status()
            return s or {"error": "no response"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/{connection_id}/run")
def run_program(connection_id: str):
    """启动程序运行"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            return {"ok": bool(controller.set_program_run())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/{connection_id}/pause")
def pause_program(connection_id: str):
    """暂停程序运行"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            return {"ok": bool(controller.set_program_pause())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/{connection_id}/stop")
def stop_program(connection_id: str):
    """停止程序运行"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            return {"ok": bool(controller.set_program_stop())}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/{connection_id}/sv")
def set_sv(connection_id: str, sv: float = Body(...)):  # 摄氏度
    """设定目标温度"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            return {"ok": bool(controller.set_sv(sv))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/{connection_id}/segment/set")
def set_segment(connection_id: str, segment: int = Body(...)):
    """设置当前程序段"""
    try:
        with connection_pool.get_controller(connection_id) as controller:
            return {"ok": bool(controller.set_segment(segment))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/{connection_id}/program/segments")
def get_program_segments(connection_id: str):
    """获取所有程序段设置"""
    print(f"[FURNACE API] 接收到程序段读取请求，连接ID: {connection_id}")

    try:
        with connection_pool.get_controller(connection_id) as controller:
            segments = controller.read_program_segments()
            result = [s.model_dump() for s in segments]
            print(f"[FURNACE API] 程序段读取API成功返回，返回{len(result)}个段")
            return result
    except Exception as e:
        print(f"[FURNACE API] 程序段读取API异常: {str(e)}")
        return {"error": str(e)}


@app.post("/{connection_id}/program/segments")
def set_program_segments(connection_id: str, items: List[ProgramSegment]):
    """设置程序段"""
    print(f"[FURNACE API] 接收到程序段写入请求，连接ID: {connection_id}，包含{len(items)}个段")

    try:
        # 打印接收到的数据概览
        valid_segments = [s for s in items if 1 <= s.id <= 30]
        print(f"[FURNACE API] 有效程序段数: {len(valid_segments)} (总共接收到{len(items)}个段)")

        with connection_pool.get_controller(connection_id) as controller:
            ok = controller.write_program_segments(items)
            print(f"[FURNACE API] 程序段写入API完成，结果: {'成功' if ok else '失败'}")
            return {"ok": bool(ok), "count": len(items)}
    except Exception as e:
        print(f"[FURNACE API] 程序段写入API异常: {str(e)}")
        return {"ok": False, "error": str(e), "count": len(items)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8011)
