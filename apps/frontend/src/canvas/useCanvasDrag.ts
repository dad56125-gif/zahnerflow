/**
 * Canvas 拖动 Hook
 * 从 Canvas.tsx 提取的 Y 轴拖动逻辑
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseCanvasDragOptions {
    /** 初始是否启用拖动 */
    initialEnabled?: boolean;
}

export interface UseCanvasDragReturn {
    /** 是否启用拖动模式 */
    isDragEnabled: boolean;
    /** 是否正在拖动 */
    isDragging: boolean;
    /** 当前 Y 轴偏移量 */
    canvasOffsetY: number;
    /** 切换拖动模式 */
    toggleDragMode: () => void;
    /** 鼠标按下处理 */
    handleMouseDown: (e: React.MouseEvent) => void;
}

export const useCanvasDrag = (options: UseCanvasDragOptions = {}): UseCanvasDragReturn => {
    const { initialEnabled = false } = options;

    const [isDragEnabled, setIsDragEnabled] = useState(initialEnabled);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartY, setDragStartY] = useState(0);
    const [canvasOffsetY, setCanvasOffsetY] = useState(0);
    const dragStartScrollY = useRef(0);

    // 切换拖动模式
    const toggleDragMode = useCallback(() => {
        setIsDragEnabled(prev => {
            if (prev) setCanvasOffsetY(0); // 关闭时重置偏移
            return !prev;
        });
    }, []);

    // 鼠标按下处理
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!isDragEnabled || e.button !== 0) return;

        const target = e.target as HTMLElement;
        // 排除节点、缩放控件、工具栏的点击
        if (target.closest('.node') || target.closest('.zoom-controls') || target.closest('.toolbar')) {
            return;
        }

        setIsDragging(true);
        setDragStartY(e.clientY);
        dragStartScrollY.current = canvasOffsetY;
        e.preventDefault();
    }, [isDragEnabled, canvasOffsetY]);

    // 鼠标移动处理
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        const deltaY = e.clientY - dragStartY;
        setCanvasOffsetY(dragStartScrollY.current + deltaY);
    }, [isDragging, dragStartY]);

    // 鼠标释放处理
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // 全局事件监听
    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return {
        isDragEnabled,
        isDragging,
        canvasOffsetY,
        toggleDragMode,
        handleMouseDown
    };
};
