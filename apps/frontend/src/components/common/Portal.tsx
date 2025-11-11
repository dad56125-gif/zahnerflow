import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement | null;
}

/**
 * React Portal组件
 * 将子元素渲染到指定的DOM容器（默认是document.body）
 * 用途：
 * 1. 绕过祖先元素的层叠上下文限制（如transform、filter等）
 * 2. 实现模态框、下拉菜单等需要脱离正常文档流的组件
 * 3. 确保backdrop-filter能看到整个页面的内容
 */
export const Portal: React.FC<PortalProps> = ({ children, container }) => {
  const mountNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 创建portal容器div
    const node = document.createElement('div');
    mountNode.current = node;
    node.style.position = 'absolute';
    node.style.top = '0';
    node.style.left = '0';
    node.style.width = '100%';
    node.style.pointerEvents = 'none'; // 让点击事件能穿透到下方
    node.style.zIndex = '1000'; // 足够高的z-index

    // 将节点添加到目标容器
    const target = container || document.body;
    target.appendChild(node);

    return () => {
      // 清理：卸载时移除节点
      if (mountNode.current && target.contains(mountNode.current)) {
        target.removeChild(mountNode.current);
      }
    };
  }, [container]);

  if (!mountNode.current) {
    return null;
  }

  return createPortal(children, mountNode.current);
};
