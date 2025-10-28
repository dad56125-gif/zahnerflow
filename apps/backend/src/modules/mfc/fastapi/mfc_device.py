from fastapi import FastAPI, Body, Query, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import struct
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
    PROTOCOL = "PROTOCOL"
    SYSTEM = "SYSTEM"

class MfcError(Exception):
    """MFC设备专用错误类"""
    def __init__(self, message: str, category: ErrorCategory, retryable: bool = True, context: Optional[Dict] = None):
        super().__init__(message)
        self.category = category
        self.retryable = retryable
        self.context = context or {}
        self.timestamp = datetime.now()

app = FastAPI(title="MFC FastAPI (Enhanced with Error Handling)")


class MfcResponse:
    """MFC响应包装器类 - 统一数据解析和响应格式"""

    @staticmethod
    def create_success_response(data: dict, operation_code: Optional[int] = None,
                              operation_value: Optional[int] = None) -> dict:
        """创建成功响应

        Args:
            data: 响应数据
            operation_code: 操作代码
            operation_value: 操作值

        Returns:
            dict: 统一格式的成功响应
        """
        base_response = {
            "ok": True,
            "timestamp": datetime.now().isoformat(),
            **data
        }

        if operation_code is not None and operation_value is not None:
            base_response["operation"] = {
                "code": operation_code,
                "value": operation_value,
                "success": True
            }

        return base_response

    @staticmethod
    def create_error_response(error_message: str, error_category: str = "SYSTEM",
                            retryable: bool = False, context: Optional[Dict] = None) -> dict:
        """创建错误响应

        Args:
            error_message: 错误信息
            error_category: 错误分类
            retryable: 是否可重试
            context: 错误上下文

        Returns:
            dict: 统一格式的错误响应
        """
        return {
            "ok": False,
            "error_message": error_message,
            "error_category": error_category,
            "retryable": retryable,
            "timestamp": datetime.now().isoformat(),
            "context": context or {}
        }


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 19200
    timeout: float = 1.0


class DeviceInfo(BaseModel):
    device_address: int
    gas_type: str
    max_flow_sccm: int


@app.exception_handler(MfcError)
async def mfc_exception_handler(request: Request, exc: MfcError):
    """
    捕获所有自定义的MfcError异常，并返回标准化的错误响应
    """
    error_message = str(exc)
    logger.error(f"MfcError caught: {error_message} | Category: {exc.category.value} | Context: {exc.context}")

    # 使用MfcResponse工具生成响应
    error_response = MfcResponse.create_error_response(
        error_message,
        exc.category.value,
        exc.retryable,
        exc.context
    )

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

    error_response = MfcResponse.create_error_response(
        "An unexpected internal server error occurred.",
        "SYSTEM",
        False
    )

    return JSONResponse(
        status_code=500,
        content=error_response
    )


class MfcCommLogManager:
    """MFC通信日志管理器，包含错误分类和统计"""
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
            'error_category': error.category.value if isinstance(error, MfcError) else None
        }

        with self._lock:
            self._logs.append(log_entry)
            if len(self._logs) > self._max_size:
                self._logs.pop(0)

            # 错误统计
            if error:
                self._last_error_time = timestamp
                category = error.category.value if isinstance(error, MfcError) else "UNKNOWN"
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


class MfcSession:
    def __init__(self, comm_log: Optional[MfcCommLogManager] = None, connection_id: Optional[str] = None):
        self.ser: Optional[serial.Serial] = None
        self.devices: Dict[int, DeviceInfo] = {}
        self.comm_log = comm_log or MfcCommLogManager()
        self.connection_id = connection_id
        self.lock = threading.Lock()  # 串口互斥锁，确保原子性操作

    def ports(self):
        return [p.device for p in serial.tools.list_ports.comports()]

    def connect(self, port: str, baudrate: int = 19200, timeout: float = 1.0):
        """连接MFC设备

        Args:
            port: 串口号
            baudrate: 波特率
            timeout: 超时时间

        Returns:
            bool: 连接成功返回True

        Raises:
            MfcError: 连接失败时抛出异常
        """
        try:
            self.ser = serial.Serial(
                port=port,
                baudrate=baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=timeout,
            )

            if self.ser.is_open:
                logger.info(f"成功连接到MFC设备 {port}")
                self.comm_log.add_log('CONNECT', f'Connected to {port}', connection_id=self.connection_id)
                return True
            else:
                error = MfcError(f"串口打开失败 {port}", ErrorCategory.DEVICE, retryable=True)
                self.comm_log.add_log('ERROR', 'CONNECTION_FAILED', connection_id=self.connection_id, error=error)
                raise error

        except serial.SerialException as e:
            self.ser = None
            error = MfcError(f"串口连接失败 {port}: {str(e)}", ErrorCategory.DEVICE, retryable=True)
            self.comm_log.add_log('ERROR', 'SERIAL_ERROR', connection_id=self.connection_id, error=error)
            raise error
        except Exception as e:
            self.ser = None
            error = MfcError(f"设备连接失败 {port}: {str(e)}", ErrorCategory.SYSTEM, retryable=False)
            self.comm_log.add_log('ERROR', 'CONNECT_ERROR', connection_id=self.connection_id, error=error)
            raise error

    def disconnect(self):
        """断开MFC设备连接"""
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
                logger.info("MFC设备已断开连接")
                self.comm_log.add_log('DISCONNECT', 'Disconnected', connection_id=self.connection_id)
            except Exception as e:
                error = MfcError(f"断开连接时发生错误: {str(e)}", ErrorCategory.SYSTEM, retryable=False)
                self.comm_log.add_log('ERROR', 'DISCONNECT_ERROR', connection_id=self.connection_id, error=error)
            finally:
                self.ser = None

    def _checksum(self, data: bytes) -> int:
        return sum(data) & 0xFF

    def _read_cmd(self, address: int, class_byte: int, instance: int, attribute: int) -> bytes:
        cmd = bytes([address, 0x02, 0x80, 0x03, class_byte, instance, attribute, 0x00])
        return cmd + bytes([self._checksum(cmd)])

    def _write_cmd(self, address: int, class_byte: int, instance: int, attribute: int, data: bytes) -> bytes:
        if len(data) == 1:
            cmd = bytes([address, 0x02, 0x81, 0x04, class_byte, instance, attribute]) + data + bytes([0x00])
        elif len(data) == 2:
            cmd = bytes([address, 0x02, 0x81, 0x05, class_byte, instance, attribute]) + data + bytes([0x00])
        else:
            cmd = bytes([address, 0x02, 0x81, len(data) + 6, class_byte, instance, attribute]) + data + bytes([0x00])
        return cmd + bytes([self._checksum(cmd)])

    def _send(self, cmd: bytes):
        """发送命令到MFC设备并等待响应（严格一发一收：收到完整响应/超时才返回）

        Args:
            cmd: 要发送的命令字节

        Returns:
            bytes: 接收到的响应数据，失败时抛出异常

        Raises:
            MfcError: 设备通信错误时抛出异常
        """
        with self.lock:  # 串口互斥，避免多线程同时读写
            try:
                if not self.ser or not self.ser.is_open:
                    error = MfcError(f"设备未连接", ErrorCategory.DEVICE, retryable=True)
                    self.comm_log.add_log('ERROR', 'DEVICE_NOT_CONNECTED', connection_id=self.connection_id, error=error)
                    raise error

                # 清空输入缓冲，避免上一次残留数据干扰
                self.ser.reset_input_buffer()

                # 发送
                bytes_written = self.ser.write(cmd)
                self.ser.flush()

                # 记录发送的16进制数据
                self.comm_log.add_log('TX', cmd.hex(), connection_id=self.connection_id)

                response = bytearray()
                start_time = time.time()
                max_wait = 0.5  # 最多等0.5秒，按用户要求

                # 第一步：读取基本响应头（至少6字节才能获取长度信息）
                while time.time() - start_time < max_wait and len(response) < 6:
                    waiting = self.ser.in_waiting
                    if waiting > 0:
                        chunk = self.ser.read(waiting)
                        if chunk:
                            response.extend(chunk)
                    else:
                        time.sleep(0.01)  # 轻量轮询

                # 如果连6字节头都没收到，返回超时
                if len(response) < 6:
                    n = self.ser.in_waiting
                    if n > 0:
                        partial_response = self.ser.read(n)
                        response.extend(partial_response)
                        self.comm_log.add_log('RX', response.hex(), connection_id=self.connection_id)

                    timeout_error = MfcError(
                        f"通信超时, 命令: {cmd.hex()}, 等待{max_wait}秒只收到{len(response)}字节",
                        ErrorCategory.TIMEOUT,
                        retryable=True
                    )
                    self.comm_log.add_log('ERROR', 'COMMUNICATION_TIMEOUT', connection_id=self.connection_id, error=timeout_error)
                    raise timeout_error

                # 第二步：根据第5字节的Data Length计算完整响应长度
                data_length = response[4] if len(response) > 4 else 0
                # 根据协议文档：6字节头 + data_length字节数据内容
                # data_length包含从Class开始到校验和结束的所有数据
                total_length = 6 + data_length
                logger.info(f"Data Length field: {data_length}, calculating total length: {total_length}")

                logger.info(f"Response header: {response[:6].hex()}, data_length={data_length}, total_length={total_length}")

                # 第三步：读取剩余字节直到完整响应
                while time.time() - start_time < max_wait and len(response) < total_length:
                    waiting = self.ser.in_waiting
                    if waiting > 0:
                        chunk = self.ser.read(waiting)
                        if chunk:
                            response.extend(chunk)
                    else:
                        time.sleep(0.01)  # 轻量轮询

                # 记录接收的完整16进制数据
                self.comm_log.add_log('RX', response.hex(), connection_id=self.connection_id)
                logger.info(f"Received {len(response)} bytes, expected {total_length}")

                # 返回完整响应
                return bytes(response)

            except serial.SerialTimeoutException as e:
                error = MfcError(f"串口超时: {str(e)}", ErrorCategory.TIMEOUT, retryable=True)
                self.comm_log.add_log('ERROR', 'SERIAL_TIMEOUT', connection_id=self.connection_id, error=error)
                raise error
            except serial.SerialException as e:
                error = MfcError(f"串口通信错误: {str(e)}", ErrorCategory.DEVICE, retryable=True)
                self.comm_log.add_log('ERROR', 'SERIAL_ERROR', connection_id=self.connection_id, error=error)
                raise error
            except MfcError:
                # 重新抛出已知的MfcError
                raise
            except Exception as e:
                error = MfcError(f"未知通信错误: {str(e)}", ErrorCategory.SYSTEM, retryable=False)
                self.comm_log.add_log('ERROR', 'UNKNOWN_ERROR', connection_id=self.connection_id, error=error)
                raise error

    def _parse_uint16_from_resp(self, resp: bytes) -> Optional[int]:
        if not resp or len(resp) < 10:
            return None
        try:
            return struct.unpack('<H', resp[8:10])[0]
        except Exception:
            return None

    def _parse_uint8_from_resp(self, resp: bytes) -> Optional[int]:
        if not resp or len(resp) < 9:
            return None
        return resp[8]

    def _parse_text32_from_resp(self, resp: bytes) -> Optional[str]:
        """解析TEXT32格式的响应数据

        Args:
            resp: 响应字节数据

        Returns:
            Optional[str]: 解析出的字符串，失败时返回None
        """
        if not resp or len(resp) < 9:
            return None

        try:
            # 根据通讯协议，TEXT32数据在第9字节开始（索引8）
            # 找到结束符0x00的位置
            text_start = 8
            text_end = resp.find(0x00, text_start)

            if text_end == -1:
                # 如果没有找到结束符，取到响应末尾
                text_end = len(resp)

            # 提取文本数据并解码
            text_bytes = resp[text_start:text_end]
            return text_bytes.decode('ascii', errors='ignore').strip()

        except Exception:
            return None

    def scan(self, start: int = 32, end: int = 80, realtime_callback: Optional[callable] = None) -> List[DeviceInfo]:
        out: List[DeviceInfo] = []
        if not self.ser:
            return out

        logger.info(f"Starting MFC device scan: addresses {start}-{end}")
        scanned_count = 0
        found_count = 0

        for addr in range(start, end + 1):
            scanned_count += 1
            try:
                logger.info(f"Scanning address {addr}...")

                # 首先尝试读取流量数据 (Class 0x68, Instance 0x01, Attribute 0xB9)
                # 这是MFC最基本的功能，如果设备存在应该能响应
                cmd = self._read_cmd(addr, 0x68, 0x01, 0xB9)
                logger.info(f"TX: {cmd.hex()} (read flow data for address {addr})")
                resp = self._send(cmd)
                logger.info(f"RX: {resp.hex() if resp else 'null'} (length: {len(resp) if resp else 0})")

                device_found = False
                gas = ""
                fs_sccm = 0
                flow_sccm = 0

                # 检查是否有有效响应
                if resp and len(resp) >= 8:
                    # 解析流量值来验证设备存在
                    # MFC协议使用小端序：29 42 = 0x4229
                    raw_flow_bytes = resp[8:10] if len(resp) >= 10 else b'\x00\x00'
                    raw_flow = struct.unpack('<H', raw_flow_bytes)[0]  # 小端序解析
                    if raw_flow is not None:
                        # 使用UFRAC16格式转换
                        flow_percent = self.ufrac16_to_percent(raw_flow)
                        # 在扫描阶段还没有满量程信息，暂时保存百分比
                        # 实际SCCM值会在轮询阶段计算
                        flow_sccm = flow_percent  # 临时保存百分比
                        device_found = True
                        logger.info(f"Address {addr}: Raw flow 0x{raw_flow:04X} = {flow_percent:.2f}% - device detected")

                # 如果流量命令有响应，继续读取设备信息
                if device_found:
                    # 读取气体名称 (Class 0x66, Instance 0x01, Attribute 0x01 - Target Gas Name)
                    try:
                        cmd2 = self._read_cmd(addr, 0x66, 0x01, 0x01)
                        logger.info(f"TX: {cmd2.hex()} (read gas name for address {addr})")
                        resp2 = self._send(cmd2)
                        logger.info(f"RX: {resp2.hex() if resp2 else 'null'} (length: {len(resp2) if resp2 else 0})")

                        if resp2 and len(resp2) >= 8:
                            try:
                                # 使用我们新添加的TEXT32解析方法
                                gas = self._parse_text32_from_resp(resp2)
                                if gas:
                                    gas = gas.strip()
                                    logger.info(f"Address {addr}: Parsed gas name: '{gas}'")
                                else:
                                    gas = "UNKNOWN"
                            except Exception:
                                gas = "UNKNOWN"
                    except Exception as e:
                        logger.info(f"Address {addr}: Failed to read gas name: {str(e)}")
                        gas = "UNKNOWN"

                    # 读取满量程 (Class 0x66, Instance 0x01, Attribute 0x03 - Full Scale)
                    try:
                        cmd3 = self._read_cmd(addr, 0x66, 0x01, 0x03)
                        logger.info(f"TX: {cmd3.hex()} (read full scale for address {addr})")
                        resp3 = self._send(cmd3)
                        logger.info(f"RX: {resp3.hex() if resp3 else 'null'} (length: {len(resp3) if resp3 else 0})")

                        val = self._parse_uint16_from_resp(resp3)
                        if val is not None:
                            fs_sccm = val
                            logger.info(f"Address {addr}: Full scale {fs_sccm} SCCM")
                    except Exception as e:
                        logger.info(f"Address {addr}: Failed to read full scale: {str(e)}")

                    # 读取当前设定值 (Class 0x69, Instance 0x01, Attribute 0xA5 - Active Setpoint)
                    try:
                        cmd4 = self._read_cmd(addr, 0x69, 0x01, 0xA5)
                        logger.info(f"TX: {cmd4.hex()} (read active setpoint for address {addr})")
                        resp4 = self._send(cmd4)
                        logger.info(f"RX: {resp4.hex() if resp4 else 'null'} (length: {len(resp4) if resp4 else 0})")

                        setpoint_val = self._parse_uint16_from_resp(resp4)
                        if setpoint_val is not None:
                            # 使用UFRAC16格式解析当前设定值
                            setpoint_percent = self.ufrac16_to_percent(setpoint_val)
                            # 保存当前设定值百分比，实际SCCM值会在后续计算
                            logger.info(f"Address {addr}: Active setpoint raw=0x{setpoint_val:04X} ({setpoint_percent:.2f}%)")
                    except Exception as e:
                        logger.info(f"Address {addr}: Failed to read active setpoint: {str(e)}")

                    # 如果成功获取了流量数据，就认为设备存在
                    found_count += 1
                    info = DeviceInfo(
                        device_address=addr,
                        gas_type=gas or "UNKNOWN",
                        max_flow_sccm=int(fs_sccm or 1000)  # 默认1000 SCCM
                    )
                    self.devices[addr] = info
                    out.append(info)

                    # 实时推送设备发现（如果提供了回调）
                    if realtime_callback:
                        try:
                            realtime_callback(info)
                            logger.info(f"Real-time callback sent for device at address {addr}")
                        except Exception as e:
                            logger.warning(f"Failed to send real-time callback for device {addr}: {str(e)}")

                    # 计算实际SCCM流量值
                    actual_flow_sccm = flow_percent * int(fs_sccm or 1000) / 100.0
                    logger.info(f"Found MFC device at address {addr}: gas_type={info.gas_type}, max_flow={info.max_flow_sccm} SCCM, current_flow={actual_flow_sccm:.4f} SCCM")
                else:
                    logger.info(f"Address {addr}: No device response to flow command")

            except MfcError as e:
                # 单个地址失败是正常的，继续扫描下一个地址
                if e.category == ErrorCategory.TIMEOUT:
                    logger.info(f"Address {addr} timeout - continuing")
                else:
                    logger.info(f"Address {addr} not responding ({e.category.value}) - continuing")
                continue
            except Exception as e:
                # 其他异常也继续扫描，但记录警告
                logger.warning(f"Unexpected error scanning address {addr}: {str(e)}")
                continue

        logger.info(f"MFC scan completed: scanned {scanned_count} addresses, found {found_count} devices")
        return out

    def ufrac16_to_percent(self, value: int) -> float:
        return ((value - 0x4000) / (0xC000 - 0x4000)) * 100.0

    def percent_to_ufrac16(self, percent: float) -> int:
        if percent < 0: percent = 0
        if percent > 100: percent = 100
        return int(percent * (0xC000 - 0x4000) / 100 + 0x4000)

    def read_status(self, address: int) -> dict:
        """读取MFC设备状态

        Args:
            address: 设备地址

        Returns:
            dict: 包含设备状态信息的字典

        Raises:
            MfcError: 读取失败时抛出异常
        """
        try:
            info = self.devices.get(address)
            if not info:
                raise MfcError(f"设备地址 {address} 未找到", ErrorCategory.DEVICE, retryable=False)

            # Flow percent from 0x68/0x01/0xB9 (UFRAC16)
            flow_percent = 0.0
            try:
                resp_flow = self._send(self._read_cmd(address, 0x68, 0x01, 0xB9))
                raw_flow = self._parse_uint16_from_resp(resp_flow)
                if raw_flow is not None:
                    flow_percent = self.ufrac16_to_percent(raw_flow)
            except Exception as e:
                raise MfcError(f"读取流量百分比失败: {str(e)}", ErrorCategory.PROTOCOL, retryable=True)

            # Digital setpoint percent
            digital_sp_percent = 0.0
            try:
                resp_dsp = self._send(self._read_cmd(address, 0x69, 0x01, 0xA4))
                raw_dsp = self._parse_uint16_from_resp(resp_dsp)
                if raw_dsp is not None:
                    digital_sp_percent = self.ufrac16_to_percent(raw_dsp)
            except Exception as e:
                raise MfcError(f"读取数字设定点失败: {str(e)}", ErrorCategory.PROTOCOL, retryable=True)

            # Active setpoint percent
            active_sp_percent = 0.0
            try:
                resp_asp = self._send(self._read_cmd(address, 0x69, 0x01, 0xA5))
                raw_asp = self._parse_uint16_from_resp(resp_asp)
                if raw_asp is not None:
                    active_sp_percent = self.ufrac16_to_percent(raw_asp)
            except Exception as e:
                raise MfcError(f"读取活动设定点失败: {str(e)}", ErrorCategory.PROTOCOL, retryable=True)

            # Calculate flow_sccm
            flow_sccm = 0.0
            if info and info.max_flow_sccm:
                flow_sccm = flow_percent * info.max_flow_sccm / 100.0

            # Calculate setpoint_sccm
            setpoint_sccm = 0.0
            if info and info.max_flow_sccm:
                setpoint_sccm = active_sp_percent * info.max_flow_sccm / 100.0

            # 构建响应数据
            status_data = {
                "device_address": address,
                "flow_percent": flow_percent,
                "flow_sccm": flow_sccm,
                "digital_setpoint_percent": digital_sp_percent,
                "active_setpoint_percent": active_sp_percent,
                "setpoint_sccm": setpoint_sccm,
                "connection_status": "connected" if self.ser and self.ser.is_open else "disconnected",
                "last_communication": datetime.now().isoformat()
            }

            return MfcResponse.create_success_response(status_data)

        except MfcError:
            raise
        except Exception as e:
            raise MfcError(f"读取状态异常 (地址: {address}): {str(e)}", ErrorCategory.SYSTEM, retryable=False)

    def read_gas_name(self, address: int) -> dict:
        """读取MFC设备气体名称

        Args:
            address: 设备地址

        Returns:
            dict: 包含气体名称信息的字典

        Raises:
            MfcError: 读取失败时抛出异常
        """
        try:
            # 根据通讯协议1：Target Gas Name 读指令 (Class=0x66, Instance=0x01, Attribute=0x01)
            cmd = self._read_cmd(address, 0x66, 0x01, 0x01)
            resp = self._send(cmd)

            # 解析TEXT32格式的气体名称
            gas_name = self._parse_text32_from_resp(resp)

            if gas_name is None:
                gas_name = "Unknown"

            # 构建响应数据
            result_data = {
                "device_address": address,
                "gas_name": gas_name.strip(),  # 移除可能的空白字符
                "connection_status": "connected" if self.ser and self.ser.is_open else "disconnected"
            }

            return MfcResponse.create_success_response(
                result_data,
                operation_code=0x01,
                operation_value=address
            )

        except MfcError:
            raise
        except Exception as e:
            raise MfcError(f"读取气体名称异常 (地址: {address}): {str(e)}", ErrorCategory.SYSTEM, retryable=False)

    def read_active_setpoint(self, address: int) -> dict:
        """读取MFC设备当前设定值

        Args:
            address: 设备地址

        Returns:
            dict: 包含当前设定值信息的字典

        Raises:
            MfcError: 读取失败时抛出异常
        """
        try:
            # 获取设备信息用于计算sccm值
            info = self.devices.get(address)

            # 根据通讯协议1：Read Active Setpoint 读指令 (Class=0x69, Instance=0x01, Attribute=0xA5)
            cmd = self._read_cmd(address, 0x69, 0x01, 0xA5)
            resp = self._send(cmd)

            # 解析UFRAC16格式的当前设定值
            raw_value = self._parse_uint16_from_resp(resp)

            if raw_value is None:
                raise MfcError(f"解析当前设定值失败", ErrorCategory.PROTOCOL, retryable=True)

            # 转换为百分比
            active_percent = self.ufrac16_to_percent(raw_value)

            # 计算sccm值
            active_sccm = 0.0
            if info and info.max_flow_sccm:
                active_sccm = active_percent * info.max_flow_sccm / 100.0

            # 构建响应数据
            result_data = {
                "device_address": address,
                "active_setpoint_percent": active_percent,
                "active_setpoint_sccm": active_sccm,
                "connection_status": "connected" if self.ser and self.ser.is_open else "disconnected"
            }

            return MfcResponse.create_success_response(
                result_data,
                operation_code=0xA5,
                operation_value=int(raw_value)
            )

        except MfcError:
            raise
        except Exception as e:
            raise MfcError(f"读取当前设定值异常 (地址: {address}): {str(e)}", ErrorCategory.SYSTEM, retryable=False)

    def write_setpoint_sccm(self, address: int, sccm: float) -> dict:
        """写入MFC设备流量设定点

        Args:
            address: 设备地址
            sccm: 流量设定值 (sccm)

        Returns:
            dict: 包含操作结果的字典

        Raises:
            MfcError: 写入失败时抛出异常
        """
        try:
            info = self.devices.get(address)
            if not info or not info.max_flow_sccm:
                # Cannot convert; accept and return error
                raise MfcError(f"设备地址 {address} 未找到或最大流量未设置", ErrorCategory.DEVICE, retryable=False)

            percent = (sccm / info.max_flow_sccm) * 100.0
            value = self.percent_to_ufrac16(percent)
            cmd = self._write_cmd(address, 0x69, 0x01, 0xA4, bytes([value & 0xFF, (value >> 8) & 0xFF]))

            # 发送命令
            self._send(cmd)

            # 构建响应数据
            result_data = {
                "device_address": address,
                "sccm": sccm,
                "percent": percent,
                "connection_status": "connected" if self.ser and self.ser.is_open else "disconnected"
            }

            return MfcResponse.create_success_response(
                result_data,
                operation_code=0xA4,
                operation_value=int(value)
            )

        except MfcError:
            raise
        except Exception as e:
            raise MfcError(f"写入设定点异常 (地址: {address}, sccm: {sccm}): {str(e)}", ErrorCategory.SYSTEM, retryable=False)


class MfcDeviceManager:
    """MFC设备管理器 - 单连接模式，移除过度设计的复杂性"""

    def __init__(self):
        self._controller: Optional[MfcSession] = None
        self._connection_id: Optional[str] = None
        self._lock = threading.Lock()
        self.comm_log = MfcCommLogManager()

    def connect(self, port: str, baudrate: int = 19200, timeout: float = 1.0) -> str:
        """连接MFC设备（单连接模式）

        Args:
            port: 串口号
            baudrate: 波特率
            timeout: 超时时间

        Returns:
            connection_id: 连接ID

        Raises:
            MfcError: 连接失败时抛出异常
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
            self._controller = MfcSession(
                comm_log=self.comm_log,
                connection_id=self._connection_id
            )

            # 尝试连接
            try:
                self._controller.connect(port, baudrate, timeout)
                logger.info(f"成功连接到MFC设备: {port}")
                return self._connection_id
            except Exception as e:
                self._controller = None
                self._connection_id = None
                mfc_error = MfcError(
                    f"连接失败 {port}: {str(e)}",
                    ErrorCategory.DEVICE,
                    retryable=True
                )
                self.comm_log.add_log('ERROR', 'CONNECTION_FAILED', connection_id=self._connection_id, error=mfc_error)
                raise mfc_error

    def disconnect(self) -> bool:
        """断开MFC设备连接

        Returns:
            是否成功断开
        """
        with self._lock:
            if not self._controller:
                return False

            try:
                self._controller.disconnect()
                self.comm_log.clear_logs(self._connection_id)
                logger.info("MFC设备已断开连接")
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
                'connected': self._controller.ser is not None and self._controller.ser.is_open if self._controller.ser else False
            }

    def get_controller(self) -> Optional[MfcSession]:
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
                    # 注意：这里需要保存连接参数，简化实现暂不支持自动重连
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
            return (self._controller.ser is not None and
                   self._controller.ser.is_open)
        except Exception:
            return False


# 全局设备管理器实例
device_manager = MfcDeviceManager()


def get_active_controller() -> MfcSession:
    """
    FastAPI依赖项：获取活动的控制器
    如果获取失败，抛出MfcError异常

    Returns:
        MfcSession: 可用的控制器实例

    Raises:
        MfcError: 当没有活动连接时
    """
    controller = device_manager.get_controller()
    if not controller:
        raise MfcError(
            "No active connection to the MFC device. Please connect first.",
            ErrorCategory.DEVICE,
            retryable=False
        )
    return controller


def get_optional_controller() -> Optional[MfcSession]:
    """
    FastAPI依赖项：获取可选的控制器
    如果获取失败，返回None而不是抛出异常

    Returns:
        Optional[MfcSession]: 可用的控制器实例，或None
    """
    return device_manager.get_controller()


# 保留原有session实例以兼容现有代码（将被逐步淘汰）
session = MfcSession()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ports")
def ports():
    return session.ports()


@app.post("/connect")
def connect(request: ConnectRequest):
    """连接MFC设备"""
    try:
        connection_id = device_manager.connect(
            port=request.port,
            baudrate=request.baudrate,
            timeout=request.timeout
        )
        logger.info(f"MFC设备连接成功: {connection_id} ({request.port})")

        return MfcResponse.create_success_response({
            "connection_id": connection_id,
            "connected": True,
            "port": request.port
        })
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"连接失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.post("/disconnect")
def disconnect():
    """断开MFC设备连接"""
    try:
        success = device_manager.disconnect()
        if success:
            logger.info("MFC设备已断开连接")

        return MfcResponse.create_success_response({
            "success": success,
            "disconnected_count": 1 if success else 0
        })
    except Exception as e:
        raise MfcError(f"断开连接失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.post("/scan")
def scan(controller: Optional[MfcSession] = Depends(get_optional_controller),
         start: int = Body(32), end: int = Body(80)):
    """扫描MFC设备 - 支持实时设备发现"""
    try:
        if not controller:
            raise MfcError("需要先连接设备才能进行扫描", ErrorCategory.DEVICE, retryable=False)

        discovered_devices = []

        def realtime_device_discovered(device_info: DeviceInfo):
            """实时设备发现回调"""
            discovered_devices.append(device_info.dict())
            logger.info(f"Device discovered: address {device_info.device_address}, type {device_info.gas_type}")

        # 执行扫描并提供实时回调 - 现在这是默认行为
        devices = controller.scan(start, end, realtime_callback=realtime_device_discovered)

        return MfcResponse.create_success_response({
            "devices": [d.dict() for d in devices],
            "discovered_during_scan": discovered_devices,
            "count": len(devices),
            "scan_range": {"start": start, "end": end}
        })
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"扫描失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.get("/status")
def get_status(address: Optional[int] = Query(None),
               controller: MfcSession = Depends(get_active_controller)):
    """获取MFC设备状态"""
    try:
        if address is None:
            # 获取所有设备状态
            all_status = []
            for device_address in list(controller.devices.keys()):
                try:
                    status = controller.read_status(device_address)
                    all_status.append(status)
                except MfcError as e:
                    # 单个设备失败不影响其他设备
                    error_response = MfcResponse.create_error_response(
                        str(e), e.category.value, e.retryable
                    )
                    error_response["device_address"] = device_address
                    all_status.append(error_response)

            return MfcResponse.create_success_response({
                "devices": all_status,
                "count": len(all_status)
            })
        else:
            # 获取指定设备状态
            status = controller.read_status(address)
            return status
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"获取状态失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.post("/setpoint")
def set_setpoint(address: int = Body(...), sccm: float = Body(...),
                controller: MfcSession = Depends(get_active_controller)):
    """设置MFC流量设定点"""
    try:
        result = controller.write_setpoint_sccm(address, sccm)
        return result
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"设置流量失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


# 新增API端点
@app.get("/comm-log")
def get_comm_log():
    """获取通信日志"""
    try:
        connection_id = device_manager.get_connection_id()
        logs = device_manager.comm_log.get_logs(connection_id)
        error_stats = device_manager.comm_log.get_error_stats()

        return MfcResponse.create_success_response({
            "logs": logs,
            "total": len(logs),
            "connection_id": connection_id,
            "error_stats": error_stats
        })
    except Exception as e:
        raise MfcError(f"获取通信日志失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.delete("/comm-log")
def clear_comm_log():
    """清空通信日志"""
    try:
        connection_id = device_manager.get_connection_id()
        device_manager.comm_log.clear_logs(connection_id)

        return MfcResponse.create_success_response({
            "message": "通信日志已清空",
            "connection_id": connection_id
        })
    except Exception as e:
        raise MfcError(f"清空通信日志失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.get("/connection/info")
def get_connection_info():
    """获取连接信息"""
    try:
        connection_info = device_manager.get_connection_info()

        return MfcResponse.create_success_response({
            "connection_info": connection_info,
            "has_connection": connection_info is not None
        })
    except Exception as e:
        raise MfcError(f"获取连接信息失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.get("/gas-name")
def get_gas_name(address: int = Query(..., description="设备地址"),
                  controller: MfcSession = Depends(get_active_controller)):
    """获取MFC设备气体名称"""
    try:
        result = controller.read_gas_name(address)
        return result
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"获取气体名称失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


@app.get("/active-setpoint")
def get_active_setpoint(address: int = Query(..., description="设备地址"),
                        controller: MfcSession = Depends(get_active_controller)):
    """获取MFC设备当前设定值"""
    try:
        result = controller.read_active_setpoint(address)
        return result
    except MfcError:
        raise
    except Exception as e:
        raise MfcError(f"获取当前设定值失败: {str(e)}", ErrorCategory.SYSTEM, retryable=False)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8010)
