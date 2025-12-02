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

    // 计算连接点（节点右侧中点 到 目标节点左侧中点）
    const sourceX = source.x + source.width;
    const sourceY = source.y + source.height / 2;
    const targetX = target.x;
    const targetY = target.y + target.height / 2;

    // 根据连接类型生成路径
    let pathData;
    let markerEnd = 'url(#arrowhead)';

    if (edge.type === 'smoothstep' && Math.abs(sourceY - targetY) > 50) {
      // 换行连接使用阶梯线
      const midY = sourceY + (targetY - sourceY) / 2;
      pathData = `M ${sourceX},${sourceY} L ${sourceX + 30},${sourceY} L ${sourceX + 30},${midY} L ${targetX - 30},${midY} L ${targetX},${targetY}`;
    } else {
      // 普通直线连接
      pathData = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    }

    return (
      <g key={edge.id}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3, 0 6"
              fill={edge.style?.stroke || '#888'}
            />
          </marker>
        </defs>
        <path
          d={pathData}
          fill="none"
          stroke={edge.style?.stroke || '#888'}
          strokeWidth={edge.style?.strokeWidth || 2}
          strokeDasharray={edge.style?.strokeDasharray}
          markerEnd={markerEnd}
          className={edge.animated ? 'animated-edge' : ''}
        />
        {edge.label && (
          <text
            x={(sourceX + targetX) / 2}
            y={Math.min(sourceY, targetY) - 10}
            textAnchor="middle"
            fontSize="12"
            fill="#666"
          >
            {edge.label}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg
      className="computed-connection-lines"
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
      {edges.map(renderEdge)}
    </svg>
  );
};