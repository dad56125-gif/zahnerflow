"""从本次执行归档的 CSV 恢复报告曲线，不读取实时缓存或修改测量值。"""
import csv
import math
from pathlib import Path

from shared.contracts.report import ReportCurveSeries, ReportMeasurementCurve, ReportStep

MEASUREMENTS = {'ocp_measurement', 'chronoamperometry', 'chronopotentiometry',
                'voltage_ramp', 'current_ramp', 'eis_potentiostatic', 'eis_galvanostatic'}


def load_measurement_curves(steps: list[ReportStep]) -> list[ReportMeasurementCurve]:
    curves = []
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
        try:
            path = Path(raw_path)
            if path.stat().st_size > 32 * 1024 * 1024:
                raise ValueError('数据文件超过报告读取上限（32 MB）')
            with path.open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.DictReader(stream)
                headers = reader.fieldnames or []
                rows = list(reader)
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
                curve.series = [series('Nyquist', column('z_real', "impedance' (Ω)"),
                    column('z_imag', "impedance'' (Ω)"), "Z′ (Ω)", '−Z″ (Ω)', negate=True, equal=True)]
            elif step.node_type == 'voltage_ramp':
                curve.series = [series('LSV', voltage, current, '电压 (V)', '电流 (A)')]
            else:
                curve.series = [series('电压–时间', time, voltage, '时间 (s)', '电压 (V)')]
                if current:
                    curve.series.append(series('电流–时间', time, current, '时间 (s)', '电流 (A)'))
        except (OSError, UnicodeError, csv.Error, ValueError) as exc:
            curve.series = []
            curve.error = '测量文件不存在或不可读取' if isinstance(exc, OSError) else str(exc)
    return curves
