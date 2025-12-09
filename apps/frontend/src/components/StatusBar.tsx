import React from 'react';
import { NotificationPanel } from './NotificationPanel';
import { useCanvasStore } from '../canvas/canvasStore'; // 修正 Store 路径
import { NODE_CONFIGS } from '../types/NodeConfiguration'; // 引入配置以获取节点显示名称
import type { SimpleLoopInfo } from '../canvas/useLoopDetection'; // 修正 Hooks 路径

interface StatusBarProps {
  zoomLevel: number;
  isRunning: boolean;
  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;
  detectedLoops?: SimpleLoopInfo[];
}

export const StatusBar: React.FC<StatusBarProps> = ({
  zoomLevel,
  isRunning,
  isNotificationPanelOpen,
  setIsNotificationPanelOpen,
  detectedLoops = []
}) => {
  // ✅ 修复 1: 移除 connections, 使用 selectedNodeId
  const { nodes, selectedNodeId } = useCanvasStore();

  // ✅ 修复 2: 动态派生选中节点信息
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  // 获取静态显示名称
  const nodeConfig = selectedNode ? NODE_CONFIGS[selectedNode.type] : null;
  const displayName = nodeConfig?.name || selectedNode?.type;

  const nodeCount = nodes.length;
  // const connectionCount = connections.length; // 已移除
  const loopCount = detectedLoops.length;

  const formatZoomLevel = (zoom: number): string => {
    return `${Math.round(zoom * 100)}%`;
  };

  const getStatusMessage = (): string => {
    if (isRunning) {
      return '流程运行中...';
    }

    if (selectedNode) {
      return `已选择: ${displayName}`;
    }

    return '就绪';
  };

  return (
    <div className="status-bar glass">
      {/* 左侧：状态信息 */}
      <div className="status-left">
        {/* 运行状态 */}
        <div
          className="status-item notification-trigger"
          onClick={() => setIsNotificationPanelOpen(!isNotificationPanelOpen)}
          title="点击打开通知面板"
        >
          <span className={`status-indicator ${isRunning ? 'status-running' : 'status-ready'}`} />
          <span className="status-message">{getStatusMessage()}</span>
        </div>

        {/* 选中节点信息 */}
        {selectedNode && (
          <div className="selected-node-info glass">
            <div className="node-row node-id-row">
              {/* 显示部分 ID */}
              <span className="node-id">ID: {selectedNode.id.substring(0, 18)}...</span>
            </div>
            <div className="node-divider"></div>
            <div className="node-row node-details-row">
              <span className="node-type">{selectedNode.type}</span>
              {/* WorkflowNode 不再直接包含 status，这里只显示类型，保持简洁 */}
            </div>
          </div>
        )}
      </div>

      {/* 中间：统计信息 */}
      <div className="status-center">
        <div className="status-item">
          <span className="stat-label">节点:</span>
          <span className="stat-value glass">{nodeCount}</span>
        </div>

        {/* 连接数统计已移除 */}

        <div className="status-item">
          <span className="stat-label">循环:</span>
          <span className="stat-value glass">{loopCount}</span>
        </div>

        <div className="status-item">
          <span className="stat-label">缩放:</span>
          <span className="stat-value glass">{formatZoomLevel(zoomLevel)}</span>
        </div>
      </div>

      {/* 右侧：系统信息 */}
      <div className="status-right">
        {/* 内存使用率 (仅 Chrome/Edge 支持，加个简单判断) */}
        <div className="status-item">
          <span className="memory-label">内存:</span>
          <span className="memory-value glass">
            {typeof performance !== 'undefined' && (performance as any).memory
              ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) + 'MB'
              : 'N/A'}
          </span>
        </div>

        {/* 版本信息 */}
        <div className="version-info glass">
          <span className="app-name">ZahnerFlow</span>
          <span className="app-version">v1.0.0</span>
        </div>

        {/* 时间 */}
        <div className="current-time glass">
          {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* 通知面板 */}
      <NotificationPanel
        isOpen={isNotificationPanelOpen}
        onClose={() => setIsNotificationPanelOpen(false)}
      />
    </div>
  );
};