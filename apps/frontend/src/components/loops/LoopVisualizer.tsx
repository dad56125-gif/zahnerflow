/**
 * 循环可视化组件
 *
 * 负责可视化显示循环的边界和状态信息
 * 专注于可视化展示，不包含执行控制功能
 */

import React from 'react';
import { LoopInfo } from './LoopDetector';
import { LoopBoundary } from '../LoopBoundary';
import { LoopStartNode, LoopEndNode } from '../../nodes/types';
import {
  type LoopExecutionContext,
  type LoopExecutionState
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
  zoomLevel?: number;
  canvasOffsetY?: number;
}

/**
 * 循环可视化主组件
 */
const LoopVisualizerComponent: React.FC<LoopVisualizerProps> = ({
  loop,
  nodes,
  context,
  className = '',
  style = {},
  zoomLevel = 1,
  canvasOffsetY = 0
}) => {
  // 获取循环内的节点 - 按照循环路径顺序
  const loopNodes = React.useMemo(() => {
    const orderedNodes: typeof nodes = [];

    // 按照循环路径的顺序获取节点
    loop.node_ids.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        orderedNodes.push(node);
      }
    });

    return orderedNodes;
  }, [nodes, loop.node_ids]);

  const startNode = React.useMemo(() => {
    return loopNodes.find(n => n.id === loop.start_node_id);
  }, [loopNodes, loop.start_node_id]);

  const endNode = React.useMemo(() => {
    return loopNodes.find(n => n.id === loop.end_node_id);
  }, [loopNodes, loop.end_node_id]);

  // 如果找不到开始或结束节点，不渲染
  if (!startNode || !endNode || loopNodes.length === 0) {
    return null;
  }

  // 转换节点格式以匹配LoopBoundary组件的接口
  const adaptNodeToLoopNode = React.useCallback((
    node: any,
    type: 'loop_start' | 'loop_end'
  ): LoopStartNode | LoopEndNode => {
    const now = new Date();
    const baseNode = {
      id: node.id,
      name: node.name || `${type}_${node.id}`,
      category: 'flow_control' as const,
      position: { x: node.position?.x || 0, y: node.position?.y || 0 },
      data: {
        name: node.name || `${type}_${node.id}`,
        description: `${type} node for loop ${loop.id}`,
        parameters: {
          loop_id: loop.id,
          loop_count: loop.iteration_count,
          loop_variable: loop.parameters.loop_variable || 'i',
          start_value: loop.parameters.start_value || 0,
          step: loop.parameters.step || 1,
          delay_ms: loop.parameters.delay_ms,
          break_condition: loop.parameters.break_condition,
          continue_condition: loop.parameters.continue_condition,
          data_accumulation: loop.parameters.data_accumulation || 'all',
          export_format: loop.parameters.export_format || 'csv'
        },
        createdAt: now,
        updatedAt: now
      },
      status: 'pending' as const,
      input: {
        id: `${node.id}_input`,
        name: 'Input',
        dataType: 'flow' as const
      },
      output: {
        id: `${node.id}_output`,
        name: 'Output',
        dataType: 'flow' as const
      },
      style: {
        width: 180,
        height: 80
      }
    };

    if (type === 'loop_start') {
      const startNode: LoopStartNode = {
        id: baseNode.id,
        type: 'loop_start',
        name: baseNode.name,
        category: baseNode.category,
        position: baseNode.position,
        data: {
          name: baseNode.data.name,
          description: baseNode.data.description,
          parameters: {
            loop_id: loop.id,
            loop_count: loop.iteration_count,
            loop_variable: loop.parameters.loop_variable || 'i',
            start_value: loop.parameters.start_value || 0,
            step: loop.parameters.step || 1,
            delay_ms: loop.parameters.delay_ms,
            break_condition: loop.parameters.break_condition,
            continue_condition: loop.parameters.continue_condition,
            data_accumulation: loop.parameters.data_accumulation || 'all',
            export_format: loop.parameters.export_format || 'csv'
          },
          createdAt: baseNode.data.createdAt,
          updatedAt: baseNode.data.updatedAt
        },
        status: baseNode.status,
        input: baseNode.input,
        output: baseNode.output,
        style: baseNode.style
      };
      return startNode;
    } else {
      const endNode: LoopEndNode = {
        id: baseNode.id,
        type: 'loop_end',
        name: baseNode.name,
        category: baseNode.category,
        position: baseNode.position,
        data: {
          name: baseNode.data.name,
          description: baseNode.data.description,
          parameters: {
            loop_id: loop.id
          },
          createdAt: baseNode.data.createdAt,
          updatedAt: baseNode.data.updatedAt
        },
        status: baseNode.status,
        input: baseNode.input,
        output: baseNode.output,
        style: baseNode.style
      };
      return endNode;
    }
  }, [loop.id, loop.iteration_count, loop.parameters]);

  const startNodeData = React.useMemo(() => {
    return startNode ? adaptNodeToLoopNode(startNode, 'loop_start') as LoopStartNode : null;
  }, [startNode, adaptNodeToLoopNode]);

  const endNodeData = React.useMemo(() => {
    return endNode ? adaptNodeToLoopNode(endNode, 'loop_end') as LoopEndNode : null;
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

  return (
    <>
      {/* 使用LoopBoundary组件显示循环边界 */}
      {startNodeData && endNodeData && (
        <LoopBoundary
          startNode={startNodeData}
          endNode={endNodeData}
          nodesInLoop={loopNodes}
          state={context?.state}
          zoomLevel={zoomLevel}
          canvasOffsetY={canvasOffsetY}
        />
      )}

      {/* 应用状态样式到循环区域 */}
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

// 使用 React.memo 优化，只有 props 变化时才重新渲染
export const LoopVisualizer = React.memo(LoopVisualizerComponent, (prevProps, nextProps) => {
  // 自定义比较函数，只在关键数据变化时重新渲染
  return (
    prevProps.loop.id === nextProps.loop.id &&
    prevProps.loop.node_ids.length === nextProps.loop.node_ids.length &&
    prevProps.loop.iteration_count === nextProps.loop.iteration_count &&
    prevProps.nodes.length === nextProps.nodes.length &&
    prevProps.context?.state === nextProps.context?.state &&
    prevProps.context?.current_iteration === nextProps.context?.current_iteration
  );
});

export default LoopVisualizer;