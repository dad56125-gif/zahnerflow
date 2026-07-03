import React from 'react';

// 引入ComputedEdge接口
import { ComputedEdge } from './LayoutConfig';

interface ComputedConnectionLinesProps {
  // 预计算的连接线数据，由useUnifiedLayout生成
  layoutEdges: ComputedEdge[];
  // 布局稳定状态，用于控制动画过渡
  layoutStable?: boolean;
}

// 复用原有ConnectionLines的样式常量和函数
/** 分离线宽常量 */
const LINE_STROKE_WIDTH = 2.5;   // 连线线宽（你可随意改，不影响箭头大小）
const ARROW_STROKE_WIDTH = 2.5;  // 箭头线宽（固定为 2）

/** 以"原来 strokeWidth=2 时"的视觉为基准，固定箭头几何尺寸 */
const BASE_STROKE_FOR_ARROW = 2;          // 基准线宽
const MARKER_WIDTH_PX = 10 * BASE_STROKE_FOR_ARROW;  // 10 * 2 = 20px
const MARKER_HEIGHT_PX = 10 * BASE_STROKE_FOR_ARROW; // 10 * 2 = 20px
const REF_X_PX = -9 * BASE_STROKE_FOR_ARROW;        // -15 * 2 = -30px

// 🎯 架构解耦：硬编码渲染段长度，不动态计算
// 几何坐标直接来自layoutEdges
const RENDER_SEGMENT_LENGTH = 20;
const CORNER_RADIUS = 8;
const ARROW_END_GAP = 10;
const NODE_EDGE_GAP = 4;

const clampRadius = (...values: number[]) => Math.max(0, Math.min(CORNER_RADIUS, ...values.map(v => Math.abs(v) / 2)));

export const ConnectionLines: React.FC<ComputedConnectionLinesProps> = ({
  layoutEdges,
  layoutStable = true
}) => {
  const renderEdge = React.useCallback((edge: ComputedEdge) => {
    const { sourcePosition, targetPosition, sourceDir = 1, targetDir = -1 } = edge; // 默认值防炸
    if (!sourcePosition || !targetPosition) return null;

    const stroke = edge.style?.stroke || 'rgba(255,255,255,0.6)';
    const baseStrokeWidth = edge.style?.strokeWidth || LINE_STROKE_WIDTH;
    const strokeWidth = Number(baseStrokeWidth);
    const sourceStart = {
      x: sourcePosition.x + Number(sourceDir) * NODE_EDGE_GAP,
      y: sourcePosition.y
    };
    const targetEnd = {
      x: targetPosition.x + Number(targetDir) * NODE_EDGE_GAP,
      y: targetPosition.y
    };

    // 🎯 使用硬编码的RENDER_SEGMENT_LENGTH，不动态计算
    const segmentLength = RENDER_SEGMENT_LENGTH;

    if (edge.type === 'smoothstep') {
      if (Number(sourceDir) === Number(targetDir)) {
        const dir = Number(sourceDir) as 1 | -1;
        const yDir = targetEnd.y >= sourceStart.y ? 1 : -1;
        const targetEndX = targetEnd.x + dir * ARROW_END_GAP;
        const verticalX = dir === 1
          ? Math.max(sourceStart.x, targetEnd.x) + segmentLength
          : Math.min(sourceStart.x, targetEnd.x) - segmentLength;
        const radius = clampRadius(
          verticalX - sourceStart.x,
          targetEnd.y - sourceStart.y,
          verticalX - targetEndX
        );
        const path = [
          `M ${sourceStart.x} ${sourceStart.y}`,
          `H ${verticalX - dir * radius}`,
          `Q ${verticalX} ${sourceStart.y} ${verticalX} ${sourceStart.y + yDir * radius}`,
          `V ${targetEnd.y - yDir * radius}`,
          `Q ${verticalX} ${targetEnd.y} ${verticalX - dir * radius} ${targetEnd.y}`,
          `H ${targetEndX}`
        ].join(' ');

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#arrowhead)"
          />
        );
      } else {
        const dir = Number(sourceDir) as 1 | -1;
        const x1 = sourceStart.x + segmentLength * dir;
        const midY = sourceStart.y + (targetEnd.y - sourceStart.y) / 2;
        const yDirToMid = midY >= sourceStart.y ? 1 : -1;
        const yDirToTarget = targetEnd.y >= midY ? 1 : -1;
        const xDirToTarget = targetEnd.x >= x1 ? 1 : -1;
        const targetEndY = targetEnd.y - yDirToTarget * ARROW_END_GAP;
        const radius = clampRadius(midY - sourceStart.y, targetEnd.x - x1, targetEnd.y - midY);
        const path = [
          `M ${sourceStart.x} ${sourceStart.y}`,
          `H ${x1 - dir * radius}`,
          `Q ${x1} ${sourceStart.y} ${x1} ${sourceStart.y + yDirToMid * radius}`,
          `V ${midY - yDirToMid * radius}`,
          `Q ${x1} ${midY} ${x1 + xDirToTarget * radius} ${midY}`,
          `H ${targetEnd.x - xDirToTarget * radius}`,
          `Q ${targetEnd.x} ${midY} ${targetEnd.x} ${midY + yDirToTarget * radius}`,
          `V ${targetEndY}`
        ].join(' ');

        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#arrowhead)"
          />
        );
      }
    } else {
      // 📏 直线连接 (同行)
      // 直线也需要缩进处理，防止箭头被遮挡
      // 简化逻辑：直接画线，箭头由 marker 处理

      // 注意：如果是反向行 (R->L)，直线是从右向左画。markerEnd 会自动旋转方向，只要线坐标是对的。
      // 在 useUnifiedLayout 中我们已经交换了 sourceX 和 targetX，所以这里直接画即可。

      // 稍微做一点点缩进以免盖住节点边框 (使用 padSegment 逻辑，这里简化演示)
      const dx = targetEnd.x - sourceStart.x;
      const dy = targetEnd.y - sourceStart.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      // 简单的缩进计算
      const endGap = ARROW_END_GAP; // 留给箭头的空间

      const ratio = length > 0 ? (length - endGap) / length : 1;
      const finalX = sourceStart.x + dx * ratio;
      const finalY = sourceStart.y + dy * ratio;

      return (
        <line
          key={edge.id}
          x1={sourceStart.x}
          y1={sourceStart.y}
          x2={finalX} // 使用缩进后的终点
          y2={finalY}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
        />
      );
    }
  }, []);

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
        transition: layoutStable ? 'none' : 'all 0.3s ease',
        // ✅ 关键修复：显示SVG画布外的连接线，解决超过5列断连问题
        overflow: 'visible'  // 允许显示超出SVG边界的连接线
      }}
    >
      <defs>
        {/* ✅ 修复确认：箭头marker使用基础尺寸，与连接线保持一致 */}
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
          />
        </marker>
      </defs>
      {layoutEdges.map(renderEdge)}
    </svg>
  );
};
