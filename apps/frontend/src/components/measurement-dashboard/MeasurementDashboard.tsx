/**
 * MeasurementDashboard 组件
 * 全屏显示测量图表的 Modal，使用 Portal 渲染
 * 宽度对齐 Canvas 边界（--left-panel-r 到 --property-l）
 * 高度为 Canvas 高度的 2/3
 */

import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { ModalLayer } from '../shared/OverlayLayer';
import { MeasurementChart } from './MeasurementChart';
import { MeasurementTabBar } from './MeasurementTabBar';
import { useBulkSelection } from './useBulkSelection';
import type { ExecutionSnapshot, WorkflowNode } from '@zahnerflow/types';
import { NODE_CONFIGS } from '../../types/NodeConfiguration';
import { EisLegendScheme } from '../../utils/colorUtils';
import { UiIconSvg } from '../shared/UiIconSvg';

interface MeasurementDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    systemState: ExecutionSnapshot | null;
    nodes: WorkflowNode[];
}

// 定义哪些节点类型支持图表显示
const MEASUREMENT_NODE_TYPES = [
    'eis_potentiostatic',
    'eis_galvanostatic',
    'ocp_measurement',
    'chronoamperometry',
    'chronopotentiometry',
    'voltage_ramp',
    'current_ramp',
    // 高级测量节点
    'galvanostatic_switching',
    'potentiostatic_switching',
    'galvanostatic_step_ramp',
    'potentiostatic_step_ramp'
];

const TEST_TYPE_MAPPING: Record<string, { key: string; label: string }> = {
    'eis_potentiostatic': { key: 'eis_potentiostatic', label: '恒电位EIS' },
    'eis_galvanostatic': { key: 'eis_galvanostatic', label: '恒电流EIS' },
    'chronoamperometry': { key: 'chrono', label: '计时法' },
    'chronopotentiometry': { key: 'chrono', label: '计时法' },
    'voltage_ramp': { key: 'ramp', label: '斜坡' },
    'current_ramp': { key: 'ramp', label: '斜坡' },
    'galvanostatic_switching': { key: 'switching_step', label: '开关/阶跃' },
    'potentiostatic_switching': { key: 'switching_step', label: '开关/阶跃' },
    'galvanostatic_step_ramp': { key: 'switching_step', label: '开关/阶跃' },
    'potentiostatic_step_ramp': { key: 'switching_step', label: '开关/阶跃' },
    'ocp_measurement': { key: 'ocp', label: 'OCP' }
};

export const MeasurementDashboard: React.FC<MeasurementDashboardProps> = ({
    isOpen,
    onClose,
    systemState,
    nodes
}) => {
    const secondaryTabsRef = useRef<HTMLDivElement>(null);
    const secondaryTabsContentRef = useRef<HTMLDivElement>(null);
    const { bulkMode, handleBulkToggleClick: bulkToggleHandler, resetBulkSelection } = useBulkSelection();

    // 筛选出支持图表的测量节点
    const measurementNodes = useMemo(() => {
        return nodes.filter(node => MEASUREMENT_NODE_TYPES.includes(node.type));
    }, [nodes]);

    // 对测量节点进行大类分组
    const groupedCategories = useMemo(() => {
        const groups: Record<string, { key: string; label: string; nodes: WorkflowNode[] }> = {};

        measurementNodes.forEach(node => {
            const mapping = TEST_TYPE_MAPPING[node.type] || { key: 'other', label: '其他' };
            if (!groups[mapping.key]) {
                groups[mapping.key] = {
                    key: mapping.key,
                    label: mapping.label,
                    nodes: []
                };
            }
            groups[mapping.key].nodes.push(node);
        });

        return Object.values(groups);
    }, [measurementNodes]);

    // 预计算 node.id -> globalIndex 映射，避免 map 内反复 findIndex
    const nodeIdToIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node, index) => map.set(node.id, index));
        return map;
    }, [nodes]);

    // 当前活跃的节点索引（用于高亮显示）
    const activeNodeIndex = systemState?.currentStep?.index ?? -1;

    // 当前选中的 Tab 状态
    const [activeTypeKey, setActiveTypeKey] = useState<string>('');
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [isSecondaryExpanded, setIsSecondaryExpanded] = useState(false);
    const [isSecondaryOverflowing, setIsSecondaryOverflowing] = useState(false);

    // 当前选中的大类
    const activeGroup = useMemo(() => {
        return groupedCategories.find(g => g.key === activeTypeKey) || null;
    }, [groupedCategories, activeTypeKey]);

    // 当前主类型下正在显示的节点
    const visibleNodes = useMemo(() => {
        if (!activeGroup) return [];
        return activeGroup.nodes.filter(n => selectedNodeIds.has(n.id));
    }, [activeGroup, selectedNodeIds]);
    const eisLegendScheme: EisLegendScheme = bulkMode === 'sample' ? 'sampleGradient' : 'palette';
    const visibleNodeIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        visibleNodes.forEach((node, index) => map.set(node.id, index));
        return map;
    }, [visibleNodes]);
    const chartOverlayNodes = useMemo(() => {
        return visibleNodes.map(node => ({
            nodeIndex: nodeIdToIndexMap.get(node.id) ?? -1,
            label: `#${(nodeIdToIndexMap.get(node.id) ?? -1) + 1}`
        }));
    }, [visibleNodes, nodeIdToIndexMap]);

    // 当前标题/状态栏代表节点：优先取当前主类型下最后一个显示节点
    const activeNode = useMemo(() => {
        if (!activeGroup) return null;
        return visibleNodes[visibleNodes.length - 1] || activeGroup.nodes[0] || null;
    }, [activeGroup, visibleNodes]);
    const activeNodeConfig = useMemo(() => {
        if (!activeNode) return null;
        return {
            name: NODE_CONFIGS[activeNode.type]?.name || activeNode.type,
            ...activeNode.config
        };
    }, [activeNode]);

    const updateSecondaryOverflow = () => {
        const container = secondaryTabsRef.current;
        const content = secondaryTabsContentRef.current;
        if (!container || !content || !activeGroup) {
            setIsSecondaryOverflowing(false);
            return;
        }

        const tabItems = Array.from(content.children) as HTMLElement[];
        const collapsedItemsWidth = tabItems.reduce((total, item) => total + item.offsetWidth, 0);
        const collapsedGapWidth = Math.max(0, tabItems.length - 1) * 6;
        const collapsedWidth = collapsedItemsWidth + collapsedGapWidth;
        const availableWidth = content.clientWidth;
        const overflowing = content.scrollWidth > availableWidth + 1 || collapsedWidth > availableWidth + 1;
        setIsSecondaryOverflowing(overflowing);
    };

    useLayoutEffect(() => {
        let secondFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(updateSecondaryOverflow);
        });

        window.addEventListener('resize', updateSecondaryOverflow);
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            window.removeEventListener('resize', updateSecondaryOverflow);
        };
    }, [activeTypeKey, activeGroup?.nodes.length]);

    // 监听运行步骤的变化，实现自动聚焦
    useEffect(() => {
        if (!isOpen) return;

        const runningNode = measurementNodes.find(node => {
            const globalIdx = nodeIdToIndexMap.get(node.id);
            return globalIdx === activeNodeIndex;
        });

        if (runningNode) {
            const mapping = TEST_TYPE_MAPPING[runningNode.type] || { key: 'other', label: '其他' };
            setActiveTypeKey(mapping.key);
            setSelectedNodeIds(prev => {
                const next = new Set(prev);
                next.add(runningNode.id);
                return next;
            });
        } else {
            const currentGroupExists = groupedCategories.some(g => g.key === activeTypeKey);
            if (!activeTypeKey || !currentGroupExists) {
                if (groupedCategories.length > 0) {
                    const firstGroup = groupedCategories[0];
                    setActiveTypeKey(firstGroup.key);
                    setSelectedNodeIds(prev => {
                        if (firstGroup.nodes.some(node => prev.has(node.id))) return prev;
                        if (firstGroup.nodes.length === 0) return prev;
                        const next = new Set(prev);
                        next.add(firstGroup.nodes[0].id);
                        return next;
                    });
                }
            }
        }
    }, [isOpen, activeNodeIndex, measurementNodes, groupedCategories, nodeIdToIndexMap]);

    const handleTypeClick = (key: string) => {
        resetBulkSelection();
        setActiveTypeKey(key);
        const group = groupedCategories.find(g => g.key === key);
        if (group && group.nodes.length > 0) {
            setSelectedNodeIds(prev => {
                if (group.nodes.some(node => prev.has(node.id))) return prev;
                const next = new Set(prev);
                next.add(group.nodes[0].id);
                return next;
            });
        }
    };

    const handleNodeClick = (nodeId: string) => {
        resetBulkSelection();
        setSelectedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const handleBulkToggleClick = () => {
        if (!activeGroup) return;

        const { nodesToShow } = bulkToggleHandler(activeGroup.nodes);
        const activeGroupIds = new Set(activeGroup.nodes.map(node => node.id));
        setSelectedNodeIds(prev => {
            const next = new Set(Array.from(prev).filter(nodeId => !activeGroupIds.has(nodeId)));
            nodesToShow.forEach(node => next.add(node.id));
            return next;
        });
    };

    // 全局点击监听用于收起二级 Tab 展开面板
    useEffect(() => {
        if (!isSecondaryExpanded) return;

        const handleGlobalPointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.chart-modal__tabs-secondary')) {
                setIsSecondaryExpanded(false);
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener('pointerdown', handleGlobalPointerDown, true);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointerdown', handleGlobalPointerDown, true);
        };
    }, [isSecondaryExpanded]);

    return (
        <ModalLayer
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            backdrop={false}
            blur={false}
            closeOnBackdrop={false}
            contentClassName="overlay-layer__content--fill"
            id="measurement-dashboard-overlay"
        >
            {({ state, close }) => {
                const isHiding = state === 'closing';
                return (
            <div
                className={`chart-modal-backdrop ${isHiding ? 'is-hiding' : 'is-visible'}`}
                onClick={() => {
                    if (isSecondaryOverflowing && isSecondaryExpanded) {
                        setIsSecondaryExpanded(false);
                    } else {
                        close();
                    }
                }}
            >
                {/* 1. 悬浮的 Tab 栏 */}
                <div
                    className={`chart-modal__tab-container ${isHiding ? 'is-hiding' : 'is-visible'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <MeasurementTabBar
                        variant="primary"
                        measurementNodes={measurementNodes}
                        groupedCategories={groupedCategories}
                        nodeIdToIndexMap={nodeIdToIndexMap}
                        activeTypeKey={activeTypeKey}
                        selectedNodeIds={selectedNodeIds}
                        visibleNodes={visibleNodes}
                        visibleNodeIndexMap={visibleNodeIndexMap}
                        activeNodeIndex={activeNodeIndex}
                        systemState={systemState}
                        eisLegendScheme={eisLegendScheme}
                        bulkMode={bulkMode}
                        onTypeClick={handleTypeClick}
                    />
                </div>

                {/* 2. Modal 大卡片 */}
                <div
                    className={`chart-modal glass ${isHiding ? 'is-hiding' : 'is-visible'}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 标题栏 + 二级标签 */}
                    <MeasurementTabBar
                        variant="header"
                        measurementNodes={measurementNodes}
                        groupedCategories={groupedCategories}
                        nodeIdToIndexMap={nodeIdToIndexMap}
                        activeTypeKey={activeTypeKey}
                        selectedNodeIds={selectedNodeIds}
                        visibleNodes={visibleNodes}
                        visibleNodeIndexMap={visibleNodeIndexMap}
                        activeNode={activeNode}
                        activeNodeIndex={activeNodeIndex}
                        systemState={systemState}
                        eisLegendScheme={eisLegendScheme}
                        bulkMode={bulkMode}
                        isSecondaryOverflowing={isSecondaryOverflowing}
                        isSecondaryExpanded={isSecondaryExpanded}
                        secondaryTabsRef={secondaryTabsRef}
                        secondaryTabsContentRef={secondaryTabsContentRef}
                        onTypeClick={handleTypeClick}
                        onNodeClick={handleNodeClick}
                        onBulkToggleClick={handleBulkToggleClick}
                        onSecondaryExpandedChange={setIsSecondaryExpanded}
                    />

                    {/* 图表内容区 */}
                    <div
                        className="chart-modal__content"
                        style={{
                            flex: 1,
                            overflow: 'hidden',
                            padding: '48px 16px 12px 16px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {measurementNodes.length === 0 ? (
                            <div
                                className="chart-modal-empty"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%',
                                    color: 'var(--text-muted)'
                                }}
                            >
                                <span style={{ marginBottom: 'var(--size-md)' }}>
                                    <UiIconSvg name="chart" className="chart-modal-empty__icon" />
                                </span>
                                <span>当前工作流没有测量节点</span>
                                <span style={{ fontSize: 'var(--size-sm)', marginTop: 'var(--size-xs)' }}>
                                    添加 EIS、OCP、电压/电流斜坡等测量节点后可查看图表
                                </span>
                            </div>
                        ) : (
                            visibleNodes.length > 0 && activeNode && activeNodeConfig ? (
                                <div
                                    style={{
                                        height: '100%',
                                        width: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minHeight: 0
                                    }}
                                >
                                    <MeasurementChart
                                        nodeIndex={nodeIdToIndexMap.get(activeNode.id) ?? -1}
                                        nodeConfig={activeNodeConfig}
                                        systemState={systemState}
                                        nodeType={activeNode.type}
                                        height="100%"
                                        overlayNodes={chartOverlayNodes}
                                        eisLegendScheme={eisLegendScheme}
                                    />
                                </div>
                            ) : (
                                <div
                                    className="chart-modal-empty"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    点击上方子标签显示图表
                                </div>
                            )
                        )}
                    </div>

                    {/* 底部状态栏 */}
                    <div
                        className="chart-modal__footer"
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--size-xs) var(--size-md)',
                            borderTop: '1px solid var(--glass-border)',
                            fontSize: 'var(--size-sm)',
                            color: 'var(--text-secondary)',
                            flexShrink: 0
                        }}
                    >
                        <span>
                            共 {measurementNodes.length} 个测量节点
                        </span>
                        <span>
                            {systemState?.status === 'running'
                                ? `正在执行步骤 ${(activeNodeIndex + 1)}/${nodes.length}`
                                : systemState?.status === 'completed'
                                    ? '执行完成'
                                    : '就绪'
                            }
                        </span>
                    </div>
                </div>
            </div>
                );
            }}
        </ModalLayer>
    );
};
