import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import { useOnClickOutside } from '../shared/useOnClickOutside';

interface WorkflowNameDisplayProps {
    className?: string;
}

export const WorkflowNameDisplay: React.FC<WorkflowNameDisplayProps> = ({ className = '' }) => {
    const {
        currentWorkflow,
        updateWorkflow,
        draftWorkflowName,
        setDraftWorkflowName
    } = useWorkflowStore();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 同步名称到编辑状态
    useEffect(() => {
        if (!isEditing) {
            if (currentWorkflow) {
                setEditValue(currentWorkflow.name || '');
            } else {
                setEditValue(draftWorkflowName || '');
            }
        }
    }, [currentWorkflow, draftWorkflowName, isEditing]);

    // 双击开始编辑（始终可编辑，无论有无 currentWorkflow）
    const handleDoubleClick = () => {
        if (currentWorkflow) {
            setEditValue(currentWorkflow.name || '');
        } else {
            setEditValue(draftWorkflowName || '');
        }
        setIsEditing(true);
    };

    // 保存编辑
    const handleSave = async () => {
        const trimmedValue = editValue.trim();

        if (currentWorkflow) {
            // 有工作流：更新到后端
            if (trimmedValue !== currentWorkflow.name) {
                try {
                    await updateWorkflow(currentWorkflow.id, {
                        name: trimmedValue,
                    });
                } catch (error) {
                    console.error('更新工作流名称失败:', error);
                }
            }
        } else {
            // 无工作流：保存到草稿名称
            setDraftWorkflowName(trimmedValue || null);
        }

        setIsEditing(false);
    };

    // 取消编辑
    const handleCancel = () => {
        if (currentWorkflow) {
            setEditValue(currentWorkflow.name || '');
        } else {
            setEditValue(draftWorkflowName || '');
        }
        setIsEditing(false);
    };

    // 键盘事件处理
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    // 失去焦点时保存
    const handleBlur = () => {
        if (isEditing) {
            handleSave();
        }
    };

    // 自动聚焦输入框
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // 使用点击外部关闭Hook
    useOnClickOutside(containerRef, handleSave, isEditing);

    // 显示名称（有工作流用工作流名，无工作流用草稿名或 placeholder）
    const displayName = currentWorkflow?.name || draftWorkflowName || '未命名工作流';
    const isPlaceholder = !currentWorkflow && !draftWorkflowName;

    return (
        <div
            ref={containerRef}
            className={`workflow-name-display ${isEditing ? 'editing' : ''} ${isPlaceholder ? 'placeholder' : ''} ${className}`}
        >
            {isEditing ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                    className="workflow-name-input"
                    placeholder="输入工作流名称"
                    maxLength={50}
                />
            ) : (
                <div
                    className="display-content"
                    onDoubleClick={handleDoubleClick}
                    title={currentWorkflow ? `双击编辑工作流名称 (ID: ${currentWorkflow.id})` : '双击编辑工作流名称'}
                >
                    <span className="display-text">
                        {displayName}
                    </span>
                    <span className="edit-hint">✏️</span>
                </div>
            )}
        </div>
    );
};

// 保留旧名称导出以兼容
export const WorkflowIdDisplay = WorkflowNameDisplay;
