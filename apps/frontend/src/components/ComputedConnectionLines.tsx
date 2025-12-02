import React from 'react';

interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  type?: 'straight' | 'smoothstep' | 'default';
  animated?: boolean;
  style?: React.CSSProperties;
  label?: string;
}

interface ComputedConnectionLinesProps {
  edges: ComputedEdge[];
  nodes: any[]; // 包含position信息的节点数组
  layoutStable?: boolean;
}

// 复用原有ConnectionLines的样式常量和函数
/** rem → px（按需调整根字号） */
const remToPx = (rem: number) => rem * 16;
/** 线尾与箭头之间的留白（更小）：1rem ≈ 16px */
const END_GAP = remToPx(1.2);
/** 线头的留白（给一点）：0.5rem ≈ 8px */
const START_GAP = remToPx(0.5);
/** 分离线宽常量 */
const LINE_STROKE_WIDTH = 2.5;   // 连线线宽（你可随意改，不影响箭头大小）
const ARROW_STROKE_WIDTH = 2.5;  // 箭头线宽（固定为 2）

/** 以"原来 strokeWidth=2 时"的视觉为基准，固定箭头几何尺寸 */
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

export const ComputedConnectionLines: React.FC<ComputedConnectionLinesProps> = ({
  edges,
  nodes,
  layoutStable = true
}) => {
  // 创建节点ID到位置的映射
  const nodePositionMap = React.useMemo(() => {
    const map = new Map();
    nodes.forEach(node => {
      map.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.style.width || 140,
        height: node.style.height || 60
      });
    });
    return map;
  }, [nodes]);

  const renderEdge = (edge: ComputedEdge) => {
    const source = nodePositionMap.get(edge.source);
    const target = nodePositionMap.get(edge.target);

    if (!source || !target) return null;

    // 🔥 完全复用原有的连接算法逻辑
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterY = target.y + target.height / 2;

    // 根据连接类型决定使用哪种连接算法
    if (edge.type === 'smoothstep') {
      // 🐍 L形连接：完全复用原有的三段式逻辑
      const midY = sourceCenterY + (targetCenterY - sourceCenterY) / 2;

      return (
        <g key={edge.id}>
          <line
            x1={source.x + source.width}
            y1={sourceCenterY}
            x2={source.x + source.width + 30}
            y2={sourceCenterY}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={LINE_STROKE_WIDTH}
            strokeLinecap="round"
          />
          <line
            x1={source.x + source.width + 30}
            y1={sourceCenterY}
            x2={source.x + source.width + 30}
            y2={targetCenterY}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={LINE_STROKE_WIDTH}
            strokeLinecap="round"
          />
          <line
            x1={source.x + source.width + 30}
            y1={targetCenterY}
            x2={target.x}
            y2={targetCenterY}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={LINE_STROKE_WIDTH}
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
          />
        </g>
      );
    } else {
      // 📏 直线连接：使用原有的padSegment逻辑
      const seg = padSegment(
        { x: source.x + source.width, y: sourceCenterY },
        { x: target.x, y: targetCenterY },
        START_GAP,
        END_GAP
      );

      return (
        <line
          key={edge.id}
          x1={seg.x1}
          y1={seg.y1}
          x2={seg.x2}
          y2={seg.y2}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={LINE_STROKE_WIDTH}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
          className={edge.animated ? 'animated-edge' : ''}
        />
      );
    }
  };

  return (
    <svg
      className="connections-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        transition: layoutStable ? 'none' : 'all 0.3s ease'
      }}
    >
      <defs>
        {/* 复用原有的箭头marker定义 */}
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
            strokeWidth={ARROW_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </marker>
      </defs>
      {edges.map(renderEdge)}
    </svg>
  );
};