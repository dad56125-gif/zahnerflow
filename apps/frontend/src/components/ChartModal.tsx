/**
 * ChartModal 组件
 * 全屏显示 NodeChart 图表的 Modal，使用 Portal 渲染
 * 宽度对齐 Canvas 边界（--sidebar-r 到 --property-l）
 * 高度为 Canvas 高度的 2/3
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Portal } from './Portal';
import { NodeChart } from './NodeChart';
import { ExecutionSnapshot, WorkflowNode } from '../types/Interfaces';
import { NODE_CONFIGS } from '../types/NodeConfiguration';

interface ChartModalProps {
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
    'lsv_measurement'
];

export const ChartModal: React.FC<ChartModalProps> = ({
    isOpen,
    onClose,
    systemState,
    nodes
}) => {
    const [dimensions, setDimensions] = useState({ left: 0, width: 0, top: 0, height: 0 });
    const modalRef = useRef<HTMLDivElement>(null);

    // 筛选出支持图表的测量节点
    const measurementNodes = useMemo(() => {
        return nodes.filter(node => MEASUREMENT_NODE_TYPES.includes(node.type));
    }, [nodes]);

    // 当前活跃的节点索引（用于高亮显示）
    const activeNodeIndex = systemState?.currentStep?.index ?? -1;

    // 计算 Modal 尺寸和位置
    useEffect(() => {
        if (!isOpen) return;

        const computeDimensions = () => {
            const computedStyle = getComputedStyle(document.documentElement);

            // 获取 CSS 变量（需要解析计算后的实际值）
            const sidebarW = parseFloat(computedStyle.getPropertyValue('--sidebar-w')) || 256;
            const propertyW = parseFloat(computedStyle.getPropertyValue('--property-w')) || 256;
            const space = parseFloat(computedStyle.getPropertyValue('--space')) || 24;
            const navbarH = parseFloat(computedStyle.getPropertyValue('--navbar-h')) || 48;

            // 计算边界
            // --sidebar-r = space + sidebar-w
            // --property-l = 100vw - space - property-w
            const sidebarR = space + sidebarW;
            const propertyL = window.innerWidth - space - propertyW;

            // Canvas 顶部 = space + navbar-h + space
            const canvasTop = space + navbarH + space;

            // Canvas 可用高度（视口高度减去顶部和底部空间）
            const canvasHeight = window.innerHeight - canvasTop - (navbarH + 2 * space);

            setDimensions({
                left: sidebarR,
                width: propertyL - sidebarR,
                top: canvasTop + (canvasHeight * 0.1), // 上方留 10% 空间
                height: canvasHeight * 0.66 // 2/3 高度
            });
        };

        computeDimensions();
        window.addEventListener('resize', computeDimensions);

        return () => window.removeEventListener('resize', computeDimensions);
    }, [isOpen]);

    // ESC 键关闭
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <Portal isOpen={isOpen} onClose={onClose} pointerEvents="auto">
            {/* 背景遮罩 */}
            <div
                className="chart-modal-backdrop"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                    zIndex: 'var(--z-modal, 200)'
                }}
            />

            {/* Modal 主体 */}
            <div
                ref={modalRef}
                className="chart-modal glass"
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'fixed',
                    left: dimensions.left,
                    top: dimensions.top,
                    width: dimensions.width,
                    height: dimensions.height,
                    zIndex: 'calc(var(--z-modal, 200) + 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {/* 标题栏 */}
                <div
                    className="chart-modal-header"
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 'var(--size-sm) var(--size-md)',
                        borderBottom: '1px solid var(--glass-border)',
                        flexShrink: 0
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: 'var(--size-lg)', color: 'var(--text-primary)' }}>
                        📊 实时测量图表
                    </h3>
                    <button
                        onClick={onClose}
                        className="chart-modal-close-btn"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: 'var(--size-lg)',
                            cursor: 'pointer',
                            padding: 'var(--size-2xs)',
                            borderRadius: 'var(--radius-sm)',
                            transition: 'var(--transition-fast)'
                        }}
                        title="关闭 (ESC)"
                    >
                        ✕
                    </button>
                </div>

                {/* 图表内容区 */}
                <div
                    className="chart-modal-content"
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: 'var(--size-md)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                        gap: 'var(--size-md)',
                        alignContent: 'start'
                    }}
                >
                    {measurementNodes.length === 0 ? (
                        <div
                            className="chart-modal-empty"
                            style={{
                                gridColumn: '1 / -1',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                color: 'var(--text-muted)'
                            }}
                        >
                            <span style={{ fontSize: '3rem', marginBottom: 'var(--size-md)' }}>📈</span>
                            <span>当前工作流没有测量节点</span>
                            <span style={{ fontSize: 'var(--size-sm)', marginTop: 'var(--size-xs)' }}>
                                添加 EIS、OCP、电压/电流斜坡等测量节点后可查看图表
                            </span>
                        </div>
                    ) : (
                        measurementNodes.map((node, idx) => {
                            const globalIndex = nodes.findIndex(n => n.id === node.id);
                            const nodeConfig = NODE_CONFIGS[node.type];
                            const nodeName = nodeConfig?.name || node.type;

                            return (
                                <NodeChart
                                    key={node.id}
                                    nodeIndex={globalIndex}
                                    nodeConfig={{ name: nodeName, ...node.config }}
                                    systemState={systemState}
                                />
                            );
                        })
                    )}
                </div>

                {/* 底部状态栏 */}
                <div
                    className="chart-modal-footer"
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
        </Portal>
    );
};
