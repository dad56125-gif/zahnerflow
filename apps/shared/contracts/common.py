"""
通用数据契约

定义所有设备模块和工作流共享的基础类型。
"""

from pydantic import Field
from typing import Optional, Any, Literal
from ._base import ContractModel


DeviceConnectionStatus = str  # 'connected' | 'disconnected' | 'connecting' | 'error'


class DeviceError(ContractModel):
    """
    设备错误信息

    设备操作失败时，描述出了什么问题。
    """
    code: str = Field(description="错误码 (如 FURNACE_TIMEOUT)")
    message: str = Field(description="人能看懂的描述")
    status: int = Field(description="HTTP 状态码")
    details: Optional[Any] = Field(default=None, description="额外信息")
    retry_after: Optional[float] = Field(default=None, description="建议重试等待时间 (秒)")


LogEntryType = str  # 'success' | 'info' | 'warning' | 'error'


class LogEntry(ContractModel):
    """
    日志条目

    前端操作日志面板里的一行记录。
    """
    id: str = Field(description="唯一标识")
    timestamp: str = Field(description="时间 (如 10:30:15)")
    type: LogEntryType = Field(description="日志级别")
    message: str = Field(description="日志内容")


class ChartDataPoint(ContractModel):
    """
    图表数据点

    画图表时，一个数据点包含时间和数值。
    """
    timestamp: str = Field(description="时间 (ISO)")
    value: float = Field(description="数值")
    label: Optional[str] = Field(default=None, description="标签")


class ExecutionFailure(ContractModel):
    """执行失败的阶段和已确认命令事实。"""
    code: str = Field(description="可定位错误类型的稳定错误码")
    device: str = Field(default="furnace", description="关联设备")
    stage: Literal["preflight", "command", "confirmation", "waiting"] = Field(description="失败阶段")
    title: str = Field(description="中文失败标题")
    message: str = Field(description="已确认事实的中文说明")
    suggestion: str = Field(description="下一步检查建议，不自动重试")
    commandOutcome: Literal["not_sent", "partial", "acknowledged", "unknown"] = Field(description="启动命令事实：未发送、部分配置已写入、已确认或结果未知")
    originalError: str = Field(description="保留的原始异常原因")
    details: dict = Field(default_factory=dict, description="故障发生时的参数与测量事实，不含用户设置")


class RuntimeDiagnosticBundle(ContractModel):
    schemaVersion: Literal[1] = Field(default=1, description="诊断导出格式版本")
    appVersion: str = Field(description="导出时应用版本")
    exportedAt: str = Field(description="导出时间")
    runtimeId: str = Field(description="导出时后端进程身份")
    system: dict = Field(description="操作系统及运行环境")
    execution: Optional[dict] = Field(default=None, description="选定执行的持久化步骤及故障事实")
    deviceSnapshots: list[dict] = Field(default_factory=list, description="导出时的设备快照，不能当成故障发生时状态")
    runtimeEvents: list[dict] = Field(default_factory=list, description="限定范围的设备生命周期记录")
    commandLogs: dict = Field(default_factory=dict, description="当前进程有限条设备命令日志；重启后可能为空")


class NotificationMessage(ContractModel):
    """
    通知消息

    前端右上角的通知弹窗。
    """
    id: str = Field(description="唯一标识")
    type: LogEntryType = Field(description="消息级别")
    title: str = Field(description="标题")
    message: str = Field(description="内容")
    timestamp: str = Field(description="时间")
    duration: Optional[int] = Field(default=None, description="显示时长 (毫秒)")
    details: Optional[Any] = Field(default=None, description="额外错误详情")
    executionId: Optional[str] = Field(default=None, description="关联执行，供重置后导出历史诊断")
    failure: Optional[ExecutionFailure] = Field(default=None, description="结构化失败事实；普通通知可为空")


class HistoryQueryParams(ContractModel):
    """
    历史数据查询参数

    查历史温度/流量数据时，告诉后端你要查哪段时间、要多少条。
    """
    from_time: Optional[str] = Field(default=None, alias="from", description="起始时间 (ISO)")
    to: Optional[str] = Field(default=None, description="结束时间 (ISO)")
    limit: Optional[int] = Field(default=1000, description="最多返回条数")
    offset: Optional[int] = Field(default=0, description="跳过条数 (分页)")
    downsample: Optional[int] = Field(default=None, description="每 N 条取 1 条")
