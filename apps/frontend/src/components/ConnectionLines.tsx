/**
 * 连接线组件（refX=-15 + 小一点的end gap + 圆头直线 + start gap）
 */

import React from 'react';
import { ElectrochemicalNode } from '../types/nodes';
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

/** rem → px（按需调整根字号） */
const remToPx = (rem: number) => rem * 16;

/** 线尾与箭头之间的留白（更小）：1rem ≈ 16px */
const END_GAP = remToPx(1.2);
/** 线头的留白（给一点）：0.5rem ≈ 8px */
const START_GAP = remToPx(0.5);

/** 分离线宽常量 */
const LINE_STROKE_WIDTH = 2.5;   // 连线线宽（你可随意改，不影响箭头大小）
const ARROW_STROKE_WIDTH = 2.5;  // 箭头线宽（固定为 2）

/** 以“原来 strokeWidth=2 时”的视觉为基准，固定箭头几何尺寸 */
const BASE_STROKE_FOR_ARROW = 2;          // 基准线宽
const MARKER_WIDTH_PX = 10 * BASE_STROKE_FOR_ARROW;  // 10 * 2 = 20px
const MARKER_HEIGHT_PX = 10 * BASE_STROKE_FOR_ARROW; // 10 * 2 = 20px
const REF_X_PX = -9 * BASE_STROKE_FOR_ARROW;        // -15 * 2 = -30px

/** 将线段两端按比例回缩 */
function padSegment(
  start: { x: number; y: number },
  end: { x: number; y: number },
  startGap: number,
  endGap: number
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: start.x + (dx / len) * startGap,
    y1: start.y + (dy / len) * startGap,
    x2: end.x - (dx / len) * endGap,
    y2: end.y - (dy / len) * endGap
  };
}

export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  nodes,
  canvasWidth,
  layoutStable,
  className = ''
}) => {
  const [cachedConnections, setCachedConnections] = React.useState<CachedConnection[]>([]);
  const [prevNodes, setPrevNodes] = React.useState<ElectrochemicalNode[]>([]);

  React.useEffect(() => {
    if (!layoutStable || nodes.length === 0) {
      setCachedConnections([]);
      setPrevNodes(nodes);
      return;
    }
    if (!connection_binding_service.shouldUpdateConnections(prevNodes, nodes)) {
      return;
    }

    try {
      const options: LayoutCalculationOptions = {
        canvas_width: canvasWidth,
        nodes,
        enable_zigzag: true,
        center_single_node: true
      };

      const node_positions: NodePosition[] = layout_service.calculateAllNodePositions(options);
      const layout = layout_service.calculateDynamicLayout(options);
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
        {/* 
          箭头 marker：与线宽解耦，几何尺寸锁定为“原先 strokeWidth=2 时”的大小 
          - userSpaceOnUse：不随线宽缩放
          - markerWidth/Height：等于原来 10 * 2 = 20px
          - refX：等于原来 -15 * 2 = -30px（保持与线端距离一致）
        */}
        <marker
          id="arrowhead"
          viewBox="-16 -16 32 32"
          markerWidth={MARKER_WIDTH_PX}
          markerHeight={MARKER_HEIGHT_PX}
          refX={REF_X_PX}
          refY={0}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M -10 -12 L 0 0 L -10 12"
            fill="none"
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={ARROW_STROKE_WIDTH} // 箭头线宽固定为 2
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </marker>
      </defs>

      {layoutStable &&
        cachedConnections.map((conn) => {
          if (conn.is_l_shape) {
            const seg1 = padSegment(
              { x: conn.start_x, y: conn.start_y },
              { x: conn.mid_x, y: conn.start_y },
              START_GAP,
              0
            );
            const seg2 = { x1: conn.mid_x, y1: conn.start_y, x2: conn.mid_x, y2: conn.mid_y };
            const seg3 = padSegment(
              { x: conn.mid_x, y: conn.mid_y },
              { x: conn.end_x, y: conn.end_y },
              0,
              END_GAP
            );

            return (
              <g key={conn.id}>
                <line
                  x1={seg1.x1}
                  y1={seg1.y1}
                  x2={seg1.x2}
                  y2={seg1.y2}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={LINE_STROKE_WIDTH}
                  strokeLinecap="round"
                />
                <line
                  x1={seg2.x1}
                  y1={seg2.y1}
                  x2={seg2.x2}
                  y2={seg2.y2}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={LINE_STROKE_WIDTH}
                  strokeLinecap="round"
                />
                <line
                  x1={seg3.x1}
                  y1={seg3.y1}
                  x2={seg3.x2}
                  y2={seg3.y2}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={LINE_STROKE_WIDTH}
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead)"
                />
              </g>
            );
          } else {
            const seg = padSegment(
              { x: conn.start_x, y: conn.start_y },
              { x: conn.end_x, y: conn.end_y },
              START_GAP,
              END_GAP
            );

            return (
              <line
                key={conn.id}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={LINE_STROKE_WIDTH}
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
              />
            );
          }
        })}
    </svg>
  );
};

export default ConnectionLines;
