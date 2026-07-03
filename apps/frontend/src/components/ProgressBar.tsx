/**
 * ProgressBar 组件
 * 显示工作流执行进度，点击唤起图表 Modal
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { ExecutionSnapshot, WorkflowEtaEstimate, WorkflowNode } from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import { formatDuration } from '../utils/timeFormat';

interface ProgressBarProps {
    systemState: ExecutionSnapshot | null;
    nodes?: WorkflowNode[];
    onClick?: () => void;
    suppressPlannedEstimate?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    systemState,
    nodes = [],
    onClick,
    suppressPlannedEstimate = false
}) => {
    const [displayRemainingSeconds, setDisplayRemainingSeconds] = useState(0);
    const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);
    const [plannedEstimate, setPlannedEstimate] = useState<WorkflowEtaEstimate | null>(null);
    const [estimateFailed, setEstimateFailed] = useState(false);
    const isRunning = systemState?.status === 'running';
    const isPaused = systemState?.status === 'paused';
    const isCancelling = systemState?.status === 'cancelling';
    const isCompleted = systemState?.status === 'completed';
    const isFailed = systemState?.status === 'failed';
    const canShowPlan = !suppressPlannedEstimate && !isRunning && !isPaused && !isCancelling;
    const hasPlannedEstimate = Boolean(canShowPlan && plannedEstimate && plannedEstimate.eta.estimatedTotalSeconds > 0);
    const nodeFingerprint = useMemo(
        () => JSON.stringify(nodes.map(node => ({ id: node.id, type: node.type, config: node.config }))),
        [nodes]
    );

    useEffect(() => {
        const eta = systemState?.eta;
        if (!eta) {
            setDisplayRemainingSeconds(0);
            setDisplayElapsedSeconds(systemState?.duration ?? 0);
            return;
        }

        const updatedAtMs = new Date(eta.updatedAt || systemState?.timestamp || new Date().toISOString()).getTime();
        const updateDisplay = () => {
            const shouldTick = systemState?.status === 'running' || systemState?.status === 'cancelling';
            const deltaSeconds = shouldTick ? Math.max(0, (Date.now() - updatedAtMs) / 1000) : 0;
            setDisplayRemainingSeconds(Math.max(0, (eta.estimatedRemainingSeconds ?? 0) - deltaSeconds));
            setDisplayElapsedSeconds(Math.max(0, (eta.elapsedSeconds ?? systemState?.duration ?? 0) + deltaSeconds));
        };

        updateDisplay();
        if (systemState?.status !== 'running' && systemState?.status !== 'cancelling') return;

        const timer = setInterval(updateDisplay, 1000);
        return () => clearInterval(timer);
    }, [systemState?.eta, systemState?.status, systemState?.timestamp, systemState?.duration]);

    useEffect(() => {
        if (!canShowPlan || nodes.length === 0) {
            setPlannedEstimate(null);
            setEstimateFailed(false);
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            try {
                const estimate = await runtimeClient.executions.estimate<WorkflowEtaEstimate>({ nodes });
                if (!cancelled) {
                    setPlannedEstimate(estimate);
                    setEstimateFailed(false);
                }
            } catch {
                if (!cancelled) {
                    setPlannedEstimate(null);
                    setEstimateFailed(true);
                }
            }
        }, 350);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [canShowPlan, nodeFingerprint, nodes]);

    // ✅ 优先使用展开后的索引 (准确反映循环执行进度)
    const currentStep = systemState?.currentStep;
    const useUnrolled = currentStep?.unrolledIndex !== undefined && currentStep?.unrolledTotal !== undefined;

    const currentIndex = useUnrolled
        ? currentStep.unrolledIndex!
        : (currentStep?.index ?? 0);
    const totalSteps = useUnrolled
        ? currentStep.unrolledTotal!
        : (currentStep?.total ?? 0);

    const etaTotalSeconds = Math.max(0, displayElapsedSeconds + displayRemainingSeconds);
    const timeProgress = etaTotalSeconds > 0 ? (displayElapsedSeconds / etaTotalSeconds) * 100 : 0;
    const stepProgress = totalSteps > 0 ? (currentIndex / totalSteps) * 100 : 0;
    const progress = etaTotalSeconds > 0 ? timeProgress : stepProgress;

    // 获取状态颜色
    const getStatusColor = () => {
        if (hasPlannedEstimate || estimateFailed) return 'var(--color-neutral)';
        if (isFailed) return 'var(--color-danger)';
        if (isCompleted) return 'var(--color-success)';
        if (isCancelling) return 'var(--color-warning)';
        if (isRunning || isPaused) return 'var(--color-primary)';
        return 'var(--color-neutral)';
    };

    // 获取状态文字
    const getStatusText = () => {
        if (hasPlannedEstimate || estimateFailed) return '就绪';
        if (isFailed) return '执行失败';
        if (isCompleted) return '已完成';
        if (isCancelling) return '停止中';
        if (isPaused) return '已暂停';
        if (isRunning) return `步骤 ${currentIndex + 1}/${totalSteps}`;
        return '就绪';
    };

    return (
        <div
            className="progress-bar__container glass"
            onClick={onClick}
            title="点击查看图表"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {/* 进度条轨道 */}
            <div className="progress-bar__track">
                <div
                    className="progress-bar__fill"
                    style={{
                        width: `${isCompleted ? 100 : progress}%`,
                        backgroundColor: getStatusColor(),
                        transition: 'width 0.3s ease-out'
                    }}
                />

                {/* 运行时脉冲动画 */}
                {(isRunning || isPaused || isCancelling) && (
                    <div
                        className="progress-bar__pulse"
                        style={{ left: `${progress}%` }}
                    />
                )}
            </div>

            {/* 进度信息 */}
            <div className="progress-bar__info">
                <span className="progress-bar__status" style={{ color: getStatusColor() }}>
                    {getStatusText()}
                </span>

                {(isRunning || isPaused || isCancelling || (isCompleted && !hasPlannedEstimate)) && (
                    <span className="progress-bar__time">
                        {isCancelling
                            ? '等待当前节点结束'
                            : isRunning || isPaused
                            ? `剩余 ${formatCountdown(displayRemainingSeconds)}`
                            : formatDuration(systemState?.duration ?? displayElapsedSeconds)
                        }
                    </span>
                )}

                {hasPlannedEstimate && (
                    <span className="progress-bar__time">
                        预计 {formatDuration(plannedEstimate.eta.estimatedTotalSeconds)}
                    </span>
                )}

                {canShowPlan && estimateFailed && nodes.length > 0 && (
                    <span className="progress-bar__time">
                        预估不可用
                    </span>
                )}
            </div>
        </div>
    );
};

function formatCountdown(totalSeconds: number): string {
    const seconds = Math.max(0, Math.ceil(totalSeconds));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return remainingSeconds > 0 ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes} 分`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`;
}
