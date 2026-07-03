"""
加热炉数据契约

统一定义加热炉相关的所有数据结构。
前端通过代码生成器自动产生对应的 TypeScript 类型。
"""

from pydantic import Field
from typing import Optional, List
from ._base import ContractModel


class FurnaceStatus(ContractModel):
    """
    加热炉状态 — 统一用于实时推送、历史采样、操作响应

    后端推送格式：
        deviceStatusUpdate 事件的 payload 字段
        历史数据查询的返回元素
        操作（run/pause/stop）的返回数据
    """
    ts: str = Field(description="时间戳 (ISO 格式)")
    pv: float = Field(description="Process Value — 当前实际温度 (℃)")
    sv: float = Field(description="Set Value — 设定目标温度 (℃)")
    mv: float = Field(description="Manipulated Value — 加热器输出功率 (0-100%)")
    status: str = Field(description="运行状态: running / paused / stopped / idle")
    segment: int = Field(description="当前程序段号 (1-27)")
    segment_time: float = Field(description="当前段已运行时间 (秒)")
    segment_time_set: float = Field(description="当前段设定时间 (秒)")


class ProgramSegment(ContractModel):
    """
    温度程序段

    一个温度程序由多个 ProgramSegment 组成，每段定义一个温度和保持时间。
    时间为 -121 时表示停止符（程序到此结束）。
    """
    id: int = Field(ge=1, le=27, description="段号 (1-27)")
    temperature: float = Field(ge=0, le=1100, description="目标温度 (℃)")
    time: float = Field(description="保持时间 (分钟), -121=停止符")


class FurnacePreset(ContractModel):
    """
    温度程序预设

    保存好的温度程序，方便下次直接选用。
    """
    name: str = Field(description="预设名称 (唯一)")
    segments: List[ProgramSegment] = Field(description="程序段列表")
    summary: Optional[str] = Field(default=None, description="可选描述")
    created_at: Optional[str] = Field(default=None, description="创建时间 (ISO)")
    updated_at: Optional[str] = Field(default=None, description="更新时间 (ISO)")


class FurnaceConnectRequest(ContractModel):
    """
    加热炉连接参数

    告诉后端如何通过串口连接加热炉。
    """
    port: str = Field(description="串口号 (如 COM3)")
    baudrate: int = Field(default=115200, description="通信波特率")
    address: int = Field(default=1, description="Modbus 设备地址")
    stopbits: int = Field(default=1, description="停止位")
    timeout: float = Field(default=0.3, description="超时时间 (秒)")


class FurnaceConfig(ContractModel):
    """
    加热炉安全限制配置

    前端用此配置校验用户输入，防止超出设备能力。
    """
    name: str = Field(default="Furnace", description="设备名称")
    address: int = Field(default=1, description="Modbus 地址")
    port: str = Field(default="COM1", description="串口号")
    timeout: int = Field(default=5000, description="超时 (毫秒)")
    polling_interval: int = Field(default=1000, description="轮询间隔 (毫秒)")
    max_temperature: int = Field(default=1100, description="最高允许温度 (℃)")
    heating_rate_limit: float = Field(default=10, description="最大升温速率 (℃/分钟)")
    cooling_rate_limit: float = Field(default=15, description="最大降温速率 (℃/分钟)")


class SegmentProgress(ContractModel):
    """
    程序段读写进度

    写入/读取 27 段程序时，后端推送此事件报告进度。
    """
    active: bool = Field(description="是否正在进行操作")
    type: str = Field(description="操作类型: read / write")
    progress: float = Field(ge=0, le=100, description="进度百分比 (0-100)")
    message: Optional[str] = Field(default=None, description="进度提示文字")
