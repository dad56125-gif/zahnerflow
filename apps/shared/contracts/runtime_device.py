"""
统一设备 runtime 契约

这里定义的是所有设备共享的 runtime 外壳。设备业务字段仍由 furnace/mfc
各自的契约描述，不在这里强行合并。
"""

from pydantic import Field
from typing import Any, Dict, List, Optional
from ._base import ContractModel


RuntimeDeviceKind = str  # 'furnace' | 'mfc' | 'zahner'
RuntimeDeviceMode = str  # 'real' | 'simulator' | 'disconnected'


class RuntimeDeviceStatusEnvelope(ContractModel):
    """
    统一设备状态事件/响应外壳

    payload 是设备专属状态:
      - furnace: pv/sv/mv/statusCode/segment/segmentTime/segmentTimeSet
      - mfc: devices[]
      - zahner: mode/connected 等设备状态
    """
    device: RuntimeDeviceKind = Field(description="设备类型")
    connected: bool = Field(description="设备是否已连接")
    mode: RuntimeDeviceMode = Field(description="运行模式: real / simulator / disconnected")
    profile: Optional[str] = Field(default=None, description="模拟器 profile / 故障预设")
    timestamp: str = Field(description="状态产生时间 (ISO)")
    payload: Dict[str, Any] = Field(description="设备专属状态载荷")
    connection_state: Dict[str, Any] = Field(description="统一连接状态信息")
    diagnostics: Dict[str, Any] = Field(default_factory=dict, description="最近命令、错误和扫描诊断")
    capabilities: List[str] = Field(default_factory=list, description="设备能力标记")
    device_count: Optional[int] = Field(default=None, description="子设备数量，适用于 MFC")
    error: Optional[str] = Field(default=None, description="错误信息")
