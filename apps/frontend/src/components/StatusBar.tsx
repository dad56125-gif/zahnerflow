import React from 'react';
import { NotificationPanel } from './NotificationPanel';
import { ProgressBar } from './ProgressBar';
import { useCanvasStore } from '../canvas/canvasStore';
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import { ExecutionSnapshot } from '../types/Interfaces';
import type { SimpleLoopInfo } from '../canvas/useLoopDetection';

interface StatusBarProps {
  zoomLevel: number;
  isRunning: boolean;
  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;
  detectedLoops?: SimpleLoopInfo[];
  systemState?: ExecutionSnapshot | null;
  onProgressBarClick?: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  zoomLevel,
  isRunning,
  isNotificationPanelOpen,
  setIsNotificationPanelOpen,
  detectedLoops = [],
  systemState = null,
  onProgressBarClick
}) => {
  const { nodes, selectedNodeId } = useCanvasStore();

  // 动态派生选中节点信息
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const nodeConfig = selectedNode ? NODE_CONFIGS[selectedNode.type] : null;
  const displayName = nodeConfig?.name || selectedNode?.type;

  const nodeCount = nodes.length;
  const loopCount = detectedLoops.length;

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
              <span className="node-id">ID: {selectedNode.id.substring(0, 18)}...</span>
            </div>
            <div className="node-divider"></div>
            <div className="node-row node-details-row">
              <span className="node-type">{selectedNode.type}</span>
            </div>
          </div>
        )}
      </div>

      {/* 中间：进度条 */}
      <div className="status-center">
        <ProgressBar
          systemState={systemState}
          onClick={onProgressBarClick}
        />
      </div>

      {/* 右侧：统计信息（简化版） */}
      <div className="status-right">
        <div className="status-item">
          <span className="stat-label">节点:</span>
          <span className="stat-value glass">{nodeCount}</span>
        </div>

        <div className="status-item">
          <span className="stat-label">循环:</span>
          <span className="stat-value glass">{loopCount}</span>
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
