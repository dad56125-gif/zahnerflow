"""
Users — /api/users 路由
"""
import sqlite3
import time
import random
from pydantic import ValidationError
from shared.contracts.settings import UserProfile, UserListResponse, UserSettingsResponse, CreateUserResponse
from user_settings import load_user_settings, save_user_settings as persist_user_settings
from datetime import datetime
from typing import Any

import fastapi
from fastapi import APIRouter, Body, HTTPException

from database import db

router = APIRouter(prefix="/api/users", tags=["users"])

@router.post("", status_code=201, response_model=CreateUserResponse)
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
    return {"success": True, "message": f"User {username} created successfully", "user": UserProfile(id=u_id, user=username, email=body.get("email"), created_at=now).model_dump(by_alias=True)}


@router.get("", response_model=UserListResponse)
def get_users():
    rows = db.conn.execute("SELECT id, username, email, created_at FROM users ORDER BY created_at DESC").fetchall()
    return {"users": [UserProfile(id=row["id"], user=row["username"], email=row["email"], created_at=row["created_at"], avatar=load_user_settings(row["username"])["cloud"]["avatar"]).model_dump(by_alias=True) for row in rows]}


@router.delete("/{user}")
def delete_user(user: str):
    db.conn.execute("DELETE FROM user_settings WHERE user = ?", (user,))
    cursor = db.conn.execute("DELETE FROM users WHERE username = ?", (user,))
    db.conn.commit()
    return {"success": cursor.rowcount > 0, "message": f"User {user} deleted" if cursor.rowcount > 0 else f"User {user} not found"}


@router.get("/{user}/settings", response_model=UserSettingsResponse)
def get_user_settings(user: str):
    return {"success": True, "settings": load_user_settings(user)}


@router.put("/{user}/settings", response_model=UserSettingsResponse)
def save_user_settings(user: str, settings: dict):
    try:
        return {"success": True, "settings": persist_user_settings(user, settings)}
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_input=False, include_context=False)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/{user}/settings/{section}", response_model=UserSettingsResponse)
def update_settings_section(user: str, section: str, value: Any = Body(...)):
    if section not in {"filePath", "notification", "cloud"}:
        raise HTTPException(status_code=404, detail=f"Unknown settings section: {section}")
    return save_user_settings(user, {section: value})


@router.post("/{user}/settings/test-email")
async def test_email(user: str):
    from email_service import email_service
    result = await email_service.send_test_email(user)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result
