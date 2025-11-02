import React from 'react';
import { NotificationPanel } from './NotificationPanel';
import { useCanvasStore } from '../services/stores/canvasStore';
import type { LoopInfo } from './features/loop';

interface StatusBarProps {
  zoomLevel: number;
  isRunning: boolean;
  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;
  detectedLoops?: LoopInfo[];
}

export const StatusBar: React.FC<StatusBarProps> = ({
  zoomLevel,
  isRunning,
  isNotificationPanelOpen,
  setIsNotificationPanelOpen,
  detectedLoops = []
}) => {
  const { nodes, connections, selectedNode } = useCanvasStore();
  const nodeCount = nodes.length;
  const connectionCount = connections.length;
  const loopCount = detectedLoops.length;

  const formatZoomLevel = (zoom: number): string => {
    return `${Math.round(zoom * 100)}%`;
  };

  const getStatusMessage = (): string => {
    if (isRunning) {
      return '流程运行中...';
    }
    
    if (selectedNode) {
      return `已选择: ${selectedNode.name}`;
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
              <span className="node-id">ID: {selectedNode.id.substring(0, 50)}...</span>
            </div>
            <div className="node-divider"></div>
            <div className="node-row node-details-row">
              <span className="node-type">{selectedNode.type}</span>
              <span className="separator">|</span>
              <span className="node-status">{selectedNode.status}</span>
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

        <div className="status-item">
          <span className="stat-label">连接:</span>
          <span className="stat-value glass">{connectionCount}</span>
        </div>

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
        {/* 内存使用率 */}
        <div className="status-item">
          <span className="memory-label">内存:</span>
          <span className="memory-value glass">
            {Math.round((performance as any).memory ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 : 0)}MB
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