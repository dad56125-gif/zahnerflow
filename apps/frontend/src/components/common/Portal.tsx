import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement | null;
  /**
   * 控制 Portal 容器的点击穿透行为
   * 'none': 点击穿透（适用于下拉菜单、Tooltip，不阻挡下方内容）- 默认值
   * 'auto': 阻挡点击（适用于模态框、全屏遮罩）
   */
  pointerEvents?: 'none' | 'auto';
}

/**
 * React Portal组件
 * 将子元素渲染到指定的DOM容器（默认是document.body）
 * 用途：
 * 1. 绕过祖先元素的层叠上下文限制（如transform、filter等）
 * 2. 实现模态框、下拉菜单等需要脱离正常文档流的组件
 * 3. 确保backdrop-filter能看到整个页面的内容
 */
export const Portal: React.FC<PortalProps> = ({
  children,
  container,
  pointerEvents = 'none' // 保持默认行为，兼容现有的下拉菜单
}) => {
  const mountNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = document.createElement('div');
    mountNode.current = node;

    // 基础样式
    node.style.position = 'absolute';
    node.style.top = '0';
    node.style.left = '0';
    node.style.width = '100%';

    // ✅ 动态设置 pointer-events
    node.style.pointerEvents = pointerEvents;

    // 注意：如果是模态框，zIndex 可能需要更高，或者由内部 CSS 控制
    node.style.zIndex = pointerEvents === 'auto' ? '1000' : '999';

    const target = container || document.body;
    target.appendChild(node);

    return () => {
      // 清理：卸载时移除节点
      if (mountNode.current && target.contains(mountNode.current)) {
        target.removeChild(mountNode.current);
      }
    };
  }, [container, pointerEvents]); // 添加 pointerEvents 到依赖项

  if (!mountNode.current) {
    return null;
  }

  return createPortal(children, mountNode.current);
};
