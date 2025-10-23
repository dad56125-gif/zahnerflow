from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import List
import serial
import serial.tools.list_ports
import time
import threading
from datetime import datetime

# AI-518P温控器FastAPI服务器
app = FastAPI(title="AI-518P温控器FastAPI接口")

# 通信日志缓冲区
comm_log = []  # 最多保存500条通信日志


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
    """AI-518P温控器控制器类"""

    def __init__(self, port='COM4', baudrate=9600, address=1, stopbits=2, timeout=0.5):
        """初始化温控器控制器

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

    def connect(self):
        """连接温控器设备

        Returns:
            bool: 连接成功返回True

        Raises:
            Exception: 连接失败时抛出异常
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
            return True
        except Exception as e:
            self.serial = None
            raise Exception(f"Failed to connect to {self.port}: {str(e)}")

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
            Exception: 设备未连接时抛出异常
        """
        with self.lock:  # 串口互斥，避免多线程同时读写
            try:
                if not self.serial or not self.serial.is_open:
                    raise Exception(f"Device not connected on {self.port}")

                # 清空输入缓冲，避免上一次残留数据干扰
                self.serial.reset_input_buffer()

                # 发送
                bytes_written = self.serial.write(cmd)
                self.serial.flush()

                # 记录发送的16进制数据
                add_comm_log('TX', cmd.hex())

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
                    add_comm_log('RX', response_bytes.hex())
                    return response_bytes
                else:
                    # 读取所有可用数据
                    n = self.serial.in_waiting
                    if n > 0:
                        partial_response = self.serial.read(n)
                        add_comm_log('RX', partial_response.hex())
                        return partial_response
                    return None

            except Exception as e:
                return None

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
            return {"pv": pv / 10.0, "sv": sv / 10.0, "mv": mv, "status_a": status_a, "param_value": param_value}
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


# 全局控制器实例
controller: AI518PController | None = None


@app.get("/health")
def health():
    """健康检查接口"""
    return {"status": "ok"}


@app.get("/comm-log")
def get_comm_log():
    """获取通信日志"""
    return {
        "logs": comm_log,
        "total": len(comm_log)
    }


@app.get("/ports")
def ports():
    """获取可用串口列表"""
    return [p.device for p in serial.tools.list_ports.comports()]


@app.post("/connect")
def connect(req: ConnectRequest):
    """连接温控器设备（支持端口切换）"""
    global controller
    try:
        # 断开现有连接（如果存在）
        if controller:
            try:
                controller.disconnect()
            except Exception:
                pass  # 忽略断开时的异常

        # 建立新连接
        controller = AI518PController(req.port, req.baudrate, req.address, req.stopbits, req.timeout)
        controller.connect()
        return {"connected": True, "port": req.port}
    except Exception as e:
        controller = None
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
def set_sv(sv: float = Body(...)):  # 摄氏度
    """设定目标温度"""
    if not controller:
        return {"error": "not connected"}
    try:
        return {"ok": bool(controller.set_sv(sv))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/segment/set")
def set_segment(segment: int = Body(...)):
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
    print(f"[FURNACE API] 接收到程序段读取请求")

    if not controller:
        print(f"[FURNACE API] 设备未连接，无法读取程序段")
        return {"error": "not connected"}

    try:
        segments = controller.read_program_segments()
        result = [s.model_dump() for s in segments]
        print(f"[FURNACE API] 程序段读取API成功返回，返回{len(result)}个段")
        return result
    except Exception as e:
        print(f"[FURNACE API] 程序段读取API异常: {str(e)}")
        return {"error": str(e)}


@app.post("/program/segments")
def set_program_segments(items: List[ProgramSegment]):
    """设置程序段"""
    print(f"[FURNACE API] 接收到程序段写入请求，包含{len(items)}个段")

    if not controller:
        print(f"[FURNACE API] 设备未连接，无法写入程序段")
        return {"error": "not connected"}

    try:
        # 打印接收到的数据概览
        valid_segments = [s for s in items if 1 <= s.id <= 30]
        print(f"[FURNACE API] 有效程序段数: {len(valid_segments)} (总共接收到{len(items)}个段)")

        ok = controller.write_program_segments(items)
        print(f"[FURNACE API] 程序段写入API完成，结果: {'成功' if ok else '失败'}")
        return {"ok": bool(ok), "count": len(items)}
    except Exception as e:
        print(f"[FURNACE API] 程序段写入API异常: {str(e)}")
        return {"ok": False, "error": str(e), "count": len(items)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8011)
