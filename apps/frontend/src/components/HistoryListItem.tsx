/**
 * 历史记录列表项组件
 * 从 WorkflowManagerUI.tsx 提取的列表项渲染逻辑
 */

import React, { useState } from 'react';
import { WorkflowHistory } from './useWorkflowHistory';

interface HistoryListItemProps {
    item: WorkflowHistory;
    isDeleting: boolean;
    onLoad: (item: WorkflowHistory) => void;
    onDelete: (item: WorkflowHistory) => void;
    onShowDeleteConfirm: (item: WorkflowHistory) => void;
    onCancelDelete: () => void;
    onToggleFavorite?: (item: WorkflowHistory) => void;
}

export const HistoryListItem: React.FC<HistoryListItemProps> = ({
    item,
    isDeleting,
    onLoad,
    onDelete,
    onShowDeleteConfirm,
    onCancelDelete,
    onToggleFavorite
}) => {
    // 增加内部动画状态，避免渲染时自动触发动画
    const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);

    return (
        <div
            className="history-item"
            onDoubleClick={() => onLoad(item)}
            title="双击加载工作流"
        >
            <div className="history-info">
                <div className="history-name">
                    {item.name}
                    <span className="history-id">{item.id}</span>
                </div>
                <div className="history-details">
                    <span>节点: {item.node_count || 0}</span>
                    <span>循环: {item.loop_count || 0}</span>
                </div>
                <div className="history-time">
                    {new Date(item.created_at).toLocaleString()}
                </div>
            </div>
            <div className="history-actions">
                {/* 收藏按钮 - 删除确认时隐藏 */}
                {onToggleFavorite && !isDeleting && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // 仅在从未收藏切换到已收藏时播放动画
                            if (!item.is_favorite) {
                                setIsPlayingAnimation(true);
                                setTimeout(() => setIsPlayingAnimation(false), 500); // 动效时长结束后清除
                            }
                            onToggleFavorite(item);
                        }}
                        className={`favorite-btn ${item.is_favorite ? 'is-favorited' : ''} ${isPlayingAnimation ? 'animate-pop' : ''}`}
                        title={item.is_favorite ? '取消收藏' : '收藏'}
                    >
                        ✦
                    </button>
                )}

                <button
                    onClick={() => onShowDeleteConfirm(item)}
                    className="delete-user-btn"
                    title="删除记录"
                    style={{ display: isDeleting ? 'none' : 'flex' }}
                >
                    ×
                </button>
                {isDeleting && (
                    <div className="delete-confirm">
                        <div className="delete-confirm-content">
                            <span className="delete-confirm-text">确认删除？</span>
                            {item.is_favorite && (
                                <span className="delete-confirm-warning">⚠ 这是收藏的工作流</span>
                            )}
                        </div>
                        <button
                            onClick={() => onDelete(item)}
                            className="delete-confirm-btn confirm"
                            title="确认删除"
                        >
                            ✓
                        </button>
                        <button
                            onClick={onCancelDelete}
                            className="delete-confirm-btn cancel"
                            title="取消删除"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

        </div>
    );
};
