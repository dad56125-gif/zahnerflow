import React, { useEffect, useMemo, useState } from 'react';
import { ModalLayer } from './shared/OverlayLayer';
import type { WorkflowNode } from '@zahnerflow/types';
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import { runtimeClient } from '../runtimeClient';
import { NodeIconSvg } from './NodeIconSvg';
import { UiIconSvg } from './shared/UiIconSvg';

interface UnrollViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: WorkflowNode[];
    autoStartupConfig?: Record<string, any>;
    canRunFromStep?: boolean;
    onRunFromStep?: (startFromUnrolledIndex: number) => void;
}

type BackendUnrollPreview = {
    nodeCount: number;
    steps: UnrolledStepWithAdvancedMeta[];
    summary?: Record<string, any>;
};

type UnrolledStepWithAdvancedMeta = {
    nodeId: string;
    nodeType: string;
    originalIndex: number;
    sourceIndex?: number | null;
    unrolledIndex: number;
    unrolledTotal: number;
    iterationPath?: Array<Record<string, any>>;
    loopContextStack?: number[];
    loopDepth?: number;
    blockPath?: Array<Record<string, any>>;
    parentNodeType?: string;
    parentNodeId?: string | null;
    stepIndex?: number;
    totalSteps?: number;
    stepValue?: number;
    cycleIndex?: number;
    node?: {
        id?: string;
        type?: string;
        config?: Record<string, any>;
        auto?: boolean;
    };
};

type CollapsibleRangeKind = 'loop' | 'advanced' | 'workflow';

type CollapsibleRange = {
    key: string;
    kind: CollapsibleRangeKind;
    title: string;
    meta: string;
    start: number;
    end: number;
    depth: number;
};

const HIDDEN_PREVIEW_NODE_TYPES = new Set(['startup', 'shutdown']);

const getLoopCount = (node?: WorkflowNode): number => {
    const rawCount = node?.config?.loopCount ?? node?.config?.loop_count ?? 1;
    const loopCount = Number(rawCount);
    return Number.isFinite(loopCount) && loopCount > 0 ? Math.floor(loopCount) : 1;
};

const formatCompactNumber = (value: unknown): string => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return String(value);
    }
    return String(Number(numericValue.toFixed(6)));
};

/**
 * 展开视图 Modal - 显示工作流展开后的所有执行步骤
 */
export const UnrollViewModal: React.FC<UnrollViewModalProps> = ({
    isOpen,
    onClose,
    nodes,
    autoStartupConfig,
    canRunFromStep = false,
    onRunFromStep
}) => {
    const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
    const [selectedUnrolledIndex, setSelectedUnrolledIndex] = useState<number | null>(null);
    const [preview, setPreview] = useState<BackendUnrollPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (!nodes || nodes.length === 0) {
            setPreview({ nodeCount: 0, steps: [], summary: { totalSteps: 0, physicalNodeCount: 0, maxLoopDepth: 0, loops: [] } });
            setPreviewError(null);
            setSelectedUnrolledIndex(null);
            return;
        }

        let cancelled = false;
        setIsLoadingPreview(true);
        setPreviewError(null);
        setSelectedUnrolledIndex(null);
        setCollapsedKeys(new Set());

        runtimeClient.executions
            .unrollPreview<BackendUnrollPreview>({
                nodes,
                autoStartupConfig: autoStartupConfig || {},
            })
            .then((result) => {
                if (!cancelled) {
                    setPreview(result);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPreview(null);
                    setPreviewError(error?.message || '展开预览失败');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingPreview(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [autoStartupConfig, isOpen, nodes]);

    const unrollResult = preview || {
        nodeCount: 0,
        steps: [],
        summary: { totalSteps: 0, physicalNodeCount: 0, maxLoopDepth: 0, loops: [] }
    };

    const visibleSteps = useMemo(
        () => (unrollResult.steps as UnrolledStepWithAdvancedMeta[])
            .filter((step) => !HIDDEN_PREVIEW_NODE_TYPES.has(step.nodeType)),
        [unrollResult.steps]
    );

    // 获取节点配置信息
    const getNodeConfig = (nodeType: string) => {
        return NODE_CONFIGS[nodeType as keyof typeof NODE_CONFIGS] || {
            name: nodeType,
            icon: 'workflow',
            category: 'unknown'
        };
    };

    // 根据原始节点获取参数预览
    const getParamPreview = (step: UnrolledStepWithAdvancedMeta): string => {
        const node = step.node || nodes.find(n => n.id === step.nodeId);
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
                    params.push(`${formatCompactNumber(config.polarizationVoltage)}V`);
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
                    params.push(`值: ${formatCompactNumber((step as any).stepValue)}`);
                }
                if ((step as any).cycleIndex !== undefined) {
                    params.push(`周期 ${(step as any).cycleIndex + 1}`);
                }
        }

        return params.join(' · ');
    };

    const formatIterationLabel = (iterationPath: Array<Record<string, any>> = []): string => {
        return iterationPath
            .map((item) => {
                const iteration = Number(item.iteration ?? 0);
                const total = Number(item.totalIterations ?? 0);
                return total > 0 ? `${iteration}/${total}` : String(iteration || '');
            })
            .filter(Boolean)
            .join('-');
    };

    const formatBlockLabel = (blockPath: Array<Record<string, any>> = []): string => {
        return blockPath
            .map((item) => String(item.blockWorkflowName || item.blockWorkflowId || '工作流块'))
            .filter(Boolean)
            .join(' / ');
    };

    const collapsibleRanges = useMemo<CollapsibleRange[]>(() => {
        const steps = visibleSteps;
        const ranges: CollapsibleRange[] = [];
        const loopRangeMap = new Map<string, CollapsibleRange>();
        const workflowRangeMap = new Map<string, CollapsibleRange>();

        steps.forEach((step, index) => {
            const iterationPath = step.iterationPath || [];
            const loopContextStack = step.loopContextStack || [];

            iterationPath.forEach((iteration, depthIndex) => {
                const loopStartIndex = loopContextStack[depthIndex] ?? iteration.loopStartIndex;
                const loopNode = typeof loopStartIndex === 'number' ? nodes[loopStartIndex] : undefined;
                const loopCount = getLoopCount(loopNode);
                const key = `loop:${loopStartIndex ?? depthIndex}:${iterationPath.slice(0, depthIndex + 1).map((item) => item.iteration).join('.')}`;
                const existing = loopRangeMap.get(key);

                if (existing) {
                    existing.end = index;
                } else {
                    loopRangeMap.set(key, {
                        key,
                        kind: 'loop',
                        title: `第${depthIndex + 1}层循环 · 第${Number(iteration.iteration ?? 0)}轮`,
                        meta: `${loopCount}次 · 原节点 #${(loopStartIndex ?? 0) + 1}`,
                        start: index,
                        end: index,
                        depth: depthIndex + 1
                    });
                }
            });
        });

        loopRangeMap.forEach((range) => {
            if (range.end > range.start) {
                ranges.push(range);
            }
        });

        let index = 0;
        while (index < steps.length) {
            const step = steps[index];

            if (!step.parentNodeType) {
                index++;
                continue;
            }

            const start = index;
            const iterationKey = formatIterationLabel(step.iterationPath || []);
            index++;

            while (
                index < steps.length &&
                steps[index].parentNodeId === step.parentNodeId &&
                steps[index].parentNodeType === step.parentNodeType &&
                formatIterationLabel(steps[index].iterationPath || []) === iterationKey
            ) {
                index++;
            }

            const end = index - 1;
            if (end > start) {
                const parentConfig = getNodeConfig(step.parentNodeType);
                const childConfig = getNodeConfig(step.nodeType);
                ranges.push({
                    key: `advanced:${step.parentNodeId || step.nodeId}:${step.parentNodeType}:${iterationKey}`,
                    kind: 'advanced',
                    title: parentConfig.name,
                    meta: `展开为${childConfig.name}`,
                    start,
                    end,
                    depth: (step.iterationPath || []).length + 1
                });
            }
        }

        steps.forEach((step, stepIndex) => {
            if (!step.blockPath || step.blockPath.length === 0) return;

            const lastBlock = step.blockPath[step.blockPath.length - 1];
            const workflowName = String(lastBlock.blockWorkflowName || lastBlock.blockWorkflowId || '工作流块');
            const key = `workflow:${lastBlock.blockNodeId || 'block'}:${formatIterationLabel(step.iterationPath || [])}`;
            const existing = workflowRangeMap.get(key);
            if (existing) {
                existing.end = stepIndex;
            } else {
                workflowRangeMap.set(key, {
                    key,
                    kind: 'workflow',
                    title: workflowName,
                    meta: '工作流块子节点',
                    start: stepIndex,
                    end: stepIndex,
                    depth: (step.iterationPath || []).length + 1
                });
            }
        });

        workflowRangeMap.forEach((range) => {
            ranges.push(range);
        });

        return ranges.sort((a, b) => a.start - b.start || b.end - a.end || a.depth - b.depth);
    }, [nodes, visibleSteps]);

    const activeCollapsedRanges = useMemo(() => {
        const kindPriority: Record<CollapsibleRangeKind, number> = {
            workflow: 0,
            loop: 1,
            advanced: 2
        };
        const selectedRanges = collapsibleRanges
            .filter((range) => collapsedKeys.has(range.key))
            .sort((a, b) => (
                a.start - b.start ||
                kindPriority[a.kind] - kindPriority[b.kind] ||
                b.end - a.end
            ));
        const activeRanges = new Map<number, CollapsibleRange>();
        let coveredUntil = -1;

        selectedRanges.forEach((range) => {
            if (range.start <= coveredUntil) return;
            activeRanges.set(range.start, range);
            coveredUntil = range.end;
        });

        return activeRanges;
    }, [collapsedKeys, collapsibleRanges]);

    const rangeStates = useMemo(() => {
        const buildState = (kind: CollapsibleRangeKind) => {
            const ranges = collapsibleRanges.filter((range) => range.kind === kind);
            return {
                count: ranges.length,
                isCollapsed: ranges.some((range) => collapsedKeys.has(range.key))
            };
        };

        return {
            loop: buildState('loop'),
            advanced: buildState('advanced'),
            workflow: buildState('workflow')
        };
    }, [collapsedKeys, collapsibleRanges]);

    const toggleRangesByKind = (kind: CollapsibleRangeKind) => {
        setCollapsedKeys((current) => {
            const next = new Set(current);
            const targetRanges = collapsibleRanges.filter((range) => range.kind === kind);
            const hasCollapsedRange = targetRanges.some((range) => next.has(range.key));

            targetRanges.forEach((range) => {
                if (hasCollapsedRange) {
                    next.delete(range.key);
                } else {
                    next.add(range.key);
                }
            });
            return next;
        });
    };

    const expandAllGroups = () => {
        setCollapsedKeys(new Set());
    };

    const expandRange = (key: string) => {
        setCollapsedKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
        });
    };

    const renderStepCard = (step: UnrolledStepWithAdvancedMeta, index: number) => {
        const nodeConfig = getNodeConfig(step.nodeType);
        const paramPreview = getParamPreview(step);
        const iterPath = formatIterationLabel(step.iterationPath || []);
        const blockLabel = formatBlockLabel(step.blockPath || []);
        const isSelected = selectedUnrolledIndex === step.unrolledIndex;

        return (
            <button
                key={`card:${step.nodeId}:${index}`}
                type="button"
                className={`unroll-step-card unroll-step-card--selectable ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedUnrolledIndex(step.unrolledIndex)}
                aria-pressed={isSelected}
            >
                {/* 序号 + 图标 + 名称 */}
                <div className="unroll-step-card__header">
                    <span className="unroll-step-card__index">
                        #{index + 1}
                    </span>
                    <span className="unroll-step-card__node-icon">
                        <NodeIconSvg nodeType={step.nodeType} fallback={nodeConfig.icon} />
                    </span>
                    <span className="unroll-step-card__name">
                        {nodeConfig.name}
                    </span>
                </div>

                {/* 迭代路径 */}
                {(step.iterationPath || []).length > 0 && (
                    <div className="unroll-step-card__iteration">
                        <span className="unroll-step-card__meta-icon"><UiIconSvg name="loop" /></span>
                        <span>迭代 [{iterPath}]</span>
                    </div>
                )}

                {blockLabel && (
                    <div className="unroll-step-card__iteration unroll-step-card__iteration--block">
                        <span className="unroll-step-card__meta-icon">
                            <NodeIconSvg nodeType="workflow_block" fallback="workflow_block" />
                        </span>
                        <span>{blockLabel}</span>
                    </div>
                )}

                {/* 参数预览 */}
                {paramPreview && (
                    <div className="unroll-step-card__preview">
                        {paramPreview}
                    </div>
                )}
            </button>
        );
    };

    const renderCollapsedRangeCard = (range: CollapsibleRange) => {
        return (
            <button
                key={`collapsed:${range.key}`}
                type="button"
                className={`unroll-step-card unroll-step-card--collapsed unroll-step-card--collapsed-${range.kind}`}
                onClick={() => expandRange(range.key)}
                aria-label={`展开${range.title}`}
            >
                <div className="unroll-step-card__header">
                    <span className="unroll-step-card__index">
                        #{range.start + 1}-{range.end + 1}
                    </span>
                    <span className="unroll-step-card__collapse-icon">+</span>
                    <span className="unroll-step-card__name">
                        {range.title}
                    </span>
                </div>
                <div className="unroll-step-card__preview">
                    已收缩 {range.end - range.start + 1} 步 · {range.meta}
                </div>
            </button>
        );
    };

    const renderVisibleSteps = () => {
        const renderedItems: React.ReactNode[] = [];
        const steps = visibleSteps;
        let index = 0;

        while (index < steps.length) {
            const collapsedRange = activeCollapsedRanges.get(index);
            if (collapsedRange) {
                renderedItems.push(renderCollapsedRangeCard(collapsedRange));
                index = collapsedRange.end + 1;
                continue;
            }

            renderedItems.push(renderStepCard(steps[index], index));
            index++;
        }

        return renderedItems;
    };

    const selectedStep = selectedUnrolledIndex === null
        ? null
        : (unrollResult.steps as UnrolledStepWithAdvancedMeta[])
            .find((step) => step.unrolledIndex === selectedUnrolledIndex);

    const renderRangeToggle = (kind: CollapsibleRangeKind, label: string) => {
        const state = rangeStates[kind];
        const actionLabel = state.isCollapsed ? '展开' : '收缩';

        return (
            <button
                type="button"
                className={`btn btn--xs unroll-controls__toggle ${state.isCollapsed ? 'is-active' : ''}`}
                onClick={() => toggleRangesByKind(kind)}
                disabled={state.count === 0}
                aria-pressed={state.isCollapsed}
            >
                {actionLabel}{label}{state.count > 0 ? ` (${state.count})` : ''}
            </button>
        );
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
                            总步骤: {visibleSteps.length}
                        </span>
                        <span className="unroll-badge unroll-badge--success">
                            物理节点: {unrollResult.summary?.physicalNodeCount ?? unrollResult.nodeCount}
                        </span>
                        {(unrollResult.summary?.maxLoopDepth ?? 0) > 0 && (
                            <span className="unroll-badge unroll-badge--warning">
                                最大嵌套: {unrollResult.summary?.maxLoopDepth}层
                            </span>
                        )}
                    </div>
                    <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={close}>✕</button>
                </div>

                {/* 节点网格 */}
                <div className="modal__body unroll-view-body">
                    {isLoadingPreview ? (
                        <div className="unroll-empty">
                            正在展开工作流...
                        </div>
                    ) : previewError ? (
                        <div className="unroll-empty">
                            {previewError}
                        </div>
                    ) : visibleSteps.length === 0 ? (
                        <div className="unroll-empty">
                            当前工作流为空，请添加节点后再查看
                        </div>
                    ) : (
                        <>
                            <div className="unroll-selection">
                                <span className="unroll-selection__text">
                                    {selectedStep
                                        ? `已选择 #${visibleSteps.findIndex((step) => step.unrolledIndex === selectedUnrolledIndex) + 1} ${getNodeConfig(selectedStep.nodeType).name}`
                                        : '点击任意展开步骤，可从该步骤开始运行'}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn--xs btn--primary"
                                    disabled={!selectedStep || !canRunFromStep}
                                    onClick={() => {
                                        if (selectedUnrolledIndex !== null) {
                                            onRunFromStep?.(selectedUnrolledIndex);
                                        }
                                    }}
                                >
                                    从此步骤开始运行
                                </button>
                            </div>
                            {collapsibleRanges.length > 0 && (
                                <div className="unroll-controls">
                                    <span className="unroll-controls__summary">
                                        当前保持全展开，收缩只临时隐藏重复范围
                                    </span>
                                    <div className="unroll-controls__actions">
                                        {renderRangeToggle('loop', '循环')}
                                        {renderRangeToggle('advanced', '高级')}
                                        {renderRangeToggle('workflow', '组节点')}
                                        <button
                                            type="button"
                                            className="btn btn--xs unroll-controls__toggle unroll-controls__toggle--reset"
                                            onClick={expandAllGroups}
                                            disabled={collapsedKeys.size === 0}
                                        >
                                            全部展开
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="unroll-grid">
                                {renderVisibleSteps()}
                            </div>
                        </>
                    )}
                </div>
            </div>
            )}
        </ModalLayer>
    );
};
