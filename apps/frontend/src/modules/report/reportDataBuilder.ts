/**
 * 实验报告模块 - 数据构建工具
 * 从 workflow 和 executionHistory 构建报告数据
 */

import { ReportData, ReportNodeInfo, NODE_TYPE_LABELS } from './types';
import { Workflow, WorkflowNode } from '../../types/Interfaces';

interface ExecutionHistoryItem {
    executionId: string;
    workflowId: string;
    status: 'completed' | 'failed' | 'cancelled';
    startTime: string;
    endTime?: string;
    duration?: number;
    error?: string;
}

interface NodeExecutionResult {
    nodeId: string;
    status: 'success' | 'failed' | 'skipped';
    duration?: number;
}

/**
 * 构建报告数据
 */
export function buildReportData(
    workflow: Workflow,
    execution: ExecutionHistoryItem,
    nodeResults: NodeExecutionResult[] = [],
    user: string = 'Unknown'
): ReportData {
    const nodes = buildNodeInfoList(workflow.nodes, nodeResults);

    return {
        // 封面信息
        projectName: workflow.name || 'Untitled Project',
        individualName: workflow.individualName || '',
        workflowName: workflow.name || 'Untitled Workflow',
        user,

        // 执行摘要
        executionId: execution.executionId,
        status: execution.status,
        startTime: new Date(execution.startTime),
        endTime: execution.endTime ? new Date(execution.endTime) : new Date(),
        duration: execution.duration || 0,

        // 节点明细
        nodes,
    };
}

/**
 * 构建节点明细列表（处理循环缩进）
 */
function buildNodeInfoList(
    nodes: WorkflowNode[],
    nodeResults: NodeExecutionResult[]
): ReportNodeInfo[] {
    const result: ReportNodeInfo[] = [];
    let currentIndentLevel = 0;
    const loopStack: number[] = []; // 记录循环嵌套深度

    nodes.forEach((node, index) => {
        // 循环开始：增加缩进
        if (node.type === 'loop_start') {
            result.push(buildNodeInfo(node, index, currentIndentLevel, nodeResults));
            loopStack.push(currentIndentLevel);
            currentIndentLevel++;
            return;
        }

        // 循环结束：恢复缩进
        if (node.type === 'loop_end') {
            currentIndentLevel = loopStack.pop() ?? 0;
            result.push(buildNodeInfo(node, index, currentIndentLevel, nodeResults));
            return;
        }

        // 普通节点
        result.push(buildNodeInfo(node, index, currentIndentLevel, nodeResults));
    });

    return result;
}

/**
 * 构建单个节点信息
 */
function buildNodeInfo(
    node: WorkflowNode,
    index: number,
    indentLevel: number,
    nodeResults: NodeExecutionResult[]
): ReportNodeInfo {
    const nodeResult = nodeResults.find(r => r.nodeId === node.id);

    return {
        index: index + 1,
        type: node.type,
        label: NODE_TYPE_LABELS[node.type] || node.type,
        keyParams: extractKeyParams(node),
        status: nodeResult?.status || 'pending',
        duration: nodeResult?.duration,
        indentLevel,
    };
}

/**
 * 提取节点关键参数（用于显示）
 */
function extractKeyParams(node: WorkflowNode): string {
    const config = node.config || {};
    const params: string[] = [];

    switch (node.type) {
        case 'startup':
            if (config.zahner_host) params.push(`host: ${config.zahner_host}`);
            break;

        case 'loop_start':
            if (config.loop_count) params.push(`次数: ${config.loop_count}`);
            break;

        case 'wait_delay':
            if (config.delay_seconds) params.push(`${config.delay_seconds}s`);
            break;

        case 'ocp_measurement':
            if (config.measurement_duration) params.push(`${config.measurement_duration}s`);
            break;

        case 'eis_potentiostatic':
        case 'eis_galvanostatic':
            if (!config.enable_dc_bias) params.push('DC: OCV');
            else if (config.eis_potential) params.push(`DC: ${config.eis_potential}V`);
            if (config.ac_amplitude) params.push(`AC: ${config.ac_amplitude * 1000}mV`);
            break;

        case 'chronoamperometry':
            if (config.polarization_voltage) params.push(`${config.polarization_voltage}V`);
            if (config.duration) params.push(`${config.duration}s`);
            break;

        case 'chronopotentiometry':
            if (config.polarization_current) params.push(`${config.polarization_current * 1000}mA`);
            if (config.duration) params.push(`${config.duration}s`);
            break;

        case 'voltage_ramp':
        case 'current_ramp':
            if (config.start_voltage !== undefined && config.end_voltage !== undefined) {
                params.push(`${config.start_voltage}V → ${config.end_voltage}V`);
            }
            break;

        case 'change_temperature':
            if (config.target_temperature) params.push(`${config.target_temperature}℃`);
            if (config.rate) params.push(`${config.rate}℃/min`);
            break;

        case 'change_gas_flow':
            if (config.gas_type) params.push(config.gas_type);
            if (config.target_flow_rate) params.push(`${config.target_flow_rate} sccm`);
            break;
    }

    return params.join(', ') || '-';
}

/**
 * 格式化持续时间
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}min`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: Date): string {
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}
