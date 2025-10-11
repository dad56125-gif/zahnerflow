#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI-518P 温度控制器 GUI界面
实时监控、控制、数据记录
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, simpledialog
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.font_manager as fm
import numpy as np
import threading
import time
from datetime import datetime, timedelta
from collections import deque
import sys

# 导入通讯模块
import serial

# 设置matplotlib使用英文字体
plt.rcParams['font.family'] = 'DejaVu Sans'
plt.rcParams['axes.unicode_minus'] = False

class AI518PController:
    """AI-518P通讯控制器"""
    def __init__(self, port='COM4', baudrate=9600, address=1):
        self.port = port
        self.baudrate = baudrate
        self.address = address
        self.serial = None

    def connect(self):
        """连接串口"""
        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_TWO,
                timeout=0.5
            )
            return True
        except Exception as e:
            print(f"连接失败: {e}")
            return False

    def disconnect(self):
        """断开连接"""
        if self.serial and self.serial.is_open:
            self.serial.close()

    def calculate_checksum_read(self, param_code):
        """计算读指令校验码"""
        checksum = param_code * 256 + 82 + self.address
        low_byte = checksum & 0xFF
        high_byte = (checksum >> 8) & 0xFF
        return bytes([low_byte, high_byte])

    def calculate_checksum_write(self, param_code, param_value):
        """计算写指令校验码"""
        checksum = param_code * 256 + 67 + param_value + self.address
        low_byte = checksum & 0xFF
        high_byte = (checksum >> 8) & 0xFF
        return bytes([low_byte, high_byte])

    def build_read_command(self, param_code):
        """构建读指令"""
        address_code = self.address + 0x80
        checksum = self.calculate_checksum_read(param_code)
        return bytes([address_code, address_code, 0x52, param_code, 0x00, 0x00, checksum[0], checksum[1]])

    def build_write_command(self, param_code, param_value):
        """构建写指令"""
        address_code = self.address + 0x80
        checksum = self.calculate_checksum_write(param_code, param_value)
        return bytes([
            address_code, address_code, 0x43, param_code,
            param_value & 0xFF, (param_value >> 8) & 0xFF, checksum[0], checksum[1]
        ])

    def send_command(self, command):
        """发送命令"""
        try:
            self.serial.reset_input_buffer()
            bytes_written = self.serial.write(command)
            self.serial.flush()

            # 只在写入操作时打印详细信息（写入命令的第3个字节是0x43）
            if len(command) >= 3 and command[2] == 0x43:
                print(f"写入命令发送: 写入{bytes_written}字节, 命令={[hex(b) for b in command]}")

            # 不需要固定延迟，直接开始轮询
            start_time = time.time()
            while self.serial.in_waiting < 10 and (time.time() - start_time) < 0.5:  # 超时时间500ms
                time.sleep(0.01)  # 仅在轮询时短暂等待

            bytes_available = self.serial.in_waiting
            if len(command) >= 3 and command[2] == 0x43:
                print(f"写入响应可用: {bytes_available}字节")

            if self.serial.in_waiting >= 10:
                response = self.serial.read(10)
                if len(command) >= 3 and command[2] == 0x43:
                    print(f"写入响应接收: {[hex(b) for b in response]}")
                return response
            else:
                if len(command) >= 3 and command[2] == 0x43:
                    print(f"写入响应超时: 仅{bytes_available}字节可用")
                    # 尝试读取可用的数据
                    if bytes_available > 0:
                        partial_response = self.serial.read(bytes_available)
                        print(f"写入部分响应: {[hex(b) for b in partial_response]}")
                return None

        except Exception as e:
            if len(command) >= 3 and command[2] == 0x43:
                print(f"写入命令异常: {e}")
            return None
        return None

    def read_parameter(self, param_code):
        """读取参数"""
        command = self.build_read_command(param_code)
        response = self.send_command(command)

        if response and len(response) == 10:
            pv = response[0] + (response[1] << 8)
            sv = response[2] + (response[3] << 8)
            mv = response[4] if response[4] <= 127 else response[4] - 256
            status_a = response[5]
            param_value = response[6] + (response[7] << 8)

            return {
                'pv': pv / 10.0,
                'sv': sv / 10.0,
                'mv': mv,
                'status_a': status_a,
                'param_value': param_value
            }
        return None

    def write_parameter(self, param_code, param_value):
        """写入参数"""
        try:
            command = self.build_write_command(param_code, param_value)
            print(f"发送写入命令: {[hex(b) for b in command]}")

            response = self.send_command(command)

            if not response:
                print(f"写入失败: 无响应，参数码={hex(param_code)}, 值={param_value}")
                return False

            if len(response) != 10:
                print(f"写入失败: 响应长度错误={len(response)}, 参数码={hex(param_code)}, 值={param_value}")
                print(f"响应数据: {[hex(b) for b in response]}")
                return False

            returned_value = response[6] + (response[7] << 8)
            print(f"写入响应: 期望值={param_value}, 返回值={returned_value}, 参数码={hex(param_code)}")

            success = returned_value == param_value
            if success:
                print(f"写入成功: 参数码={hex(param_code)}, 值={param_value}")
            else:
                print(f"写入失败: 值不匹配，参数码={hex(param_code)}, 期望={param_value}, 返回={returned_value}")
                print(f"完整响应: {[hex(b) for b in response]}")

            return success

        except Exception as e:
            print(f"写入异常: 参数码={hex(param_code)}, 值={param_value}, 异常={e}")
            return False

    def get_all_status(self):
        """获取所有状态"""
        try:
            # 读取PV/SV
            temp_data = self.read_parameter(0x00)
            if not temp_data:
                return None

            # 读取程序控制字
            control_data = self.read_parameter(0x15)
            if not control_data:
                return None

            control_value = control_data['param_value']
            stop = (control_value & 0x01) != 0      # STOP位 (BIT0)
            hold = (control_value & 0x04) != 0     # HOLD位 (BIT2)

            # 根据实际数据：运行=0, 暂停=4, 停止=12
            if control_value == 12:
                status = "停止"
            elif control_value == 4:
                status = "暂停"
            elif control_value == 0:
                status = "运行"
            else:
                status = f"未知({control_value})"

            # 读取当前程序段 - 直接使用已读取的temp_data中的param_value
            # 参数0x00既是SV也是程序段，param_value部分包含程序段信息
            current_segment = temp_data['param_value'] if temp_data else 0

            # 读取当前程序段的设定时间
            segment_time_set = self.get_segment_time_set(current_segment)

            # 读取运行时间
            time_data = self.read_parameter(0x56)
            segment_time = time_data['param_value'] if time_data else 0

            return {
                'pv': temp_data['pv'],
                'sv': temp_data['sv'],
                'mv': temp_data['mv'],
                'status': status,
                'segment': current_segment,
                'segment_time': segment_time,
                'segment_time_set': segment_time_set,
                'control_value': control_value,
                'timestamp': datetime.now()
            }
        except Exception as e:
            print(f"读取状态错误: {e}")
            return None

    def set_program_run(self):
        """设置程序运行"""
        return self.write_parameter(0x15, 0)

    def set_program_pause(self):
        """设置程序暂停"""
        return self.write_parameter(0x15, 4)

    def set_program_stop(self):
        """设置程序停止"""
        return self.write_parameter(0x15, 12)

    def set_segment(self, segment_num):
        """设置程序段"""
        return self.write_parameter(0x00, segment_num)

    def get_segment_time_set(self, segment_num):
        """获取指定程序段的设定时间"""
        if 1 <= segment_num <= 30:
            # t01-t30的参数地址：0x1B, 0x1D, 0x1F, ...
            time_code = 0x1B + (segment_num - 1) * 2
            time_data = self.read_parameter(time_code)
            if time_data:
                return time_data['param_value']
        return 0

    def set_sv(self, sv_value):
        """设定SV值"""
        sv_int = int(sv_value * 10)
        return self.write_parameter(0x00, sv_int)


class ProgramSegmentManager:
    """程序段管理器"""
    def __init__(self):
        self.segments = []
        self.pending_changes = {}
        self.read_thread = None
        self.reading = False

        # 初始化30个程序段
        for i in range(30):
            self.segments.append({
                'id': i + 1,
                'temperature': 0.0,  # 温度值
                'time': 0,          # 时间值(分钟)
                'original_temp': 0.0, # 原始温度值
                'original_time': 0,   # 原始时间值
                'modified': False     # 是否已修改
            })

    def start_reading(self, controller):
        """开始自动读取"""
        if not self.reading:
            self.reading = True
            self.read_thread = threading.Thread(target=self._read_loop, args=(controller,), daemon=True)
            self.read_thread.start()

    def stop_reading(self):
        """停止自动读取"""
        self.reading = False
        if self.read_thread:
            self.read_thread.join(timeout=1)

    def _read_loop(self, controller):
        """自动读取循环"""
        while self.reading:
            try:
                self.read_all_segments(controller)
                # 通知GUI更新显示
                if hasattr(self, 'update_callback'):
                    self.update_callback()
                time.sleep(60)  # 每分钟读取一次
            except Exception as e:
                print(f"读取程序段错误: {e}")
                time.sleep(5)

    def set_update_callback(self, callback):
        """设置更新回调"""
        self.update_callback = callback

    def read_all_segments(self, controller):
        """读取所有程序段 - 按顺序连续读取温度和时间参数"""
        try:
            start_time = time.time()
            print(f"开始读取程序段，连续读取30个段（温度+时间）")

            # 按段顺序读取：每个段的温度和时间参数地址是连续的
            for i in range(30):
                segment_start = time.time()
                segment_id = i + 1

                # 读取温度参数 C01-C30 (地址: 0x1A, 0x1C, 0x1E, ...)
                temp_code = 0x1A + i * 2
                temp_data = controller.read_parameter(temp_code)

                if temp_data:
                    self.segments[i]['temperature'] = temp_data['param_value'] / 10.0
                    self.segments[i]['original_temp'] = self.segments[i]['temperature']
                    print(f"段{segment_id:02d} 温度: {self.segments[i]['temperature']:.1f}°C")
                else:
                    print(f"段{segment_id:02d} 温度读取失败")

                # 读取时间参数 t01-t30 (地址: 0x1B, 0x1D, 0x1F, ...)
                time_code = 0x1B + i * 2
                time_data = controller.read_parameter(time_code)

                if time_data:
                    self.segments[i]['time'] = time_data['param_value']
                    self.segments[i]['original_time'] = self.segments[i]['time']
                    print(f"段{segment_id:02d} 时间: {self.segments[i]['time']}分钟")
                else:
                    print(f"段{segment_id:02d} 时间读取失败")

                segment_end = time.time()
                print(f"段{segment_id:02d} 读取完成，耗时: {(segment_end - segment_start)*1000:.1f}ms")

            total_time = time.time() - start_time
            print(f"读取程序段完成，总耗时: {total_time:.1f}秒")

            return True
        except Exception as e:
            print(f"读取程序段失败: {e}")
            return False

    def update_segment(self, segment_id, temperature=None, time_value=None):
        """更新程序段数据"""
        if 1 <= segment_id <= 30:
            index = segment_id - 1
            segment = self.segments[index]

            # 重置修改状态
            segment['modified'] = False

            if temperature is not None:
                segment['temperature'] = temperature
                if segment['temperature'] != segment['original_temp']:
                    segment['modified'] = True

            if time_value is not None:
                segment['time'] = time_value
                if segment['time'] != segment['original_time']:
                    segment['modified'] = True

            # 记录待更改的段（只要有一个参数发生变化就标记为需要写入）
            if segment['modified']:
                self.pending_changes[segment_id] = True

    def read_segment_immediate(self, controller, segment_id):
        """即时读取指定程序段 - 按顺序读取温度和时间参数"""
        try:
            index = segment_id - 1
            segment = self.segments[index]

            print(f"读取段{segment_id}参数...")

            # 读取温度参数 (C01-C30: 0x1A, 0x1C, 0x1E, ...)
            temp_code = 0x1A + index * 2
            temp_data = controller.read_parameter(temp_code)
            if temp_data:
                segment['temperature'] = temp_data['param_value'] / 10.0
                segment['original_temp'] = segment['temperature']
                print(f"段{segment_id} 温度: {segment['temperature']:.1f}°C")
            else:
                print(f"段{segment_id} 温度读取失败")
                return False

            # 读取时间参数 (t01-t30: 0x1B, 0x1D, 0x1F, ...)
            time_code = 0x1B + index * 2
            time_data = controller.read_parameter(time_code)
            if time_data:
                segment['time'] = time_data['param_value']
                segment['original_time'] = segment['time']
                print(f"段{segment_id} 时间: {segment['time']}分钟")
            else:
                print(f"段{segment_id} 时间读取失败")
                return False

            segment['modified'] = False
            if segment_id in self.pending_changes:
                del self.pending_changes[segment_id]

            print(f"段{segment_id} 读取完成")
            return True
        except Exception as e:
            print(f"读取段{segment_id}失败: {e}")
            return False

    def write_all_changes(self, controller):
        """写入所有更改"""
        if not self.pending_changes:
            return False, "没有需要写入的更改"

        success_count = 0
        total_count = len(self.pending_changes)
        failed_segments = []

        print(f"开始写入程序段，总计 {total_count} 个段需要写入")

        for segment_id in self.pending_changes:
            index = segment_id - 1
            segment = self.segments[index]

            try:
                print(f"正在写入段{segment_id}: 温度={segment['temperature']}°C, 时间={segment['time']}分钟")

                # 写入温度参数 (C01-C30)
                temp_code = 0x1A + index * 2
                temp_int = int(segment['temperature'] * 10)
                print(f"  写入温度参数: 参数码={hex(temp_code)}, 值={temp_int}")

                temp_result = controller.write_parameter(temp_code, temp_int)
                print(f"  温度参数写入结果: {temp_result}")

                if not temp_result:
                    error_msg = f"写入温度参数失败: 段{segment_id}, 参数码={hex(temp_code)}, 值={temp_int}"
                    print(error_msg)
                    failed_segments.append(error_msg)
                    continue

                # 写入时间参数 (t01-t30)
                time_code = 0x1B + index * 2
                print(f"  写入时间参数: 参数码={hex(time_code)}, 值={segment['time']}")

                time_result = controller.write_parameter(time_code, segment['time'])
                print(f"  时间参数写入结果: {time_result}")

                if not time_result:
                    error_msg = f"写入时间参数失败: 段{segment_id}, 参数码={hex(time_code)}, 值={segment['time']}"
                    print(error_msg)
                    failed_segments.append(error_msg)
                    continue

                # 只有温度和时间都写入成功才算成功
                success_count += 1
                print(f"  段{segment_id}写入成功")

            except Exception as e:
                error_msg = f"写入段{segment_id}异常: {e}"
                print(error_msg)
                failed_segments.append(error_msg)

        print(f"写入完成: 成功 {success_count}/{total_count} 个段")

        # 更新原始值 - 只有完全成功才更新
        if success_count == total_count:
            for segment_id in self.pending_changes:
                index = segment_id - 1
                self.segments[index]['original_temp'] = self.segments[index]['temperature']
                self.segments[index]['original_time'] = self.segments[index]['time']
                self.segments[index]['modified'] = False
            self.pending_changes.clear()
            return True, f"成功写入全部 {success_count} 个程序段"
        else:
            error_details = "; ".join(failed_segments) if failed_segments else "未知错误"
            return False, f"写入失败: 仅成功写入 {success_count}/{total_count} 个程序段。错误详情: {error_details}"

    def clear_changes(self):
        """清除所有更改"""
        for segment in self.segments:
            if segment['modified']:
                segment['temperature'] = segment['original_temp']
                segment['time'] = segment['original_time']
                segment['modified'] = False
        self.pending_changes.clear()

    def get_pending_count(self):
        """获取待更改数量"""
        return sum(1 for segment in self.segments if segment['modified'])


class ConsoleRedirector:
    """重定向输出到GUI控制台"""
    def __init__(self, gui, level="INFO"):
        self.gui = gui
        self.level = level

    def write(self, message):
        if message.strip():
            # Schedule the GUI update on the main thread
            self.gui.root.after(0, self.gui.log_message, message.strip(), self.level)

    def flush(self):
        pass


class AI518PGUI:
    """AI-518P GUI主界面"""
    def __init__(self, root):
        self.root = root
        self.root.title("AI-518P 温度控制器")
        self.root.geometry("1200x600")

        # 初始化控制器
        self.controller = AI518PController()
        self.connected = False
        self.monitoring = False
        self.monitor_thread = None

        # 初始化程序段管理器
        self.segment_manager = ProgramSegmentManager()

        # 数据存储
        self.time_data = deque(maxlen=300)  # 最多保存300个数据点
        self.pv_data = deque(maxlen=300)
        self.sv_data = deque(maxlen=300)
        self.mv_data = deque(maxlen=300)
        self.segment_entries = {}

        # 创建界面
        self.create_widgets()

        # 重定向标准输出和错误
        sys.stdout = ConsoleRedirector(self, "INFO")
        sys.stderr = ConsoleRedirector(self, "ERROR")

        # 启动时间更新
        self.update_time()

    def create_widgets(self):
        """创建界面组件"""
        # 主框架
        main_frame = ttk.Frame(self.root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 右侧控制台
        console_frame = ttk.Frame(main_frame, width=400)
        console_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(5, 0))
        console_frame.pack_propagate(False)
        self.create_console(console_frame)

        # 创建选项卡
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # 选项卡1: 实时监控
        self.monitoring_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.monitoring_frame, text="实时监控")
        self.create_monitoring_tab(self.monitoring_frame)

        # 选项卡2: 程序段设计
        self.program_frame = ttk.Frame(self.notebook)
        self.notebook.add(self.program_frame, text="程序段设计")
        self.create_program_tab(self.program_frame)

    def create_monitoring_tab(self, parent):
        """创建实时监控选项卡"""
        # 顶部状态显示
        self.create_status_display(parent)

        # 中间图表
        self.create_chart(parent)

        # 底部控制按钮
        self.create_control_buttons(parent)

    def create_program_tab(self, parent):
        """创建程序段设计选项卡"""
        # 顶部控制按钮
        control_frame = ttk.Frame(parent)
        control_frame.pack(fill=tk.X, padx=5, pady=5)

        ttk.Button(control_frame, text="读取程序段",
                  command=self.read_all_segments).pack(side=tk.LEFT, padx=5)
        ttk.Button(control_frame, text="写入程序段",
                  command=self.write_segment_changes).pack(side=tk.LEFT, padx=5)

        # 创建一个Canvas和Scrollbar来实现滚动
        canvas = tk.Canvas(parent)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(
                scrollregion=canvas.bbox("all")
            )
        )

        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # 创建网格输入框
        num_rows = 15
        for i in range(num_rows):
            # First column of segments (1-15)
            seg_id1 = i + 1
            frame1 = ttk.Frame(scrollable_frame)
            frame1.grid(row=i, column=0, padx=10, pady=3, sticky='w')
            
            ttk.Label(frame1, text=f"C{seg_id1:02d}").pack(side=tk.LEFT)
            temp_entry1 = ttk.Entry(frame1, width=8)
            temp_entry1.pack(side=tk.LEFT, padx=2)
            
            ttk.Label(frame1, text=f" t{seg_id1:02d}").pack(side=tk.LEFT)
            time_entry1 = ttk.Entry(frame1, width=8)
            time_entry1.pack(side=tk.LEFT, padx=2)
            self.segment_entries[seg_id1] = {'temp': temp_entry1, 'time': time_entry1}

            # Second column of segments (16-30)
            seg_id2 = i + 1 + num_rows
            if seg_id2 <= 30:
                frame2 = ttk.Frame(scrollable_frame)
                frame2.grid(row=i, column=1, padx=10, pady=3, sticky='w')

                ttk.Label(frame2, text=f"C{seg_id2:02d}").pack(side=tk.LEFT)
                temp_entry2 = ttk.Entry(frame2, width=8)
                temp_entry2.pack(side=tk.LEFT, padx=2)

                ttk.Label(frame2, text=f" t{seg_id2:02d}").pack(side=tk.LEFT)
                time_entry2 = ttk.Entry(frame2, width=8)
                time_entry2.pack(side=tk.LEFT, padx=2)
                self.segment_entries[seg_id2] = {'temp': temp_entry2, 'time': time_entry2}

        self.populate_segment_grid()

    def populate_segment_grid(self):
        """填充程序段网格"""
        for segment in self.segment_manager.segments:
            segment_id = segment['id']
            if segment_id in self.segment_entries:
                entries = self.segment_entries[segment_id]
                entries['temp'].delete(0, tk.END)
                entries['temp'].insert(0, f"{segment['temperature']:.1f}")
                entries['time'].delete(0, tk.END)
                entries['time'].insert(0, str(segment['time']))

    def update_segment_display(self):
        """更新程序段显示"""
        self.populate_segment_grid()

    def read_all_segments(self):
        """读取所有程序段"""
        if not self.connected:
            messagebox.showwarning("警告", "请先连接设备")
            return

        # 禁用读取按钮，防止重复点击
        for widget in self.root.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Frame):
                        for grandchild in child.winfo_children():
                            if isinstance(grandchild, ttk.Button) and "读取程序段" in grandchild.cget("text"):
                                grandchild.config(state=tk.DISABLED, text="读取中...")

        self.log_message("正在读取所有程序段...", "INFO")

        # 在后台线程中执行读取操作
        read_thread = threading.Thread(target=self._read_segments_in_background, daemon=True)
        read_thread.start()

    def _read_segments_in_background(self):
        """在后台线程中读取程序段"""
        try:
            success = self.segment_manager.read_all_segments(self.controller)

            # 在主线程中更新GUI
            self.root.after(0, self._handle_read_result, success)
        except Exception as e:
            self.root.after(0, self._handle_read_result, False)
            self.root.after(0, self.log_message, f"读取程序段异常: {e}", "ERROR")

    def _handle_read_result(self, success):
        """处理读取结果，在主线程中更新GUI"""
        try:
            # 重新启用读取按钮
            for widget in self.root.winfo_children():
                if isinstance(widget, ttk.Frame):
                    for child in widget.winfo_children():
                        if isinstance(child, ttk.Frame):
                            for grandchild in child.winfo_children():
                                if isinstance(grandchild, ttk.Button) and "读取中" in grandchild.cget("text"):
                                    grandchild.config(state=tk.NORMAL, text="读取程序段")

            if success:
                self.populate_segment_grid()
                self.log_message("程序段读取成功", "SUCCESS")
            else:
                self.log_message("读取程序段失败", "ERROR")
        except Exception as e:
            self.log_message(f"更新界面失败: {e}", "ERROR")

    def write_segment_changes(self):
        """写入程序段更改"""
        if not self.connected:
            messagebox.showwarning("警告", "请先连接设备")
            return

        # 禁用写入按钮，防止重复点击
        for widget in self.root.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Frame):
                        for grandchild in child.winfo_children():
                            if isinstance(grandchild, ttk.Button) and "写入程序段" in grandchild.cget("text"):
                                grandchild.config(state=tk.DISABLED, text="写入中...")

        # 从输入框更新 segment_manager
        try:
            for segment_id, entries in self.segment_entries.items():
                temp_str = entries['temp'].get()
                time_str = entries['time'].get()

                temperature = float(temp_str)
                time_value = int(time_str)

                self.segment_manager.update_segment(segment_id, temperature, time_value)
        except ValueError:
            messagebox.showerror("错误", "无效的输入值。请确保所有输入框中的都是有效数字。")
            # 重新启用按钮
            self._enable_write_button()
            return

        self.log_message("正在写入程序段...", "INFO")

        # 在后台线程中执行写入操作
        write_thread = threading.Thread(target=self._write_segments_in_background, daemon=True)
        write_thread.start()

    def _write_segments_in_background(self):
        """在后台线程中写入程序段"""
        try:
            success, message = self.segment_manager.write_all_changes(self.controller)

            # 在主线程中更新GUI
            self.root.after(0, self._handle_write_result, success, message)
        except Exception as e:
            self.root.after(0, self._handle_write_result, False, f"写入程序段异常: {e}")

    def _handle_write_result(self, success, message):
        """处理写入结果，在主线程中更新GUI"""
        try:
            # 重新启用写入按钮
            self._enable_write_button()

            if success:
                self.populate_segment_grid()  # Refresh grid with written values
                self.log_message(message, "SUCCESS")
                messagebox.showinfo("成功", message)
            else:
                self.log_message(message, "ERROR")
                messagebox.showerror("错误", message)
        except Exception as e:
            self.log_message(f"更新界面失败: {e}", "ERROR")

    def _enable_write_button(self):
        """重新启用写入按钮"""
        for widget in self.root.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Frame):
                        for grandchild in child.winfo_children():
                            if isinstance(grandchild, ttk.Button) and "写入中" in grandchild.cget("text"):
                                grandchild.config(state=tk.NORMAL, text="写入程序段")

    def create_status_display(self, parent):
        """创建状态显示区域"""
        status_frame = ttk.LabelFrame(parent, text="实时状态", padding=10)
        status_frame.pack(fill=tk.X, pady=(0, 10))

        # 创建状态显示框架
        status_inner = ttk.Frame(status_frame)
        status_inner.pack(fill=tk.X)

        # 左侧状态
        left_status = ttk.Frame(status_inner)
        left_status.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # PV显示
        pv_frame = ttk.Frame(left_status)
        pv_frame.pack(fill=tk.X, pady=2)
        ttk.Label(pv_frame, text="PV:", font=("Arial", 12, "bold")).pack(side=tk.LEFT)
        self.pv_label = ttk.Label(pv_frame, text="--.-°C", font=("Arial", 16, "bold"), foreground="red")
        self.pv_label.pack(side=tk.LEFT, padx=(10, 0))

        # SV显示
        sv_frame = ttk.Frame(left_status)
        sv_frame.pack(fill=tk.X, pady=2)
        ttk.Label(sv_frame, text="SV:", font=("Arial", 12, "bold")).pack(side=tk.LEFT)
        self.sv_label = ttk.Label(sv_frame, text="--.-°C", font=("Arial", 16, "bold"), foreground="blue")
        self.sv_label.pack(side=tk.LEFT, padx=(10, 0))

        # MV显示
        mv_frame = ttk.Frame(left_status)
        mv_frame.pack(fill=tk.X, pady=2)
        ttk.Label(mv_frame, text="MV:", font=("Arial", 12, "bold")).pack(side=tk.LEFT)
        self.mv_label = ttk.Label(mv_frame, text="--%", font=("Arial", 16, "bold"), foreground="green")
        self.mv_label.pack(side=tk.LEFT, padx=(10, 0))

        # 右侧状态
        right_status = ttk.Frame(status_inner)
        right_status.pack(side=tk.RIGHT, fill=tk.Y)

        # 程序状态
        program_frame = ttk.Frame(right_status)
        program_frame.pack(fill=tk.X, pady=2)
        ttk.Label(program_frame, text="程序状态:", font=("Arial", 10)).pack(side=tk.LEFT)
        self.status_label = ttk.Label(program_frame, text="断开", font=("Arial", 10, "bold"), foreground="gray")
        self.status_label.pack(side=tk.LEFT, padx=(5, 0))

        # 程序段
        segment_frame = ttk.Frame(right_status)
        segment_frame.pack(fill=tk.X, pady=2)
        ttk.Label(segment_frame, text="程序段:", font=("Arial", 10)).pack(side=tk.LEFT)
        self.segment_label = ttk.Label(segment_frame, text="--", font=("Arial", 10, "bold"), foreground="purple")
        self.segment_label.pack(side=tk.LEFT, padx=(5, 0))

        # 运行时间 / 设定时间
        time_frame = ttk.Frame(right_status)
        time_frame.pack(fill=tk.X, pady=2)
        ttk.Label(time_frame, text="运行时间/设定时间:", font=("Arial", 10)).pack(side=tk.LEFT)
        self.time_label = ttk.Label(time_frame, text="-- / -- 分钟", font=("Arial", 10, "bold"))
        self.time_label.pack(side=tk.LEFT, padx=(5, 0))

    def create_chart(self, parent):
        """创建实时图表"""
        chart_frame = ttk.LabelFrame(parent, text="温度曲线", padding=5)
        chart_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # 创建matplotlib图表
        self.fig = Figure(figsize=(8, 3), dpi=80)
        self.ax = self.fig.add_subplot(111)
        self.ax.set_xlabel('Time (s)')
        self.ax.set_ylabel('Temperature (°C)')
        self.ax.grid(True, alpha=0.3)

        # 设置Y轴范围
        self.ax.set_ylim(0, 100)

        # 创建线条
        self.pv_line, = self.ax.plot([], [], 'r-', label='PV', linewidth=2)
        self.sv_line, = self.ax.plot([], [], 'b--', label='SV', linewidth=1)
        self.mv_line, = self.ax.plot([], [], 'g-', label='MV(%)', linewidth=1, alpha=0.7)

        self.ax.legend(loc='upper right')

        # 嵌入到tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, chart_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

    def create_control_buttons(self, parent):
        """创建控制按钮"""
        button_frame = ttk.LabelFrame(parent, text="控制面板", padding=10)
        button_frame.pack(side=tk.BOTTOM, fill=tk.X)

        # Single row for all buttons
        row = ttk.Frame(button_frame)
        row.pack(fill=tk.X)

        self.connect_btn = ttk.Button(row, text="连接设备", command=self.toggle_connection)
        self.connect_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.monitor_btn = ttk.Button(row, text="开始监控", command=self.toggle_monitoring, state=tk.DISABLED)
        self.monitor_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.run_btn = ttk.Button(row, text="运行", command=self.set_run, state=tk.DISABLED)
        self.run_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.pause_btn = ttk.Button(row, text="暂停", command=self.set_pause, state=tk.DISABLED)
        self.pause_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.stop_btn = ttk.Button(row, text="停止", command=self.set_stop, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        self.set_segment_btn = ttk.Button(row, text="设置程序段", command=self.set_segment_dialog, state=tk.DISABLED)
        self.set_segment_btn.pack(side=tk.LEFT, padx=(0, 5))

    def create_console(self, parent):
        """创建控制台"""
        console_frame = ttk.LabelFrame(parent, text="控制台输出", padding=5)
        console_frame.pack(fill=tk.BOTH, expand=True)

        # 控制台文本区域
        self.console = scrolledtext.ScrolledText(console_frame, height=40, wrap=tk.WORD)
        self.console.pack(fill=tk.BOTH, expand=True)

        # 配置标签样式
        self.console.tag_configure("INFO", foreground="black")
        self.console.tag_configure("SUCCESS", foreground="green")
        self.console.tag_configure("WARNING", foreground="orange")
        self.console.tag_configure("ERROR", foreground="red")
        self.console.tag_configure("TIMESTAMP", foreground="gray")

    def log_message(self, message, level="INFO"):
        """添加日志消息"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.console.insert(tk.END, f"[{timestamp}] ", "TIMESTAMP")
        self.console.insert(tk.END, f"{message}\n", level)
        self.console.see(tk.END)

    def toggle_connection(self):
        """切换连接状态"""
        if not self.connected:
            self.log_message("正在连接设备...")
            if self.controller.connect():
                self.connected = True
                self.connect_btn.config(text="断开连接")
                self.monitor_btn.config(state=tk.NORMAL)
                self.log_message("设备连接成功", "SUCCESS")

                # 启用控制按钮
                self.enable_controls(True)

                # 暂时屏蔽程序段自动读取功能
                # self.segment_manager.set_update_callback(self.update_segment_display)
                # self.segment_manager.start_reading(self.controller)
                # self.log_message("程序段自动读取已启动", "INFO")
                self.log_message("程序段自动读取已屏蔽，请使用手动读取按钮", "WARNING")
            else:
                self.log_message("设备连接失败", "ERROR")
        else:
            self.stop_monitoring()
            self.segment_manager.stop_reading()
            self.controller.disconnect()
            self.connected = False
            self.connect_btn.config(text="连接设备")
            self.monitor_btn.config(state=tk.DISABLED)
            self.log_message("设备已断开连接")

            # 禁用控制按钮
            self.enable_controls(False)

    def toggle_monitoring(self):
        """切换监控状态"""
        if not self.monitoring:
            self.start_monitoring()
        else:
            self.stop_monitoring()

    def start_monitoring(self):
        """开始监控"""
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self.monitor_loop, daemon=True)
        self.monitor_thread.start()
        self.monitor_btn.config(text="停止监控")
        self.log_message("开始实时监控", "SUCCESS")

    def stop_monitoring(self):
        """停止监控"""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=1)
        self.monitor_btn.config(text="开始监控")
        self.log_message("停止实时监控")

    def monitor_loop(self):
        """监控循环"""
        while self.monitoring:
            try:
                status = self.controller.get_all_status()
                if status:
                    # 更新数据
                    self.time_data.append(status['timestamp'])
                    self.pv_data.append(status['pv'])
                    self.sv_data.append(status['sv'])
                    self.mv_data.append(status['mv'])

                    # 更新界面
                    self.root.after(0, self.update_display, status)
                else:
                    self.root.after(0, self.log_message, "读取数据失败", "WARNING")

                time.sleep(1)  # 1秒更新一次
            except Exception as e:
                self.root.after(0, self.log_message, f"监控错误: {e}", "ERROR")
                break

    def update_display(self, status):
        """更新显示"""
        try:
            # 更新状态标签
            self.pv_label.config(text=f"{status['pv']:.1f}°C")
            self.sv_label.config(text=f"{status['sv']:.1f}°C")
            self.mv_label.config(text=f"{status['mv']}%")

            # 更新程序状态
            self.status_label.config(text=status['status'])
            if status['status'] == "运行":
                self.status_label.config(foreground="green")
            elif status['status'] == "暂停":
                self.status_label.config(foreground="orange")
            else:
                self.status_label.config(foreground="red")

            # 更新程序段
            self.segment_label.config(text=f"{status['segment']}")

            # 更新运行时间/设定时间显示格式
            segment_time_set = status.get('segment_time_set', 0)
            segment_time = status['segment_time']

            # 格式化运行时间
            if segment_time >= 60:
                hours = segment_time // 60
                minutes = segment_time % 60
                run_time_str = f"{hours}h{minutes}m"
            else:
                run_time_str = f"{segment_time}m"

            # 格式化设定时间
            if segment_time_set >= 60:
                hours = segment_time_set // 60
                minutes = segment_time_set % 60
                set_time_str = f"{hours}h{minutes}m"
            else:
                set_time_str = f"{segment_time_set}m"

            # 合并显示：运行时间 / 设定时间
            self.time_label.config(text=f"{run_time_str} / {set_time_str}")

            # 更新图表
            self.update_chart()

        except Exception as e:
            self.log_message(f"更新显示错误: {e}", "ERROR")

    def update_chart(self):
        """更新图表"""
        if len(self.time_data) > 1:
            try:
                # 转换时间为相对秒数
                base_time = self.time_data[0]
                time_seconds = [(t - base_time).total_seconds() for t in self.time_data]

                # 更新数据
                self.pv_line.set_data(time_seconds, list(self.pv_data))
                self.sv_line.set_data(time_seconds, list(self.sv_data))

                # MV数据需要缩放到温度范围
                mv_scaled = [m/2 for m in self.mv_data]  # 将%转换为温度范围
                self.mv_line.set_data(time_seconds, mv_scaled)

                # 调整X轴范围
                if len(time_seconds) > 0:
                    self.ax.set_xlim(max(0, time_seconds[-1] - 300), time_seconds[-1] + 10)

                # 调整Y轴范围
                if len(self.pv_data) > 0:
                    all_temps = list(self.pv_data) + list(self.sv_data) + mv_scaled
                    y_min = min(all_temps) - 5
                    y_max = max(all_temps) + 5
                    self.ax.set_ylim(y_min, y_max)

                self.canvas.draw()
            except Exception as e:
                self.log_message(f"更新图表错误: {e}", "ERROR")

    def enable_controls(self, enabled):
        """启用/禁用控制按钮"""
        state = tk.NORMAL if enabled else tk.DISABLED
        self.run_btn.config(state=state)
        self.pause_btn.config(state=state)
        self.stop_btn.config(state=state)

        # 启用/禁用设置程序段按钮
        if hasattr(self, 'set_segment_btn'):
            self.set_segment_btn.config(state=state)

    def set_run(self):
        """设置运行"""
        if self.controller.set_program_run():
            self.log_message("程序已设置为运行状态", "SUCCESS")
        else:
            self.log_message("设置运行失败", "ERROR")

    def set_pause(self):
        """设置暂停"""
        if self.controller.set_program_pause():
            self.log_message("程序已设置为暂停状态", "SUCCESS")
        else:
            self.log_message("设置暂停失败", "ERROR")

    def set_stop(self):
        """设置停止"""
        if self.controller.set_program_stop():
            self.log_message("程序已设置为停止状态", "SUCCESS")
        else:
            self.log_message("设置停止失败", "ERROR")

    def set_segment_dialog(self):
        """设置程序段对话框"""
        dialog = simpledialog.askinteger("设置程序段", "请输入程序段号 (1-30):",
                                         minvalue=1, maxvalue=30, parent=self.root)
        if dialog:
            if self.controller.set_segment(dialog):
                self.log_message(f"程序段已设置为 {dialog}", "SUCCESS")
            else:
                self.log_message("设置程序段失败", "ERROR")



    def update_time(self):
        """更新时间显示"""
        # 可以在这里添加时间相关的更新
        self.root.after(1000, self.update_time)

    def on_closing(self):
        """关闭程序"""
        if self.monitoring:
            self.stop_monitoring()
        if self.connected:
            self.controller.disconnect()
        self.root.destroy()


def main():
    """主函数"""
    root = tk.Tk()
    app = AI518PGUI(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()