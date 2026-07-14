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


class RuntimeDeviceState(ContractModel):
    """后端持有的设备运行时权威快照。

    该结构同时承载连接生命周期和（Furnace）程序生命周期。MFC 不使用
    执行字段时以 ``null`` 表示；当前扫描设备单独使用 ``scanned_devices``，
    不与历史发现记录混用。
    """

    connection_status: str = Field(
        description="连接状态: disconnected / connecting / connected / communication_error"
    )
    connected_port: Optional[str] = Field(default=None, description="当前连接端口")
    connected_at: Optional[str] = Field(default=None, description="本次连接建立时间 (ISO)")
    execution_status: Optional[str] = Field(
        default=None,
        description="Furnace 执行状态: idle / running / paused / stopped / completed / error",
    )
    execution_id: Optional[str] = Field(default=None, description="当前 Furnace 程序执行 ID")
    current_segment_index: Optional[int] = Field(default=None, description="当前 Furnace 程序段")
    started_at: Optional[str] = Field(default=None, description="整次 Furnace 程序首次开始时间 (ISO)")
    current_run_started_at: Optional[str] = Field(default=None, description="本次运行或恢复开始时间 (ISO)")
    accumulated_run_seconds: float = Field(default=0, description="已确认的有效运行时间 (秒)")
    stopped_at: Optional[str] = Field(default=None, description="停止或完成时间 (ISO)")
    device_status: Optional[Dict[str, Any]] = Field(default=None, description="当前实时设备快照")
    scanned_devices: List[Dict[str, Any]] = Field(default_factory=list, description="本次扫描的设备快照")
    last_successful_communication_at: Optional[str] = Field(
        default=None,
        description="最近一次成功通信时间 (ISO)",
    )
    last_error: Optional[Dict[str, Any]] = Field(default=None, description="最近一次设备或运行时错误")
    state_version: int = Field(default=0, description="单调递增的状态版本")
    updated_at: str = Field(description="状态更新时间 (ISO)")


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
    runtime_state: RuntimeDeviceState = Field(description="后端权威运行时状态快照")
    state_version: int = Field(description="运行时状态版本")
    updated_at: str = Field(description="运行时状态更新时间 (ISO)")
