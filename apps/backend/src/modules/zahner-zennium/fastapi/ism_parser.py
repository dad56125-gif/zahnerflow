# -*- coding: utf-8 -*-
"""
ISM 文件解析器
解析 Zahner .ism 文件，返回核心数据并生成完整 CSV
"""
import os
import csv
from typing import Dict, Any

try:
    from zahner_analysis.file_import.ism_import import IsmImport
    HAS_ZAHNER_ANALYSIS = True
except ImportError:
    HAS_ZAHNER_ANALYSIS = False
    print("[ISM Parser] Warning: zahner_analysis not installed. Run: pip install zahner_analysis")


def parse_ism_file(ism_path: str) -> Dict[str, Any]:
    """
    解析 ISM 文件
    
    :param ism_path: ISM 文件路径
    :return: {
        "frequency": [...],
        "z_real": [...],
        "z_imag": [...],
        "csv_path": "...",
        "point_count": int
    }
    :raises: FileNotFoundError, ImportError
    """
    if not HAS_ZAHNER_ANALYSIS:
        raise ImportError("zahner_analysis library required. Install with: pip install zahner_analysis")
    
    if not os.path.exists(ism_path):
        raise FileNotFoundError(f"ISM file not found: {ism_path}")
    
    print(f"[ISM Parser] Reading: {ism_path}")
    data = IsmImport(ism_path)
    
    # 获取核心数据
    frequency = data.getFrequencyArray().tolist()
    complex_z = data.getComplexImpedanceArray()
    z_real = complex_z.real.tolist()
    z_imag = complex_z.imag.tolist()
    
    # 生成完整 CSV（本地保存，包含所有 8 列）
    csv_path = ism_path.replace('.ism', '.csv').replace('.ISM', '.csv')
    _write_full_csv(csv_path, data)
    
    print(f"[ISM Parser] Parsed {len(frequency)} points")
    
    # 仅返回核心三列（用于传输）
    return {
        "frequency": frequency,
        "z_real": z_real,
        "z_imag": z_imag,
        "csv_path": csv_path,
        "point_count": len(frequency)
    }


def _write_full_csv(csv_path: str, data: IsmImport) -> None:
    """
    写入完整 CSV 文件（8列标准格式）
    
    列: frequency (Hz), impedance (Ω), phase/rad, phase/deg, Z' (Ω), Z'' (Ω), time (s), significance
    """
    frequency = data.getFrequencyArray()
    impedance = data.getImpedanceArray()
    phase_rad = data.getPhaseArray(degree=False)
    phase_deg = data.getPhaseArray(degree=True)
    complex_z = data.getComplexImpedanceArray()
    significance = data.getSignificanceArray()
    
    # 计算相对时间
    timestamps = data.getMeasurementDateTimeArray()
    start_time = data.getMeasurementStartDateTime()
    time_seconds = [(t - start_time).total_seconds() for t in timestamps]
    
    # 确保目录存在
    dir_path = os.path.dirname(csv_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        # 表头
        writer.writerow([
            "frequency (Hz)",
            "impedance (Ω)", 
            "phase / rad (rad)",
            "phase / deg (°)",
            "impedance' (Ω)",
            "impedance'' (Ω)",
            "time (s)",
            "significance"
        ])
        # 数据行
        for i in range(len(frequency)):
            writer.writerow([
                f"{frequency[i]:.6e}",
                f"{impedance[i]:.6e}",
                f"{phase_rad[i]:.6f}",
                f"{phase_deg[i]:.4f}",
                f"{complex_z[i].real:.6e}",
                f"{complex_z[i].imag:.6e}",
                f"{time_seconds[i]:.3f}",
                int(significance[i])
            ])
    
    print(f"[ISM Parser] CSV saved: {csv_path}")
