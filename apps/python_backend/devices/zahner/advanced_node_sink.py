"""高级节点单文件逐点保存。

一个句柄只服务一个高级节点的一次执行（含其全部展开子工步）：开始时写一次
表头，每条有效原始测量数据立即追加一行并 flush，收尾统一 flush、fsync、
关闭。写入、同步或关闭错误向上抛出，交由现有执行失败流程处理。

保存路径在构造时一次性确定，只由本次执行身份与父高级节点首个展开步骤决定，
同一父执行内稳定且排他创建，绝不覆盖已有实验。
"""

from __future__ import annotations

import csv
import json
import math
import os
import re
import time
from typing import Any, Callable

from . import logic


class AdvancedNodeFileError(RuntimeError):
    """高级节点 CSV 写入、同步、关闭或数据有效性失败。"""


_STEP_RAMP_TYPES = {
    "galvanostatic_step_ramp": ("chronopotentiometry", "current"),
    "potentiostatic_step_ramp": ("chronoamperometry", "potential"),
}
_SWITCHING_TYPES = {
    "galvanostatic_switching": ("chronopotentiometry", "current"),
    "potentiostatic_switching": ("chronoamperometry", "potential"),
}
ADVANCED_NODE_TYPES = frozenset(_STEP_RAMP_TYPES) | frozenset(_SWITCHING_TYPES)

# 报告与保存共用的列名常量，避免两处各写一份字符串。
TIME_COLUMN = "Time (s)"
STEP_TIME_COLUMN = "Step time (s)"
STEP_COLUMN = "Step"
CYCLE_COLUMN = "Cycle"
PHASE_COLUMN = "Phase"
POTENTIAL_COLUMN = "Potential (V)"
CURRENT_COLUMN = "Current (A)"

# 四种高级节点都按现有 chrono 统计口径统计实测电流。
_STAT_SERIES = "current"

_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


def sink_kind(parent_node_type: str | None) -> str | None:
    if parent_node_type in _STEP_RAMP_TYPES:
        return "step_ramp"
    if parent_node_type in _SWITCHING_TYPES:
        return "switching"
    return None


def csv_fieldnames(parent_node_type: str) -> list[str]:
    kind = sink_kind(parent_node_type)
    if kind is None:
        raise ValueError(f"不支持的父高级节点类型：{parent_node_type}")
    setpoint = _setpoint_column(parent_node_type)
    if kind == "switching":
        return [TIME_COLUMN, STEP_TIME_COLUMN, STEP_COLUMN, CYCLE_COLUMN, PHASE_COLUMN, setpoint, POTENTIAL_COLUMN, CURRENT_COLUMN]
    return [TIME_COLUMN, STEP_TIME_COLUMN, STEP_COLUMN, setpoint, POTENTIAL_COLUMN, CURRENT_COLUMN]


def _setpoint_column(parent_node_type: str) -> str:
    return "Set current (A)" if parent_node_type.startswith("galvanostatic") else "Set potential (V)"


def _output_measurement_type(parent_node_type: str) -> str:
    return _STEP_RAMP_TYPES.get(parent_node_type, _SWITCHING_TYPES.get(parent_node_type))[0]


def _path_digest(value: Any) -> str:
    """把 iterationPath/blockPath 变成可比较的稳定字符串。"""
    return json.dumps(value or [], ensure_ascii=False, sort_keys=True, default=str)


def parent_execution_key(step: dict) -> tuple:
    """父高级节点本次执行的稳定身份，用于判断是否复用同一句柄。

    同一次父执行的每个子工步共享 parentNodeId/parentNodeType 与所在循环
    迭代、工作流块路径；重复父节点由 iterationPath/blockPath 区分。
    """

    return (
        step.get("parentNodeId"),
        step.get("parentNodeType"),
        _path_digest(step.get("iterationPath")),
        _path_digest(step.get("blockPath")),
    )


def point_rows(
    parent_node_type: str,
    point: dict[str, Any],
    *,
    step_index: int,
    cycle_index: int | None,
    cumulative_time: float,
) -> dict[str, Any]:
    """把一条已验证的原始读数转换为 CSV 行，保留 A/V/s 原始精度。

    ``Time (s)`` 是本次高级执行开始后的实际累计时间，``Step time (s)`` 是当前
    工步自身的局部时间；两列都直接使用原始读数，不做四舍五入。
    """

    kind = sink_kind(parent_node_type)
    if kind is None:
        raise ValueError(f"不支持的父高级节点类型：{parent_node_type}")
    row = {
        TIME_COLUMN: cumulative_time,
        STEP_TIME_COLUMN: point["elapsed"],
        STEP_COLUMN: int(step_index) + 1,
        _setpoint_column(parent_node_type): point["setpoint"],
        POTENTIAL_COLUMN: point["potential"],
        CURRENT_COLUMN: point["current"],
    }
    if kind == "switching":
        row[CYCLE_COLUMN] = (cycle_index or 0) + 1
        row[PHASE_COLUMN] = int(step_index) % 2 + 1
    return row


def _require_finite(value: object, field: str) -> float:
    """测量读数必须是有限数值；NaN/Inf/非数值一律明确失败，不写无效行。"""

    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AdvancedNodeFileError(f"高级节点 {field} 不是有效数值：{value!r}")
    number = float(value)
    if not math.isfinite(number):
        raise AdvancedNodeFileError(f"高级节点 {field} 不是有限数值：{value!r}")
    return number


class _OnlineStats:
    """常量内存累计：只保留计数、总和与极值，不保存逐点历史。"""

    def __init__(self, series: str) -> None:
        self._series = series
        self._value: tuple[int, float, float, float] | None = None

    def add(self, value: float) -> None:
        number = float(value)
        count, total, low, high = self._value or (0, 0.0, number, number)
        self._value = (count + 1, total + number, min(low, number), max(high, number))

    def result(self) -> dict[str, float]:
        if self._value is None:
            return {}
        count, total, low, high = self._value
        return {"avg": total / count, "min": low, "max": high, "count": count}


class AdvancedNodeSink:
    """持有唯一文件句柄，保存路径与统计均不随采样点增长。"""

    def __init__(
        self,
        parent_node_type: str,
        params: dict[str, Any],
        *,
        execution_id: str = "",
        unrolled_index: int | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.parent_node_type = parent_node_type
        self.kind = sink_kind(parent_node_type)
        if self.kind is None:
            raise ValueError(f"不支持的父高级节点类型：{parent_node_type}")
        self.fieldnames = csv_fieldnames(parent_node_type)
        self.params = dict(params or {})
        self.execution_id = execution_id
        # 父高级节点本次执行首个展开步骤的编号；同一次执行内稳定，不随子工步变化。
        self.unrolled_index = unrolled_index
        self.path = self._build_path()

        self.saved_points = 0  # 父执行累计已保存行数
        self.step_points = 0  # 当前工步已保存行数

        # Time (s) 是父执行开始后的实际单调时间，包含工步之间与切换的时间。
        self._clock = clock
        self._start_monotonic = clock()

        self._stat_series = _STAT_SERIES
        self._stats = _OnlineStats(_STAT_SERIES)
        self._step_key: tuple[int, int | None] | None = None

        self._file = None
        self._writer = None
        self._closed = False

    # ---- 生命周期 -------------------------------------------------------

    def open(self) -> None:
        if self._writer is not None:
            raise AdvancedNodeFileError(f"高级节点 CSV 已经打开：{self.path}")
        try:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            # 排他创建：同名文件已存在即报错，绝不覆盖已有实验。
            handle = open(self.path, "x", newline="", encoding="utf-8")
        except OSError as exc:
            raise AdvancedNodeFileError(f"无法创建高级节点 CSV：{self.path}：{exc}") from exc
        self._file = handle
        try:
            writer = csv.DictWriter(handle, fieldnames=self.fieldnames)
            writer.writeheader()
            handle.flush()
        except (OSError, ValueError) as exc:
            self._closed = True
            self._file = None
            try:
                handle.close()
            except OSError:
                pass
            raise AdvancedNodeFileError(f"写入高级节点 CSV 表头失败：{self.path}：{exc}") from exc
        self._writer = writer

    def close(self) -> None:
        """公共执行收尾只调用通用 close；收尾错误向上传播。"""
        self.finalize()

    def finalize(self) -> None:
        """最终 flush + fsync + close；同步与关闭错误都保留并向上抛出。"""
        if self._closed:
            return
        handle = self._file
        self._closed = True
        self._writer = None
        self._file = None
        if handle is None:
            return
        sync_error: OSError | None = None
        close_error: OSError | None = None
        try:
            handle.flush()
            os.fsync(handle.fileno())
        except OSError as exc:
            sync_error = exc
        finally:
            try:
                handle.close()
            except OSError as exc:
                close_error = exc
        if sync_error is not None and close_error is not None:
            raise AdvancedNodeFileError(
                f"同步并关闭高级节点 CSV 失败：{self.path}：{sync_error}；{close_error}"
            ) from sync_error
        if sync_error is not None:
            raise AdvancedNodeFileError(f"同步高级节点 CSV 失败：{self.path}：{sync_error}") from sync_error
        if close_error is not None:
            raise AdvancedNodeFileError(f"关闭高级节点 CSV 失败：{self.path}：{close_error}") from close_error

    # ---- 步与点 ---------------------------------------------------------

    def reset_step(self, step_index: int = 0, cycle_index: int | None = None) -> None:
        """开始一个工步：清零本步计数与统计。

        必须在本步任何一次 ``append`` 之前调用；即使本步零点失败也不会继承
        上一步统计。父执行的累计时间只来自构造时的单调时钟，不受本步影响。
        """

        self._step_key = (int(step_index), cycle_index)
        self.step_points = 0
        self._stats = _OnlineStats(self._stat_series)

    def append(self, point: dict[str, Any], step_index: int = 0, cycle_index: int | None = None) -> None:
        """追加一条原始读数并立即 flush；不读回、不重写已有数据。

        追加前校验时间、设定值、实测电压和电流都是有限数值；任一无效即明确
        失败且不写该行，不允许把 NaN/Inf 写入实验文件。``saved_points`` /
        ``step_points`` 与在线统计在 ``writerow`` 成功后立即更新，之后再
        ``flush()``：若本次 flush 失败而收尾 flush 成功，CSV 行数与归档
        点数仍一致。``dataPoints`` 语义为已完成追加的行数，异常时不宣称
        持久化成功。
        """

        if self._writer is None or self._file is None:
            raise AdvancedNodeFileError(f"高级节点 CSV 尚未打开：{self.path}")
        key = (int(step_index), cycle_index)
        if key != self._step_key:
            self.reset_step(step_index, cycle_index)
        local_elapsed = _require_finite(point.get("elapsed"), STEP_TIME_COLUMN)
        setpoint = _require_finite(point.get("setpoint"), _setpoint_column(self.parent_node_type))
        potential = _require_finite(point.get("potential"), POTENTIAL_COLUMN)
        current = _require_finite(point.get("current"), CURRENT_COLUMN)
        cumulative_time = _require_finite(self._clock() - self._start_monotonic, TIME_COLUMN)
        row = point_rows(
            self.parent_node_type,
            {"elapsed": local_elapsed, "setpoint": setpoint, "potential": potential, "current": current},
            step_index=int(step_index),
            cycle_index=cycle_index,
            cumulative_time=cumulative_time,
        )
        try:
            self._writer.writerow(row)
        except (OSError, ValueError) as exc:
            raise AdvancedNodeFileError(f"写入高级节点 CSV 失败：{self.path}：{exc}") from exc
        # writerow 成功即视为“已完成追加”，先计数与在线统计再 flush：
        # 若本次 flush 失败但收尾 flush 成功，CSV 行数与归档点数仍一致。
        self.saved_points += 1
        self.step_points += 1
        self._stats.add(current)
        try:
            self._file.flush()
        except (OSError, ValueError) as exc:
            raise AdvancedNodeFileError(f"刷新高级节点 CSV 失败：{self.path}：{exc}") from exc

    def statistics(self) -> dict[str, float]:
        """当前工步实测电流统计；零点是空字典，不混入父执行累计。"""

        return self._stats.result()

    # ---- 路径 -----------------------------------------------------------

    def _build_path(self) -> str:
        """用现有命名辅助得到基础路径，再拼上本次高级执行身份。

        ``logic.build_filename`` 的源码与普通测量完全一致；身份只加在高级
        sink 自己算出的文件名上，保证同一父执行稳定、不同执行不重名。
        """

        base = logic._prepare_output_path(self.params, _output_measurement_type(self.parent_node_type))
        stem, suffix = os.path.splitext(base)
        identity = f"{self.execution_id or 'exec'}__{self.unrolled_index if self.unrolled_index is not None else 'u'}"
        return f"{stem}__{_INVALID_FILENAME_CHARS.sub('_', identity)}{suffix}"
