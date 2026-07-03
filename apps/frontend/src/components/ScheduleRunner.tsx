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
import { FloatingLayer } from './shared/OverlayLayer';

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

interface ScheduleTimePickerProps {
    initialTime?: Date | null;
    confirmText?: string;
    onConfirm: (scheduledTime: Date) => void;
}

export const ScheduleTimePicker: React.FC<ScheduleTimePickerProps> = ({
    initialTime = null,
    confirmText = '开始',
    onConfirm
}) => {
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(0);
    const [isNextDay, setIsNextDay] = useState(false);

    const hourDigitRef = useRef<HTMLDivElement>(null);
    const minuteDigitRef = useRef<HTMLDivElement>(null);

    const triggerFlip = useCallback((el: HTMLDivElement | null) => {
        if (!el) return;
        el.classList.add('flipping');
        const onEnd = () => {
            el.classList.remove('flipping');
            el.removeEventListener('animationend', onEnd);
        };
        el.addEventListener('animationend', onEnd);
    }, []);

    const getMinTime = useCallback(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);
        return now;
    }, []);

    useEffect(() => {
        if (initialTime) {
            setHours(initialTime.getHours());
            setMinutes(initialTime.getMinutes());
            setIsNextDay(initialTime.toDateString() !== new Date().toDateString());
            return;
        }

        const minTime = getMinTime();
        setHours(minTime.getHours());
        setMinutes(Math.ceil(minTime.getMinutes() / 5) * 5);
        setIsNextDay(false);
    }, [getMinTime, initialTime]);

    const handleHourWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;

        setHours(prev => {
            let newHour = prev + delta;
            const minTime = getMinTime();
            const minHour = minTime.getHours();
            const minMinute = minTime.getMinutes();

            if (newHour > 23) {
                if (!isNextDay) {
                    setIsNextDay(true);
                    return 0;
                }
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

            if (!isNextDay && newHour < minHour) {
                return minHour;
            }

            if (!isNextDay && newHour === minHour && minutes < minMinute) {
                setMinutes(Math.ceil(minMinute / 5) * 5);
            }

            return newHour;
        });
        triggerFlip(hourDigitRef.current);
    }, [getMinTime, isNextDay, minutes, triggerFlip]);

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
                setHours(h => {
                    if (h === 23 && !isNextDay) {
                        setIsNextDay(true);
                        return 0;
                    }
                    return Math.min(h + 1, 23);
                });
            }

            if (newMinute < 0) {
                newMinute = 55;
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

            if (!isNextDay && hours === minHour && newMinute < minMinute) {
                return Math.ceil(minMinute / 5) * 5;
            }

            return newMinute;
        });
        triggerFlip(minuteDigitRef.current);
    }, [getMinTime, isNextDay, hours, triggerFlip]);

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

    const handleConfirm = () => {
        const now = new Date();
        const scheduledTime = new Date(now);

        if (isNextDay) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        scheduledTime.setHours(hours, minutes, 0, 0);
        onConfirm(scheduledTime);
    };

    return (
        <>
            <div className="schedule-runner__clock">
                <div
                    ref={hourDigitRef}
                    className="schedule-runner__digit"
                    title="滚动调整小时"
                >
                    <span className="schedule-runner__value">
                        {hours.toString().padStart(2, '0')}
                    </span>
                    <span className="schedule-runner__label">时</span>
                </div>

                <span className="schedule-runner__separator">:</span>

                <div
                    ref={minuteDigitRef}
                    className="schedule-runner__digit"
                    title="滚动调整分钟"
                >
                    <span className="schedule-runner__value">
                        {minutes.toString().padStart(2, '0')}
                    </span>
                    <span className="schedule-runner__label">分</span>
                </div>

                {isNextDay && (
                    <span className="schedule-runner__next-day">+1day</span>
                )}
            </div>

            <button
                className="btn btn--sm btn--primary btn--block"
                onClick={handleConfirm}
            >
                {confirmText}
            </button>
        </>
    );
};

export const ScheduleRunner: React.FC<ScheduleRunnerProps> = ({
    isOpen,
    onClose,
    onSchedule,
    anchorRect
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

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
        <FloatingLayer
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            passthrough
            id="schedule-runner-popover"
        >
            <div
                ref={modalRef}
                className="schedule-runner glass"
                style={{ ...modalStyle, pointerEvents: 'auto' }}
            >
                <ScheduleTimePicker
                    onConfirm={(scheduledTime) => {
                        onSchedule(scheduledTime);
                        onClose();
                    }}
                />
            </div>
        </FloatingLayer>
    );
};

export default ScheduleRunner;
