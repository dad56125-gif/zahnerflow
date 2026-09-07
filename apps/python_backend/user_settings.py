"""设置的读取、合并与持久化边界，供路由、执行和通知共用。"""

import json
from datetime import datetime, timezone

from database import db
from shared.contracts.settings import UserSettings


def normalize_user_settings(settings: dict | None) -> dict:
    return UserSettings.model_validate(settings or {}).model_dump(by_alias=True)


def load_user_settings(user: str) -> dict:
    row = db.conn.execute("SELECT settings_json FROM user_settings WHERE user = ?", (user,)).fetchone()
    try:
        stored = json.loads(row["settings_json"]) if row else {}
    except (TypeError, json.JSONDecodeError):
        stored = {}
    return normalize_user_settings(stored if isinstance(stored, dict) else {})


def save_user_settings(user: str, patch: dict) -> dict:
    settings = load_user_settings(user)
    for section, values in patch.items():
        if section not in settings:
            raise ValueError(f"未知设置分组：{section}")
        if not isinstance(values, dict):
            raise ValueError(f"设置分组 {section} 必须是对象")
        unknown = set(values) - set(settings[section])
        if unknown:
            raise ValueError(f"未知设置字段：{section}.{sorted(unknown)[0]}")
        settings[section].update(values)
    normalized = normalize_user_settings(settings)
    with db.conn:
        db.conn.execute(
            "INSERT INTO user_settings (user, settings_json, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(user) DO UPDATE SET settings_json=excluded.settings_json, updated_at=excluded.updated_at",
            (user, json.dumps(normalized, ensure_ascii=False), datetime.now(timezone.utc).isoformat()),
        )
    return normalized
