/**
 * ProgressBar 组件
 * 显示工作流执行进度，点击唤起图表 Modal
 */

import React from 'react';
import type { ExecutionSnapshot } from '@zahnerflow/types';
import type { WorkflowTimeState } from '../state/workflowTimeModel';
import { formatCountdown, formatDuration } from '../utils/timeFormat';
import { describeExecution } from '../state/executionStateModel';

interface ProgressBarProps {
    systemState: ExecutionSnapshot | null;
    onClick?: () => void;
    workflowTime: WorkflowTimeState;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    systemState,
    onClick,
    workflowTime
}) => {
    const { remainingSeconds: displayRemainingSeconds, elapsedSeconds: displayElapsedSeconds, plannedEstimate, estimateFailed } = workflowTime;
    const execution = describeExecution(systemState);
    const { running, paused, cancelling, completed } = execution.is;
    const canShowPlan = execution.phase === 'idle';
    const hasPlannedEstimate = Boolean(canShowPlan && plannedEstimate && plannedEstimate.eta.estimatedTotalSeconds > 0);

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
        return execution.view.color;
    };

    // 获取状态文字
    const getStatusText = () => {
        if (hasPlannedEstimate || estimateFailed) return '就绪';
        if (running) return `步骤 ${currentIndex + 1}/${totalSteps}`;
        return execution.view.label;
    };

    return (
        <div
            className="progress-bar__container glass"
            data-tutorial-anchor="progress"
            onClick={onClick}
            title="点击查看图表"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {/* 进度条轨道 */}
            <div className="progress-bar__track">
                <div
                    className="progress-bar__fill"
                    style={{
                        width: `${completed ? 100 : progress}%`,
                        backgroundColor: getStatusColor(),
                        transition: 'width 0.3s ease-out'
                    }}
                />

                {/* 运行时脉冲动画 */}
                {(running || paused || cancelling) && (
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

                {(execution.is.active || (execution.is.terminal && !hasPlannedEstimate)) && (
                    <span className="progress-bar__time">
                        {cancelling
                            ? '等待当前节点结束'
                            : running || paused
                            ? workflowTime.currentStepOverdue
                              ? `已超出预估${displayRemainingSeconds > 0 ? ` · 后续约 ${formatCountdown(displayRemainingSeconds)}` : ''}`
                              : `剩余 ${formatCountdown(displayRemainingSeconds)}`
                            : formatDuration(systemState?.duration ?? displayElapsedSeconds)
                        }
                    </span>
                )}

                {hasPlannedEstimate && (
                    <span className="progress-bar__time">
                        预计 {formatDuration(plannedEstimate.eta.estimatedTotalSeconds)}
                    </span>
                )}

                {canShowPlan && estimateFailed && (
                    <span className="progress-bar__time">
                        预估不可用
                    </span>
                )}
            </div>
        </div>
    );
};
