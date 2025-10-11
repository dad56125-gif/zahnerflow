#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MFC设备GUI控制程序
基于Tkinter的MFC设备实时监控和控制界面
"""

import tkinter as tk
from tkinter import ttk, messagebox
import serial
import serial.tools.list_ports
import threading
import time
import struct
from typing import Dict, List, Optional
import queue

class MFCDevice:
    """MFC设备类"""
    def __init__(self, address: int, name: str, max_flow: float = 100.0):
        self.address = address
        self.name = name
        self.max_flow = max_flow
        self.current_flow = 0.0
        self.digital_setpoint = 0.0  # 数字设定值
        self.active_setpoint = 0.0   # 当前设定值
        self.hold_follow = 0
        self.gas_type = "未知"
        self.status = "未知"
        self.responding = False

    def calculate_checksum(self, data: bytes) -> int:
        """计算校验和"""
        return sum(data) & 0xFF

    def create_read_command(self, class_byte: int, instance: int, attribute: int) -> bytes:
        """创建读取命令"""
        command = bytes([self.address, 0x02, 0x80, 0x03, class_byte, instance, attribute, 0x00])
        checksum = self.calculate_checksum(command)
        return command + bytes([checksum])

    def create_write_command(self, class_byte: int, instance: int, attribute: int, data: bytes) -> bytes:
        """创建写入命令"""
        if len(data) == 1:  # UINT8数据，如Hold/Follow
            command = bytes([self.address, 0x02, 0x81, 0x04, class_byte, instance, attribute]) + data + bytes([0x00])
        elif len(data) == 2:  # UINT16或UFRAC16数据
            command = bytes([self.address, 0x02, 0x81, 0x05, class_byte, instance, attribute]) + data + bytes([0x00])
        else:
            command = bytes([self.address, 0x02, 0x81, len(data) + 6, class_byte, instance, attribute]) + data + bytes([0x00])
        checksum = self.calculate_checksum(command)
        return command + bytes([checksum])

    def ufrac16_to_percentage(self, value: int) -> float:
        """UFRAC16转百分比"""
        return ((value - 0x4000) / (0xC000 - 0x4000)) * 100

    def percentage_to_ufrac16(self, percentage: float) -> int:
        """百分比转UFRAC16"""
        return int(percentage * (0xC000 - 0x4000) / 100 + 0x4000)

class MFCControlGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("MFC设备控制系统")
        self.root.geometry("1200x700")

        # 设备管理
        self.devices: Dict[int, MFCDevice] = {}
        self.serial_conn: Optional[serial.Serial] = None
        self.selected_port = tk.StringVar()

        # 线程管理
        self.monitor_thread: Optional[threading.Thread] = None
        self.monitoring = False
        self.command_queue = queue.Queue()

        # 创建UI
        self.create_widgets()

        # 搜索端口
        self.search_ports()

    def create_widgets(self):
        """创建UI组件"""
        # 顶部控制栏
        control_frame = ttk.Frame(self.root)
        control_frame.pack(fill=tk.X, padx=10, pady=5)

        # 端口选择
        ttk.Label(control_frame, text="串口:").pack(side=tk.LEFT, padx=5)
        self.port_combo = ttk.Combobox(control_frame, textvariable=self.selected_port, width=15)
        self.port_combo.pack(side=tk.LEFT, padx=5)

        ttk.Button(control_frame, text="搜索设备", command=self.search_devices).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="开始监控", command=self.start_monitoring).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="停止监控", command=self.stop_monitoring).pack(side=tk.LEFT, padx=5)

        # 连接状态和搜索进度
        self.status_label = ttk.Label(control_frame, text="未连接", foreground="red")
        self.status_label.pack(side=tk.RIGHT, padx=10)

        self.search_progress = ttk.Label(control_frame, text="", foreground="blue")
        self.search_progress.pack(side=tk.RIGHT, padx=10)

        # 设备显示区域
        self.devices_frame = ttk.Frame(self.root)
        self.devices_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 创建设备卡片容器
        self.device_cards = {}

    def search_ports(self):
        """搜索可用串口"""
        ports = [port.device for port in serial.tools.list_ports.comports()]
        self.port_combo['values'] = ports
        # 不自动设置端口

    def search_devices(self):
        """搜索MFC设备"""
        port = self.selected_port.get()
        if not port:
            messagebox.showwarning("警告", "请选择串口")
            return

        # 在新线程中搜索设备，避免界面卡死
        threading.Thread(target=self._search_devices_thread, args=(port,), daemon=True).start()

    def _search_devices_thread(self, port: str):
        """搜索设备线程"""
        try:
            # 连接串口
            self.serial_conn = serial.Serial(
                port=port,
                baudrate=19200,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.5
            )

            self.root.after(0, lambda: self.status_label.config(text="已连接", foreground="green"))

            # 清空现有设备
            self.root.after(0, self._clear_devices)

            # 搜索已知存在的设备地址
            found_devices = []
            known_addresses = [0x21, 0x25, 0x2C]  # 已知存在的设备地址

            for address in known_addresses:
                # 更新搜索进度
                self.root.after(0, lambda addr=address: self.search_progress.config(text=f"搜索地址: {addr}"))

                if self.test_device(address):
                    device = MFCDevice(address, f"设备{address}")
                    self.devices[address] = device
                    found_devices.append(device)
                    self.root.after(0, lambda addr=address: self.search_progress.config(text=f"发现设备: {addr}"))

                time.sleep(0.1)  # 短暂延迟避免过快

            # 搜索完成
            self.root.after(0, lambda: self.search_progress.config(text=""))

            if found_devices:
                # 创建设备卡片
                for device in found_devices:
                    self.root.after(0, lambda d=device: self.create_device_card(d))
                # 立即尝试读取设备信息
                self.root.after(500, self.read_all_device_info)
                self.root.after(0, lambda: messagebox.showinfo("成功", f"发现 {len(found_devices)} 个设备"))
            else:
                self.root.after(0, lambda: messagebox.showinfo("结果", "未发现设备"))

        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("错误", f"连接失败: {e}"))
            self.root.after(0, lambda: self.status_label.config(text="连接失败", foreground="red"))

    def _clear_devices(self):
        """清空设备显示"""
        for widget in self.devices_frame.winfo_children():
            widget.destroy()
        self.device_cards.clear()
        self.devices.clear()

    def read_all_device_info(self):
        """读取所有设备的基本信息（气体类型、满量程等）"""
        if not self.serial_conn or not self.serial_conn.is_open:
            return

        for address, device in self.devices.items():
            try:
                print(f"读取设备 {address} 的基本信息...")

                # 读取气体类型 - 使用66命令（实际验证的命令）
                gas_name_cmd = device.create_read_command(0x66, 0x01, 0x01)
                if self.send_command(gas_name_cmd):
                    time.sleep(0.1)
                    response = self.serial_conn.read(20)
                    print(f"设备{address} 气体名称响应: {response.hex() if response else 'None'}")
                    if len(response) >= 11 and response[0] == 0x06:
                        # 根据实际测试，气体名称数据长度变化
                        data_length = response[4] if len(response) > 4 else 0
                        expected_gas_length = data_length - 3  # 减去Class、Instance、Attribute
                        if len(response) >= 8 + expected_gas_length:
                            gas_data = response[8:8+expected_gas_length]
                            try:
                                gas_name = gas_data.decode('ascii').strip('\x00')
                                gas_name = gas_name.strip()
                                if gas_name and gas_name != "":
                                    device.gas_type = gas_name
                                    print(f"设备{address} 气体类型: {gas_name}")
                                    # 更新UI
                                    self.root.after(0, lambda d=device: self.update_device_card(d))
                            except Exception as e:
                                print(f"气体名称解析错误: {e}")

                # 如果没获取到，根据地址推测
                if device.gas_type == "未知":
                    if device.address == 0x21:
                        device.gas_type = "NITROGEN"
                    elif device.address == 0x25:
                        device.gas_type = "H2"
                    elif device.address == 0x2C:
                        device.gas_type = "Air"
                    else:
                        device.gas_type = f"未知气体"
                    print(f"设备{address} 推测气体类型: {device.gas_type}")
                    # 更新UI
                    self.root.after(0, lambda d=device: self.update_device_card(d))

                # 读取满量程值 - 使用66命令
                fullscale_cmd = device.create_read_command(0x66, 0x01, 0x03)
                if self.send_command(fullscale_cmd):
                    time.sleep(0.1)
                    response = self.serial_conn.read(20)
                    print(f"设备{address} 满量程响应: {response.hex() if response else 'None'}")
                    if len(response) >= 11 and response[0] == 0x06:
                        # 根据实际测试，满量程是UINT16格式
                        if len(response) >= 10:
                            fs_bytes = response[8:10]
                            try:
                                fullscale = struct.unpack('<H', fs_bytes)[0]
                                if fullscale > 0:
                                    device.max_flow = fullscale
                                    print(f"设备{address} 满量程: {fullscale}")
                                    # 更新UI标题
                                    self.root.after(0, lambda d=device: self.update_device_title(d))
                            except Exception as e:
                                print(f"满量程解析错误: {e}")

            except Exception as e:
                print(f"读取设备{address}信息失败: {e}")

    def test_device(self, address: int) -> bool:
        """测试设备是否存在"""
        try:
            # 发送读取流量命令
            device = MFCDevice(address, "test")
            command = device.create_read_command(0x68, 0x01, 0xB9)

            self.serial_conn.reset_input_buffer()
            self.serial_conn.write(command)
            self.serial_conn.flush()

            time.sleep(0.1)
            response = self.serial_conn.read(20)

            # 检查响应
            if len(response) >= 11:
                if response[0] == 0x06 and response[1] == 0x00:
                    return True
            return False
        except:
            return False

    def create_device_card(self, device: MFCDevice):
        """创建设备控制卡片"""
        # 设备卡片框架 - 使用十进制通道号
        card_frame = ttk.LabelFrame(self.devices_frame, text=f"[{device.address}] 最大流量 {device.max_flow} sccm")
        card_frame.grid(row=0, column=len(self.device_cards), padx=10, pady=10, sticky="nsew")

        # 配置网格权重
        self.devices_frame.grid_columnconfigure(len(self.device_cards), weight=1)

        card = {}

        # 左侧参数区
        left_frame = ttk.Frame(card_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=10)

        # 瞬时流量显示
        flow_frame = ttk.Frame(left_frame)
        flow_frame.pack(fill=tk.X, pady=5)
        ttk.Label(flow_frame, text="瞬时流量:", width=10).pack(side=tk.LEFT)
        card['flow_label'] = ttk.Label(flow_frame, text="0.00 sccm", font=("Arial", 12, "bold"))
        card['flow_label'].pack(side=tk.LEFT, padx=5)

        # 设定点输入
        setpoint_frame = ttk.Frame(left_frame)
        setpoint_frame.pack(fill=tk.X, pady=5)
        ttk.Label(setpoint_frame, text="设定点:", width=10).pack(side=tk.LEFT)
        card['setpoint_var'] = tk.StringVar(value="0.00")
        card['setpoint_entry'] = ttk.Entry(setpoint_frame, textvariable=card['setpoint_var'], width=10)
        card['setpoint_entry'].pack(side=tk.LEFT, padx=5)
        card['setpoint_entry'].bind('<Return>', lambda e: self.set_device_setpoint(device))
        ttk.Button(setpoint_frame, text="设置", command=lambda: self.set_device_setpoint(device)).pack(side=tk.LEFT)

        # 气体名称显示
        gas_frame = ttk.Frame(left_frame)
        gas_frame.pack(fill=tk.X, pady=5)
        ttk.Label(gas_frame, text="气体类型:", width=10).pack(side=tk.LEFT)
        card['gas_label'] = ttk.Label(gas_frame, text="未知", font=("Arial", 10))
        card['gas_label'].pack(side=tk.LEFT, padx=5)

        # 设定点控制
        control_frame = ttk.Frame(left_frame)
        control_frame.pack(fill=tk.X, pady=5)

        # Hold/Follow状态控制
        ttk.Label(control_frame, text="控制状态:", width=10).pack(side=tk.LEFT)
        card['hold_button'] = ttk.Button(control_frame, text="设为等待",
                                        command=lambda: self.set_hold_follow_state(device, 0))
        card['hold_button'].pack(side=tk.LEFT, padx=2)
        card['follow_button'] = ttk.Button(control_frame, text="设为跟随",
                                         command=lambda: self.set_hold_follow_state(device, 1))
        card['follow_button'].pack(side=tk.LEFT, padx=2)

        # 状态指示
        status_frame = ttk.Frame(left_frame)
        status_frame.pack(fill=tk.X, pady=10)
        ttk.Label(status_frame, text="设备状态:", width=10).pack(side=tk.LEFT)
        card['status_canvas'] = tk.Canvas(status_frame, width=20, height=20)
        card['status_canvas'].pack(side=tk.LEFT, padx=5)
        card['status_light'] = card['status_canvas'].create_oval(2, 2, 18, 18, fill="gray", outline="black")
        card['status_text'] = ttk.Label(status_frame, text="未知")
        card['status_text'].pack(side=tk.LEFT, padx=5)

        # 右侧柱状图
        right_frame = ttk.Frame(card_frame)
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, padx=10, pady=10)

        chart_canvas = tk.Canvas(right_frame, width=120, height=200, bg="white")
        chart_canvas.pack()

        # 绘制柱状图背景
        chart_canvas.create_rectangle(30, 20, 50, 180, outline="black", width=2)
        chart_canvas.create_rectangle(70, 20, 90, 180, outline="black", width=2)
        chart_canvas.create_text(40, 190, text="实际", font=("Arial", 8))
        chart_canvas.create_text(80, 190, text="设定", font=("Arial", 8))

        # 柱状图条
        card['flow_bar'] = chart_canvas.create_rectangle(32, 178, 48, 178, fill="blue", outline="")
        card['setpoint_bar'] = chart_canvas.create_rectangle(72, 178, 88, 178, fill="red", outline="")

        # 百分比标签
        card['flow_percent'] = chart_canvas.create_text(40, 10, text="0%", font=("Arial", 8))
        card['setpoint_percent'] = chart_canvas.create_text(80, 10, text="0%", font=("Arial", 8))

        card['canvas'] = chart_canvas
        self.device_cards[device.address] = card

    def update_device_card(self, device: MFCDevice):
        """更新设备卡片显示"""
        if device.address not in self.device_cards:
            return

        card = self.device_cards[device.address]

        # 更新流量显示
        flow_sccm = device.current_flow * device.max_flow / 100
        card['flow_label'].config(text=f"{flow_sccm:.2f} sccm")

        # 更新设定点显示
        digital_sp_sccm = device.digital_setpoint * device.max_flow / 100
        active_sp_sccm = device.active_setpoint * device.max_flow / 100
        card['setpoint_var'].set(f"{digital_sp_sccm:.2f}")

        # 更新气体类型
        card['gas_label'].config(text=device.gas_type)

        # 更新Hold/Follow按钮状态
        if device.hold_follow == 1:  # 跟随状态
            card['hold_button'].config(state='normal')
            card['follow_button'].config(state='disabled')
        else:  # 等待状态
            card['hold_button'].config(state='disabled')
            card['follow_button'].config(state='normal')

        # 更新状态灯
        if device.responding:
            if device.hold_follow == 1:  # 跟随状态
                card['status_canvas'].itemconfig(card['status_light'], fill="green")
                card['status_text'].config(text="正常")
            else:  # 等待状态
                card['status_canvas'].itemconfig(card['status_light'], fill="yellow")
                card['status_text'].config(text="等待")
        else:
            card['status_canvas'].itemconfig(card['status_light'], fill="red")
            card['status_text'].config(text="离线")

        # 更新柱状图 - 使用数字设定值
        self.update_chart(card, device.current_flow, device.digital_setpoint)

    def update_device_title(self, device: MFCDevice):
        """更新设备标题"""
        if device.address in self.device_cards:
            # 找到对应的卡片框架并更新标题
            for widget in self.devices_frame.winfo_children():
                if isinstance(widget, ttk.LabelFrame):
                    title_text = widget.cget("text")
                    if f"[{device.address}]" in title_text:
                        new_title = f"[{device.address}] 最大流量 {device.max_flow:.1f} sccm"
                        widget.config(text=new_title)
                        break

    def update_chart(self, card: Dict, flow_percent: float, setpoint_percent: float):
        """更新柱状图"""
        # 限制范围
        flow_percent = max(-50, min(125, flow_percent))
        setpoint_percent = max(-50, min(125, setpoint_percent))

        # 计算柱状图高度 (总高度160像素)
        flow_height = int((flow_percent + 50) / 175 * 160)
        setpoint_height = int((setpoint_percent + 50) / 175 * 160)

        # 更新实际流量柱
        card['canvas'].coords(card['flow_bar'], 32, 178 - flow_height, 48, 178)
        card['canvas'].itemconfig(card['flow_percent'], text=f"{flow_percent:.1f}%")

        # 更新设定点柱
        card['canvas'].coords(card['setpoint_bar'], 72, 178 - setpoint_height, 88, 178)
        card['canvas'].itemconfig(card['setpoint_percent'], text=f"{setpoint_percent:.1f}%")

    def set_device_setpoint(self, device: MFCDevice):
        """设置设备设定点"""
        try:
            setpoint_text = self.device_cards[device.address]['setpoint_var'].get()
            setpoint_sccm = float(setpoint_text)
            setpoint_percent = setpoint_sccm / device.max_flow * 100

            # 根据协议限制UFRAC16范围: 0.25-0.75 (0x4000-0xC000) = -50% to 125%
            setpoint_percent = max(-50, min(125, setpoint_percent))

            # 生成UFRAC16值
            ufrac16_value = device.percentage_to_ufrac16(setpoint_percent)
            data_bytes = struct.pack('<H', ufrac16_value)

            # 创建写入命令 - 根据协议使用正确的数字设定值命令
            command = device.create_write_command(0x69, 0x01, 0xA4, data_bytes)

            # 发送命令
            self.command_queue.put(('write', command, device))

        except ValueError:
            messagebox.showerror("错误", "请输入有效的数值")

    def set_hold_follow_state(self, device: MFCDevice, state: int):
        """设置Hold/Follow状态"""
        # 0 = 等待状态, 1 = 跟随状态
        if state in [0, 1]:
            data_bytes = bytes([state])
            command = device.create_write_command(0x69, 0x01, 0x05, data_bytes)
            self.command_queue.put(('write', command, device))

    def start_monitoring(self):
        """开始监控"""
        if not self.serial_conn or not self.serial_conn.is_open:
            messagebox.showwarning("警告", "请先搜索设备")
            return

        if not self.monitoring:
            self.monitoring = True
            self.monitor_thread = threading.Thread(target=self.monitor_loop, daemon=True)
            self.monitor_thread.start()
            self.status_label.config(text="监控中", foreground="blue")

    def stop_monitoring(self):
        """停止监控"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1)
        self.status_label.config(text="已停止", foreground="orange")

    def monitor_loop(self):
        """监控循环"""
        while self.monitoring:
            try:
                # 处理命令队列
                while not self.command_queue.empty():
                    try:
                        cmd_type, command, device = self.command_queue.get_nowait()
                        if cmd_type == 'write':
                            self.send_command(command)
                    except queue.Empty:
                        break

                # 读取所有设备数据
                for address, device in self.devices.items():
                    if self.read_device_data(device):
                        # 在主线程更新UI
                        self.root.after(0, self.update_device_card, device)

                time.sleep(0.5)  # 监控间隔

            except Exception as e:
                print(f"监控错误: {e}")
                break

    def send_command(self, command: bytes) -> bool:
        """发送命令"""
        try:
            self.serial_conn.reset_input_buffer()
            self.serial_conn.write(command)
            self.serial_conn.flush()
            return True
        except:
            return False

    def read_device_data(self, device: MFCDevice) -> bool:
        """读取设备数据"""
        try:
            # 读取实时流量
            flow_cmd = device.create_read_command(0x68, 0x01, 0xB9)
            if self.send_command(flow_cmd):
                time.sleep(0.05)
                response = self.serial_conn.read(20)
                if len(response) >= 11 and response[0] == 0x06:
                    flow_bytes = response[8:10]
                    flow_value = struct.unpack('<H', flow_bytes)[0]
                    device.current_flow = device.ufrac16_to_percentage(flow_value)
                    device.responding = True

                    # 读取数字设定值 - 根据协议使用正确的命令
                    digital_setpoint_cmd = device.create_read_command(0x69, 0x01, 0xA4)
                    if self.send_command(digital_setpoint_cmd):
                        time.sleep(0.05)
                        response = self.serial_conn.read(20)
                        if len(response) >= 11 and response[0] == 0x06:
                            sp_bytes = response[8:10]
                            sp_value = struct.unpack('<H', sp_bytes)[0]
                            device.digital_setpoint = device.ufrac16_to_percentage(sp_value)

                    # 读取当前设定值
                    active_setpoint_cmd = device.create_read_command(0x69, 0x01, 0xA5)
                    if self.send_command(active_setpoint_cmd):
                        time.sleep(0.05)
                        response = self.serial_conn.read(20)
                        if len(response) >= 11 and response[0] == 0x06:
                            as_bytes = response[8:10]
                            as_value = struct.unpack('<H', as_bytes)[0]
                            device.active_setpoint = device.ufrac16_to_percentage(as_value)

                    # 读取Hold/Follow状态 - 根据协议使用正确的命令
                    status_cmd = device.create_read_command(0x69, 0x01, 0x05)
                    if self.send_command(status_cmd):
                        time.sleep(0.05)
                        response = self.serial_conn.read(20)
                        if len(response) >= 11 and response[0] == 0x06:
                            device.hold_follow = response[8] if len(response) > 8 else 0

                    # 读取气体类型 - 使用66命令（实际验证的命令）
                    gas_name_cmd = device.create_read_command(0x66, 0x01, 0x01)
                    if self.send_command(gas_name_cmd):
                        time.sleep(0.05)
                        response = self.serial_conn.read(20)
                        print(f"设备{device.address} 气体名称响应: {response.hex() if response else 'None'}")
                        if len(response) >= 11 and response[0] == 0x06:
                            # 根据实际测试，气体名称数据长度变化
                            data_length = response[4] if len(response) > 4 else 0
                            expected_gas_length = data_length - 3  # 减去Class、Instance、Attribute
                            if len(response) >= 8 + expected_gas_length:
                                gas_data = response[8:8+expected_gas_length]
                                try:
                                    gas_name = gas_data.decode('ascii').strip('\x00')
                                    gas_name = gas_name.strip()
                                    if gas_name and gas_name != "":
                                        device.gas_type = gas_name
                                        print(f"设备{device.address} 气体类型: {gas_name}")
                                except Exception as e:
                                    print(f"气体名称解析错误: {e}")

                    # 如果没有获取到气体名称，尝试读取气体代码
                    if device.gas_type == "未知":
                        gas_code_cmd = device.create_read_command(0x66, 0x01, 0x02)
                        if self.send_command(gas_code_cmd):
                            time.sleep(0.05)
                            response = self.serial_conn.read(20)
                            print(f"设备{device.address} 气体代码响应: {response.hex() if response else 'None'}")
                            if len(response) >= 11 and response[0] == 0x06:
                                if len(response) >= 10:
                                    code_bytes = response[8:10]
                                    gas_code = struct.unpack('<H', code_bytes)[0]
                                    device.gas_type = f"代码{gas_code}"
                                    print(f"设备{device.address} 气体代码: {gas_code}")

                    # 根据地址推测气体类型 (基于实际测试结果)
                    if device.gas_type == "未知":
                        if device.address == 0x21:
                            device.gas_type = "NITROGEN"
                        elif device.address == 0x25:
                            device.gas_type = "H2"
                        elif device.address == 0x2C:
                            device.gas_type = "Air"
                        else:
                            device.gas_type = f"未知气体"
                        print(f"设备{device.address} 推测气体类型: {device.gas_type}")

                    # 读取满量程值 - 使用66命令
                    fullscale_cmd = device.create_read_command(0x66, 0x01, 0x03)
                    if self.send_command(fullscale_cmd):
                        time.sleep(0.05)
                        response = self.serial_conn.read(20)
                        print(f"设备{device.address} 满量程响应: {response.hex() if response else 'None'}")
                        if len(response) >= 11 and response[0] == 0x06:
                            # 根据实际测试，满量程是UINT16格式
                            if len(response) >= 10:
                                fs_bytes = response[8:10]
                                try:
                                    fullscale = struct.unpack('<H', fs_bytes)[0]
                                    if fullscale > 0:
                                        device.max_flow = fullscale
                                        print(f"设备{device.address} 满量程: {fullscale}")
                                        # 更新UI标题
                                        self.root.after(0, lambda d=device: self.update_device_title(d))
                                except Exception as e:
                                    print(f"满量程解析错误: {e}")

                    return True
                else:
                    device.responding = False
                    return False
        except:
            device.responding = False
            return False

    def __del__(self):
        """析构函数"""
        self.stop_monitoring()
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()

def main():
    """主函数"""
    root = tk.Tk()
    app = MFCControlGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()