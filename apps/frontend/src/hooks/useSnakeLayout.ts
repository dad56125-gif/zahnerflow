import { useMemo } from 'react';

// 配置常量（根据截图调整像素值）
const LAYOUT_CONFIG = {
  COLUMNS: 4,           // 每行4个节点
  NODE_WIDTH: 240,      // 节点宽 + 间距
  ROW_HEIGHT: 160,      // 行高
  START_X: 50,          // 起始X偏移
  START_Y: 50,          // 起始Y偏移
};

export const useSnakeLayout = (nodes: any[]) => {
  return useMemo(() => {
    // 1. 计算每个节点的坐标
    const nodesWithPosition = nodes.map((node, index) => {
      const row = Math.floor(index / LAYOUT_CONFIG.COLUMNS);
      const colIndex = index % LAYOUT_CONFIG.COLUMNS;

      // 判断方向：偶数行从左往右，奇数行从右往左
      const isLeftToRight = row % 2 === 0;

      // 计算 Grid 坐标
      // 如果是从左往右：colIndex
      // 如果是从右往左：(总列数 - 1) - colIndex
      const gridCol = isLeftToRight
        ? colIndex
        : (LAYOUT_CONFIG.COLUMNS - 1) - colIndex;

      return {
        ...node,
        // 强制覆盖 position (如果不希望后端存储位置，这里是最佳切入点)
        position: {
          x: LAYOUT_CONFIG.START_X + gridCol * LAYOUT_CONFIG.NODE_WIDTH,
          y: LAYOUT_CONFIG.START_Y + row * LAYOUT_CONFIG.ROW_HEIGHT,
        },
        // 附加布局元数据，方便连线组件判断方向
        layoutMeta: { index, row, isLeftToRight, isLastInRow: colIndex === LAYOUT_CONFIG.COLUMNS - 1, width: LAYOUT_CONFIG.NODE_WIDTH }
      };
    });

    // 2. 自动生成连接线 (核心魔法：不需要存储 edges)
    const computedEdges = [];

    for (let i = 0; i < nodesWithPosition.length - 1; i++) {
      const current = nodesWithPosition[i];
      const next = nodesWithPosition[i + 1];

      // 🔥 关键修复：根据蛇形布局的实际位置判断是否需要L形连接
      // 不是简单的行变化，而是基于实际的节点位置和蛇形连接逻辑
      const currentRight = current.position.x + current.layoutMeta.width;
      const nextLeft = next.position.x;
      const currentY = current.position.y;
      const nextY = next.position.y;

      // 🐍 蛇形连接规则：
      // 1. 同行内：顺序连接（直线）
      // 2. 偶数行到奇数行：从右到左的连接（可能需要L形）
      // 3. 奇数行到偶数行：从左到右的连接（可能需要L形）

      const currentRow = current.layoutMeta.row;
      const nextRow = next.layoutMeta.row;
      const currentIsLeftToRight = current.layoutMeta.isLeftToRight;
      const nextIsLeftToRight = next.layoutMeta.isLeftToRight;

      let needsLShape = false;

      if (currentRow === nextRow) {
        // 同一行：总是直线连接
        needsLShape = false;
      } else if (currentRow % 2 === 0 && nextRow % 2 === 1) {
        // 偶数行 -> 奇数行：偶数行从左往右，奇数行从右往左
        // 如果当前节点不是最后一个，需要L形连接
        needsLShape = !current.layoutMeta.isLastInRow;
      } else if (currentRow % 2 === 1 && nextRow % 2 === 0) {
        // 奇数行 -> 偶数行：奇数行从右往左，偶数行从左往右
        // 如果下一个节点不是第一个，需要L形连接
        needsLShape = !next.layoutMeta.isLastInRow;
      } else {
        // 其他情况（应该很少）：也用位置判断
        needsLShape = Math.abs(currentY - nextY) > 80 || nextLeft < currentRight;
      }

      computedEdges.push({
        id: `auto-edge-${i}-${i+1}`,
        source: current.id,
        target: next.id,
        type: needsLShape ? 'smoothstep' : 'straight',
        animated: false, // 截图里看起来不是动画线，如果运行中可以设为true
        style: { stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2.5 }, // 使用原有的颜色和线宽
      });
    }

    // 3. 处理循环回连 (GOTO Loop)
    // 如果有 loop_end 节点，找到对应的 loop_start 并在它们之间画一条虚线
    nodesWithPosition.forEach((node, i) => {
      if (node.type === 'loop_end') {
         // 简单示例：假设 loop_start 在前面。实际逻辑可以复用你现有的栈匹配
         // 这里只画线，不影响逻辑
         const loopStartId = findMatchingStartNode(nodes, i); // 你需要实现这个查找函数
         if (loopStartId) {
           computedEdges.push({
             id: `loop-return-${node.id}`,
             source: node.id,
             target: loopStartId,
             type: 'default',
             style: { strokeDasharray: '5,5', stroke: '#f00' }, // 红色虚线
             label: 'Loop'
           });
         }
      }
    });

    return {
      layoutNodes: nodesWithPosition,
      layoutEdges: computedEdges
    };

  }, [nodes]);
};

// 辅助函数：找到匹配的循环开始节点
function findMatchingStartNode(nodes: any[], endIndex: number): string | null {
  // 使用栈匹配逻辑找到对应的loop_start
  const stack: string[] = [];

  for (let i = 0; i <= endIndex; i++) {
    const node = nodes[i];
    if (node.type === 'loop_start') {
      stack.push(node.id);
    } else if (node.type === 'loop_end') {
      if (stack.length > 0) {
        const startId = stack.pop();
        // 如果这是当前end节点，返回匹配的startId
        if (i === endIndex && startId) {
          return startId;
        }
      }
    }
  }

  return null;
}