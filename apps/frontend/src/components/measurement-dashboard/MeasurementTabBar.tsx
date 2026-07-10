/**
 * 测量面板 Tab 栏组件
 * 提取自 MeasurementDashboard.tsx
 *
 * 两种渲染模式：
 * - variant="primary"  → 一级标签按钮（测量类型切换）
 * - variant="header"   → Modal 内部标题栏（步骤标题 + 二级标签 + 状态药丸）
 */

import React from 'react';
import type { WorkflowNode, ExecutionSnapshot } from '@zahnerflow/types';
import { NODE_CONFIGS } from '../../types/NodeConfiguration';
import { EisLegendScheme, IterationSymbol, getEisLegendVisual } from '../../utils/colorUtils';
import { getBulkIconCells, BulkDisplayMode } from './useBulkSelection';
import { UiIconSvg } from '../shared/UiIconSvg';
import {
  deriveNodeExecutionUiPhase,
  useExecutionStore,
} from '../../state/executionStateBridge';

// ─── Props ───────────────────────────────────────────────

interface MeasurementTabBarProps {
  /** 渲染模式 */
  variant: 'primary' | 'header';

  /** 所有测量节点 */
  measurementNodes: WorkflowNode[];
  /** 按类型分组后的类别列表 */
  groupedCategories: Array<{ key: string; label: string; nodes: WorkflowNode[] }>;
  /** node.id → 全局索引映射 */
  nodeIdToIndexMap: Map<string, number>;

  /** 当前选中的大类 key */
  activeTypeKey: string;
  /** 已选中的节点 ID 集合 */
  selectedNodeIds: Set<string>;
  /** 当前可见的节点列表 */
  visibleNodes: WorkflowNode[];
  /** 可见节点的索引映射 */
  visibleNodeIndexMap: Map<string, number>;
  /** 当前代表节点（标题药丸用） */
  activeNode?: WorkflowNode | null;

  /** 执行状态快照 */
  systemState: ExecutionSnapshot | null;

  /** EIS 图例配色方案 */
  eisLegendScheme: EisLegendScheme;
  /** 批量显示模式 */
  bulkMode: BulkDisplayMode;

  /** 二级标签是否溢出 */
  isSecondaryOverflowing?: boolean;
  /** 二级标签是否展开 */
  isSecondaryExpanded?: boolean;
  /** 二级标签容器 ref */
  secondaryTabsRef?: React.RefObject<HTMLDivElement | null>;
  /** 二级标签内容区 ref */
  secondaryTabsContentRef?: React.RefObject<HTMLDivElement | null>;

  /** 点击一级标签 */
  onTypeClick: (key: string) => void;
  /** 点击二级标签（节点选择） */
  onNodeClick?: (nodeId: string) => void;
  /** 点击批量切换按钮 */
  onBulkToggleClick?: () => void;
  /** 展开/收起二级标签 */
  onSecondaryExpandedChange?: (expanded: boolean) => void;
}

// ─── 图例标记样式 ────────────────────────────────────────

const getLegendMarkerStyle = (color: string, symbol: IterationSymbol): React.CSSProperties => {
  const base: React.CSSProperties = {
    width: 8,
    height: 8,
    background: color,
    boxShadow: `0 0 6px ${color}`,
    flexShrink: 0
  };

  switch (symbol) {
    case 'rect':
      return { ...base, borderRadius: 1 };
    case 'triangle':
      return { ...base, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' };
    case 'diamond':
      return { ...base, transform: 'rotate(45deg)' };
    case 'roundRect':
      return { ...base, width: 10, borderRadius: 3 };
    case 'circle':
    default:
      return { ...base, borderRadius: '50%' };
  }
};

// ─── 组件 ────────────────────────────────────────────────

export const MeasurementTabBar: React.FC<MeasurementTabBarProps> = (props) => {
  const nodeStatuses = useExecutionStore(state => state.nodeStatuses);
  if (props.measurementNodes.length === 0) return null;

  return props.variant === 'primary'
    ? renderPrimaryTabs(props)
    : renderModalHeader(props, nodeStatuses);
};

// ─── 一级标签 ────────────────────────────────────────────

function renderPrimaryTabs(props: MeasurementTabBarProps) {
  const { groupedCategories, activeTypeKey, onTypeClick } = props;

  return (
    <div className="chart-modal__tabs-primary">
      {groupedCategories.map(group => {
        const isActive = activeTypeKey === group.key;
        return (
          <button
            key={group.key}
            className={`tab-primary-item ${isActive ? 'is-active' : ''}`}
            onClick={() => onTypeClick(group.key)}
          >
            <span>{group.label}</span>
            <span className="tab-primary-item__badge">{group.nodes.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Modal 内部标题栏 ────────────────────────────────────

function renderModalHeader(props: MeasurementTabBarProps, nodeStatuses: string[]) {
  const {
    groupedCategories,
    nodeIdToIndexMap,
    activeTypeKey,
    selectedNodeIds,
    visibleNodes,
    visibleNodeIndexMap,
    activeNode,
    systemState,
    eisLegendScheme,
    bulkMode,
    isSecondaryOverflowing = false,
    isSecondaryExpanded = false,
    secondaryTabsRef,
    secondaryTabsContentRef,
    onNodeClick,
    onBulkToggleClick,
    onSecondaryExpandedChange,
  } = props;

  if (!activeNode) return null;

  const activeGroup = groupedCategories.find(g => g.key === activeTypeKey);

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        height: '32px',
        zIndex: 10,
        pointerEvents: 'none'
      }}
    >
      {/* 左侧：步骤标题药丸 */}
      <div
        className="tab-secondary-item"
        style={{
          cursor: 'default',
          color: '#fff',
          fontWeight: 500,
          background: 'rgba(255, 255, 255, 0.05)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          padding: '0 0.85rem',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transform: 'translateZ(0)',
          willChange: 'transform, filter, backdrop-filter',
          pointerEvents: 'auto'
        }}
      >
        步骤{nodeIdToIndexMap.get(activeNode.id)! + 1}: {NODE_CONFIGS[activeNode.type]?.name || activeNode.type}
        <span style={{
          marginLeft: 8,
          fontSize: '11px',
          color: activeNode.type.includes('eis') ? '#52c41a' : '#40a9ff',
          fontWeight: 'normal'
        }}>
          [{activeNode.type.includes('eis')
            ? 'Nyquist'
            : activeNode.type.includes('switching') || activeNode.type.includes('step_ramp')
              ? 'Chrono I-V-T'
              : 'I-V-T'}]
        </span>
      </div>

      {/* 中间：二级标签 + 批量切换 + 展开箭头 */}
      {activeGroup && activeGroup.nodes.length > 0 && (
        <div
          style={{
            margin: '0 24px',
            flex: 1,
            position: 'relative',
            height: '100%',
            minWidth: 0,
            pointerEvents: 'auto'
          }}
        >
          <div
            ref={secondaryTabsRef}
            className={`chart-modal__tabs-secondary ${isSecondaryExpanded ? 'is-expanded' : ''} ${isSecondaryOverflowing ? 'is-overflowing' : 'is-fit-content'}`}
            onClick={() => {
              if (!isSecondaryExpanded && onSecondaryExpandedChange) {
                onSecondaryExpandedChange(true);
              }
            }}
          >
            {/* 子 Tab 列表 */}
            <div ref={secondaryTabsContentRef} className="chart-modal__tabs-secondary-content">
              {activeGroup.nodes.map(node => {
                const globalIndex = nodeIdToIndexMap.get(node.id) ?? -1;
                const isActive = selectedNodeIds.has(node.id);

                const nodePhase = deriveNodeExecutionUiPhase(
                  nodeStatuses[globalIndex],
                  globalIndex,
                  systemState,
                );

                let stateClass = '';
                if (nodePhase === 'running' || nodePhase === 'paused' || nodePhase === 'cancelling') stateClass = 'is-running';
                else if (nodePhase === 'completed') stateClass = 'is-completed';
                else if (nodePhase === 'failed') stateClass = 'is-failed';
                else if (nodePhase === 'cancelled') stateClass = 'is-cancelled';
                else stateClass = 'is-pending';

                const visibleIndex = visibleNodeIndexMap.get(node.id) ?? -1;
                const markerVisual = visibleIndex >= 0
                  ? getEisLegendVisual(visibleIndex, Math.max(visibleNodes.length, 1), eisLegendScheme)
                  : undefined;

                return (
                  <button
                    key={node.id}
                    className={`tab-secondary-item ${isActive ? 'is-active' : ''} ${stateClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNodeClick?.(node.id);
                    }}
                  >
                    {markerVisual && (
                      <span
                        aria-hidden="true"
                        style={getLegendMarkerStyle(markerVisual.color, markerVisual.symbol)}
                      />
                    )}
                    #{globalIndex + 1}
                  </button>
                );
              })}
            </div>

            {/* 批量显示按钮 */}
            <button
              type="button"
              className={`chart-modal__tabs-secondary-bulk ${bulkMode !== 'none' ? 'is-active' : ''}`}
              aria-label="批量显示子标签"
              onClick={(e) => {
                e.stopPropagation();
                onBulkToggleClick?.();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                {getBulkIconCells(bulkMode).map((isLit, index) => {
                  const x = 2 + (index % 3) * 4;
                  const y = 3 + Math.floor(index / 3) * 5;
                  return (
                    <rect
                      key={index}
                      x={x}
                      y={y}
                      width="2.7"
                      height="2.7"
                      rx="0.7"
                      fill={isLit ? '#ffd666' : 'currentColor'}
                      opacity={isLit ? 1 : 0.28}
                    />
                  );
                })}
              </svg>
            </button>

            {/* 展开/收起箭头 */}
            <div
              className="chart-modal__tabs-secondary-arrow"
              onClick={(e) => {
                e.stopPropagation();
                onSecondaryExpandedChange?.(!isSecondaryExpanded);
              }}
            >
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                style={{
                  transform: isSecondaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease-in-out'
                }}
              >
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* 右侧：测量状态药丸 */}
      {(() => {
        const globalIndex = nodeIdToIndexMap.get(activeNode.id) ?? -1;
        const nodePhase = deriveNodeExecutionUiPhase(
          nodeStatuses[globalIndex],
          globalIndex,
          systemState,
        );
        const isPending = nodePhase === 'pending';
        const isRunning = nodePhase === 'running';
        const isFailed = nodePhase === 'failed';
        const isCancelled = nodePhase === 'cancelled';

        let borderColor = 'rgba(24, 144, 255, 0.2)';
        if (isRunning) borderColor = 'rgba(82, 196, 26, 0.4)';
        else if (isPending) borderColor = 'rgba(250, 173, 20, 0.3)';
        else if (isFailed) borderColor = 'rgba(255, 77, 79, 0.45)';
        else if (isCancelled) borderColor = 'rgba(250, 173, 20, 0.4)';

        return (
          <div
            className="tab-secondary-item"
            style={{
              cursor: 'default',
              padding: '0 0.85rem',
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              borderColor,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              transform: 'translateZ(0)',
              willChange: 'transform, filter, backdrop-filter',
              color: isRunning ? '#52c41a' : isFailed ? '#ff4d4f' : isPending || isCancelled ? '#faad14' : '#1890ff',
              fontWeight: isRunning ? 'bold' : 'normal',
              pointerEvents: 'auto'
            }}
          >
            {isPending && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UiIconSvg name="timer" />
                等待
              </span>
            )}
            {isRunning && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '5px',
                  height: '5px',
                  background: '#52c41a',
                  borderRadius: '50%',
                  boxShadow: '0 0 6px #52c41a',
                  animation: 'tab-pulse 1.5s infinite'
                }} />
                测量中
              </span>
            )}
            {nodePhase === 'paused' && <span>已暂停</span>}
            {nodePhase === 'cancelling' && <span>停止中</span>}
            {isFailed && <span><UiIconSvg name="error" />失败</span>}
            {isCancelled && <span>已取消</span>}
            {nodePhase === 'completed' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UiIconSvg name="check" />
                已完成
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default MeasurementTabBar;
