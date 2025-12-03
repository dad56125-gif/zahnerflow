import React from 'react';

// 引入ComputedEdge接口
import { ComputedEdge } from './LayoutConfig';

interface ComputedConnectionLinesProps {
  // 预计算的连接线数据，由useUnifiedLayout生成
  layoutEdges: ComputedEdge[];
  // 布局稳定状态，用于控制动画过渡
  layoutStable?: boolean;
  // Canvas缩放级别，用于视觉补偿
  zoomLevel?: number;
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

// 🎯 架构解耦：硬编码渲染段长度，不动态计算
// 几何坐标来自layoutEdges（100%比例），视觉补偿由zoomLevel处理
const RENDER_SEGMENT_LENGTH = 40;

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
  layoutEdges,
  layoutStable = true,
  zoomLevel = 1.0
}) => {
  // 🎯 架构解耦：明确区分几何渲染和视觉补偿
  // 几何坐标直接来自layoutEdges（100%比例），只有strokeWidth进行反向补偿
  const renderEdge = React.useCallback((edge: ComputedEdge) => {
    const { sourcePosition, targetPosition, sourceDir = 1, targetDir = -1 } = edge; // 默认值防炸
    if (!sourcePosition || !targetPosition) return null;

    const stroke = edge.style?.stroke || 'rgba(255,255,255,0.6)';
    const baseStrokeWidth = edge.style?.strokeWidth || LINE_STROKE_WIDTH;
    // 🎯 只有strokeWidth进行视觉补偿：/ zoomLevel反向补偿
    const strokeWidth = Number(baseStrokeWidth) / (zoomLevel || 1.0);

    // 🎯 使用硬编码的RENDER_SEGMENT_LENGTH，不动态计算
    const segmentLength = RENDER_SEGMENT_LENGTH;

    if (edge.type === 'smoothstep') {
      // 🐍 蛇形折线 / L型连接
      // 计算关键拐点

      // 1. 起点延伸点 (P1): 根据 sourceDir 决定向左还是向右延伸
      const p1 = {
        x: sourcePosition.x + (segmentLength * Number(sourceDir)),
        y: sourcePosition.y
      };

      // 2. 终点延伸点 (P2): 目标点出来的延伸位置，通常用于最后一段对齐
      // 如果是转折连接 (U-turn)，我们希望线出来后，垂直走，然后水平进
      // 简单逻辑：如果是同侧转折（比如都在右边），中间X取最大值

      const midY = sourcePosition.y + (targetPosition.y - sourcePosition.y) / 2;

      // 处理 U 型转折 (Turn) 的特殊情况
      // 如果 sourceDir 和 targetDir 相同（比如都是 1，右出右进），说明是蛇形转弯
      if (Number(sourceDir) === Number(targetDir)) {
        // 确定垂直线的 X 坐标：取两点中更"靠外"的那个，再加一点间距
        // 如果是右侧转弯 (Dir=1)，取 max(src.x, tgt.x) + gap
        // 如果是左侧转弯 (Dir=-1)，取 min(src.x, tgt.x) - gap
        const gap = segmentLength; // 转弯的额外外扩距离

        let verticalX = 0;
        if (Number(sourceDir) === 1) {
          verticalX = Math.max(sourcePosition.x, targetPosition.x) + gap;
        } else {
          verticalX = Math.min(sourcePosition.x, targetPosition.x) - gap;
        }

        return (
          <g key={edge.id}>
            {/* 1. 源点 -> 外扩点 */}
            <line x1={sourcePosition.x} y1={sourcePosition.y} x2={verticalX} y2={sourcePosition.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* 2. 垂直下落 */}
            <line x1={verticalX} y1={sourcePosition.y} x2={verticalX} y2={targetPosition.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* 3. 外扩点 -> 目标点 */}
            <line x1={verticalX} y1={targetPosition.y} x2={targetPosition.x} y2={targetPosition.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd="url(#arrowhead)" />
          </g>
        );
      } else {
        // 标准 Z 型连接 (跨行但不在端点，或者是 Grid 模式)
        // 使用 p1 延伸

        return (
          <g key={edge.id}>
            {/* 源点 -> P1 */}
            <line x1={sourcePosition.x} y1={sourcePosition.y} x2={p1.x} y2={p1.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* P1 -> 中间垂直点 */}
            <line x1={p1.x} y1={sourcePosition.y} x2={p1.x} y2={midY} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* 中间水平线 */}
            <line x1={p1.x} y1={midY} x2={targetPosition.x} y2={midY} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
            {/* 垂直下落到目标高度 */}
            <line x1={targetPosition.x} y1={midY} x2={targetPosition.x} y2={targetPosition.y} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd="url(#arrowhead)" />
          </g>
        );
      }
    } else {
      // 📏 直线连接 (同行)
      // 直线也需要缩进处理，防止箭头被遮挡
      // 简化逻辑：直接画线，箭头由 marker 处理

      // 注意：如果是反向行 (R->L)，直线是从右向左画。markerEnd 会自动旋转方向，只要线坐标是对的。
      // 在 useUnifiedLayout 中我们已经交换了 sourceX 和 targetX，所以这里直接画即可。

      // 稍微做一点点缩进以免盖住节点边框 (使用 padSegment 逻辑，这里简化演示)
      const dx = targetPosition.x - sourcePosition.x;
      const dy = targetPosition.y - sourcePosition.y;
      const length = Math.sqrt(dx*dx + dy*dy);
      // 简单的缩进计算
      const startGap = 0;
      const endGap = 10 * (zoomLevel || 1); // 留给箭头的空间

      const ratio = length > 0 ? (length - endGap) / length : 1;
      const finalX = sourcePosition.x + dx * ratio;
      const finalY = sourcePosition.y + dy * ratio;

      return (
        <line
          key={edge.id}
          x1={sourcePosition.x}
          y1={sourcePosition.y}
          x2={finalX} // 使用缩进后的终点
          y2={finalY}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
        />
      );
    }
  }, [zoomLevel]); // 依赖 zoomLevel

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
        {/* ✅ 修复确认：箭头marker使用基础尺寸，与连接线保持一致的缩放方式
             CSS transform会统一处理缩放，确保与节点视觉位置匹配 */}
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
            strokeWidth={ARROW_STROKE_WIDTH / (zoomLevel || 1.0)}  // 🎯 动态箭头线宽
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      {layoutEdges.map(renderEdge)}
    </svg>
  );
};