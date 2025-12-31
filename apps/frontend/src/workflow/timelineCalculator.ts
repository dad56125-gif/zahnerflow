/**
 * 工作流时间线计算模块
 * 
 * 功能：
 * - 预估工作流总运行时间
 * - 每个节点完成时更新预估时间（用实际时间替换预估）
 * - 时间格式化（<5h 显示分钟，>=5h 显示小时）
 */

import { WorkflowNode } from '../types/Interfaces';
import { unrollLoops } from '@shared/loopUnroller';

// ==================== 类型定义 ====================

export interface NodeTimeInfo {
    nodeId: string;
    nodeType: string;
    estimatedSeconds: number;  // 预估时间（秒）
    actualSeconds?: number;    // 实际时间（秒），完成后填充
    isCompleted: boolean;
}

export interface TimelineState {
    workflowId: string | null;
    startTime: Date | null;
    nodes: NodeTimeInfo[];
    totalEstimatedSeconds: number;
    totalActualSeconds: number;      // 已完成节点的实际时间累计
    remainingEstimatedSeconds: number; // 未完成节点的预估时间
}

export interface TimelineDisplay {
    totalFormatted: string;           // 总预估时间（格式化）
    elapsedFormatted: string;         // 已用时间
    remainingFormatted: string;       // 剩余预估时间
    progress: number;                 // 进度百分比 (0-100)
    currentNodeIndex: number;
    totalNodes: number;
}

// ==================== 常量配置 ====================

/** 各节点类型的默认预估时间（秒） */
const NODE_TIME_ESTIMATES: Record<string, number | ((config: Record<string, any>) => number)> = {
    // 设备控制 - 固定时间
    startup: 3,
    shutdown: 3,

    // 温度控制 - 动态计算
    change_temperature: (config) => {
        const calculatedDuration = config.calculated_duration || 0;
        const stabilizationTime = config.stabilization_time || 30;
        return calculatedDuration + stabilizationTime;
    },

    // 气体流量 - 稳定时间
    change_gas_flow: (config) => config.stabilization_time || 10,

    // EIS测量 - 预估5分钟
    eis_potentiostatic: 300,  // 5 min
    eis_galvanostatic: 300,   // 5 min

    // 其他测量 - 使用 measurement_duration
    ocp_measurement: (config) => config.measurement_duration || 60,
    chronoamperometry: (config) => config.measurement_duration || 60,
    chronopotentiometry: (config) => config.measurement_duration || 60,
    voltage_ramp: (config) => config.measurement_duration || 130,
    current_ramp: (config) => config.measurement_duration || 60,

    // 流程控制
    wait_delay: (config) => config.duration || 1,
    loop_start: 0,
    loop_end: 0,

    // 高级测量 - 切换节点
    galvanostatic_switching: (config) => {
        const cycles = config.cycles || 5;
        const holdTime1 = config.hold_time_1 || 30;
        const holdTime2 = config.hold_time_2 || 30;
        return cycles * (holdTime1 + holdTime2);
    },
    potentiostatic_switching: (config) => {
        const cycles = config.cycles || 5;
        const holdTime1 = config.hold_time_1 || 30;
        const holdTime2 = config.hold_time_2 || 30;
        return cycles * (holdTime1 + holdTime2);
    },

    // 高级测量 - 阶梯节点
    galvanostatic_step_ramp: (config) => {
        const start = config.start_current ?? 0.1;
        const end = config.end_current ?? 1.0;
        const step = Math.abs(config.step_current ?? 0.1);
        const holdTime = config.hold_time || 30;
        const stepCount = step > 0 ? Math.floor(Math.abs(end - start) / step) + 1 : 1;
        return stepCount * holdTime;
    },
    potentiostatic_step_ramp: (config) => {
        const start = config.start_potential ?? 0;
        const end = config.end_potential ?? 1.0;
        const step = Math.abs(config.step_potential ?? 0.1);
        const holdTime = config.hold_time || 30;
        const stepCount = step > 0 ? Math.floor(Math.abs(end - start) / step) + 1 : 1;
        return stepCount * holdTime;
    },
};

/** 5小时阈值（秒） */
const FIVE_HOURS_IN_SECONDS = 5 * 60 * 60;

// ==================== 工具函数 ====================

/**
 * 计算单个节点的预估时间（秒）
 */
export function estimateNodeTime(node: WorkflowNode): number {
    const estimator = NODE_TIME_ESTIMATES[node.type];

    if (typeof estimator === 'function') {
        return estimator(node.config || {});
    }

    if (typeof estimator === 'number') {
        return estimator;
    }

    // 未知节点类型，默认1秒
    console.warn(`[TimelineCalculator] Unknown node type: ${node.type}, using 1s estimate`);
    return 1;
}

/**
 * 格式化时间显示
 * - 总时间 < 5小时：显示 "XX 分钟" 或 "X 小时 XX 分钟"
 * - 总时间 >= 5小时：显示 "X.X 小时"
 */
export function formatDuration(totalSeconds: number, totalWorkflowSeconds?: number): string {
    const checkAgainst = totalWorkflowSeconds ?? totalSeconds;
    const seconds = Math.max(0, Math.round(totalSeconds));

    if (checkAgainst >= FIVE_HOURS_IN_SECONDS) {
        // >= 5小时，显示小时（保留1位小数）
        const hours = seconds / 3600;
        return `${hours.toFixed(1)} 小时`;
    }

    // < 5小时，显示分钟
    const minutes = Math.ceil(seconds / 60);

    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0
            ? `${hours} 小时 ${remainingMinutes} 分钟`
            : `${hours} 小时`;
    }

    return `${minutes} 分钟`;
}

// ==================== 核心类 ====================

export class TimelineCalculator {
    private state: TimelineState;

    constructor() {
        this.state = this.createEmptyState();
    }

    private createEmptyState(): TimelineState {
        return {
            workflowId: null,
            startTime: null,
            nodes: [],
            totalEstimatedSeconds: 0,
            totalActualSeconds: 0,
            remainingEstimatedSeconds: 0,
        };
    }

    /**
     * 初始化时间线（工作流开始前调用）
     */
    initialize(workflowId: string, nodes: WorkflowNode[]): void {
        const nodeInfos: NodeTimeInfo[] = nodes.map(node => ({
            nodeId: node.id,
            nodeType: node.type,
            estimatedSeconds: estimateNodeTime(node),
            isCompleted: false,
        }));

        const totalEstimated = nodeInfos.reduce((sum, n) => sum + n.estimatedSeconds, 0);

        this.state = {
            workflowId,
            startTime: null,
            nodes: nodeInfos,
            totalEstimatedSeconds: totalEstimated,
            totalActualSeconds: 0,
            remainingEstimatedSeconds: totalEstimated,
        };
    }

    /**
     * 标记工作流开始
     */
    start(): void {
        this.state.startTime = new Date();
    }

    /**
     * 节点完成时调用，用实际时间更新预估
     */
    completeNode(nodeId: string, actualSeconds: number): void {
        const node = this.state.nodes.find(n => n.nodeId === nodeId);
        if (!node || node.isCompleted) return;

        // 更新节点状态
        node.actualSeconds = actualSeconds;
        node.isCompleted = true;

        // 重新计算时间
        this.recalculate();
    }

    /**
     * 根据步骤索引完成节点
     */
    completeNodeByIndex(index: number, actualSeconds: number): void {
        if (index < 0 || index >= this.state.nodes.length) return;

        const node = this.state.nodes[index];
        if (node.isCompleted) return;

        node.actualSeconds = actualSeconds;
        node.isCompleted = true;

        this.recalculate();
    }

    /**
     * 重新计算时间
     */
    private recalculate(): void {
        let totalActual = 0;
        let remainingEstimated = 0;

        for (const node of this.state.nodes) {
            if (node.isCompleted && node.actualSeconds !== undefined) {
                totalActual += node.actualSeconds;
            } else {
                remainingEstimated += node.estimatedSeconds;
            }
        }

        this.state.totalActualSeconds = totalActual;
        this.state.remainingEstimatedSeconds = remainingEstimated;
    }

    /**
     * 获取当前时间线显示信息
     */
    getDisplay(): TimelineDisplay {
        const { nodes, startTime, totalEstimatedSeconds, totalActualSeconds, remainingEstimatedSeconds } = this.state;

        // 当前进度
        const completedCount = nodes.filter(n => n.isCompleted).length;
        const progress = nodes.length > 0 ? (completedCount / nodes.length) * 100 : 0;

        // 已用时间
        const elapsedSeconds = startTime
            ? (Date.now() - startTime.getTime()) / 1000
            : 0;

        // 新的总预估 = 已完成的实际时间 + 未完成的预估时间
        const updatedTotalSeconds = totalActualSeconds + remainingEstimatedSeconds;

        return {
            totalFormatted: formatDuration(updatedTotalSeconds),
            elapsedFormatted: formatDuration(elapsedSeconds, updatedTotalSeconds),
            remainingFormatted: formatDuration(remainingEstimatedSeconds, updatedTotalSeconds),
            progress: Math.round(progress),
            currentNodeIndex: completedCount,
            totalNodes: nodes.length,
        };
    }

    /**
     * 获取初始预估总时间（工作流开始前）
     */
    getInitialEstimate(): string {
        return formatDuration(this.state.totalEstimatedSeconds);
    }

    /**
     * 获取原始状态（供调试或高级用途）
     */
    getState(): Readonly<TimelineState> {
        return this.state;
    }

    /**
     * 重置状态
     */
    reset(): void {
        this.state = this.createEmptyState();
    }
}

// ==================== 便捷工厂函数 ====================

/**
 * 快速计算工作流预估时间（不创建实例）
 * ✅ 使用 unrollLoops 考虑循环迭代
 */
export function estimateWorkflowDuration(nodes: WorkflowNode[]): string {
    const totalSeconds = estimateWorkflowSeconds(nodes);
    return formatDuration(totalSeconds);
}

/**
 * 快速获取工作流预估秒数
 * ✅ 使用 unrollLoops 展开循环后计算真实执行时间
 * ✅ 高级节点直接使用整体时间，不按子步骤重复计算
 */
export function estimateWorkflowSeconds(nodes: WorkflowNode[]): number {
    const { steps } = unrollLoops(nodes);

    // 追踪已计算过的高级节点原始索引，避免重复计算
    const calculatedAdvancedNodes = new Set<number>();

    return steps.reduce((sum, step: any) => {
        const node = nodes[step.originalIndex];

        // 如果是高级节点展开后的子步骤
        if (step.parentNodeType) {
            // 只在第一个子步骤时计算整个高级节点的时间
            if (!calculatedAdvancedNodes.has(step.originalIndex)) {
                calculatedAdvancedNodes.add(step.originalIndex);
                return sum + estimateNodeTime(node);
            }
            // 其他子步骤跳过（时间已在第一个子步骤中计算）
            return sum;
        }

        // 普通节点正常计算
        return sum + estimateNodeTime(node);
    }, 0);
}

