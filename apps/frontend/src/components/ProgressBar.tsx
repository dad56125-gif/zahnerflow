/**
 * ProgressBar 组件
 * 显示工作流执行进度，点击唤起图表 Modal
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { ExecutionSnapshot, WorkflowEtaEstimate, WorkflowNode } from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import { formatCountdown, formatDuration } from '../utils/timeFormat';
import { deriveExecutionUiState } from '../state/executionStateBridge';

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
    const executionUi = deriveExecutionUiState(systemState);
    const { isRunning, isPaused, isCancelling, isCompleted } = executionUi;
    const canShowPlan = !suppressPlannedEstimate && executionUi.phase === 'idle';
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
            const shouldTick = executionUi.isRunning || executionUi.isCancelling;
            const deltaSeconds = shouldTick ? Math.max(0, (Date.now() - updatedAtMs) / 1000) : 0;
            setDisplayRemainingSeconds(Math.max(0, (eta.estimatedRemainingSeconds ?? 0) - deltaSeconds));
            setDisplayElapsedSeconds(Math.max(0, (eta.elapsedSeconds ?? systemState?.duration ?? 0) + deltaSeconds));
        };

        updateDisplay();
        if (!executionUi.isRunning && !executionUi.isCancelling) return;

        const timer = setInterval(updateDisplay, 1000);
        return () => clearInterval(timer);
    }, [
        executionUi.isCancelling,
        executionUi.isRunning,
        systemState?.duration,
        systemState?.eta,
        systemState?.timestamp,
    ]);

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
        return executionUi.color;
    };

    // 获取状态文字
    const getStatusText = () => {
        if (hasPlannedEstimate || estimateFailed) return '就绪';
        if (isRunning) return `步骤 ${currentIndex + 1}/${totalSteps}`;
        return executionUi.label;
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

                {(executionUi.isActive || (executionUi.isTerminal && !hasPlannedEstimate)) && (
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
