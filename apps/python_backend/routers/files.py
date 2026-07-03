"""
Files — /api/files 路由
"""
import os
import sys
import time
import random
import json
from datetime import datetime

import fastapi
from fastapi import APIRouter

from database import db
from experiment_worker import build_output_path

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/register", status_code=201)
def register_file(payload: dict):
    user = payload.get("user")
    proj = payload.get("projectName", "")
    indiv = payload.get("individualName", "")
    t_type = payload.get("testType", "general")
    b_path = payload.get("basePath", "C:\\data\\archive")
    filename = payload.get("filename", "placeholder")
    dir_path = build_output_path({"basePath": b_path, "projectName": proj, "individualName": indiv, "testType": t_type})
    f_id = f"file_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"
    now = datetime.utcnow().isoformat() + 'Z'
    db.conn.execute("INSERT INTO files (id, user, project_name, individual_name, test_type, base_path, dir_path, filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (f_id, user, proj, indiv, t_type, b_path, dir_path, filename, now))
    db.conn.commit()
    return {"success": True, "data": {"id": f_id, "dirPath": dir_path, "projectName": proj, "individualName": indiv, "testType": t_type}}


@router.get("/projects")
def get_projects(user: str):
    rows = db.conn.execute("SELECT DISTINCT project_name FROM files WHERE user = ?", (user,)).fetchall()
    return {"success": True, "projects": [r["project_name"] for r in rows if r["project_name"]]}


@router.delete("/projects/{projectName}")
def delete_project(projectName: str, user: str):
    db.conn.execute("DELETE FROM files WHERE user = ? AND project_name = ?", (user, projectName))
    db.conn.commit()
    return {"success": True, "message": f"Project \"{projectName}\" deleted"}


@router.get("/user-config")
def get_user_config(user: str):
    # 导入 users 路由中的 get_user_settings
    from routers.users import get_user_settings
    settings = get_user_settings(user)["settings"]
    fp = settings.get("filePath", {})
    return {"success": True, "config": {"basePath": fp.get("basePath", "C:\\data\\archive"),
                                         "projectName": fp.get("projectName", ""),
                                         "individualName": fp.get("individualName", "")}}


@router.post("/path-config")
async def save_path_config(config: dict):
    res = register_file({**config, "filename": "placeholder.csv"})
    return {"success": True, "id": res["data"]["id"], "dirPath": res["data"]["dirPath"]}


@router.get("/workflows")
def get_workflow_files(user: str, project: str = None):
    rows = db.conn.execute("SELECT id, json_data, updated_at FROM workflows").fetchall()
    proj_res = get_projects(user)
    projects = proj_res["projects"]
    default_proj = projects[0] if projects else "默认项目"
    wfs = []
    for r in rows:
        wf = json.loads(r["json_data"])
        nodes = wf.get("nodes") or []
        wfs.append({"id": wf["id"], "name": wf.get("name") or "未命名工作流", "filename": f"{wf['id']}.json",
                     "filepath": "SQLite DB", "projectName": project or default_proj,
                     "createdAt": wf.get("createdAt") or r["updated_at"], "nodeCount": len(nodes), "connectionCount": 0})
    wfs.sort(key=lambda w: w["createdAt"], reverse=True)
    return {"success": True, "data": wfs}


@router.get("/browse-system-path")
def browse_system_path():
    try:
        from experiment_worker import open_system_folder_dialog
        path = open_system_folder_dialog()
        return {"success": True, "path": path, "message": "路径选择成功"}
    except Exception as e:
        if str(e) == "USER_CANCELLED":
            return {"success": False, "message": "USER_CANCELLED"}
        return {"success": False, "message": "无法打开系统对话框，请手动输入路径"}


@router.get("/browse-path")
def browse_path():
    try:
        from experiment_worker import open_system_folder_dialog
        path = open_system_folder_dialog()
        return {"success": True, "path": path, "message": "路径选择成功"}
    except Exception as e:
        if str(e) == "USER_CANCELLED":
            return {"success": False, "message": "USER_CANCELLED"}
        import getpass
        username = getpass.getuser()
        if sys.platform == 'win32':
            paths = ['C:\\data\\archive', f'C:\\Users\\{username}\\Documents',
                     f'C:\\Users\\{username}\\Desktop', f'C:\\Users\\{username}\\Downloads', 'D:\\data', 'E:\\data']
        else:
            home = os.path.expanduser("~")
            paths = [f'{home}/Documents', f'{home}/Desktop', f'{home}/Downloads', '/tmp/data', '/var/data']
        return {"success": True, "paths": paths,
                "defaultPath": "C:\\data\\archive" if sys.platform == 'win32' else "/tmp/data",
                "message": "请选择或输入以下路径之一"}
