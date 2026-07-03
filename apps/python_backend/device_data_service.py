"""
设备数据持久化服务
统一管理 Furnace 和 MFC 的历史数据、预设等。
所有 SQLite 操作在主进程完成，设备子进程只负责硬件通信。
"""
import json
import time
from datetime import datetime
from database import db
from devices.furnace.limits import validate_furnace_temperature

RAW_SAMPLE_RETENTION_SECONDS = 30 * 24 * 60 * 60


# ============================================================
# 工具函数
# ============================================================

def to_db_timestamp(iso_string: str) -> int:
    """ISO 字符串 → Unix 时间戳（秒），用于数据库存储"""
    try:
        return int(datetime.fromisoformat(iso_string.replace('Z', '+00:00')).timestamp())
    except Exception:
        return int(time.time())


def from_db_timestamp(ts: int) -> str:
    """Unix 时间戳（秒）→ ISO 字符串，用于返回前端"""
    return datetime.utcfromtimestamp(ts).isoformat() + 'Z'


def cleanup_old_raw_samples(table: str, timestamp_column: str = "timestamp") -> None:
    cutoff = int(time.time()) - RAW_SAMPLE_RETENTION_SECONDS
    db.conn.execute(f"DELETE FROM {table} WHERE {timestamp_column} < ?", (cutoff,))


# ============================================================
# Furnace 数据服务
# ============================================================

class FurnaceDataService:
    """Furnace 预设 CRUD + 采样/事件写入与查询"""

    # ---------- 预设管理 ----------

    def list_presets(self) -> list:
        rows = db.conn.execute(
            "SELECT name, created_at, updated_at FROM furnace_presets"
        ).fetchall()
        return [{"name": r["name"], "createdAt": r["created_at"], "updatedAt": r["updated_at"]} for r in rows]

    def get_preset(self, name: str) -> dict:
        row = db.conn.execute(
            "SELECT * FROM furnace_presets WHERE name = ?", (name,)
        ).fetchone()
        if not row:
            return None
        return {
            "name": row["name"],
            "segments": json.loads(row["segments_json"]),
            "summary": row["summary"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def create_preset(self, name: str, segments: list, summary: str = "") -> dict:
        self._validate_segments(segments)
        now = datetime.utcnow().isoformat() + 'Z'
        try:
            db.conn.execute(
                "INSERT INTO furnace_presets (name, segments_json, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (name, json.dumps(segments), summary, now, now),
            )
            db.conn.commit()
        except Exception as e:
            if "UNIQUE constraint" in str(e):
                raise ValueError("Preset name already exists")
            raise
        return {"name": name, "segments": segments, "summary": summary, "createdAt": now, "updatedAt": now}

    def update_preset(self, name: str, segments: list) -> dict:
        self._validate_segments(segments)
        now = datetime.utcnow().isoformat() + 'Z'
        cursor = db.conn.execute(
            "UPDATE furnace_presets SET segments_json = ?, updated_at = ? WHERE name = ?",
            (json.dumps(segments), now, name),
        )
        db.conn.commit()
        if cursor.rowcount == 0:
            return None
        return self.get_preset(name)

    def delete_preset(self, name: str) -> bool:
        cursor = db.conn.execute("DELETE FROM furnace_presets WHERE name = ?", (name,))
        db.conn.commit()
        return cursor.rowcount > 0

    def clone_preset(self, name: str, new_name: str) -> dict:
        src = self.get_preset(name)
        if not src:
            return None
        return self.create_preset(new_name, src["segments"], src.get("summary", ""))

    def segments_equal(self, a: list, b: list) -> bool:
        if len(a) != len(b):
            return False
        return all(
            x.get("id") == y.get("id")
            and x.get("temperature") == y.get("temperature")
            and x.get("time") == y.get("time")
            for x, y in zip(a, b)
        )

    def _validate_segments(self, segments: list) -> None:
        for segment in segments:
            validate_furnace_temperature(segment.get("temperature", 0), "preset segment temperature")

    # ---------- 采样数据 ----------

    def add_sample(self, pv: float, sv: float, mv: float, status_code: int = 0,
                   segment: int = 0, segment_time: float = 0, segment_time_set: float = 0):
        ts = int(time.time())
        cleanup_old_raw_samples("furnace_metrics_recent")
        db.conn.execute(
            "INSERT OR IGNORE INTO furnace_metrics_recent (timestamp, pv, sv, mv, status_code, segment, segment_time, segment_time_set) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (ts, pv, sv, mv, status_code, segment, segment_time, segment_time_set),
        )
        db.conn.commit()

    def query_samples(self, from_ts: str = None, to_ts: str = None, limit: int = None, downsample: int = None) -> list:
        select_columns = "timestamp, pv, sv, mv, status_code, segment, segment_time, segment_time_set, tier"
        params = []
        conditions = []

        if from_ts:
            conditions.append("timestamp >= ?")
            params.append(to_db_timestamp(from_ts))
        if to_ts:
            conditions.append("timestamp <= ?")
            params.append(to_db_timestamp(to_ts))

        if conditions:
            where_clause = " WHERE " + " AND ".join(conditions)
        else:
            where_clause = ""

        total = None
        if limit and limit > 0:
            total_row = db.conn.execute(
                f"SELECT COUNT(*) AS total FROM furnace_history_view{where_clause}",
                params,
            ).fetchone()
            total = int(total_row["total"]) if total_row else 0

        if limit and limit > 0 and total and total > limit:
            # 长时间范围不能只截取最早的 limit 条；按完整范围均匀抽样，保留首尾点。
            step = max(1, (total + limit - 2) // max(1, limit - 1))
            sql = f"""
                SELECT {select_columns}
                FROM (
                    SELECT {select_columns},
                           ROW_NUMBER() OVER (ORDER BY timestamp ASC) AS rn,
                           COUNT(*) OVER () AS total_count
                    FROM furnace_history_view
                    {where_clause}
                )
                WHERE rn = 1 OR rn = total_count OR ((rn - 1) % ? = 0)
                ORDER BY timestamp ASC
            """
            query_params = [*params, step]
        else:
            sql = f"SELECT {select_columns} FROM furnace_history_view{where_clause} ORDER BY timestamp ASC"
            query_params = [*params]

        if limit and limit > 0 and not (total and total > limit):
            sql += " LIMIT ?"
            query_params.append(limit)

        rows = db.conn.execute(sql, query_params).fetchall()
        result = [
            {
                "timestamp": from_db_timestamp(r["timestamp"]),
                "pv": r["pv"],
                "sv": r["sv"],
                "mv": r["mv"],
                "statusCode": r["status_code"],
                "segment": r["segment"],
                "segmentTime": r["segment_time"],
                "segmentTimeSet": r["segment_time_set"],
                "tier": r["tier"],  # 0=recent, 1=archive(1min), 更多层级可扩展
            }
            for r in rows
        ]

        if downsample and downsample > 1:
            result = [r for i, r in enumerate(result) if i % downsample == 0]

        return result

# ============================================================
# MFC 数据服务
# ============================================================

class MfcDataService:
    """MFC 流量采样写入与查询"""

    def add_flow_sample(self, address: int, flow_sccm: float, flow_percent: float = 0,
                        digital_setpoint_percent: float = 0, active_setpoint_percent: float = 0):
        ts = int(time.time())
        cleanup_old_raw_samples("mfc_samples")
        db.conn.execute(
            "INSERT INTO mfc_samples (timestamp, address, flow_sccm, flow_percent, setpoint, active_setpoint) VALUES (?, ?, ?, ?, ?, ?)",
            (ts, address, flow_sccm, flow_percent, digital_setpoint_percent, active_setpoint_percent),
        )
        db.conn.commit()

    def query_flow_history(self, device_address: int = None, from_ts: str = None,
                           to_ts: str = None, limit: int = None, downsample: int = None) -> dict:
        sql = "SELECT timestamp, address, flow_sccm, flow_percent, setpoint as digital_setpoint_percent, active_setpoint as active_setpoint_percent FROM mfc_samples"
        conditions = []
        params = []

        if device_address is not None:
            conditions.append("address = ?")
            params.append(device_address)
        if from_ts:
            conditions.append("timestamp >= ?")
            params.append(to_db_timestamp(from_ts))
        if to_ts:
            conditions.append("timestamp <= ?")
            params.append(to_db_timestamp(to_ts))

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)

        sql += " ORDER BY timestamp ASC"

        if limit and limit > 0:
            sql += " LIMIT ?"
            params.append(limit)

        rows = db.conn.execute(sql, params).fetchall()
        samples = [
            {
                "timestamp": from_db_timestamp(r["timestamp"]),
                "address": r["address"],
                "flowSccm": r["flow_sccm"],
                "flowPercent": r["flow_percent"],
                "digitalSetpointPercent": r["digital_setpoint_percent"],
                "activeSetpointPercent": r["active_setpoint_percent"],
            }
            for r in rows
        ]

        if downsample and downsample > 1:
            samples = [r for i, r in enumerate(samples) if i % downsample == 0]

        return {"samples": samples, "total": len(rows), "queryInfo": {"address": device_address}}


# 单例
furnace_data = FurnaceDataService()
mfc_data = MfcDataService()
