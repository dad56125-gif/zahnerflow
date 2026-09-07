"""实验记录持久化到 API 的唯一转换边界，保留旧记录，输出一种字段命名。"""

import json
from datetime import datetime, timezone

from database import db
from shared.contracts.report import (
    ExecutionReport, ReportArtifact, ReportEnvironment, ReportExecutionMetadata, ReportStep, ReportWarning,
)


def read_json(value, default):
    if isinstance(value, type(default)):
        return value
    try:
        decoded = json.loads(value) if value else default
    except (TypeError, json.JSONDecodeError):
        return default
    return decoded if isinstance(decoded, type(default)) else default


# 旧记录只在数据库读边界归一化；新测量结果使用这些规范字段。
RESULT_FIELDS = {
    "outputFile": ("output_file", "full_path"),
    "csvPath": ("csv_path",),
    "outputDir": ("output_dir", "output_path", "outputPath"),
    "dataPoints": ("data_points", "points", "point_count"),
}


def normalize_stored_result(raw: dict) -> dict:
    result = dict(raw)
    for canonical, aliases in RESULT_FIELDS.items():
        if result.get(canonical) is None:
            for alias in aliases:
                if result.get(alias) is not None:
                    result[canonical] = result[alias]
                    break
        for alias in aliases:
            result.pop(alias, None)
    return result


def load_execution_report(execution_id: str) -> ExecutionReport | None:
    execution = db.conn.execute("SELECT * FROM executions WHERE id = ?", (execution_id,)).fetchone()
    if execution is None:
        return None
    steps = []
    for row in db.conn.execute("SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY unrolled_index", (execution_id,)):
        record = dict(row)
        for name, default in (("params", {}), ("iteration_path", []), ("block_path", []), ("result", {})):
            record[name] = read_json(record.get(name), default)
        record["result"] = normalize_stored_result(record["result"])
        steps.append(ReportStep.model_validate(record))

    artifacts = []
    for row in db.conn.execute("SELECT * FROM execution_artifacts WHERE execution_id = ? ORDER BY created_at", (execution_id,)):
        record = dict(row)
        record["metadata"] = normalize_stored_result(read_json(record.get("metadata"), {}))
        if record.get("file_path"):
            artifacts.append(ReportArtifact.model_validate({**record, "source": "persisted", "data_points": record["metadata"].get("dataPoints")}))
    keys = {(item.execution_id, item.node_id, item.file_path) for item in artifacts}
    for step in steps:
        for kind, field in (("output_file", "outputFile"), ("csv", "csvPath"), ("output_dir", "outputDir")):
            path = step.result.get(field)
            key = (execution_id, step.node_id, path)
            if path and key not in keys:
                artifacts.append(ReportArtifact(execution_id=execution_id, node_id=step.node_id, file_type=kind, file_path=path, created_at=step.ended_at or step.started_at, source="stepResult", data_points=step.result.get("dataPoints")))
                keys.add(key)
    warnings = [ReportWarning.model_validate({**dict(row), "metadata": read_json(row["metadata"], {})}) for row in db.conn.execute("SELECT * FROM execution_warnings WHERE execution_id = ? ORDER BY created_at", (execution_id,))]
    workflow = read_json(execution["workflow_snapshot"], {})
    path = read_json(execution["path_config"], {})
    return ExecutionReport(
        execution_metadata=ReportExecutionMetadata(
            execution_id=execution["id"], workflow_id=execution["workflow_id"],
            workflow_name=workflow.get("name") or execution["workflow_id"], owner_name=workflow.get("ownerName") or "",
            project_name=path.get("projectName") or "", individual_name=path.get("individualName") or "",
            status=execution["status"], started_at=execution["start_time"], ended_at=execution["end_time"], duration_ms=execution["duration"], error=execution["error"],
        ),
        workflow_snapshot=workflow, path_config=path, unrolled_steps=steps, artifacts=artifacts,
        environment_snapshot=ReportEnvironment.model_validate(read_json(execution["environment_snapshot"], {})),
        warning_flags=warnings, summary_metrics=read_json(execution["summary_metrics"], {}), generated_at=datetime.now(timezone.utc).isoformat(),
    )
