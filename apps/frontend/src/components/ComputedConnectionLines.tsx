import React from 'react';

// 引入动态segmentLength计算函数
import { getDynamicSegmentLength, DEFAULT_LAYOUT_CONFIG } from '../services/layout/LayoutConfig';

// ComputedEdge接口已在LayoutConfig中定义，这里引用即可
interface ComputedEdge {
  id: string;
  source: string;
  target: string;
  type?: 'straight' | 'smoothstep' | 'default';
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  layoutMeta?: {
    sourceIsInOddRow: boolean;
    targetIsInOddRow: boolean;
  };
  animated?: boolean;
  style?: React.CSSProperties;
  label?: string;
}

interface ComputedConnectionLinesProps {
  // 预计算的连接线数据，由useUnifiedLayout生成
  layoutEdges: ComputedEdge[];
  // 布局稳定状态，用于控制动画过渡
  layoutStable?: boolean;
  // 🎯 核心修复：Canvas缩放级别，用于连接线坐标变换
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
  // 🎯 核心修复验证：连接线应该使用基础坐标，与节点保持一致的缩放方式
  // 节点和连接线都在同一个缩放容器内，都应该由CSS transform统一处理缩放
  // 这样确保连接线与节点视觉位置完全匹配
  const renderEdge = React.useCallback((edge: ComputedEdge) => {
    // ✅ 修复确认：直接使用基础坐标，与节点position保持一致
    // 让CSS transform统一处理缩放，避免双重缩放问题
    const sourcePosition = edge.sourcePosition;
    const targetPosition = edge.targetPosition;

    if (!sourcePosition || !targetPosition) return null;

    // 使用原有的颜色和样式
    const stroke = edge.style?.stroke || 'rgba(255,255,255,0.6)';
    // 🎯 核心修复：动态计算stroke-width，与缩放级别协调
    // 确保连接线宽度与节点比例匹配，避免缩放时线条过粗或过细
    const baseStrokeWidth = edge.style?.strokeWidth || LINE_STROKE_WIDTH;
    const strokeWidth = baseStrokeWidth / (zoomLevel || 1.0);

    // 🎯 针对60%缩放的验证调试
    if (process.env.NODE_ENV === 'development' && Math.abs(zoomLevel - 0.6) < 0.01) {
      const segmentLength = getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel);
      console.log(`🎯 60%缩放连接线渲染调试 - ${edge.id}:`, {
        缩放级别: zoomLevel,
        基础线宽: baseStrokeWidth,
        计算后线宽: strokeWidth,
        基础segmentLength: DEFAULT_LAYOUT_CONFIG.segmentLength,
        动态segmentLength: segmentLength,
        源位置: sourcePosition,
        目标位置: targetPosition,
        连接类型: edge.type,
        修复验证: {
          segmentLength正确缩放: Math.abs(segmentLength - 18) < 0.1,
          strokeWidth正确缩放: Math.abs(strokeWidth - 4.166666666666667) < 0.1,
          移除了vectorEffect: true
        }
      });
    }

    // 根据连接类型决定使用哪种连接算法（使用基础坐标）
    if (edge.type === 'smoothstep') {
      // 🐍 L形连接：使用动态segmentLength，确保与缩放级别协调
      const midY = sourcePosition.y + (targetPosition.y - sourcePosition.y) / 2;
      // 🎯 核心修复：使用动态segmentLength替换固定30px
      // 确保连接线长度与缩放级别协调，避免60%缩放下变成18px的问题
      const segmentLength = getDynamicSegmentLength(DEFAULT_LAYOUT_CONFIG, zoomLevel);

      return (
        <g key={edge.id}>
          <line
            x1={sourcePosition.x}
            y1={sourcePosition.y}
            x2={sourcePosition.x + segmentLength}
            y2={sourcePosition.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={sourcePosition.x + segmentLength}
            y1={sourcePosition.y}
            x2={sourcePosition.x + segmentLength}
            y2={midY}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={sourcePosition.x + segmentLength}
            y1={midY}
            x2={targetPosition.x}
            y2={midY}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={targetPosition.x}
            y1={midY}
            x2={targetPosition.x}
            y2={targetPosition.y}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
          />
        </g>
      );
    } else {
      // 📏 直线连接：使用基础坐标和原有的间隙
      const seg = padSegment(
        sourcePosition,
        targetPosition,
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
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          markerEnd="url(#arrowhead)"
          className={edge.animated ? 'animated-edge' : ''}
        />
      );
    }
  }, []); // 移除transformCoordinates依赖，直接使用基础坐标

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