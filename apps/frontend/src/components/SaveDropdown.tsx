/**
 * SaveDropdown 组件
 * 保存/更新工作流的下拉菜单，使用与 UserSelector 相同的样式
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Portal } from './Portal';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import { useCanvasStore } from '../state/canvasStore';
import { WorkflowNode, Workflow } from '../types/Interfaces';
import { useUser } from '../shared/UserContext';

// 保存结果类型
type SaveResult = 'created' | 'updated' | 'unchanged' | 'error';

interface SaveDropdownProps {
    disabled?: boolean;
}

// 节点比对逻辑
function areNodesEqual(a: WorkflowNode[], b: WorkflowNode[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((node, i) =>
        node.id === b[i].id &&
        node.type === b[i].type &&
        JSON.stringify(node.config) === JSON.stringify(b[i].config)
    );
}

// 结果消息配置
const RESULT_MESSAGES: Record<SaveResult, { icon: string; text: string; className: string }> = {
    created: { icon: '✅', text: '已创建新工作流', className: 'success' },
    updated: { icon: '✅', text: '工作流已更新', className: 'success' },
    unchanged: { icon: 'ℹ️', text: '此工作流未改动', className: 'info' },
    error: { icon: '❌', text: '保存失败', className: 'error' }
};

export const SaveDropdown: React.FC<SaveDropdownProps> = ({
    disabled = false
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const { currentWorkflow, createWorkflow, updateWorkflow } = useWorkflowStore();
    const { nodes } = useCanvasStore();
    const { currentUser, filePathConfig } = useUser();

    // 使用下拉位置 hook
    const dropdown = useDropdownPosition({
        triggerRef: buttonRef,
        dropdownRef: dropdownRef,
        offset: 8,
        minWidth: 200
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

    // 保存逻辑
    const handleSave = useCallback(async () => {
        if (disabled || isSaving) return;

        setIsSaving(true);

        try {
            // 情况1：没有当前工作流 → 创建新工作流
            if (!currentWorkflow) {
                await createWorkflow({
                    name: `工作流 ${new Date().toLocaleString('zh-CN')}`,
                    nodes: nodes,
                    ownerName: currentUser || undefined,
                    project_name: filePathConfig?.project_name || undefined
                });
                setSaveResult('created');
                dropdown.open();
                return;
            }

            // 情况2：有当前工作流 → 比对节点
            const currentNodes = currentWorkflow.nodes || [];

            if (areNodesEqual(nodes, currentNodes)) {
                // 节点无变化
                setSaveResult('unchanged');
                dropdown.open();
                return;
            }

            // 情况3：节点有变化 → 更新工作流
            await updateWorkflow(currentWorkflow.id, {
                nodes: nodes
            } as any);
            setSaveResult('updated');
            dropdown.open();

        } catch (error) {
            console.error('保存工作流失败:', error);
            setSaveResult('error');
            dropdown.open();
        } finally {
            setIsSaving(false);
        }
    }, [disabled, isSaving, currentWorkflow, nodes, createWorkflow, updateWorkflow, currentUser, filePathConfig, dropdown]);

    const resultConfig = saveResult ? RESULT_MESSAGES[saveResult] : null;

    return (
        <>
            <button
                ref={buttonRef}
                className={`btn_base btn_layout btn_style_common btn_mini glass btn_secondary ${disabled ? 'disabled' : ''}`}
                onClick={handleSave}
                disabled={disabled || isSaving}
                title="保存工作流"
            >
                <span className="btn-icon">{isSaving ? '⏳' : '💾'}</span>
                <span className="btn-text">{isSaving ? '保存中' : '保存'}</span>
            </button>

            {/* 保存结果下拉菜单 */}
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

export default SaveDropdown;
