import { useEffect, RefObject } from 'react';

/**
 * 自定义Hook：监听点击外部事件
 * 用于实现点击组件外部区域关闭面板的功能
 *
 * @param ref 组件的ref对象
 * @param handler 点击外部时要执行的回调函数
 * @param enabled 是否启用监听（默认true）
 */
export const useOnClickOutside = <T extends HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
) => {
  useEffect(() => {
    if (!enabled) return;

    const listener = (event: MouseEvent | TouchEvent) => {
      // 如果点击发生在ref指向的元素内部，则不执行handler
      const target = event.target as Node;
      if (ref.current && ref.current.contains(target)) {
        return;
      }

      // 否则执行handler
      handler(event);
    };

    // 监听鼠标点击和触摸事件
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    // 清理函数
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
};

export default useOnClickOutside;
