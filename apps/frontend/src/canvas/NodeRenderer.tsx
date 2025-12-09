// --- START OF FILE apps/frontend/src/components/canvas/NodeRenderer.tsx ---

import React, { memo, useCallback, useMemo } from 'react';
// 移除旧的 ElectrochemicalNode，引入通用类型或直接定义
import { DisplayNode } from './useLayout';
import { NodeParameterDisplay } from './NodeParameterDisplay';

export interface NodeRendererProps {
  // 接收统一布局生成的节点对象
  node: DisplayNode & {
    layoutMeta?: {
      index: number;
      row: number;
      col: number;
      isLeftToRight: boolean;
      isInOddRow: boolean;
      width: number;
      columns: number;
      [key: string]: any;
    };
  };
  index?: number;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectionStart?: string | null;

  // 事件回调 (参数类型改为 DisplayNode)
  onNodeClick?: (node: DisplayNode) => void;
  onNodeDoubleClick?: (node: DisplayNode) => void;
  onNodeContextMenu?: (node: DisplayNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: DisplayNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: DisplayNode, event: React.DragEvent) => void;
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
  onNodeDragEnd
}) => {
  // 1. 直接从注入的数据中读取显示属性
  const displayName = node.data.label || node.type;
  const icon = node.data.icon || '📦';
  const nodeType = node.data._nodeType; // 原始类型
  const params = node.data; // 参数即本身 (扁平化)

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  }, [node.id, onNodeClick]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeDoubleClick?.(node);
  }, [node.id, onNodeDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu?.(node, e);
  }, [node.id, onNodeContextMenu]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onNodeDragStart?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [node.id, index, onNodeDragStart]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    onNodeDragEnd?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, [node.id, index, onNodeDragEnd]);

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
      width: (node as any).style?.width || 180,  // 从注入的style取
      height: (node as any).style?.height || 60,
      cursor: 'grab',
    };
  }, [node.position.x, node.position.y]);

  // 状态样式
  const nodeClassName = useMemo(() =>
    `node glass status-idle ${ // TODO: 绑定真实状态
    isSelected ? 'selected' : ''
    } ${isConnecting ? 'connecting' : ''
    } ${isDragOver ? 'drag-over' : ''
    }`,
    [isSelected, isConnecting, isDragOver]
  );

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
      <div className="node-index-badge">
        [{index}]
      </div>

      <div className="node-icon-large">
        {icon}
      </div>

      <div className="node-content">
        <div className="node-title">
          {displayName}
        </div>

        {/* --- 参数显示区域 (数据驱动) --- */}
        <NodeParameterDisplay nodeType={nodeType} params={params} />
      </div>

      {isSelected && (
        <div className="node-selection-border" />
      )}

      {/* 连接指示器预留 */}
      {isConnecting && connectionStart === node.id && (
        <div className="connection-start-indicator">🔗</div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node.id === next.node.id &&
    prev.isSelected === next.isSelected &&
    prev.isConnecting === next.isConnecting &&
    JSON.stringify(prev.node.data) === JSON.stringify(next.node.data) &&
    prev.node.position.x === next.node.position.x &&
    prev.node.position.y === next.node.position.y
  );
});