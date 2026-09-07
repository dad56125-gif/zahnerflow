"""实验记录输出契约。SQLite 字段在后端出口转换一次，前端只接收驼峰字段。"""

from pydantic import Field
from ._base import DocumentContract
from .settings import FilePathConfig
from .protocol import REPORT_VERSION


class ReportStep(DocumentContract):
    id: int | None = None
    execution_id: str
    original_index: int | None = None
    unrolled_index: int
    node_id: str | None = None
    node_type: str | None = None
    status: str
    params: dict = Field(default_factory=dict)
    actual_seconds: float | None = None
    estimated_seconds: float | None = None
    eta_source: str | None = None
    iteration_path: list = Field(default_factory=list)
    block_path: list = Field(default_factory=list)
    result: dict = Field(default_factory=dict)
    error: str | None = None
    started_at: str | None = None
    ended_at: str | None = None


class ReportArtifact(DocumentContract):
    execution_id: str
    node_id: str | None = None
    file_type: str | None = None
    file_path: str
    created_at: str | None = None
    source: str
    data_points: int | None = None
    metadata: dict = Field(default_factory=dict)


class ReportWarning(DocumentContract):
    execution_id: str
    warning_type: str | None = None
    message: str
    created_at: str | None = None
    metadata: dict = Field(default_factory=dict)


class ReportExecutionMetadata(DocumentContract):
    execution_id: str
    workflow_id: str
    workflow_name: str
    owner_name: str
    project_name: str
    individual_name: str
    status: str
    started_at: str
    ended_at: str | None = None
    duration_ms: int | None = None
    error: str | None = None


class ReportEnvironment(DocumentContract):
    furnace_samples: list = Field(default_factory=list)
    mfc_samples: list = Field(default_factory=list)


class ExecutionReport(DocumentContract):
    report_version: str = REPORT_VERSION
    execution_metadata: ReportExecutionMetadata
    workflow_snapshot: dict
    path_config: FilePathConfig
    unrolled_steps: list[ReportStep]
    artifacts: list[ReportArtifact]
    environment_snapshot: ReportEnvironment
    warning_flags: list[ReportWarning]
    summary_metrics: dict
    generated_at: str
