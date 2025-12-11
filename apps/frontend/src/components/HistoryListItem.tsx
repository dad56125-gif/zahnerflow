/**
 * 历史记录列表项组件
 * 从 WorkflowManagerUI.tsx 提取的列表项渲染逻辑
 */

import React from 'react';
import { WorkflowHistory } from './useWorkflowHistory';

interface HistoryListItemProps {
    item: WorkflowHistory;
    isDeleting: boolean;
    onLoad: (item: WorkflowHistory) => void;
    onDelete: (item: WorkflowHistory) => void;
    onShowDeleteConfirm: (item: WorkflowHistory) => void;
    onCancelDelete: () => void;
}

export const HistoryListItem: React.FC<HistoryListItemProps> = ({
    item,
    isDeleting,
    onLoad,
    onDelete,
    onShowDeleteConfirm,
    onCancelDelete
}) => {
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
                        <span className="delete-confirm-text">确认删除？</span>
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
