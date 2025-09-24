import React from 'react';
import { ElectrochemicalNode } from '../nodes/types';
import { NotificationPanel } from './NotificationPanel';

interface StatusBarProps {
  nodeCount: number;
  connectionCount: number;
  zoomLevel: number;
  isRunning: boolean;
  selectedNode: ElectrochemicalNode | null;
  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  nodeCount,
  connectionCount,
  zoomLevel,
  isRunning,
  selectedNode,
  isNotificationPanelOpen,
  setIsNotificationPanelOpen
}) => {
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
            <span className="node-id">ID: {selectedNode.id.substring(0, 8)}...</span>
            <span className="separator">|</span>
            <span className="node-type">{selectedNode.type}</span>
            <span className="separator">|</span>
            <span className="node-status">{selectedNode.status}</span>
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