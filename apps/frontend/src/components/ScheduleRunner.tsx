/**
 * ScheduleRunner 定时运行组件
 * 
 * 翻页钟风格的时间选择器，用于设置定时执行工作流。
 * 功能：
 * - 翻页钟形式显示时:分
 * - 鼠标滚轮调整时间
 * - 最早可设定时间为当前时间的5分钟后
 * - 最多可设置24小时后（第二天同一时间）
 * - 第二天时显示 "+1" 标识
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Portal } from './Portal';
import { Button } from '../shared/Button';

interface ScheduleRunnerProps {
    /** 是否显示弹窗 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 确认定时回调 */
    onSchedule: (scheduledTime: Date) => void;
    /** 按钮元素的位置信息 */
    anchorRect?: DOMRect | null;
}

export const ScheduleRunner: React.FC<ScheduleRunnerProps> = ({
    isOpen,
    onClose,
    onSchedule,
    anchorRect
}) => {
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(0);
    const [isNextDay, setIsNextDay] = useState(false);

    const modalRef = useRef<HTMLDivElement>(null);

    // 计算最早可设定时间（当前时间 + 5分钟）
    const getMinTime = useCallback(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);
        return now;
    }, []);

    // 初始化为最早可设定时间
    useEffect(() => {
        if (isOpen) {
            const minTime = getMinTime();
            setHours(minTime.getHours());
            setMinutes(Math.ceil(minTime.getMinutes() / 5) * 5); // 向上取整到5分钟
            setIsNextDay(false);
        }
    }, [isOpen, getMinTime]);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // 滚轮调整小时
    const handleHourWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;

        setHours(prev => {
            let newHour = prev + delta;
            const minTime = getMinTime();
            const minHour = minTime.getHours();
            const minMinute = minTime.getMinutes();

            // 处理跨天
            if (newHour > 23) {
                if (!isNextDay) {
                    setIsNextDay(true);
                    return 0;
                }
                // 已经是第二天，限制到最大24小时
                const now = new Date();
                if (newHour > now.getHours()) {
                    return now.getHours();
                }
            }

            if (newHour < 0) {
                if (isNextDay) {
                    setIsNextDay(false);
                    return 23;
                }
                return minHour;
            }

            // 同一天内不能早于最早时间
            if (!isNextDay && newHour < minHour) {
                return minHour;
            }

            // 同一天同一小时内，检查分钟
            if (!isNextDay && newHour === minHour && minutes < minMinute) {
                setMinutes(Math.ceil(minMinute / 5) * 5);
            }

            return newHour;
        });
    }, [getMinTime, isNextDay, minutes]);

    // 滚轮调整分钟（每次5分钟）
    const handleMinuteWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;

        setMinutes(prev => {
            let newMinute = prev + delta;
            const minTime = getMinTime();
            const minHour = minTime.getHours();
            const minMinute = minTime.getMinutes();

            if (newMinute >= 60) {
                newMinute = 0;
                // 增加小时
                setHours(h => {
                    if (h === 23) {
                        if (!isNextDay) {
                            setIsNextDay(true);
                            return 0;
                        }
                    }
                    return Math.min(h + 1, 23);
                });
            }

            if (newMinute < 0) {
                newMinute = 55;
                // 减少小时
                setHours(h => {
                    if (h === 0 && isNextDay) {
                        setIsNextDay(false);
                        return 23;
                    }
                    if (!isNextDay && h <= minHour) {
                        return minHour;
                    }
                    return Math.max(h - 1, 0);
                });
            }

            // 同一天同一小时内，检查分钟
            if (!isNextDay && hours === minHour && newMinute < minMinute) {
                return Math.ceil(minMinute / 5) * 5;
            }

            return newMinute;
        });
    }, [getMinTime, isNextDay, hours]);

    // 使用 ref 存储元素引用
    const hourDigitRef = useRef<HTMLDivElement>(null);
    const minuteDigitRef = useRef<HTMLDivElement>(null);

    // 使用原生事件监听器（非 passive）来处理滚轮事件
    useEffect(() => {
        const hourEl = hourDigitRef.current;
        const minuteEl = minuteDigitRef.current;

        if (hourEl) {
            hourEl.addEventListener('wheel', handleHourWheel, { passive: false });
        }
        if (minuteEl) {
            minuteEl.addEventListener('wheel', handleMinuteWheel, { passive: false });
        }

        return () => {
            if (hourEl) {
                hourEl.removeEventListener('wheel', handleHourWheel);
            }
            if (minuteEl) {
                minuteEl.removeEventListener('wheel', handleMinuteWheel);
            }
        };
    }, [handleHourWheel, handleMinuteWheel]);

    // 确认定时
    const handleConfirm = () => {
        const now = new Date();
        const scheduledTime = new Date(now);

        if (isNextDay) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        scheduledTime.setHours(hours, minutes, 0, 0);
        onSchedule(scheduledTime);
        onClose();
    };

    if (!isOpen) return null;

    // 计算弹窗位置（与定时按钮居中对齐，向下移动18px）
    const modalWidth = 176; // 11rem = 176px
    const modalStyle: React.CSSProperties = anchorRect ? {
        position: 'fixed',
        top: anchorRect.bottom + 18, // 向下移动18px
        left: anchorRect.left + (anchorRect.width / 2) - (modalWidth / 2), // 与按钮居中对齐
        zIndex: 9999
    } : {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999
    };

    return (
        <Portal pointerEvents="auto">
            <div
                ref={modalRef}
                className="schedule-runner-modal glass"
                style={{ ...modalStyle, pointerEvents: 'auto' }}
            >
                {/* 翻页钟区域 */}
                <div className="schedule-runner-clock">
                    {/* 小时 */}
                    <div
                        ref={hourDigitRef}
                        className="schedule-runner-digit"
                        title="滚动调整小时"
                    >
                        <span className="schedule-runner-value">
                            {hours.toString().padStart(2, '0')}
                        </span>
                        <span className="schedule-runner-label">时</span>
                    </div>

                    {/* 分隔符 */}
                    <span className="schedule-runner-separator">:</span>

                    {/* 分钟 */}
                    <div
                        ref={minuteDigitRef}
                        className="schedule-runner-digit"
                        title="滚动调整分钟"
                    >
                        <span className="schedule-runner-value">
                            {minutes.toString().padStart(2, '0')}
                        </span>
                        <span className="schedule-runner-label">分</span>
                    </div>

                    {/* 第二天标识 */}
                    {isNextDay && (
                        <span className="schedule-runner-next-day">+1day</span>
                    )}
                </div>

                {/* 确认按钮 */}
                <Button
                    variant="primary"
                    size="small"
                    block
                    onClick={handleConfirm}
                >
                    开始
                </Button>
            </div>
        </Portal>
    );
};

export default ScheduleRunner;
