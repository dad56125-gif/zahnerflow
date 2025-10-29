/**
 * 节点渲染器
 *
 * 统一的节点渲染系统，从配置获取显示信息
 * 参数编辑功能完全转移到 PropertyPanel 中
 */

import React from 'react';
import { ElectrochemicalNode, getNodeConfig } from '../nodes/types';

export interface NodeRendererProps {
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
 * 节点渲染器组件
 * 从配置获取节点的显示信息，统一处理所有节点类型
 */
export const NodeRenderer: React.FC<NodeRendererProps> = ({
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
  // 从配置获取节点信息
  const config = getNodeConfig(node.type);
  const displayName = config.name;
  const icon = config.icon;

  // 节点拖拽交换相关状态
  const [isDragOver, setIsDragOver] = React.useState(false);

  // 节点点击处理
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  };

  // 节点双击处理
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeDoubleClick?.(node);
  };

  // 节点右键菜单处理
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu?.(node, e);
  };

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
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
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
        {icon}
      </div>

      {/* 节点标题 */}
      <div className="node-title">
        {displayName}
      </div>

      {/* change_temperature节点的特殊显示 */}
      {node.type === 'change_temperature' && (
        <div className="change_temperature-display">
          {node.data.parameters?.current_temperature && node.data.parameters?.target_temperature ? (
            <>
              {/* 执行后显示温度区间 */}
              <div className="temperature-range">
                {Math.round(node.data.parameters.current_temperature / 10)}→{Math.round(node.data.parameters.target_temperature / 10)}
              </div>
              {/* 执行后显示计算时间 */}
              {node.data.parameters?.calculated_duration && (
                <div className="temperature-time">
                  {node.data.parameters.calculated_duration}分钟
                </div>
              )}
            </>
          ) : (
            /* 执行前显示目标温度 */
            <div className="temperature-target">
              {Math.round((node.data.parameters?.target_temperature || 25) / 10)}°C
            </div>
          )}
        </div>
      )}

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
 * 批量节点渲染器
 */
export interface NodeListRendererProps {
  nodes: ElectrochemicalNode[];
  selectedNodeId?: string | null;
  isConnecting?: boolean;
  connectionStart?: string | null;
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
}

export const NodeListRenderer: React.FC<NodeListRendererProps> = ({
  nodes,
  selectedNodeId,
  isConnecting = false,
  connectionStart = null,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd
}) => {
  return (
    <>
      {nodes.map((node, index) => (
        <NodeRenderer
          key={node.id}
          node={node}
          index={index}
          isSelected={selectedNodeId === node.id}
          isConnecting={isConnecting}
          connectionStart={connectionStart}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDragEnd={onNodeDragEnd}
        />
      ))}
    </>
  );
};

/**
 * 简化的节点渲染器（用于特殊场景）
 */
export const SimpleNodeRenderer: React.FC<{
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

export default NodeRenderer;