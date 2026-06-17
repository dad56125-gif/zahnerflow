/**
 * 面板布局 hook
 * 提取自 ChartModal.tsx 中的尺寸计算和溢出检测逻辑
 */

import { useState, useEffect, useCallback, RefObject } from 'react';

interface PanelLayoutResult {
  dimensions: { left: number; width: number; top: number; height: number };
  isSecondaryOverflowing: boolean;
  updateSecondaryOverflow: () => void;
}

/**
 * 面板布局 hook
 * 负责面板尺寸计算和 Tab 溢出检测
 */
export function usePanelLayout(
  isOpen: boolean,
  activeTypeKey: string,
  activeGroupNodesLength: number,
  secondaryTabsRef: RefObject<HTMLDivElement | null>,
  secondaryTabsContentRef: RefObject<HTMLDivElement | null>
): PanelLayoutResult {
  const [dimensions, setDimensions] = useState({ left: 0, width: 0, top: 0, height: 0 });
  const [isSecondaryOverflowing, setIsSecondaryOverflowing] = useState(false);

  // 计算面板尺寸
  useEffect(() => {
    if (!isOpen) return;

    const computeDimensions = () => {
      const computedStyle = getComputedStyle(document.documentElement);

      // 获取 CSS 变量（需要解析计算后的实际值）
      const sidebarW = parseFloat(computedStyle.getPropertyValue('--sidebar-w')) || 256;
      const propertyW = parseFloat(computedStyle.getPropertyValue('--property-w')) || 256;
      const space = parseFloat(computedStyle.getPropertyValue('--space')) || 24;
      const navbarH = parseFloat(computedStyle.getPropertyValue('--navbar-h')) || 48;

      // 计算边界
      const sidebarR = space + sidebarW;
      const propertyL = window.innerWidth - space - propertyW;

      // Canvas 顶部 = space + navbar-h + space
      const canvasTop = space + navbarH + space;

      // Canvas 可用高度（视口高度减去顶部和底部空间）
      const canvasHeight = window.innerHeight - canvasTop - (navbarH + 2 * space);

      setDimensions({
        left: 0, // Unused (handled by CSS)
        width: 0, // Unused (handled by CSS)
        top: canvasTop + (canvasHeight * 0.1), // 上方留 10% 空间
        height: canvasHeight * 0.66 // 2/3 高度
      });
    };

    computeDimensions();
    window.addEventListener('resize', computeDimensions);

    return () => window.removeEventListener('resize', computeDimensions);
  }, [isOpen]);

  // Tab 溢出检测
  const updateSecondaryOverflow = useCallback(() => {
    const container = secondaryTabsRef.current;
    const content = secondaryTabsContentRef.current;
    if (!container || !content) {
      setIsSecondaryOverflowing(false);
      return;
    }

    const tabItems = Array.from(content.children) as HTMLElement[];
    const collapsedItemsWidth = tabItems.reduce((total, item) => total + item.offsetWidth, 0);
    const collapsedGapWidth = Math.max(0, tabItems.length - 1) * 6;
    const collapsedWidth = collapsedItemsWidth + collapsedGapWidth;
    const availableWidth = content.clientWidth;
    const overflowing = content.scrollWidth > availableWidth + 1 || collapsedWidth > availableWidth + 1;
    setIsSecondaryOverflowing(overflowing);
  }, [secondaryTabsRef, secondaryTabsContentRef]);

  // 监听 Tab 变化和窗口大小变化
  useEffect(() => {
    if (!isOpen) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(updateSecondaryOverflow);
    });

    window.addEventListener('resize', updateSecondaryOverflow);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.removeEventListener('resize', updateSecondaryOverflow);
    };
  }, [isOpen, activeTypeKey, activeGroupNodesLength, dimensions.width, updateSecondaryOverflow]);

  return {
    dimensions,
    isSecondaryOverflowing,
    updateSecondaryOverflow,
  };
}
