"""本地 SQLite 连接与计数器；结构和迁移统一由 database_schema 管理。"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from database_schema import migrate


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent
DATA_DIR = Path(os.getenv("ZAHNERFLOW_DATA_DIR", PROJECT_ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "app.db"


class Database:
    def __init__(self, path: Path = DB_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        try:
            self.schema_version = migrate(self.conn)
        except Exception:
            self.conn.close()
            raise

    def get_next_counter(self, key: str) -> int:
        self.conn.execute(
            "INSERT OR IGNORE INTO counters (key, value) VALUES (?, 0)",
            (key,),
        )
        self.conn.execute(
            "UPDATE counters SET value = value + 1 WHERE key = ?",
            (key,),
        )
        row = self.conn.execute(
            "SELECT value FROM counters WHERE key = ?",
            (key,),
        ).fetchone()
        self.conn.commit()
        return int(row["value"])



db = Database()
