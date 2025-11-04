import React, { useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '../../services/stores';

interface WorkflowIdDisplayProps {
  className?: string;
}

export const WorkflowIdDisplay: React.FC<WorkflowIdDisplayProps> = ({ className = '' }) => {
  const { currentWorkflow, updateWorkflow } = useWorkflowStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步当前工作流名称到编辑状态
  useEffect(() => {
    if (currentWorkflow && !isEditing) {
      setEditValue(currentWorkflow.name || '');
    }
  }, [currentWorkflow, isEditing]);

  // 双击开始编辑
  const handleDoubleClick = () => {
    if (currentWorkflow) {
      setEditValue(currentWorkflow.name || '');
      setIsEditing(true);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (currentWorkflow && editValue.trim() !== currentWorkflow.name) {
      try {
        await updateWorkflow(currentWorkflow.id, {
          name: editValue.trim(),
        });
      } catch (error) {
        console.error('更新工作流名称失败:', error);
        // 可以在这里添加错误提示
      }
    }
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancel = () => {
    setEditValue(currentWorkflow?.name || '');
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
    // 延迟保存，避免与点击事件冲突
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 200);
  };

  // 自动聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 如果没有当前工作流，显示占位符
  if (!currentWorkflow) {
    return (
      <div className={`workflow-id-display placeholder ${className}`}>
        <span className="display-text">未选择工作流</span>
      </div>
    );
  }

  return (
    <div className={`workflow-id-display ${isEditing ? 'editing' : ''} ${className}`}>
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
          title="双击编辑工作流名称"
        >
          <span className="display-text">
            {currentWorkflow.name || currentWorkflow.id}
          </span>
          <span className="edit-hint">✏️</span>
        </div>
      )}
    </div>
  );
};