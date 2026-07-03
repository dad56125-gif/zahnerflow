"""
MFC (质量流量控制器) 数据契约

统一定义 MFC 相关的所有数据结构。
"""

from pydantic import Field
from typing import Optional
from ._base import ContractModel


class MfcDeviceInfo(ContractModel):
    """
    MFC 设备基本信息

    扫描串口后发现的 MFC 设备信息。
    同时作为设备配置（合并了原 MfcConfig）。
    """
    address: int = Field(description="Modbus 设备地址")
    gas_type: str = Field(description="气体类型 (如 N2, Ar, H2)")
    max_flow_sccm: int = Field(description="满量程 (标准毫升/分钟)")
    name: str = Field(default="MFC", description="设备名称")
    port: Optional[str] = Field(default=None, description="串口号")
    timeout: int = Field(default=3000, description="超时 (毫秒)")
    polling_interval: int = Field(default=500, description="轮询间隔 (毫秒)")


class MfcStatus(ContractModel):
    """
    MFC 状态 — 统一用于实时推送和历史采样

    后端推送格式：
        deviceStatusUpdate 事件的 payload.devices 元素
        历史数据查询的返回元素
    """
    ts: str = Field(description="时间戳 (ISO 格式)")
    address: int = Field(description="设备地址")
    flow_sccm: float = Field(description="实际流量 (sccm)")
    flow_percent: float = Field(description="实际流量百分比 (0-100)")
    digital_setpoint_percent: float = Field(description="数字通道设定百分比 (0-100)")
    active_setpoint_percent: float = Field(description="实际生效设定百分比 (0-100)")


class MfcSetpointRequest(ContractModel):
    """
    设置 MFC 流量请求

    前端告诉后端"把某个设备的流量设到多少"。
    """
    address: int = Field(description="设备地址")
    sccm: float = Field(description="目标流量 (标准毫升/分钟)")


class MfcScanRequest(ContractModel):
    """
    扫描 MFC 设备请求

    告诉后端去串口上找 MFC 设备。
    """
    start_address: int = Field(default=32, description="起始地址")
    end_address: int = Field(default=80, description="结束地址")
    port: Optional[str] = Field(default=None, description="串口号 (可选)")
    timeout_ms: Optional[int] = Field(default=None, description="每地址超时 (毫秒)")
