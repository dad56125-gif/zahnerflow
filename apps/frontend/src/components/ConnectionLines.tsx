/**
 * 连接线组件
 *
 * 使用统一布局计算服务提供S形布局的自动连接线渲染
 * 用于可视化工作流的执行顺序，只显示节点间的顺序连接
 * 简化版本 - 移除所有重复的布局计算逻辑
 */

import React from 'react';
import { ElectrochemicalNode } from '../nodes/types';
import {
  layout_service,
  connection_binding_service,
  CachedConnection,
  LayoutCalculationOptions,
  NodePosition
} from '../services/layout';

export interface ConnectionLinesProps {
  nodes: ElectrochemicalNode[];
  canvasWidth: number;
  layoutStable: boolean;
  className?: string;
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  nodes,
  canvasWidth,
  layoutStable,
  className = ''
}) => {
  const [cachedConnections, setCachedConnections] = React.useState<CachedConnection[]>([]);
  const [prevNodes, setPrevNodes] = React.useState<ElectrochemicalNode[]>([]);

  // 使用统一布局服务计算所有连接线
  React.useEffect(() => {
    if (!layoutStable || nodes.length === 0) {
      setCachedConnections([]);
      setPrevNodes(nodes);
      return;
    }

    // 检查是否需要更新连接线（性能优化）
    if (!connection_binding_service.shouldUpdateConnections(prevNodes, nodes)) {
      return;
    }

    try {
      // 使用统一布局服务计算节点位置
      const options: LayoutCalculationOptions = {
        canvas_width: canvasWidth,
        nodes: nodes,
        enable_zigzag: true,
        center_single_node: true
      };

      const node_positions: NodePosition[] = layout_service.calculateAllNodePositions(options);
      const layout = layout_service.calculateDynamicLayout(options);

      // 使用连接线绑定服务计算连接线
      const connections = connection_binding_service.calculateConnections(node_positions, layout);
      const cached = connection_binding_service.generateCachedConnections(connections);

      setCachedConnections(cached);
      setPrevNodes(nodes);
    } catch (error) {
      console.error('连接线计算错误:', error);
      setCachedConnections([]);
    }
  }, [layoutStable, nodes, canvasWidth, prevNodes]);

  return (
    <svg
      className={`connections-layer ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            className="connection-arrow"
            fill="rgba(255,255,255,0.8)"
          />
        </marker>
      </defs>

      {/* 渲染工作流执行顺序连接线 */}
      {layoutStable && cachedConnections.map((conn) => (
        <g key={conn.id}>
          {conn.is_l_shape ? (
            <>
              <line
                x1={conn.start_x}
                y1={conn.start_y}
                x2={conn.mid_x}
                y2={conn.start_y}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
              />
              <line
                x1={conn.mid_x}
                y1={conn.start_y}
                x2={conn.mid_x}
                y2={conn.mid_y}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
              />
              <line
                x1={conn.mid_x}
                y1={conn.mid_y}
                x2={conn.end_x}
                y2={conn.end_y}
                className="connection-line"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            </>
          ) : (
            <line
              x1={conn.start_x}
              y1={conn.start_y}
              x2={conn.end_x}
              y2={conn.end_y}
              className="connection-line"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          )}
        </g>
      ))}

          </svg>
  );
};

export default ConnectionLines;