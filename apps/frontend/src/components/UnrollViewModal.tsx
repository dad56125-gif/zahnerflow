import React, { useMemo } from 'react';
import { ModalLayer } from './shared/OverlayLayer';
import type { WorkflowNode } from '@zahnerflow/types';
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import { unrollLoops, formatIterationPath, UnrolledStep } from '@shared/loopUnroller.ts';

interface UnrollViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: WorkflowNode[];
}

/**
 * 展开视图 Modal - 显示工作流展开后的所有执行步骤
 */
export const UnrollViewModal: React.FC<UnrollViewModalProps> = ({
    isOpen,
    onClose,
    nodes
}) => {
    // 展开节点列表
    const unrollResult = useMemo(() => {
        if (!nodes || nodes.length === 0) {
            return { steps: [], summary: { totalSteps: 0, physicalNodeCount: 0, maxLoopDepth: 0, loops: [] } };
        }
        return unrollLoops(nodes);
    }, [nodes]);

    // 获取节点配置信息
    const getNodeConfig = (nodeType: string) => {
        return NODE_CONFIGS[nodeType as keyof typeof NODE_CONFIGS] || {
            name: nodeType,
            icon: '📦',
            category: 'unknown'
        };
    };

    // 根据原始节点获取参数预览
    const getParamPreview = (step: UnrolledStep): string => {
        const node = nodes.find(n => n.id === step.nodeId);
        if (!node?.config) return '';

        const config = node.config;
        const params: string[] = [];

        // 根据节点类型提取关键参数
        switch (step.nodeType) {
            case 'eis_potentiostatic':
            case 'eis_galvanostatic':
                if (config.eisLowerFrequency && config.eisUpperFrequency) {
                    params.push(`${config.eisLowerFrequency}~${config.eisUpperFrequency}Hz`);
                }
                break;
            case 'chronoamperometry':
                if (config.polarizationVoltage !== undefined) {
                    params.push(`${config.polarizationVoltage}V`);
                }
                if (config.measurementDuration) {
                    params.push(`${config.measurementDuration}s`);
                }
                break;
            case 'chronopotentiometry':
                if (config.polarizationCurrent !== undefined) {
                    params.push(`${(config.polarizationCurrent * 1000).toFixed(1)}mA`);
                }
                if (config.measurementDuration) {
                    params.push(`${config.measurementDuration}s`);
                }
                break;
            case 'change_temperature':
                if (config.targetTemperature !== undefined) {
                    params.push(`${config.targetTemperature}°C`);
                }
                break;
            case 'change_gas_flow':
                if (config.targetFlowRate !== undefined) {
                    params.push(`${config.targetFlowRate} sccm`);
                }
                break;
            case 'wait_delay':
                if (config.duration) {
                    params.push(`${config.duration}s`);
                }
                break;
            case 'scheduled_start': {
                const hour = String(config.hour ?? 0).padStart(2, '0');
                const minute = String(config.minute ?? 0).padStart(2, '0');
                params.push(`${config.nextDay ? '次日 ' : ''}${hour}:${minute}`);
                break;
            }
            case 'ocp_measurement':
                if (config.measurementDuration) {
                    params.push(`${config.measurementDuration}s`);
                }
                break;
            default:
                // 高级节点显示步骤信息
                if ((step as any).stepIndex !== undefined && (step as any).totalSteps !== undefined) {
                    params.push(`步骤 ${(step as any).stepIndex + 1}/${(step as any).totalSteps}`);
                }
                if ((step as any).stepValue !== undefined) {
                    params.push(`值: ${(step as any).stepValue.toFixed(3)}`);
                }
                if ((step as any).cycleIndex !== undefined) {
                    params.push(`周期 ${(step as any).cycleIndex + 1}`);
                }
        }

        return params.join(' · ');
    };

    return (
        <ModalLayer
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            id="unroll-view-modal"
        >
            {({ close }) => (
            <div
                className="modal__content unroll-view-modal workspace-device-modal"
            >
                {/* 标题栏 */}
                <div className="modal__header">
                    <h3>展开所有执行步骤</h3>
                    <div className="unroll-summary">
                        <span className="unroll-badge unroll-badge--indigo">
                            总步骤: {unrollResult.summary.totalSteps}
                        </span>
                        <span className="unroll-badge unroll-badge--success">
                            物理节点: {unrollResult.summary.physicalNodeCount}
                        </span>
                        {unrollResult.summary.maxLoopDepth > 0 && (
                            <span className="unroll-badge unroll-badge--warning">
                                最大嵌套: {unrollResult.summary.maxLoopDepth}层
                            </span>
                        )}
                    </div>
                    <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={close}>✕</button>
                </div>

                {/* 节点网格 */}
                <div className="modal__body unroll-view-body">
                    {unrollResult.steps.length === 0 ? (
                        <div className="unroll-empty">
                            当前工作流为空，请添加节点后再查看
                        </div>
                    ) : (
                        <div className="unroll-grid">
                            {unrollResult.steps.map((step, index) => {
                                const nodeConfig = getNodeConfig(step.nodeType);
                                const paramPreview = getParamPreview(step);
                                const iterPath = formatIterationPath(step.iterationPath);

                                return (
                                    <div
                                        key={`${step.nodeId}-${index}`}
                                        className="unroll-step-card"
                                    >
                                        {/* 序号 + 图标 + 名称 */}
                                        <div className="unroll-step-card__header">
                                            <span className="unroll-step-card__index">
                                                #{index + 1}
                                            </span>
                                            <span>{nodeConfig.icon}</span>
                                            <span className="unroll-step-card__name">
                                                {nodeConfig.name}
                                            </span>
                                        </div>

                                        {/* 迭代路径 */}
                                        {step.iterationPath.length > 0 && (
                                            <div className="unroll-step-card__iteration">
                                                <span>🔄</span>
                                                <span>迭代 [{iterPath}]</span>
                                            </div>
                                        )}

                                        {/* 参数预览 */}
                                        {paramPreview && (
                                            <div className="unroll-step-card__preview">
                                                {paramPreview}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            )}
        </ModalLayer>
    );
};
