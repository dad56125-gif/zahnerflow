/**
 * 连接线组件（已弃用，现在由ComputedConnectionLines处理）
 *
 * 注意：这个组件已被useUnifiedLayout + ComputedConnectionLines替代
 * 保留这个文件只是为了向后兼容
 */

import React from 'react';

export interface ConnectionLinesProps {
  nodes: any[];
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
  // 现在连接线由Canvas组件中的useUnifiedLayout和ComputedConnectionLines处理
  // 这个组件返回空的SVG，不进行任何渲染
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
      {/* 连接线现在由ComputedConnectionLines组件处理 */}
    </svg>
  );
};