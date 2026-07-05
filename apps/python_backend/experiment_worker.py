"""
实验执行工具函数。
保留 build_output_path、normalize_path 等路径构建工具。
"""
from datetime import datetime
import re


# ============================================================
# 路径工具函数
# ============================================================

def normalize_path(p: str) -> str:
    return p.replace('/', '\\').rstrip('\\')


def safe_path_segment(value, fallback: str = "_unnamed") -> str:
    text = str(value or "").strip()
    if not text:
        text = fallback
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text or fallback


def get_test_type_from_measurement(measurement_type: str) -> str:
    test_type_map = {
        'eis_potentiostatic': 'eis',
        'eis_galvanostatic': 'eis',
        'ocp_measurement': 'ocp',
        'chronoamperometry': 'ca',
        'chronopotentiometry': 'cp',
        'voltage_ramp': 'lsv',
        'current_ramp': 'cv'
    }
    return test_type_map.get(measurement_type, 'general')


def build_advanced_node_folder_name(parent_node_type: str, options: dict) -> str:
    config = options.get('nodeConfig') or {}
    timestamp = datetime.utcnow().strftime('%y%m%d_%H%M%S')

    def format_current(val):
        if val == 0: return '0mA'
        abs_val = abs(val)
        if abs_val >= 1 and val == int(val): return f"{int(val)}A"
        if abs_val >= 0.001: return f"{int(round(val * 1000))}mA"
        if abs_val >= 1e-6: return f"{int(round(val * 1e6))}uA"
        return f"{int(round(val * 1e9))}nA"

    def format_voltage(val):
        if val == 0: return '0mV'
        abs_val = abs(val)
        if abs_val >= 1 and val == int(val): return f"{int(val)}V"
        if abs_val >= 0.001: return f"{int(round(val * 1000))}mV"
        return f"{int(round(val * 1e6))}uV"

    if parent_node_type == 'galvanostatic_step_ramp':
        start = format_current(config.get('startCurrent', 0.1))
        end = format_current(config.get('endCurrent', 1.0))
        step = format_current(config.get('stepCurrent', 0.1))
        hold = int(round(config.get('holdTime', 30)))
        return f"ChronoRamp_{start}-{end}_step{step}_{hold}s_{timestamp}"
    elif parent_node_type == 'potentiostatic_step_ramp':
        start = format_voltage(config.get('startPotential', 0))
        end = format_voltage(config.get('endPotential', 1.0))
        step = format_voltage(config.get('stepPotential', 0.1))
        hold = int(round(config.get('holdTime', 30)))
        return f"ChronoRamp_{start}-{end}_step{step}_{hold}s_{timestamp}"
    elif parent_node_type == 'galvanostatic_switching':
        c1 = format_current(config.get('current1', 0))
        c2 = format_current(config.get('current2', 0.01))
        t1 = int(round(config.get('holdTime1', 30)))
        t2 = int(round(config.get('holdTime2', 30)))
        cycles = config.get('cycles', 5)
        return f"ChronoSwitch_{c1}-{c2}_{t1}s-{t2}s_cycles_{cycles}_{timestamp}"
    elif parent_node_type == 'potentiostatic_switching':
        v1 = format_voltage(config.get('potential1', 0))
        v2 = format_voltage(config.get('potential2', 0.5))
        t1 = int(round(config.get('holdTime1', 30)))
        t2 = int(round(config.get('holdTime2', 30)))
        cycles = config.get('cycles', 5)
        return f"ChronoSwitch_{v1}-{v2}_{t1}s-{t2}s_cycles_{cycles}_{timestamp}"
    else:
        return f"Advanced_{timestamp}"


def build_output_path(options: dict) -> str:
    basePath = options.get('basePath', 'C:\\data\\archive')
    projectName = options.get('projectName')
    individualName = options.get('individualName')
    test_type = options.get('testType')
    measurement_type = options.get('measurementType')
    workflow_id = options.get('workflowId')
    workflow_name = options.get('workflowName')
    workflow_timestamp = options.get('workflowTimestamp')
    parent_node_type = options.get('parentNodeType')

    if test_type:
        final_test_type = test_type
    elif measurement_type:
        final_test_type = get_test_type_from_measurement(measurement_type)
    else:
        final_test_type = 'general'
    final_test_type = safe_path_segment(final_test_type, "general")

    normalized_base = normalize_path(basePath)
    project_segment = safe_path_segment(projectName) if projectName else ""
    individual_segment = safe_path_segment(individualName) if individualName else ""
    workflow_segment = safe_path_segment(workflow_id or workflow_name or 'unknown_workflow', "unknown_workflow")

    if project_segment and individual_segment:
        basePath_res = f"{normalized_base}\\{project_segment}\\{individual_segment}\\{final_test_type}"
    elif project_segment:
        basePath_res = f"{normalized_base}\\{project_segment}\\_unnamed\\{final_test_type}"
    else:
        timestamp = safe_path_segment(workflow_timestamp or datetime.utcnow().strftime('%y%m%d_%H%M%S'))
        basePath_res = f"{normalized_base}\\_unassigned\\{workflow_segment}\\{timestamp}\\{final_test_type}"

    if parent_node_type:
        folder_name = safe_path_segment(build_advanced_node_folder_name(parent_node_type, options))
        basePath_res = f"{basePath_res}\\{folder_name}"

    return basePath_res


# ============================================================
# 系统文件夹对话框
# ============================================================

def open_system_folder_dialog() -> str:
    """Open a native Windows folder picker dialog.
    Raises Exception('USER_CANCELLED') if the user cancels.
    """
    import subprocess

    ps_script = (
        '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null;'
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;'
        '$dialog.Description = "选择数据存储路径";'
        '$dialog.ShowNewFolderButton = $true;'
        '$result = $dialog.ShowDialog();'
        'if ($result -eq "OK") { $dialog.SelectedPath } else { exit 1 }'
    )
    proc = subprocess.run(
        ['powershell', '-NoProfile', '-Command', ps_script],
        capture_output=True, text=True, timeout=120
    )
    if proc.returncode != 0:
        raise Exception('USER_CANCELLED')
    path = proc.stdout.strip()
    if not path:
        raise Exception('USER_CANCELLED')
    return path
