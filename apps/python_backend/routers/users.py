"""
Users — /api/users 路由
"""
import sqlite3
import time
import random
import json
from datetime import datetime
from typing import Any

import fastapi
from fastapi import APIRouter, Body, HTTPException

from database import db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("", status_code=201)
def create_user(body: dict):
    username = body.get("user")
    if not username:
        raise HTTPException(status_code=400, detail="Missing 'user' field")
    row = db.conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        return {"success": False, "message": f"User '{username}' already exists"}
    u_id = f"user_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    now = datetime.utcnow().isoformat() + 'Z'
    try:
        db.conn.execute("INSERT INTO users (id, username, email, created_at) VALUES (?, ?, ?, ?)",
                        (u_id, username, body.get("email"), now))
        db.conn.commit()
    except sqlite3.IntegrityError:
        return {"success": False, "message": f"User '{username}' already exists"}
    return {"success": True, "message": f"User {username} created successfully"}


@router.get("")
def get_users():
    rows = db.conn.execute("SELECT username FROM users ORDER BY created_at DESC").fetchall()
    return {"users": [r["username"] for r in rows]}


@router.delete("/{user}")
def delete_user(user: str):
    db.conn.execute("DELETE FROM user_settings WHERE user = ?", (user,))
    cursor = db.conn.execute("DELETE FROM users WHERE username = ?", (user,))
    db.conn.commit()
    return {"success": cursor.rowcount > 0, "message": f"User {user} deleted" if cursor.rowcount > 0 else f"User {user} not found"}


@router.get("/{user}/settings")
def get_user_settings(user: str):
    row = db.conn.execute("SELECT settings_json FROM user_settings WHERE user = ?", (user,)).fetchone()
    if row:
        settings = json.loads(row["settings_json"])
    else:
        settings = {
            "filePath": {"basePath": "C:\\data\\archive", "projectName": "", "individualName": ""},
            "notification": {"email": "", "enabled": False, "onComplete": True, "onError": True,
                             "onWarning": True, "smtpServer": "smtp.qq.com", "smtpPort": 465,
                             "smtpUser": "", "smtpPassword": "", "smtpSecure": True},
            "cloud": {"provider": "none", "syncEnabled": False}
        }
    return {"success": True, "settings": settings}


@router.put("/{user}/settings")
def save_user_settings(user: str, settings: dict):
    current = get_user_settings(user)["settings"]
    def deep_merge(target, source):
        for k, v in source.items():
            if isinstance(v, dict) and k in target:
                deep_merge(target[k], v)
            else:
                target[k] = v
    deep_merge(current, settings)
    now = datetime.utcnow().isoformat() + 'Z'
    db.conn.execute("INSERT OR REPLACE INTO user_settings (user, settings_json, updated_at) VALUES (?, ?, ?)",
                    (user, json.dumps(current), now))
    db.conn.commit()
    return {"success": True, "message": "Settings saved successfully"}


@router.put("/{user}/settings/{section}")
def update_settings_section(user: str, section: str, value: Any = Body(...)):
    current = get_user_settings(user)["settings"]
    current[section] = value
    save_user_settings(user, current)
    return {"success": True, "message": f"{section} settings saved"}


@router.post("/{user}/settings/test-email")
async def test_email(user: str):
    from email_service import email_service
    result = await email_service.send_test_email(user)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result
