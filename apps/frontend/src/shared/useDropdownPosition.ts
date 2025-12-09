/**
 * 下拉菜单位置和动画管理 Hook
 * 从 FilePathManagerUI/UserSelector/WorkflowManagerUI 提取的通用逻辑
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

export interface DropdownPosition {
    top: number;
    left: number;
    width: number;
}

interface UseDropdownPositionOptions {
    /** 触发元素的 ref */
    triggerRef: RefObject<HTMLElement>;
    /** 下拉菜单元素的 ref */
    dropdownRef: RefObject<HTMLElement>;
    /** 偏移量 */
    offset?: number;
    /** 最小宽度 */
    minWidth?: number;
}

interface UseDropdownPositionReturn {
    /** 是否显示下拉菜单 */
    isOpen: boolean;
    /** 是否正在关闭动画中 */
    isHiding: boolean;
    /** 下拉菜单位置 */
    position: DropdownPosition;
    /** 打开下拉菜单 */
    open: () => void;
    /** 开始关闭动画 */
    startClose: () => void;
    /** 切换显示状态 */
    toggle: () => void;
}

export const useDropdownPosition = (
    options: UseDropdownPositionOptions
): UseDropdownPositionReturn => {
    const { triggerRef, dropdownRef, offset = 8, minWidth = 200 } = options;

    const [isOpen, setIsOpen] = useState(false);
    const [isHiding, setIsHiding] = useState(false);
    const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 });

    // 更新下拉菜单位置
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({
            top: rect.bottom + offset,
            left: rect.left,
            width: Math.max(minWidth, rect.width)
        });
    }, [triggerRef, offset, minWidth]);

    // 打开时更新位置并添加事件监听
    useEffect(() => {
        if (isOpen) {
            updatePosition();

            const handleResize = () => updatePosition();
            const handleScroll = () => updatePosition();

            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleScroll, true);

            return () => {
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('scroll', handleScroll, true);
            };
        }
    }, [isOpen, updatePosition]);

    // 处理点击外部关闭
    useEffect(() => {
        if (!isOpen && !isHiding) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setIsHiding(true);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, isHiding, triggerRef, dropdownRef]);

    // 处理关闭动画结束
    useEffect(() => {
        if (!isHiding) return;

        const dropdown = dropdownRef.current;
        if (!dropdown) return;

        let animationCompleted = false;
        const fallbackTimer = setTimeout(() => {
            if (!animationCompleted) {
                setIsOpen(false);
                setIsHiding(false);
            }
        }, 300);

        const handleAnimationEnd = (e: AnimationEvent) => {
            if (e.animationName === 'dropdownOut') {
                animationCompleted = true;
                clearTimeout(fallbackTimer);
                setIsOpen(false);
                setIsHiding(false);
            }
        };

        const timer = setTimeout(() => {
            dropdown.addEventListener('animationend', handleAnimationEnd);
        }, 0);

        return () => {
            clearTimeout(timer);
            clearTimeout(fallbackTimer);
            dropdown.removeEventListener('animationend', handleAnimationEnd);
        };
    }, [isHiding, dropdownRef]);

    const open = useCallback(() => setIsOpen(true), []);
    const startClose = useCallback(() => setIsHiding(true), []);
    const toggle = useCallback(() => {
        if (isOpen) {
            setIsHiding(true);
        } else {
            setIsOpen(true);
        }
    }, [isOpen]);

    return { isOpen, isHiding, position, open, startClose, toggle };
};
