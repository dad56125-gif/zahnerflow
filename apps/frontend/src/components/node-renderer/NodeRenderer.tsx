/**
 * 动态节点渲染器
 *
 * 根据节点类型动态选择并渲染对应的节点组件
 * 如果没有对应的组件，则使用默认渲染器
 */

import React from 'react';
import { ElectrochemicalNode } from '../../nodes/types';
import { getNodeComponent, hasNodeComponent } from './NodeComponentRegistry';
import { DefaultNodeRenderer } from './DefaultNodeRenderer';
import { useCanvasStore } from '../../stores/canvasStore';

export interface NodeRendererProps {
  node: ElectrochemicalNode;
  index?: number;
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectionStart?: string | null;
}

/**
 * 动态节点渲染器组件
 */
export const NodeRenderer: React.FC<NodeRendererProps> = ({
  node,
  index,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd,
  isSelected = false,
  isConnecting = false,
  connectionStart = null
}) => {
  const { updateNode, selectedNode } = useCanvasStore();

  // 节点更新处理函数
  const handleNodeUpdate = (updatedNode: Partial<ElectrochemicalNode>) => {
    updateNode({
      ...node,
      ...updatedNode,
      data: {
        ...node.data,
        ...updatedNode.data,
        updatedAt: new Date()
      }
    });
  };

  // 节点点击处理
  const handleNodeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onNodeClick?.(node);
  };

  // 节点双击处理
  const handleNodeDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onNodeDoubleClick?.(node);
  };

  // 节点右键菜单处理
  const handleNodeContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onNodeContextMenu?.(node, event);
  };

  // 节点拖拽开始处理
  const handleNodeDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('nodeId', node.id);
    event.dataTransfer.setData('nodeIndex', index?.toString() || '0');
    onNodeDragStart?.(node, event);
  };

  // 节点拖拽结束处理
  const handleNodeDragEnd = (event: React.DragEvent) => {
    onNodeDragEnd?.(node, event);
  };

  // 检查是否有对应的节点组件
  if (hasNodeComponent(node.type)) {
    const NodeComponent = getNodeComponent(node.type)!;

    return (
      <div
        className={`node-wrapper enhanced-node ${isSelected ? 'selected' : ''} ${isConnecting ? 'connecting' : ''}`}
        style={{
          position: 'absolute',
          left: node.position.x,
          top: node.position.y,
          width: node.style.width || 140,
          height: node.style.height || 60,
        }}
        onClick={handleNodeClick}
        onDoubleClick={handleNodeDoubleClick}
        onContextMenu={handleNodeContextMenu}
        draggable
        onDragStart={handleNodeDragStart}
        onDragEnd={handleNodeDragEnd}
      >
        <NodeComponent
          node={node}
          onUpdate={handleNodeUpdate}
        />

        {/* 节点边框高亮 */}
        {isSelected && (
          <div className="node-selection-border" />
        )}

        {/* 连接模式提示 */}
        {isConnecting && connectionStart === node.id && (
          <div className="connection-start-indicator">
            🔗
          </div>
        )}
      </div>
    );
  }

  // 使用默认渲染器
  return (
    <DefaultNodeRenderer
      node={node}
      index={index}
      isSelected={isSelected}
      isConnecting={isConnecting}
      connectionStart={connectionStart}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      onNodeContextMenu={handleNodeContextMenu}
      onNodeDragStart={handleNodeDragStart}
      onNodeDragEnd={handleNodeDragEnd}
    />
  );
};

/**
 * 批量节点渲染器
 */
export interface NodeListRendererProps {
  nodes: ElectrochemicalNode[];
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
}

export const NodeListRenderer: React.FC<NodeListRendererProps> = ({
  nodes,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd
}) => {
  const { selectedNode, isConnecting, connectionStart } = useCanvasStore();

  return (
    <>
      {nodes.map((node, index) => (
        <NodeRenderer
          key={node.id}
          node={node}
          index={index}
          isSelected={selectedNode?.id === node.id}
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

export default NodeRenderer;