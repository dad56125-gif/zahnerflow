"""用户档案和设置的唯一跨端定义。默认值由后端模型补齐。"""

from pydantic import Field
from ._base import DocumentContract


class FilePathConfig(DocumentContract):
    base_path: str = "C:\\data\\archive"
    project_name: str = ""
    individual_name: str = ""
    electrode_area_cm2: float | None = Field(default=None, gt=0, allow_inf_nan=False, strict=True)


class RunMetadataValidationRequest(DocumentContract):
    owner_name: str | None = None
    path_config: FilePathConfig


class RunMetadataFieldErrors(DocumentContract):
    owner_name: str = ""
    base_path: str = ""
    project_name: str = ""
    individual_name: str = ""


class RunMetadataValidationResult(DocumentContract):
    missing_fields: list[str]
    field_errors: RunMetadataFieldErrors
    message: str
    can_force_start: bool


class NotificationSettings(DocumentContract):
    email: str = ""
    enabled: bool = False
    on_complete: bool = True
    on_error: bool = True
    on_warning: bool = True
    smtp_server: str = "smtp.qq.com"
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_secure: bool = True


class CloudSettings(DocumentContract):
    provider: str = "none"
    sync_enabled: bool = False
    endpoint: str = ""
    bucket: str = ""
    avatar: str = ""


class UserSettings(DocumentContract):
    file_path: FilePathConfig = Field(default_factory=FilePathConfig)
    notification: NotificationSettings = Field(default_factory=NotificationSettings)
    cloud: CloudSettings = Field(default_factory=CloudSettings)


class UserProfile(DocumentContract):
    id: str
    user: str
    email: str | None = None
    created_at: str
    avatar: str = ""


class UserListResponse(DocumentContract):
    users: list[UserProfile]


class UserSettingsResponse(DocumentContract):
    success: bool = True
    settings: UserSettings


class CreateUserResponse(DocumentContract):
    success: bool
    message: str
    user: UserProfile | None = None
