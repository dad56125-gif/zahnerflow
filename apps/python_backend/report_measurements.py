"""从本次执行归档的 CSV 恢复报告曲线，不读取实时缓存或修改测量值。

普通测量沿用原有逐文件读取与 32 MB 上限；父高级节点的多个子工步共享一个整
文件，按 ``csvPath`` 分组后单次流式扫描，按 ``Step`` 列把行分配回各子步曲线，
并以 ``Step time (s)`` 作为该子步自身的本地时间。列格式由实际表头判定：新高级
整文件流式读取且不受 32 MB 上限影响，旧历史高级子步的 lowercase 小文件仍走
原有读取边界与上限。
"""
import csv
import math
import os
from pathlib import Path

from devices.zahner.advanced_node_sink import (
    ADVANCED_NODE_TYPES,
    CURRENT_COLUMN,
    POTENTIAL_COLUMN,
    STEP_COLUMN,
    STEP_TIME_COLUMN,
)
from shared.contracts.report import ReportCurveSeries, ReportMeasurementCurve, ReportStep

MEASUREMENTS = {'ocp_measurement', 'chronoamperometry', 'chronopotentiometry',
                'voltage_ramp', 'current_ramp', 'eis_potentiostatic', 'eis_galvanostatic'}

STANDARD_FILE_SIZE_LIMIT = 32 * 1024 * 1024


def load_measurement_curves(steps: list[ReportStep]) -> list[ReportMeasurementCurve]:
    curves = []
    advanced_groups: dict[str, list[tuple[ReportStep, ReportMeasurementCurve]]] = {}
    advanced_paths: dict[str, str] = {}
    for step in steps:
        if step.node_type not in MEASUREMENTS or step.status in {'pending', 'skipped'}:
            continue
        curve = ReportMeasurementCurve(unrolled_index=step.unrolled_index,
            node_id=step.node_id or '', node_type=step.node_type,
            iteration_path=step.iteration_path)
        curves.append(curve)
        raw_path = step.result.get('csvPath') or step.result.get('outputFile')
        if not raw_path or Path(str(raw_path)).suffix.lower() != '.csv':
            curve.error = '没有保存可绘图的 CSV 数据'
            continue
        if str((step.params or {}).get('parentNodeType') or '') in ADVANCED_NODE_TYPES:
            key = os.path.normcase(os.path.abspath(str(raw_path)))
            advanced_paths.setdefault(key, str(raw_path))
            advanced_groups.setdefault(key, []).append((step, curve))
            continue
        read_standard_curve(curve, step, Path(str(raw_path)))
    for key, members in advanced_groups.items():
        read_advanced_group(Path(advanced_paths[key]), members)
    return curves


def read_standard_curve(curve: ReportMeasurementCurve, step: ReportStep, path: Path) -> None:
    try:
        if path.stat().st_size > STANDARD_FILE_SIZE_LIMIT:
            raise ValueError('数据文件超过报告读取上限（32 MB）')
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            headers = reader.fieldnames or []
            rows = list(reader)
        curve.series = build_standard_series(rows, headers, step)
    except (OSError, UnicodeError, csv.Error, ValueError) as exc:
        curve.series = []
        curve.error = '测量文件不存在或不可读取' if isinstance(exc, OSError) else str(exc)


def read_advanced_group(path: Path, members: list[tuple[ReportStep, ReportMeasurementCurve]]) -> None:
    try:
        size = path.stat().st_size
        with path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            headers = reader.fieldnames or []
            if is_advanced_header(headers):
                assign_advanced_points(reader, members)
            else:
                # 旧历史高级子步小文件：仍按原有读取边界与 32 MB 上限处理。
                if size > STANDARD_FILE_SIZE_LIMIT:
                    raise ValueError('数据文件超过报告读取上限（32 MB）')
                rows = list(reader)
                for step, curve in members:
                    try:
                        curve.series = build_standard_series(rows, headers, step)
                    except ValueError as exc:
                        curve.series = []
                        curve.error = str(exc)
    except (OSError, UnicodeError, csv.Error, ValueError) as exc:
        message = '测量文件不存在或不可读取' if isinstance(exc, OSError) else str(exc)
        for _step, curve in members:
            curve.series = []
            curve.error = message


def is_advanced_header(headers: list[str]) -> bool:
    return all(name in headers for name in
               (STEP_COLUMN, STEP_TIME_COLUMN, POTENTIAL_COLUMN, CURRENT_COLUMN))


def assign_advanced_points(reader, members: list[tuple[ReportStep, ReportMeasurementCurve]]) -> None:
    by_number: dict[int, tuple[ReportStep, ReportMeasurementCurve]] = {}
    for step, curve in members:
        number = step_curve_number(step)
        if number is None:
            curve.series = []
            curve.error = '缺少工步编号，无法在高级整文件中定位该工步'
            continue
        by_number[number] = (step, curve)
    voltage_points: dict[int, list[list[float]]] = {number: [] for number in by_number}
    current_points: dict[int, list[list[float]]] = {number: [] for number in by_number}
    errors: dict[int, str] = {}
    for line, row in enumerate(reader, 2):
        number, valid = parse_step_cell(row.get(STEP_COLUMN))
        if not valid:
            # 工步编号非法或缺失时无法归属到某一子步，按行号明确报错，不静默错分。
            raise ValueError(f'第 {line} 行的工步编号无效：{row.get(STEP_COLUMN)!r}')
        if number not in by_number or number in errors:
            continue
        try:
            local_time = float(row[STEP_TIME_COLUMN])
            voltage = float(row[POTENTIAL_COLUMN])
            current = float(row[CURRENT_COLUMN])
        except (TypeError, ValueError, KeyError):
            errors[number] = f'第 {line} 行不是有效测量数值'
            continue
        if not (math.isfinite(local_time) and math.isfinite(voltage) and math.isfinite(current)):
            errors[number] = f'第 {line} 行包含非有限数值'
            continue
        voltage_points[number].append([local_time, voltage])
        current_points[number].append([local_time, current])
    for number, (_step, curve) in by_number.items():
        if number in errors:
            curve.series = []
            curve.error = errors[number]
            continue
        if not voltage_points[number]:
            curve.series = []
            curve.error = '该工步在高级整文件中没有测量点'
            continue
        curve.series = [
            ReportCurveSeries(name='电压–时间', x_label='时间 (s)', y_label='电压 (V)',
                              points=voltage_points[number]),
            ReportCurveSeries(name='电流–时间', x_label='时间 (s)', y_label='电流 (A)',
                              points=current_points[number]),
        ]


def step_curve_number(step: ReportStep) -> int | None:
    """params.stepIndex 是 0 基整数，CSV 的 Step 列是 1 基。

    只有有限、非负的整数编号才能唯一映射到某一行工步；缺失、小数或 Inf 等
    无法唯一归属的编号返回 ``None``，由调用方明确报错，绝不静默归到相邻工步。
    """

    raw = (step.params or {}).get('stepIndex')
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        index = raw
    else:
        try:
            number = float(raw)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(number) or not number.is_integer():
            return None
        index = int(number)
    if index < 0:
        return None
    return index + 1


def parse_step_cell(value) -> tuple[int | None, bool]:
    """解析 CSV 的 Step 单元格：只接受有限正整数，返回（工步号，是否合法）。"""

    if value is None:
        return None, False
    text = str(value).strip()
    if not text:
        return None, False
    try:
        number = float(text)
    except (TypeError, ValueError, OverflowError):
        return None, False
    if not math.isfinite(number) or number <= 0 or not number.is_integer():
        return None, False
    return int(number), True


def build_standard_series(rows: list[dict], headers: list[str], step: ReportStep) -> list[ReportCurveSeries]:
    if not rows:
        raise ValueError('数据文件没有测量点')

    def column(*names):
        return next((name for name in names if name in headers), None)

    def series(name, x, y, x_label, y_label, negate=False, equal=False):
        if x is None or y is None:
            raise ValueError('数据文件缺少绘图所需的列')
        points = []
        for number, row in enumerate(rows, 2):
            try:
                xv, yv = float(row[x]), float(row[y])
            except (TypeError, ValueError, KeyError):
                raise ValueError(f'第 {number} 行不是有效测量数值') from None
            if not math.isfinite(xv) or not math.isfinite(yv):
                raise ValueError(f'第 {number} 行包含非有限数值')
            points.append([xv, -yv if negate else yv])
        return ReportCurveSeries(name=name, x_label=x_label, y_label=y_label,
                                 points=points, equal_scale=equal)

    time = column('time', 'time (s)', 't')
    voltage = column('potential', 'voltage', 'v')
    current = column('current', 'i')
    if step.node_type.startswith('eis_'):
        return [series('Nyquist', column('z_real', "impedance' (Ω)"),
                       column('z_imag', "impedance'' (Ω)"), "Z′ (Ω)", '−Z″ (Ω)', negate=True, equal=True)]
    if step.node_type == 'voltage_ramp':
        return [series('LSV', voltage, current, '电压 (V)', '电流 (A)')]
    result = [series('电压–时间', time, voltage, '时间 (s)', '电压 (V)')]
    if current:
        result.append(series('电流–时间', time, current, '时间 (s)', '电流 (A)'))
    return result
