// --- START OF FILE apps/frontend/src/components/canvas/NodeRenderer.tsx ---

import React, { memo, useCallback, useMemo } from 'react';
// 移除旧的 ElectrochemicalNode，引入通用类型或直接定义
import { DisplayNode } from './useLayout';
import { NodeParameterDisplay } from './NodeParameterDisplay';
import { NodeIconSvg } from '../NodeIconSvg';
import { UiIconSvg } from '../shared/UiIconSvg';

export interface NodeRendererProps {
  // 接收统一布局生成的节点对象
  node: DisplayNode;
  index?: number;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectionStart?: string | null;
  nodeStatus?: string; // 节点执行状态: idle, running, completed, failed, paused, pending

  // 事件回调 (参数类型改为 DisplayNode)
  onNodeClick?: (node: DisplayNode) => void;
  onNodeDoubleClick?: (node: DisplayNode) => void;
  onNodeContextMenu?: (node: DisplayNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: DisplayNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: DisplayNode, event: React.DragEvent) => void;
}

function hasSameNodeData(
  prevData: Record<string, unknown>,
  nextData: Record<string, unknown>
): boolean {
  if (prevData === nextData) return true;

  const prevKeys = Object.keys(prevData);
  const nextKeys = Object.keys(nextData);
  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    if (prevData[key] !== nextData[key]) return false;
  }

  return true;
}

/**
 * 节点渲染器组件
 */
export const NodeRenderer: React.FC<NodeRendererProps> = memo(({
  node,
  index,
  isSelected = false,
  isConnecting = false,
  connectionStart = null,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd,
  nodeStatus = 'idle' // 默认状态
}) => {
  // 1. 直接从注入的数据中读取显示属性
  const displayName = node.data.label || node.type;
  const icon = node.data.icon || <UiIconSvg name="workflow" />;
  const nodeType = node.data._nodeType; // 原始类型
  const params = node.data; // 参数即本身 (扁平化)

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  }, [node, onNodeClick]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeDoubleClick?.(node);
  }, [node, onNodeDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu?.(node, e);
  }, [node, onNodeContextMenu]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onNodeDragStart?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [node, onNodeDragStart]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    onNodeDragEnd?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, [node, onNodeDragEnd]);

  // 拖放视觉反馈逻辑保持不变
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  }, []);

  // 样式计算
  const nodeStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      left: node.position.x,
      top: node.position.y,
      width: node.style.width || 132,
      height: node.style.height || 60,
      cursor: 'grab',
    };
  }, [node.position.x, node.position.y, node.style.height, node.style.width]);

  // 状态样式 - 使用真实节点状态
  const nodeClassName = useMemo(() => {
    // 状态映射: idle, run/running, completed, failed, paused… → status-xxx
    const statusClass = `status-${nodeStatus === 'run' ? 'running' : nodeStatus}`;
    return `node glass ${statusClass} ${isSelected ? 'is-selected' : ''
      } ${isConnecting ? 'is-connecting' : ''
      } ${isDragOver ? 'is-drag-over' : ''
      }`.trim();
  }, [nodeStatus, isSelected, isConnecting, isDragOver]);

  return (
    <div
      className={nodeClassName}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      key={node.id}
    >
      <div className="node__index-badge">
        {typeof index === 'number' ? `[${index + 1}]` : ''}
      </div>

      <div className="node__icon node__icon--large">
        <NodeIconSvg nodeType={nodeType} fallback={icon} />
      </div>

      <div className="node__content">
        <div className="node__title">
          {displayName}
        </div>

        {/* --- 参数显示区域 (数据驱动) --- */}
        <NodeParameterDisplay nodeType={nodeType} params={params} />
      </div>

      {isSelected && (
        <div className="node__selection-border" />
      )}

      {/* 连接指示器预留 */}
      {isConnecting && connectionStart === node.id && (
        <div className="connection-start__indicator"><UiIconSvg name="link" /></div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node.id === next.node.id &&
    prev.index === next.index &&
    prev.isSelected === next.isSelected &&
    prev.isConnecting === next.isConnecting &&
    prev.nodeStatus === next.nodeStatus && // 添加状态比较
    hasSameNodeData(prev.node.data, next.node.data) &&
    prev.node.position.x === next.node.position.x &&
    prev.node.position.y === next.node.position.y &&
    prev.node.style?.width === next.node.style?.width &&
    prev.node.style?.height === next.node.style?.height
  );
});
