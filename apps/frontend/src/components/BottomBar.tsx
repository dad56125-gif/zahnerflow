import React, { useState, useEffect } from 'react';
import { NotificationPanel } from './NotificationPanel';
import { ProgressBar } from './ProgressBar';
import { useCanvasStore } from '../state/canvasStore';
import { NODE_CONFIGS } from '../types/NodeConfiguration';
import type { ExecutionSnapshot } from '@zahnerflow/types';
import type { SimpleLoopInfo } from './canvas/useLoopDetection';
import { useAppStore } from '../state/appStore';
import { describeExecution } from '../state/executionStateModel';

interface BottomBarProps {
  detectedLoops?: SimpleLoopInfo[];
  systemState?: ExecutionSnapshot | null;
  onProgressBarClick?: () => void;
  suppressPlannedEstimate?: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  detectedLoops = [],
  systemState = null,
  onProgressBarClick,
  suppressPlannedEstimate = false
}) => {
  const { nodes, selectedNodeId } = useCanvasStore();
  const notificationPanelOpen = useAppStore(state => state.notificationPanelOpen);
  const toggleNotificationPanel = useAppStore(state => state.toggleNotificationPanel);
  const setNotificationPanelOpen = useAppStore(state => state.setNotificationPanelOpen);
  const execution = describeExecution(systemState);

  // ✅ 实时时钟状态
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // ✅ 每秒更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 动态派生选中节点信息
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const nodeConfig = selectedNode ? NODE_CONFIGS[selectedNode.type] : null;
  const displayName = nodeConfig?.name || selectedNode?.type;

  const nodeCount = nodes.length;
  const loopCount = detectedLoops.length;

  const getStatusMessage = (): string => {
    if (execution.phase !== 'idle') {
      return execution.view.message;
    }

    if (selectedNode) {
      return `已选择: ${displayName}`;
    }

    return '就绪';
  };

  return (
    <div className="bottom-bar glass-layout">
      {/* 左侧：状态信息 */}
      <div className="bottom-bar__left">
        {/* 运行状态 */}
        <div
          className="bottom-bar__item notification-trigger"
          onClick={toggleNotificationPanel}
          title="点击打开通知面板"
        >
          <span className={`bottom-bar__run-dot ${execution.is.active ? 'is-running' : 'is-ready'}`} />
          {systemState?.executionId && <span className="badge" title={`${systemState.workflowName || ''} · ${systemState.ownerName || ''} · ${systemState.executionId}`}>
            {{ app: 'App', cli: 'CLI', agent: 'Agent' }[systemState.commandSource || 'app']}
          </span>}
          <span className="bottom-bar__message">{getStatusMessage()}</span>
        </div>
      </div>

      {/* 中间：进度条 */}
      <div className="bottom-bar__center">
        <ProgressBar
          systemState={systemState}
          nodes={nodes}
          onClick={onProgressBarClick}
          suppressPlannedEstimate={suppressPlannedEstimate}
        />
      </div>

      {/* 右侧：统计信息 */}
      <div className="bottom-bar__right">
        <span className="bottom-bar__stat">节点: <strong>{nodeCount}</strong></span>
        <span className="bottom-bar__stat">循环: <strong>{loopCount}</strong></span>
        <span className="bottom-bar__stat bottom-bar__stat--time">{currentTime}</span>
      </div>

      {/* 通知面板 */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
      />
    </div>
  );
};
