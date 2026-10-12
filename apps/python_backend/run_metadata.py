"""运行信息校验的唯一实现，供设置面板和执行入口调用。"""

import os
import re

from experiment_worker import normalize_path
from shared.contracts.settings import RunMetadataValidationResult

_LABELS = {
    "ownerName": "用户", "basePath": "基础路径",
    "projectName": "项目名称", "individualName": "样品名称",
}


def _reserved_directory_name(value: str) -> bool:
    return os.name == "nt" and re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", value, re.IGNORECASE) is not None


def _base_path_error(value: str) -> str | None:
    # 保留现有产品的路径字符约束，再检查本机路径结构和已有目录。
    if not re.fullmatch(r"[a-zA-Z0-9\\/:_-]+", value):
        return "路径只能包含英文、数字、下划线、连字符和路径分隔符"
    path = normalize_path(value)
    _, tail = os.path.splitdrive(path)
    if ":" in tail or not os.path.isabs(path):
        return "请填写有效的绝对路径，或通过浏览按钮选择目录"
    if any(_reserved_directory_name(segment) for segment in tail.split(os.sep)):
        return "路径包含 Windows 保留的目录名称"
    ancestor = path
    try:
        while not os.path.exists(ancestor):
            parent = os.path.dirname(ancestor)
            if parent == ancestor:
                return "路径所在的磁盘或目录不可用"
            ancestor = parent
        if not os.path.isdir(ancestor):
            return "路径或上级路径是文件，请选择目录"
        if not os.access(ancestor, os.W_OK | os.X_OK):
            return "路径所在目录不可写，请选择有写入权限的目录"
    except OSError:
        return "无法访问路径所在的磁盘或目录"
    return None


def validate_run_metadata(owner_name: str | None, path_config: dict) -> RunMetadataValidationResult:
    """检查缺失及非法值，只读取文件系统，不创建目录或改写配置。"""
    values = {**path_config, "ownerName": owner_name}
    errors: dict[str, str] = {}
    missing = []
    for field in _LABELS:
        value = values.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = "请选择用户" if field == "ownerName" else f"请填写{_LABELS[field]}"
            if field != "basePath":
                missing.append(field)
            continue
        value = value.strip()
        if field == "basePath":
            error = _base_path_error(value)
            if error:
                errors[field] = error
        elif field != "ownerName" and not re.fullmatch(r"[a-zA-Z0-9_]+", value):
            errors[field] = "只能包含英文、数字和下划线"
        elif field != "ownerName" and _reserved_directory_name(value):
            errors[field] = "不能使用 Windows 保留的目录名称"
    can_force_start = not any(field not in missing for field in errors)
    if not errors:
        message = ""
    elif can_force_start:
        message = f"缺少{'、'.join(_LABELS[field] for field in missing)}，请填写后再运行。"
    else:
        message = "运行信息有误，请修正后再运行。" + "；".join(f"{_LABELS[field]}：{error}" for field, error in errors.items())
    return RunMetadataValidationResult(missingFields=missing, fieldErrors=errors, message=message, canForceStart=can_force_start)
