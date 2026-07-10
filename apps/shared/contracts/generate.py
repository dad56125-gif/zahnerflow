"""
Pydantic Model → TypeScript 类型生成器

运行方式：
    cd apps/shared
    uv run python -m contracts.generate

或者从项目根目录：
    uv run python -m apps.shared.contracts.generate

生成的文件位于 packages/types/src/contracts/ 目录。
"""

import os
import sys
import types
from typing import Union, get_args

try:
    from ._base import to_camel
except ImportError:
    from contracts._base import to_camel


# ==================== 类型映射 ====================

PYTHON_TO_TS = {
    "str": "string",
    "float": "number",
    "int": "number",
    "bool": "boolean",
    "None": "null",
    "Any": "any",
    "dict": "Record<string, any>",
}


def resolve_type(annotation, local_ns: dict = None) -> str:
    """将 Python 类型注解转换为 TypeScript 类型字符串"""
    if annotation is None:
        return "void"

    # 处理字符串形式的注解（如 Python 3.10+ 的 'int'）
    if isinstance(annotation, str):
        if annotation in PYTHON_TO_TS:
            return PYTHON_TO_TS[annotation]
        return annotation

    name = getattr(annotation, "__name__", None)

    # 基础类型
    if name in PYTHON_TO_TS:
        return PYTHON_TO_TS[name]

    # NoneType
    if annotation is type(None):
        return "null"

    # Optional[X] → X | null
    origin = getattr(annotation, "__origin__", None)
    if origin in (Union, types.UnionType):
        args = get_args(annotation)
        # Optional[X] 就是 Union[X, None]
        non_none = [a for a in args if a is not type(None)]
        if len(non_none) < len(args):
            # 有 None，是 Optional
            inner = " | ".join(resolve_type(a, local_ns) for a in non_none)
            return f"{inner} | null"
        # 纯 Union
        return " | ".join(resolve_type(a, local_ns) for a in args)

    # List[X] → X[]
    if origin is list or (name == "list"):
        args = get_args(annotation)
        if args:
            return f"{resolve_type(args[0], local_ns)}[]"
        return "any[]"

    # Dict[K, V] → Record<K, V>
    if origin is dict or (name == "dict"):
        args = get_args(annotation)
        if len(args) == 2:
            key_ts = resolve_type(args[0], local_ns)
            val_ts = resolve_type(args[1], local_ns)
            return f"Record<{key_ts}, {val_ts}>"
        return "Record<string, any>"

    # 自定义类型（类名直接使用）
    if name:
        return name

    return "any"


def model_to_interface(cls) -> str:
    """将 Pydantic Model 转换为 TypeScript interface"""
    fields = cls.model_fields
    lines = []

    for field_name, field_info in fields.items():
        # 获取类型注解
        annotation = field_info.annotation
        ts_type = resolve_type(annotation)

        # 获取描述
        description = field_info.description or ""

        # 显式 alias 优先，否则统一输出 camelCase 字段
        alias = field_info.alias
        json_name = alias if alias else to_camel(field_name)

        # 添加注释
        if description:
            lines.append(f"  /** {description} */")

        # 添加字段
        optional = field_info.is_required() is False
        if optional:
            # 可选字段加 ?
            lines.append(f"  {json_name}?: {ts_type};")
        else:
            lines.append(f"  {json_name}: {ts_type};")

    class_name = cls.__name__
    return f"export interface {class_name} {{\n" + "\n".join(lines) + "\n}"


def generate_events_ts(events_module) -> str:
    """生成 WebSocket 事件名常量的 TypeScript 文件"""
    lines = [
        "/**",
        " * WebSocket 事件名常量",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/events.py",
        " */",
        "",
    ]

    for name in dir(events_module):
        if name.isupper():
            value = getattr(events_module, name)
            lines.append(f"export const {name} = '{value}';")

    return "\n".join(lines)


def generate():
    """主生成函数"""
    # 确定路径
    script_dir = os.path.dirname(os.path.abspath(__file__))
    shared_dir = os.path.dirname(script_dir)
    project_root = os.path.dirname(os.path.dirname(shared_dir))
    output_dir = os.path.join(project_root, "packages", "types", "src", "contracts")

    os.makedirs(output_dir, exist_ok=True)

    # 导入所有 contract 模块
    sys.path.insert(0, shared_dir)
    from contracts.furnace import (
        FurnaceStatus, ProgramSegment, FurnacePreset,
        FurnaceConnectRequest, FurnaceConfig, SegmentProgress,
    )
    from contracts.mfc import (
        MfcDeviceInfo, MfcStatus, MfcSetpointRequest, MfcScanRequest,
    )
    from contracts.workflow import (
        WorkstationType, NodeType, NodeCategory, NodeStatus,
        WorkflowNode, Workflow, IterationPathEntry, ExecutionSnapshot, CurrentStep, ExecutionEtaSnapshot,
        ExecutionEtaStep, WorkflowEtaEstimate,
        ExecutionStartRequest, UnrolledWorkflowStep, WorkflowUnrollPreview,
        NodeStatusUpdate, NodesResetEvent, LoopIterationEvent,
        RawStreamData, EnrichedStreamData, EisResultData, EnrichedEisData,
    )
    from contracts.common import (
        DeviceConnectionStatus, DeviceError, LogEntry, LogEntryType,
        ChartDataPoint, NotificationMessage, HistoryQueryParams,
    )
    from contracts.runtime_device import (
        RuntimeDeviceStatusEnvelope,
    )
    import contracts.events as events_module

    # ==================== 生成 furnace.ts ====================
    furnace_content = [
        "/**",
        " * 加热炉数据契约",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/furnace.py",
        " */",
        "",
    ]
    for model in [FurnaceStatus, ProgramSegment, FurnacePreset,
                  FurnaceConnectRequest, FurnaceConfig, SegmentProgress]:
        furnace_content.append(model_to_interface(model))
        furnace_content.append("")

    # 追加兼容别名
    furnace_content.append("export type FurnaceSample = FurnaceStatus;")
    furnace_content.append("")

    with open(os.path.join(output_dir, "furnace.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(furnace_content))
    print(f"  Generated: contracts/furnace.ts")

    # ==================== 生成 mfc.ts ====================
    mfc_content = [
        "/**",
        " * MFC 数据契约",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/mfc.py",
        " */",
        "",
    ]
    for model in [MfcDeviceInfo, MfcStatus, MfcSetpointRequest, MfcScanRequest]:
        mfc_content.append(model_to_interface(model))
        mfc_content.append("")

    # 追加兼容别名
    mfc_content.append("export type MfcSample = MfcStatus;")
    mfc_content.append("")

    with open(os.path.join(output_dir, "mfc.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(mfc_content))
    print(f"  Generated: contracts/mfc.ts")

    # ==================== 生成 workflow.ts ====================
    workflow_content = [
        "/**",
        " * 工作流数据契约",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/workflow.py",
        " */",
        "",
    ]
    for model in [WorkflowNode, Workflow, IterationPathEntry, CurrentStep, ExecutionEtaSnapshot, ExecutionEtaStep,
                  WorkflowEtaEstimate, ExecutionStartRequest, UnrolledWorkflowStep, WorkflowUnrollPreview,
                  ExecutionSnapshot,
                  NodeStatusUpdate, NodesResetEvent, LoopIterationEvent,
                  RawStreamData, EnrichedStreamData, EisResultData, EnrichedEisData]:
        workflow_content.append(model_to_interface(model))
        workflow_content.append("")

    # 写入枚举类型（Python 的简单类型别名无法自动转为 TS 联合类型）
    workflow_content.extend([
        "/** 工作站类型 */",
        "export type WorkstationType = 'zahner-zennium';",
        "",
        "/** 节点类型 */",
        "export type NodeType =",
        "  | 'startup' | 'shutdown'",
        "  | 'change_temperature' | 'change_gas_flow'",
        "  | 'eis_potentiostatic' | 'eis_galvanostatic'",
        "  | 'ocp_measurement'",
        "  | 'chronoamperometry' | 'chronopotentiometry'",
        "  | 'voltage_ramp' | 'current_ramp'",
        "  | 'galvanostatic_switching' | 'potentiostatic_switching'",
        "  | 'galvanostatic_step_ramp' | 'potentiostatic_step_ramp'",
        "  | 'loop_start' | 'loop_end' | 'wait_delay' | 'scheduled_start' | 'workflow_block';",
        "",
        "/** 节点分类 */",
        "export type NodeCategory = 'device' | 'basic_measurement' | 'advanced_measurement' | 'flow_control';",
        "",
        "/** 节点状态 */",
        "export type NodeStatus = 'idle' | 'running' | 'paused' | 'cancelling' | 'completed' | 'failed' | 'cancelled';",
        "",
    ])

    with open(os.path.join(output_dir, "workflow.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(workflow_content))
    print(f"  Generated: contracts/workflow.ts")

    # ==================== 生成 common.ts ====================
    common_content = [
        "/**",
        " * 通用数据契约",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/common.py",
        " */",
        "",
    ]
    for model in [DeviceError, LogEntry, ChartDataPoint, NotificationMessage, HistoryQueryParams]:
        common_content.append(model_to_interface(model))
        common_content.append("")

    # 写入简单类型别名
    common_content.extend([
        "/** 设备连接状态 */",
        "export type DeviceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';",
        "",
        "/** 日志级别 */",
        "export type LogEntryType = 'success' | 'info' | 'warning' | 'error';",
        "",
    ])

    with open(os.path.join(output_dir, "common.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(common_content))
    print(f"  Generated: contracts/common.ts")

    # ==================== 生成 runtimeDevice.ts ====================
    runtime_device_content = [
        "/**",
        " * 统一设备 runtime 契约",
        " * 自动生成 — 勿手动修改",
        f" * 来源: apps/shared/contracts/runtime_device.py",
        " */",
        "",
    ]
    for model in [RuntimeDeviceStatusEnvelope]:
        runtime_device_content.append(model_to_interface(model))
        runtime_device_content.append("")

    runtime_device_content.extend([
        "/** 设备类型 */",
        "export type RuntimeDeviceKind = 'furnace' | 'mfc' | 'zahner';",
        "",
        "/** 设备运行模式 */",
        "export type RuntimeDeviceMode = 'real' | 'simulator' | 'disconnected';",
        "",
    ])

    with open(os.path.join(output_dir, "runtimeDevice.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(runtime_device_content))
    print(f"  Generated: contracts/runtimeDevice.ts")

    # ==================== 生成 events.ts ====================
    events_content = generate_events_ts(events_module)

    with open(os.path.join(output_dir, "events.ts"), "w", encoding="utf-8") as f:
        f.write(events_content)
    print(f"  Generated: contracts/events.ts")

    # ==================== 生成 index.ts ====================
    index_content = [
        "/**",
        " * 数据契约统一导出",
        " * 自动生成 — 勿手动修改",
        " *",
        " * 所有前后端共享的类型均从此文件导出。",
        " * 修改类型时请编辑 apps/shared/contracts/*.py，然后运行:",
        " *   uv run python -m apps.shared.contracts.generate",
        " */",
        "",
        "export * from './furnace';",
        "export * from './mfc';",
        "export * from './workflow';",
        "export * from './common';",
        "export * from './runtimeDevice';",
        "export * from './events';",
        "",
    ]

    with open(os.path.join(output_dir, "index.ts"), "w", encoding="utf-8") as f:
        f.write("\n".join(index_content))
    print(f"  Generated: contracts/index.ts")

    model_count = 29
    print(f"\n✅ All types generated to: {output_dir}")
    print(f"   5 files generated, {model_count} interfaces generated")


if __name__ == "__main__":
    print("🔄 Generating TypeScript types from Pydantic models...\n")
    generate()
