/**
 * 循环可视化组件
 *
 * 负责可视化显示循环的边界、状态和进度信息
 * 提供直观的循环控制界面
 */

import React from 'react';
import { LoopInfo } from './LoopDetector';
import { LoopBoundary } from '../LoopBoundary';  // 导入LoopBoundary组件
import {
  LoopContextManager,
  LoopExecutionContext,
  LoopExecutionState,
  LoopEvent
} from './LoopContextManager';

// 循环可视化属性接口
export interface LoopVisualizerProps {
  loop: LoopInfo;
  nodes: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  context?: LoopExecutionContext;
  className?: string;
  style?: React.CSSProperties;
  onLoopStart?: (loopId: string) => void;
  onLoopPause?: (loopId: string) => void;
  onLoopResume?: (loopId: string) => void;
  onLoopCancel?: (loopId: string) => void;
  onLoopReset?: (loopId: string) => void;
}

// 内部LoopBoundary组件已删除，使用导入的LoopBoundary组件
// 循环控制面板组件
const LoopControlPanel: React.FC<{
  loop: LoopInfo;
  context?: LoopExecutionContext;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onReset?: () => void;
  className?: string;
}> = ({
  loop,
  context,
  onStart,
  onPause,
  onResume,
  onCancel,
  onReset,
  className = ''
}) => {
  const getStateColor = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '#4CAF50';
      case 'paused': return '#FF9800';
      case 'completed': return '#2196F3';
      case 'error': return '#F44336';
      case 'cancelled': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getStateText = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '运行中';
      case 'paused': return '已暂停';
      case 'completed': return '已完成';
      case 'error': return '错误';
      case 'cancelled': return '已取消';
      default: return '未开始';
    }
  };

  return (
    <div className={`loop-control-panel ${className}`}>
      <div className="loop-info">
        <h4>循环 {loop.id}</h4>
        <div className="loop-parameters">
          <div>迭代次数: {loop.iterationCount}</div>
          <div>包含节点: {loop.nodeIds.length}</div>
          {loop.parameters.delay_ms && (
            <div>延迟: {loop.parameters.delay_ms}ms</div>
          )}
        </div>
      </div>

      {context && (
        <div className="loop-status">
          <div
            className="status-indicator"
            style={{ color: getStateColor(context.state) }}
          >
            {getStateText(context.state)}
          </div>

          <div className="loop-progress-text">
            进度: {context.currentIteration}/{context.totalIterations}
            ({context.progress.toFixed(1)}%)
          </div>

          <div className="loop-time">
            运行时间: {(context.elapsedTime / 1000).toFixed(1)}s
          </div>

          {context.error && (
            <div className="loop-error" style={{ color: '#F44336' }}>
              错误: {context.error}
            </div>
          )}
        </div>
      )}

      <div className="loop-controls">
        {!context || context.state === 'idle' || context.state === 'completed' || context.state === 'error' || context.state === 'cancelled' ? (
          <button
            className="btn-loop-start"
            onClick={onStart}
            title="开始循环"
          >
            ▶️ 开始
          </button>
        ) : context.state === 'running' ? (
          <>
            <button
              className="btn-loop-pause"
              onClick={onPause}
              title="暂停循环"
            >
              ⏸️ 暂停
            </button>
            <button
              className="btn-loop-cancel"
              onClick={onCancel}
              title="取消循环"
            >
              ❌ 取消
            </button>
          </>
        ) : context.state === 'paused' ? (
          <>
            <button
              className="btn-loop-resume"
              onClick={onResume}
              title="恢复循环"
            >
              ▶️ 恢复
            </button>
            <button
              className="btn-loop-cancel"
              onClick={onCancel}
              title="取消循环"
            >
              ❌ 取消
            </button>
          </>
        ) : null}

        <button
          className="btn-loop-reset"
          onClick={onReset}
          title="重置循环"
        >
          🔄 重置
        </button>
      </div>
    </div>
  );
};

/**
 * 循环可视化主组件
 */
export const LoopVisualizer: React.FC<LoopVisualizerProps> = ({
  loop,
  nodes,
  context,
  className = '',
  style = {},
  onLoopStart,
  onLoopPause,
  onLoopResume,
  onLoopCancel,
  onLoopReset
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  // 获取循环内的节点
  const loopNodes = React.useMemo(() => {
    return nodes.filter(node => loop.nodeIds.includes(node.id));
  }, [nodes, loop.nodeIds]);

  const startNode = React.useMemo(() => {
    return loopNodes.find(n => n.id === loop.startNodeId);
  }, [loopNodes, loop.startNodeId]);

  const endNode = React.useMemo(() => {
    return loopNodes.find(n => n.id === loop.endNodeId);
  }, [loopNodes, loop.endNodeId]);

  // 如果找不到开始或结束节点，不渲染
  if (!startNode || !endNode || loopNodes.length === 0) {
    return null;
  }

  // 转换节点格式以匹配LoopBoundary组件的接口
  const adaptNodeToLoopNode = React.useCallback((node: any, type: 'loop_start' | 'loop_end') => {
    return {
      id: node.id,
      type,
      data: {
        parameters: {
          loop_id: loop.id,
          loop_count: loop.iterationCount,
          loop_variable: loop.parameters.loop_variable || 'i',
          start_value: loop.parameters.start_value || 0,
          step: loop.parameters.step || 1,
          delay_ms: loop.parameters.delay_ms,
          break_condition: loop.parameters.break_condition,
          continue_condition: loop.parameters.continue_condition,
          data_accumulation: loop.parameters.data_accumulation || 'all',
          export_format: loop.parameters.export_format || 'csv'
        }
      },
      position: { x: node.x, y: node.y }
    };
  }, [loop.id, loop.iterationCount, loop.parameters]);

  const startNodeData = React.useMemo(() => {
    return adaptNodeToLoopNode(startNode, 'loop_start');
  }, [startNode, adaptNodeToLoopNode]);

  const endNodeData = React.useMemo(() => {
    return adaptNodeToLoopNode(endNode, 'loop_end');
  }, [endNode, adaptNodeToLoopNode]);

  // 根据执行状态设置样式类
  const getStateClass = React.useCallback(() => {
    if (!context) return '';
    switch (context.state) {
      case 'running': return 'running';
      case 'paused': return 'paused';
      case 'completed': return 'completed';
      case 'error': return 'error';
      case 'cancelled': return 'cancelled';
      default: return '';
    }
  }, [context]);

  // 计算循环层级（简单的实现，可以根据需要改进）
  const loopLevel = React.useMemo(() => {
    // 这里可以实现嵌套循环的层级检测
    // 暂时返回0
    return 0;
  }, []);

  // 监听循环事件
  React.useEffect(() => {
    if (!context) return;

    const handleLoopEvent = (event: LoopEvent) => {
      // 可以在这里添加对循环事件的响应
      console.log(`循环 ${event.loopId} 事件:`, event.type, event);
    };

    LoopContextManager.addEventListener(
      loop.id,
      ['iteration_start', 'iteration_end', 'node_start', 'node_end', 'completed', 'error'],
      handleLoopEvent
    );

    return () => {
      LoopContextManager.removeEventListener(
        loop.id,
        ['iteration_start', 'iteration_end', 'node_start', 'node_end', 'completed', 'error'],
        handleLoopEvent
      );
    };
  }, [loop.id, context]);

  const handleLoopStart = () => {
    onLoopStart?.(loop.id);
  };

  const handleLoopPause = () => {
    onLoopPause?.(loop.id);
  };

  const handleLoopResume = () => {
    onLoopResume?.(loop.id);
  };

  const handleLoopCancel = () => {
    onLoopCancel?.(loop.id);
  };

  const handleLoopReset = () => {
    onLoopReset?.(loop.id);
  };

  return (
    <>
      {/* 使用我们创建的LoopBoundary组件 */}
      <LoopBoundary
        startNode={startNodeData}
        endNode={endNodeData}
        nodesInLoop={loopNodes}
      />

      {/* 应用状态样式到括号容器 */}
      <div
        className={`bracket-container level-${loopLevel} ${getStateClass()}`}
        style={{
          position: 'absolute',
          left: Math.min(...loopNodes.map(n => n.x)) - 20,
          top: Math.min(...loopNodes.map(n => n.y)) - 40,
          width: Math.max(...loopNodes.map(n => n.x + n.width)) - Math.min(...loopNodes.map(n => n.x)) + 40,
          height: Math.max(...loopNodes.map(n => n.y + n.height)) - Math.min(...loopNodes.map(n => n.y)) + 40,
          pointerEvents: 'none',
          zIndex: 1,
          ...style
        }}
      />

      {/* 循环控制覆盖层 */}
      <div
        className="loop-visualizer-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: isHovered ? 'auto' : 'none',
          zIndex: 10
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isHovered && (
          <div
            className="loop-visualizer-popup"
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              minWidth: '250px',
              maxWidth: '300px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
          >
            <LoopControlPanel
              loop={loop}
              context={context}
              onStart={handleLoopStart}
              onPause={handleLoopPause}
              onResume={handleLoopResume}
              onCancel={handleLoopCancel}
              onReset={handleLoopReset}
            />

            {/* 详细信息切换按钮 */}
            <button
              className="btn-loop-details"
              onClick={() => setShowDetails(!showDetails)}
              style={{
                marginTop: '8px',
                width: '100%',
                padding: '4px 8px',
                background: 'var(--glass-hover)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {showDetails ? '隐藏' : '显示'}详细信息
            </button>

            {/* 详细信息面板 */}
            {showDetails && (
              <div
                className="loop-details-panel"
                style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'var(--glass-hover)',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              >
                <div>循环ID: {loop.id}</div>
                <div>开始节点: {loop.startNodeId}</div>
                <div>结束节点: {loop.endNodeId}</div>
                <div>节点数量: {loop.nodeIds.length}</div>
                {context && (
                  <>
                    <div>当前迭代: {context.currentIteration}</div>
                    <div>运行时间: {(context.elapsedTime / 1000).toFixed(1)}s</div>
                    <div>数据点: {context.accumulatedData.length}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

/**
 * 循环状态指示器组件
 */
export const LoopStatusIndicator: React.FC<{
  loops: LoopInfo[];
  contexts: Map<string, LoopExecutionContext>;
  className?: string;
}> = ({ loops, contexts, className = '' }) => {
  const runningLoops = loops.filter(loop => {
    const context = contexts.get(loop.id);
    return context?.state === 'running';
  });

  const completedLoops = loops.filter(loop => {
    const context = contexts.get(loop.id);
    return context?.state === 'completed';
  });

  const errorLoops = loops.filter(loop => {
    const context = contexts.get(loop.id);
    return context?.state === 'error';
  });

  return (
    <div className={`loop-status-indicator ${className}`}>
      <div className="loop-stats">
        <span className="stat-item">
          总计: {loops.length}
        </span>
        {runningLoops.length > 0 && (
          <span className="stat-item running" style={{ color: '#4CAF50' }}>
            运行中: {runningLoops.length}
          </span>
        )}
        {completedLoops.length > 0 && (
          <span className="stat-item completed" style={{ color: '#2196F3' }}>
            已完成: {completedLoops.length}
          </span>
        )}
        {errorLoops.length > 0 && (
          <span className="stat-item error" style={{ color: '#F44336' }}>
            错误: {errorLoops.length}
          </span>
        )}
      </div>
    </div>
  );
};

export default LoopVisualizer;