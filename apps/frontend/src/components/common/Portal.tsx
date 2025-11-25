import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement;
  pointerEvents?: 'none' | 'auto';
  isOpen?: boolean;
  onClose?: () => void;
  id?: string;
}

const nodeCache = new WeakMap<HTMLElement, Map<string, HTMLDivElement>>();

export const Portal: React.FC<PortalProps> = ({
  children,
  container,
  pointerEvents = 'none',
  isOpen = true,
  onClose,
  id = 'portal-root'
}) => {
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

  const mode = (() => {
    if (!onClose) return 'none';
    return React.Children.count(children) === 1 ? 'auto' : 'none';
  })();

  useEffect(() => {
    if (!isOpen) {
      setMountNode(null);
      return;
    }

    const target = container || document.body;
    let containerMap = nodeCache.get(target);
    
    if (!containerMap) {
      containerMap = new Map();
      nodeCache.set(target, containerMap);
    }

    const cacheKey = `${pointerEvents}-${mode}`;
    let node = containerMap.get(cacheKey);

    if (!node) {
      node = document.createElement('div');
      node.id = id;
      Object.assign(node.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        pointerEvents: pointerEvents,
        zIndex: pointerEvents === 'auto' ? '1500' : 'auto'
      });
      target.appendChild(node);
      containerMap.set(cacheKey, node);
    }

    setMountNode(node);

    return () => {
      // ✅ 修复：删除 isOpen === false 判断
      if (node && node.parentElement) {
        node.parentElement.removeChild(node);
        containerMap!.delete(cacheKey);
        if (containerMap!.size === 0) {
          nodeCache.delete(target);
        }
      }
    };
  }, [isOpen, container, pointerEvents, id, mode]);

  // Popover 模式：监听 document
  useEffect(() => {
    if (!isOpen || !onClose || mode !== 'none') return;

    const handler = (e: MouseEvent) => {
      if (mountNode && !mountNode.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, mountNode, mode]);

  if (!isOpen || !mountNode) return null;

  const content = mode === 'auto' && onClose ? (
    <div
      style={{
        position: 'fixed', inset: '0',
        /* background: 'rgba(0,0,0,0.5)', */  // 注释掉全局遮黑效果
        /* backdropFilter: 'blur(9px)', */        // ✅ 注释掉全局遮罩层模糊效果
        /* WebkitBackdropFilter: 'blur(9px)', */    // Safari 兼容
        pointerEvents: 'auto',
      }}
      onClick={onClose}
    >
      <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  ) : children;

  return createPortal(content, mountNode);
};

// 1. 纯展示：{isOpen && <Portal>...</Portal>}
// 2. 需关闭：<Portal isOpen={isOpen} onClose={()=>setIsOpen(false)}>
//    - 弹窗加 pointerEvents="none" 遮罩层触发 onClose
//    - 内容区加 onClick={e=>e.stopPropagation()} 防误关
// 3. 标签名保持：<Portal>不变