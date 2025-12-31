import React, { useMemo } from 'react';
import { Portal } from './Portal';
import { WorkflowNode } from '../types/Interfaces';
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import { unrollLoops, formatIterationPath, UnrolledStep } from '../shared/loopUnroller';

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
                if (config.eis_lower_frequency && config.eis_upper_frequency) {
                    params.push(`${config.eis_lower_frequency}~${config.eis_upper_frequency}Hz`);
                }
                break;
            case 'chronoamperometry':
                if (config.polarization_voltage !== undefined) {
                    params.push(`${config.polarization_voltage}V`);
                }
                if (config.measurement_duration) {
                    params.push(`${config.measurement_duration}s`);
                }
                break;
            case 'chronopotentiometry':
                if (config.polarization_current !== undefined) {
                    params.push(`${(config.polarization_current * 1000).toFixed(1)}mA`);
                }
                if (config.measurement_duration) {
                    params.push(`${config.measurement_duration}s`);
                }
                break;
            case 'change_temperature':
                if (config.target_temperature !== undefined) {
                    params.push(`${config.target_temperature}°C`);
                }
                break;
            case 'change_gas_flow':
                if (config.target_flow_rate !== undefined) {
                    params.push(`${config.target_flow_rate} sccm`);
                }
                break;
            case 'wait_delay':
                if (config.duration) {
                    params.push(`${config.duration}s`);
                }
                break;
            case 'ocp_measurement':
                if (config.measurement_duration) {
                    params.push(`${config.measurement_duration}s`);
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

    if (!isOpen) return null;

    return (
        <Portal isOpen={isOpen} onClose={onClose} pointerEvents="auto" id="unroll-view-modal">
            <div
                className="modal_content unroll-view-modal"
                style={{
                    position: 'fixed',
                    left: 'calc(var(--sidebar-l))',
                    top: 'calc(var(--canvas-t))',
                    width: 'calc(100vw - 2 * var(--space))',
                    height: 'calc(100vh - 2 * var(--canvas-b))',
                    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.4) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: 'var(--effect-xl)',
                    backdropFilter: 'blur(var(--effect-xl))',
                    WebkitBackdropFilter: 'blur(var(--effect-xl))',
                    boxShadow: '0 16px 64px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    animation: 'modal_scale_in 0.3s var(--ease-bounce)',
                    isolation: 'isolate',
                    pointerEvents: 'auto',
                    zIndex: 2000
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="modal_header">
                    <h3>展开所有执行步骤</h3>
                    <div className="unroll-summary" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: 'auto', marginRight: '1rem' }}>
                        <span className="badge" style={{
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: 'rgb(165, 180, 252)',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem'
                        }}>
                            总步骤: {unrollResult.summary.totalSteps}
                        </span>
                        <span className="badge" style={{
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: 'rgb(134, 239, 172)',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem'
                        }}>
                            物理节点: {unrollResult.summary.physicalNodeCount}
                        </span>
                        {unrollResult.summary.maxLoopDepth > 0 && (
                            <span className="badge" style={{
                                background: 'rgba(251, 191, 36, 0.2)',
                                color: 'rgb(253, 224, 71)',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '9999px',
                                fontSize: '0.75rem'
                            }}>
                                最大嵌套: {unrollResult.summary.maxLoopDepth}层
                            </span>
                        )}
                    </div>
                    <button className="modal_close" onClick={onClose}>×</button>
                </div>

                {/* 节点网格 */}
                <div className="modal_body" style={{ overflow: 'auto', padding: '1rem' }}>
                    {unrollResult.steps.length === 0 ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: '1rem'
                        }}>
                            当前工作流为空，请添加节点后再查看
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
                            gap: '0.5rem',
                            alignContent: 'start'
                        }}>
                            {unrollResult.steps.map((step, index) => {
                                const nodeConfig = getNodeConfig(step.nodeType);
                                const paramPreview = getParamPreview(step);
                                const iterPath = formatIterationPath(step.iterationPath);

                                return (
                                    <div
                                        key={`${step.nodeId}-${index}`}
                                        className="unroll-step-card"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '0.5rem',
                                            padding: '0.75rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.25rem',
                                            transition: 'all 0.2s ease',
                                            cursor: 'default'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                        }}
                                    >
                                        {/* 序号 + 图标 + 名称 */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.875rem',
                                            fontWeight: 500
                                        }}>
                                            <span style={{
                                                color: 'rgba(255, 255, 255, 0.4)',
                                                fontSize: '0.75rem',
                                                minWidth: '1.5rem'
                                            }}>
                                                #{index + 1}
                                            </span>
                                            <span>{nodeConfig.icon}</span>
                                            <span style={{
                                                color: 'rgba(255, 255, 255, 0.9)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {nodeConfig.name}
                                            </span>
                                        </div>

                                        {/* 迭代路径 */}
                                        {step.iterationPath.length > 0 && (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                fontSize: '0.75rem',
                                                color: 'rgba(251, 191, 36, 0.8)'
                                            }}>
                                                <span>🔄</span>
                                                <span>迭代 [{iterPath}]</span>
                                            </div>
                                        )}

                                        {/* 参数预览 */}
                                        {paramPreview && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'rgba(255, 255, 255, 0.5)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
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
        </Portal>
    );
};
