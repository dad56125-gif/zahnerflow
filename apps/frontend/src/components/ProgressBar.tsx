/**
 * ProgressBar 组件
 * 显示工作流执行进度，点击唤起图表 Modal
 */

import React from 'react';
import { ExecutionSnapshot } from '../types/Interfaces';
import { formatDuration, estimateWorkflowSeconds } from '../workflow/timelineCalculator';
import { useCanvasStore } from '../canvas/canvasStore';

interface ProgressBarProps {
    systemState: ExecutionSnapshot | null;
    onClick?: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    systemState,
    onClick
}) => {
    // 确保 nodes 始终为数组，防止 undefined 导致崩溃
    const nodes = useCanvasStore(state => (state && state.nodes) ? state.nodes : []) || [];

    // 计算进度
    const currentIndex = systemState?.currentStep?.index ?? 0;
    const totalNodes = systemState?.currentStep?.total ?? nodes.length;
    const progress = totalNodes > 0 ? (currentIndex / totalNodes) * 100 : 0;

    // 计算时间
    const estimatedSeconds = estimateWorkflowSeconds(nodes);
    const elapsedSeconds = systemState?.duration ?? 0;
    const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);

    // 状态判断
    const isRunning = systemState?.status === 'running';
    const isCompleted = systemState?.status === 'completed';
    const isFailed = systemState?.status === 'failed';
    const isIdle = !systemState || systemState.status === 'idle';

    // 获取状态颜色
    const getStatusColor = () => {
        if (isFailed) return 'var(--color-danger)';
        if (isCompleted) return 'var(--color-success)';
        if (isRunning) return 'var(--color-primary)';
        return 'var(--color-neutral)';
    };

    // 获取状态文字
    const getStatusText = () => {
        if (isFailed) return '执行失败';
        if (isCompleted) return '已完成';
        if (isRunning) return `步骤 ${currentIndex + 1}/${totalNodes}`;
        return '就绪';
    };

    return (
        <div
            className="progress-bar-container glass"
            onClick={onClick}
            title="点击查看图表"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {/* 进度条轨道 */}
            <div className="progress-bar-track">
                <div
                    className="progress-bar-fill"
                    style={{
                        width: `${isCompleted ? 100 : progress}%`,
                        backgroundColor: getStatusColor(),
                        transition: 'width 0.3s ease-out'
                    }}
                />

                {/* 运行时脉冲动画 */}
                {isRunning && (
                    <div
                        className="progress-bar-pulse"
                        style={{ left: `${progress}%` }}
                    />
                )}
            </div>

            {/* 进度信息 */}
            <div className="progress-bar-info">
                <span className="progress-bar-status" style={{ color: getStatusColor() }}>
                    {getStatusText()}
                </span>

                {(isRunning || isCompleted) && (
                    <span className="progress-bar-time">
                        {isRunning
                            ? `剩余 ${formatDuration(remainingSeconds)}`
                            : formatDuration(elapsedSeconds / 1000)
                        }
                    </span>
                )}

                {isIdle && totalNodes > 0 && (
                    <span className="progress-bar-time">
                        预计 {formatDuration(estimatedSeconds)}
                    </span>
                )}
            </div>
        </div>
    );
};
