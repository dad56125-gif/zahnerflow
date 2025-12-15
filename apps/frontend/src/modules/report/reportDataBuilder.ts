/**
 * 实验报告模块 - 数据构建工具
 * 从 workflow 和 executionHistory 构建报告数据
 * 
 * 使用 loopUnroller 展开循环，生成真实的执行步骤列表
 */

import { ReportData, ReportNodeInfo, NODE_TYPE_LABELS } from './types';
import { Workflow, WorkflowNode } from '../../types/Interfaces';
import { unrollLoops, formatIterationPath, UnrolledStep } from '../../shared/loopUnroller';

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
    status: 'success' | 'failed' | 'skipped' | 'pending';
    duration?: number;
    startTime?: string;
    endTime?: string;
}

/**
 * 构建报告数据（使用展开后的节点列表）
 */
export function buildReportData(
    workflow: Workflow,
    execution: ExecutionHistoryItem,
    nodeResults: NodeExecutionResult[] = [],
    user: string = 'Unknown'
): ReportData {
    // 使用 loopUnroller 展开节点
    const unrollResult = unrollLoops(workflow.nodes);
    const nodes = buildNodeInfoListFromUnrolled(
        workflow.nodes,
        unrollResult.steps,
        nodeResults
    );

    return {
        // 封面信息
        projectName: workflow.project_name || workflow.name || 'Untitled Project',
        individualName: workflow.individualName || '',
        workflowName: workflow.name || 'Untitled Workflow',
        user,

        // 执行摘要
        executionId: execution.executionId,
        status: execution.status,
        startTime: new Date(execution.startTime),
        endTime: execution.endTime ? new Date(execution.endTime) : new Date(),
        duration: execution.duration || 0,

        // 节点明细（展开后的）
        nodes,
    };
}

/**
 * 从展开后的步骤列表构建报告节点信息
 */
function buildNodeInfoListFromUnrolled(
    originalNodes: WorkflowNode[],
    unrolledSteps: UnrolledStep[],
    nodeResults: NodeExecutionResult[]
): ReportNodeInfo[] {
    return unrolledSteps.map((step, stepIndex) => {
        const originalNode = originalNodes[step.originalIndex];
        const nodeResult = nodeResults[stepIndex];  // 使用展开后的索引

        // 格式化迭代路径
        const iterationInfo = step.iterationPath.length > 0
            ? ` [轮次: ${formatIterationPath(step.iterationPath)}]`
            : '';

        return {
            index: stepIndex + 1,
            type: step.nodeType,
            label: (NODE_TYPE_LABELS[step.nodeType] || step.nodeType) + iterationInfo,
            keyParams: extractKeyParams(originalNode),
            status: nodeResult?.status || 'pending',
            duration: nodeResult?.duration ?? calculateDuration(nodeResult),
            indentLevel: step.loopDepth,
        };
    });
}

/**
 * 计算节点耗时（结束时间 - 开始时间）
 */
function calculateDuration(result?: NodeExecutionResult): number | undefined {
    if (!result?.startTime || !result?.endTime) return undefined;
    const start = new Date(result.startTime).getTime();
    const end = new Date(result.endTime).getTime();
    return (end - start) / 1000;  // 转换为秒
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
