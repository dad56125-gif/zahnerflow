/**
 * 批量选择状态机 hook
 * 提取自 ChartModal.tsx 中的批量选择逻辑
 */

import { useState, useRef, useCallback } from 'react';
import type { WorkflowNode } from '@zahnerflow/types';

export type BulkDisplayMode = 'none' | 'first' | 'sample';

/**
 * 获取批量选择图标单元格状态
 */
export function getBulkIconCells(mode: BulkDisplayMode): boolean[] {
  if (mode === 'first') return [true, true, true, true, true, true];
  if (mode === 'sample') return [true, false, false, false, false, true];
  return [false, false, false, false, false, false];
}

/**
 * 批量选择 hook
 */
export function useBulkSelection() {
  const [bulkMode, setBulkMode] = useState<BulkDisplayMode>('none');
  const bulkToggleRef = useRef<{ lastClickAt: number; mode: BulkDisplayMode }>({
    lastClickAt: 0,
    mode: 'none'
  });

  /**
   * 处理批量切换点击
   */
  const handleBulkToggleClick = useCallback((activeGroupNodes: WorkflowNode[]) => {
    const now = Date.now();
    const isRapidSecondClick = bulkToggleRef.current.mode === 'first'
      && now - bulkToggleRef.current.lastClickAt <= 2000;

    let nextMode: BulkDisplayMode = 'none';
    let nodesToShow: WorkflowNode[] = [];

    if (bulkToggleRef.current.mode === 'sample') {
      nextMode = 'none';
    } else if (isRapidSecondClick) {
      nextMode = 'sample';
      nodesToShow = getSampledNodes(activeGroupNodes, 10);
    } else if (bulkToggleRef.current.mode === 'first') {
      nextMode = 'none';
    } else {
      nextMode = 'first';
      nodesToShow = activeGroupNodes.slice(0, 10);
    }

    bulkToggleRef.current = { lastClickAt: now, mode: nextMode };
    setBulkMode(nextMode);

    return { nextMode, nodesToShow };
  }, []);

  /**
   * 重置批量选择状态
   */
  const resetBulkSelection = useCallback(() => {
    bulkToggleRef.current = { lastClickAt: 0, mode: 'none' };
    setBulkMode('none');
  }, []);

  return {
    bulkMode,
    setBulkMode,
    handleBulkToggleClick,
    resetBulkSelection,
    getBulkIconCells: () => getBulkIconCells(bulkMode),
  };
}

/**
 * 从节点列表中采样指定数量的节点
 */
function getSampledNodes(nodes: WorkflowNode[], maxCount: number): WorkflowNode[] {
  if (nodes.length <= maxCount) return nodes;

  const indices = new Set<number>();
  const lastIndex = nodes.length - 1;
  for (let i = 0; i < maxCount; i++) {
    indices.add(Math.round((i * lastIndex) / (maxCount - 1)));
  }

  return Array.from(indices)
    .sort((a, b) => a - b)
    .slice(0, maxCount)
    .map(index => nodes[index]);
}
