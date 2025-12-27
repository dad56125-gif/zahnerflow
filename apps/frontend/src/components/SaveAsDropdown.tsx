/**
 * SaveAsDropdown 组件
 * 另存为工作流按钮，带下拉快速提示
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Portal } from './Portal';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import { useCanvasStore } from '../state/canvasStore';
import { useUser } from '../shared/UserContext';

// 保存结果类型
type SaveAsResult = 'created' | 'error';

interface SaveAsDropdownProps {
    disabled?: boolean;
}

// 结果消息配置
const RESULT_MESSAGES: Record<SaveAsResult, { icon: string; text: string; className: string }> = {
    created: { icon: '✅', text: '已创建副本', className: 'success' },
    error: { icon: '❌', text: '另存为失败', className: 'error' }
};

export const SaveAsDropdown: React.FC<SaveAsDropdownProps> = ({
    disabled = false
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [saveResult, setSaveResult] = useState<SaveAsResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const { currentWorkflow, createWorkflow, draftWorkflowName } = useWorkflowStore();
    const { nodes } = useCanvasStore();
    const { currentUser, filePathConfig } = useUser();

    // 使用下拉位置 hook
    const dropdown = useDropdownPosition({
        triggerRef: buttonRef,
        dropdownRef: dropdownRef,
        offset: 8,
        minWidth: 180
    });

    // 自动关闭下拉菜单
    useEffect(() => {
        if (saveResult && dropdown.isOpen) {
            const timer = setTimeout(() => {
                dropdown.startClose();
                // 延迟清除结果，等待关闭动画完成
                setTimeout(() => setSaveResult(null), 300);
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [saveResult, dropdown.isOpen]);

    // 另存为逻辑：始终创建新工作流
    const handleSaveAs = useCallback(async () => {
        if (disabled || isSaving) return;

        setIsSaving(true);

        try {
            const baseName = currentWorkflow?.name || draftWorkflowName?.trim() || '未命名工作流';
            const newName = `${baseName}_副本`;

            await createWorkflow({
                name: newName,
                nodes: nodes,
                ownerName: currentUser || undefined,
                project_name: filePathConfig?.project_name || undefined
            });

            setSaveResult('created');
            dropdown.open();
            console.log(`另存为新工作流: ${newName}`);
        } catch (error) {
            console.error('另存为失败:', error);
            setSaveResult('error');
            dropdown.open();
        } finally {
            setIsSaving(false);
        }
    }, [disabled, isSaving, currentWorkflow, draftWorkflowName, nodes, createWorkflow, currentUser, filePathConfig, dropdown]);

    const resultConfig = saveResult ? RESULT_MESSAGES[saveResult] : null;

    return (
        <>
            <button
                ref={buttonRef}
                className={`btn_base btn_layout btn_style_common btn_mini glass btn_secondary ${disabled ? 'disabled' : ''}`}
                onClick={handleSaveAs}
                disabled={disabled || isSaving}
                title="另存为新工作流"
            >
                <span className="btn-icon">{isSaving ? '⏳' : '📋'}</span>
                <span className="btn-text">{isSaving ? '保存中' : '另存为'}</span>
            </button>

            {/* 另存为结果下拉菜单 */}
            <Portal
                isOpen={dropdown.isOpen || dropdown.isHiding}
                onClose={() => dropdown.startClose()}
                pointerEvents="none"
            >
                <div
                    ref={dropdownRef}
                    className={`dropdown_base overlay_base save-result-dropdown ${dropdown.isHiding ? 'hiding' : 'show'}`}
                    style={{
                        top: `${dropdown.position.top}px`,
                        left: `${dropdown.position.left}px`,
                        width: `${dropdown.position.width}px`
                    } as React.CSSProperties}
                >
                    {resultConfig && (
                        <div className={`save-result-message ${resultConfig.className}`}>
                            <span className="save-result-icon">{resultConfig.icon}</span>
                            <span className="save-result-text">{resultConfig.text}</span>
                        </div>
                    )}
                </div>
            </Portal>
        </>
    );
};

export default SaveAsDropdown;
