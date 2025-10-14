/**
 * 默认节点渲染器
 *
 * 保留现有的节点渲染功能，作为没有专门组件的节点类型的后备渲染器
 * 这确保了向后兼容性，所有现有功能都得到保留
 */

import React from 'react';
import { ElectrochemicalNode } from '../../nodes/types';

export interface DefaultNodeRendererProps {
  node: ElectrochemicalNode;
  index?: number;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectionStart?: string | null;
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
}

/**
 * 默认节点渲染器组件
 * 保持与现有Canvas中节点渲染完全一致的功能
 */
export const DefaultNodeRenderer: React.FC<DefaultNodeRendererProps> = ({
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
  // 节点拖拽交换相关状态（从现有Canvas复制）
  const [isDragOver, setIsDragOver] = React.useState(false);

  // 节点拖拽开始处理
  const handleDragStart = (e: React.DragEvent) => {
    console.log(`开始拖拽节点：${node.name}，当前索引：${index}`);
    onNodeDragStart?.(node, e);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  // 节点拖拽结束处理
  const handleDragEnd = (e: React.DragEvent) => {
    console.log('拖拽结束');
    onNodeDragEnd?.(node, e);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  // 节点拖拽悬停处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  // 节点拖拽离开处理
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // 节点放置处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    // 这里可以添加节点交换逻辑，但现在先保持简单
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  return (
    <div
      className={`node glass status-${node.status} ${
        isSelected ? 'selected' : ''
      } ${
        isConnecting ? 'connecting' : ''
      } ${
        isDragOver ? 'drag-over' : ''
      }`}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.style.width || 140,
        height: node.style.height || 60,
        cursor: 'grab',
      }}
      onClick={onNodeClick}
      onDoubleClick={onNodeDoubleClick}
      onContextMenu={onNodeContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 节点状态指示器 */}
      <div className="node-status-indicator" />

      {/* 节点图标 */}
      <div className="node-icon-large">
        {node.style.icon || '🔧'}
      </div>

      {/* 节点标题 */}
      <div className="node-title">
        {node.name}
      </div>

      {/* 节点端口（占位，后续在端口系统中实现） */}
      <div className="node-port-placeholder input" />
      <div className="node-port-placeholder output" />

      {/* 选中边框 */}
      {isSelected && (
        <div className="node-selection-border" />
      )}

      {/* 连接模式指示器 */}
      {isConnecting && connectionStart === node.id && (
        <div className="connection-start-indicator">
          🔗
        </div>
      )}
    </div>
  );
};

/**
 * 简化的默认节点渲染器（用于特殊场景）
 */
export const SimpleDefaultNodeRenderer: React.FC<{
  node: ElectrochemicalNode;
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ node, isSelected = false, onClick }) => {
  return (
    <div
      className={`node glass status-${node.status} ${
        isSelected ? 'selected' : ''
      }`}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.style.width || 140,
        height: node.style.height || 60,
      }}
      onClick={onClick}
    >
      {/* 节点状态指示器 */}
      <div className="node-status-indicator" />

      {/* 节点图标 */}
      <div className="node-icon-large">
        {node.style.icon || '🔧'}
      </div>

      {/* 节点标题 */}
      <div className="node-title">
        {node.name}
      </div>

      {/* 选中边框 */}
      {isSelected && (
        <div className="node-selection-border" />
      )}
    </div>
  );
};

export default DefaultNodeRenderer;