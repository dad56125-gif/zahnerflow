from fastapi import FastAPI, Body, Query
from pydantic import BaseModel
from typing import List, Optional, Dict
import struct
import time
import random
import threading
from datetime import datetime

app = FastAPI(title="MFC FastAPI Virtual Device")


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 19200
    timeout: float = 1.0


class DeviceInfo(BaseModel):
    address: int
    gas_type: str
    max_flow_sccm: int


class VirtualMfcDevice:
    def __init__(self, address: int, gas_type: str = "N2", max_flow_sccm: int = 100):
        self.address = address
        self.gas_type = gas_type
        self.max_flow_sccm = max_flow_sccm

        # 流量控制参数
        self.flow_percent = 0.0
        self.flow_sccm = 0.0
        self.digital_setpoint_percent = 0.0
        self.active_setpoint_percent = 0.0
        self.hold_follow = 1  # 1 = Follow, 0 = Hold

        # 设备状态
        self.is_connected = True
        self.last_update = datetime.now()

        # 模拟流量变化
        self.target_flow_percent = 0.0
        self.flow_change_rate = 2.0  # 每秒最大变化百分比

        # 其他参数
        self.delay_value = 1000
        self.softstart_percent = 5.0
        self.shutoff_percent = 0.0

        # 模拟16进制命令缓存
        self.last_commands: List[bytes] = []
        self.command_history: List[Dict] = []

    def update_flow(self):
        """模拟流量逐渐达到设定值"""
        if self.hold_follow == 0:  # Hold模式
            return

        # 计算流量变化
        diff = self.target_flow_percent - self.flow_percent
        if abs(diff) > 0.1:
            # 模拟实际的流量响应延迟
            change = min(abs(diff), self.flow_change_rate * 0.1)
            if diff > 0:
                self.flow_percent += change
            else:
                self.flow_percent -= change

            # 更新sccm值
            self.flow_sccm = (self.flow_percent / 100.0) * self.max_flow_sccm
            self.active_setpoint_percent = self.flow_percent

    def set_setpoint(self, sccm: float):
        """设定流量值"""
        if self.max_flow_sccm > 0:
            percent = min(100.0, max(0.0, (sccm / self.max_flow_sccm) * 100.0))
            self.digital_setpoint_percent = percent
            self.target_flow_percent = percent
            return True
        return False

    def set_hold_follow(self, follow: int):
        """设置Hold/Follow模式"""
        self.hold_follow = 1 if follow else 0
        if self.hold_follow == 1:  # 切换到Follow模式时恢复流量
            self.target_flow_percent = self.digital_setpoint_percent

    def simulate_command_response(self, cmd: bytes) -> bytes:
        """模拟16进制命令响应"""
        self.last_commands.append(cmd)

        # 解析命令
        if len(cmd) < 6:
            return self._create_error_response(cmd[0] if len(cmd) > 0 else 0, 0x02)

        address = cmd[0]
        control = cmd[2]

        # 构造响应帧
        if control == 0x80:  # 读命令
            return self._create_read_response(address, cmd)
        elif control == 0x81:  # 写命令
            return self._create_write_response(address, cmd)
        else:
            return self._create_error_response(address, 0x02)

    def _create_read_response(self, address: int, cmd: bytes) -> bytes:
        """创建读命令响应"""
        if len(cmd) < 7:
            return self._create_error_response(address, 0x02)

        class_byte = cmd[5]
        instance = cmd[6]
        attribute = cmd[7] if len(cmd) > 7 else 0

        # 根据不同的属性返回相应的数据
        data = b""
        if class_byte == 0x66 and instance == 0x01:  # 设备信息类
            if attribute == 0x01:  # 气体类型
                data = self.gas_type.encode('ascii')
            elif attribute == 0x03:  # 最大流量
                data = struct.pack('<H', self.max_flow_sccm)
        elif class_byte == 0x68 and instance == 0x01:  # 流量类
            if attribute == 0xB9:  # 流量百分比
                value = self._percent_to_ufrac16(self.flow_percent)
                data = struct.pack('<H', value)
        elif class_byte == 0x69 and instance == 0x01:  # 设定点类
            if attribute == 0xA4:  # 数字设定点
                value = self._percent_to_ufrac16(self.digital_setpoint_percent)
                data = struct.pack('<H', value)
            elif attribute == 0xA5:  # 活动设定点
                value = self._percent_to_ufrac16(self.active_setpoint_percent)
                data = struct.pack('<H', value)
            elif attribute == 0x05:  # Hold/Follow状态
                data = bytes([self.hold_follow])

        # 构造响应帧
        length = len(data) + 6
        resp = bytes([address, 0x02, 0x80, length, class_byte, instance, attribute]) + data + bytes([0x00])
        checksum = sum(resp) & 0xFF
        return resp + bytes([checksum])

    def _create_write_response(self, address: int, cmd: bytes) -> bytes:
        """创建写命令响应"""
        # 写命令通常返回确认帧
        resp = bytes([address, 0x02, 0x81, 0x04, 0x00, 0x00, 0x00, 0x00])
        checksum = sum(resp) & 0xFF
        return resp + bytes([checksum])

    def _create_error_response(self, address: int, error_code: int) -> bytes:
        """创建错误响应"""
        resp = bytes([address, 0x02, 0x82, 0x04, error_code, 0x00, 0x00, 0x00])
        checksum = sum(resp) & 0xFF
        return resp + bytes([checksum])

    def _percent_to_ufrac16(self, percent: float) -> int:
        """百分比转换为UFRAC16格式"""
        percent = max(0.0, min(100.0, percent))
        return int(percent * (0xC000 - 0x4000) / 100 + 0x4000)

    def _ufrac16_to_percent(self, value: int) -> float:
        """UFRAC16格式转换为百分比"""
        return ((value - 0x4000) / (0xC000 - 0x4000)) * 100.0


class MfcVirtualSession:
    def __init__(self):
        self.connected_port: Optional[str] = None
        self.devices: Dict[int, VirtualMfcDevice] = {}
        self.simulation_thread = None
        self.running = False

    def start_simulation(self):
        """启动流量模拟线程"""
        if not self.running:
            self.running = True
            self.simulation_thread = threading.Thread(target=self._simulation_loop, daemon=True)
            self.simulation_thread.start()

    def stop_simulation(self):
        """停止模拟"""
        self.running = False
        if self.simulation_thread:
            self.simulation_thread.join()

    def _simulation_loop(self):
        """模拟循环，定期更新设备状态"""
        while self.running:
            for device in self.devices.values():
                device.update_flow()
            time.sleep(0.1)  # 100ms更新一次

    def ports(self):
        """返回可用的虚拟端口"""
        return ["COM1", "COM2", "COM3", "COM4"]

    def connect(self, port: str, baudrate: int = 19200, timeout: float = 1.0):
        """连接到虚拟端口"""
        self.connected_port = port
        self.start_simulation()
        return True

    def disconnect(self):
        """断开连接"""
        self.connected_port = None
        self.stop_simulation()
        self.devices.clear()

    def scan(self, start: int = 32, end: int = 80) -> List[DeviceInfo]:
        """扫描虚拟设备"""
        out: List[DeviceInfo] = []

        # 清除之前的设备，重新生成
        self.devices.clear()

        # 使用固定的设备地址，避免每次扫描产生不同设备
        fixed_addresses = [33, 37, 42, 58, 65]  # 固定5个设备地址
        gas_types = ["N2", "O2", "Ar", "He", "H2", "CO2", "CH4"]
        max_flows = [50, 100, 200, 500, 1000, 2000]

        # 只返回在扫描范围内的固定设备
        for i, addr in enumerate(fixed_addresses):
            if start <= addr <= end:
                gas = gas_types[i % len(gas_types)]
                max_flow = max_flows[i % len(max_flows)]

                device = VirtualMfcDevice(addr, gas, max_flow)
                # 添加一些随机噪声作为初始流量
                device.flow_percent = random.uniform(1, 8)  # 1-8%的初始流量
                device.flow_sccm = device.flow_percent * max_flow / 100.0
                device.active_setpoint_percent = device.flow_percent
                device.digital_setpoint_percent = device.flow_percent

                self.devices[addr] = device
                info = DeviceInfo(address=addr, gas_type=gas, max_flow_sccm=max_flow)
                out.append(info)

        return out

    def read_status(self, address: int):
        """读取设备状态"""
        device = self.devices.get(address)
        if not device:
            return None

        return {
            "address": address,
            "flow_percent": round(device.flow_percent, 2),
            "flow_sccm": round(device.flow_sccm, 2),
            "digital_setpoint_percent": round(device.digital_setpoint_percent, 2),
            "active_setpoint_percent": round(device.active_setpoint_percent, 2),
            "hold_follow": device.hold_follow,
        }

    def write_setpoint_sccm(self, address: int, sccm: float):
        """设定流量值"""
        device = self.devices.get(address)
        if not device:
            return {"address": address, "sccm": sccm, "error": "Device not found"}

        success = device.set_setpoint(sccm)
        if success:
            return {"address": address, "sccm": sccm, "percent": device.digital_setpoint_percent, "written": True}
        else:
            return {"address": address, "sccm": sccm, "error": "Invalid setpoint"}

    def write_hold_follow(self, address: int, follow: int):
        """设置Hold/Follow模式"""
        device = self.devices.get(address)
        if not device:
            return {"address": address, "error": "Device not found"}

        device.set_hold_follow(follow)
        return {"address": address, "follow": int(bool(follow))}

    def write_delay(self, address: int, value: int):
        """设置延迟"""
        device = self.devices.get(address)
        if not device:
            return {"address": address, "error": "Device not found"}

        device.delay_value = max(0, min(0x63CD, int(value)))
        return {"address": address, "delay": device.delay_value}

    def write_softstart(self, address: int, percent: float):
        """设置软启动"""
        device = self.devices.get(address)
        if not device:
            return {"address": address, "error": "Device not found"}

        device.softstart_percent = max(0.0, min(100.0, percent))
        return {"address": address, "softstartPercent": device.softstart_percent}

    def write_shutoff(self, address: int, percent: float):
        """设置关断值"""
        device = self.devices.get(address)
        if not device:
            return {"address": address, "error": "Device not found"}

        device.shutoff_percent = max(0.0, min(100.0, percent))
        return {"address": address, "shutoffPercent": device.shutoff_percent}

    def get_command_history(self, address: int) -> List[Dict]:
        """获取命令历史（用于调试）"""
        device = self.devices.get(address)
        if device:
            return device.command_history[-10:]  # 返回最近10条命令
        return []


session = MfcVirtualSession()


@app.get("/health")
def health():
    return {"status": "ok", "virtual": True}


@app.get("/ports")
def ports():
    return session.ports()


@app.post("/connect")
def connect(req: ConnectRequest):
    success = session.connect(req.port, req.baudrate, req.timeout)
    return {"connected": success, "port": req.port, "virtual": True}


@app.post("/disconnect")
def disconnect():
    session.disconnect()
    return {"connected": False, "virtual": True}


@app.post("/scan")
def scan(start: int = Body(32), end: int = Body(80)):
    return [d.model_dump() for d in session.scan(start, end)]


@app.get("/status")
def status(address: Optional[int] = Query(None)):
    if address is None:
        return [session.read_status(a) for a in list(session.devices.keys()) if session.read_status(a) is not None]
    result = session.read_status(address)
    if result is None:
        return {"error": "Device not found", "address": address}
    return result


@app.post("/setpoint")
def setpoint(address: int = Body(...), sccm: float = Body(...)):
    return session.write_setpoint_sccm(address, sccm)


@app.post("/hold-follow")
def hold_follow(address: int = Body(...), follow: int = Body(...)):
    return session.write_hold_follow(address, follow)


@app.post("/delay")
def set_delay(address: int = Body(...), value: int = Body(...)):
    return session.write_delay(address, value)


@app.post("/softstart")
def set_softstart(address: int = Body(...), percent: float = Body(...)):
    return session.write_softstart(address, percent)


@app.post("/shutoff")
def set_shutoff(address: int = Body(...), percent: float = Body(...)):
    return session.write_shutoff(address, percent)


# 虚拟设备特有的API端点
@app.get("/debug/commands")
def get_command_history(address: int = Query(...)):
    """获取命令历史（调试用）"""
    return session.get_command_history(address)


@app.get("/debug/devices")
def get_debug_devices():
    """获取所有虚拟设备的详细信息"""
    devices_info = {}
    for addr, device in session.devices.items():
        devices_info[addr] = {
            "address": device.address,
            "gas_type": device.gas_type,
            "max_flow_sccm": device.max_flow_sccm,
            "flow_percent": device.flow_percent,
            "target_flow_percent": device.target_flow_percent,
            "digital_setpoint_percent": device.digital_setpoint_percent,
            "active_setpoint_percent": device.active_setpoint_percent,
            "hold_follow": device.hold_follow,
            "delay_value": device.delay_value,
            "softstart_percent": device.softstart_percent,
            "shutoff_percent": device.shutoff_percent,
            "last_commands": [cmd.hex() for cmd in device.last_commands[-5:]]
        }
    return devices_info


if __name__ == "__main__":
    import uvicorn
    print("启动MFC虚拟设备服务器...")
    print("虚拟设备将模拟真实的CS100系列MFC行为")
    uvicorn.run(app, host="127.0.0.1", port=8010)