/**
 * 设备状态管理通用 Hook
 * 
 * 提供设备状态管理的通用逻辑，包括：
 * - 状态更新
 * - 加载状态管理
 * - 错误处理
 * - 日志记录
 * - 异步操作执行器
 */

import { useState, useCallback } from 'react';
import { DeviceError, LogEntry, LogEntryType, DeviceConnectionStatus } from './types';

// ==================== 基础状态接口 ====================

/** 设备状态基础字段 */
export interface BaseDeviceState {
    connection_status: DeviceConnectionStatus;
    loading: boolean;
    error: DeviceError | null;
    logs: LogEntry[];
}

/** 初始化基础状态 */
export function createBaseDeviceState(): BaseDeviceState {
    return {
        connection_status: 'disconnected',
        loading: false,
        error: null,
        logs: [],
    };
}

// ==================== Hook 返回类型 ====================

export interface UseDeviceStateReturn<TState extends BaseDeviceState> {
    /** 当前状态 */
    state: TState;
    /** 部分更新状态 */
    updateState: (updates: Partial<TState>) => void;
    /** 设置状态（完整替换） */
    setState: React.Dispatch<React.SetStateAction<TState>>;
    /** 设置加载状态 */
    setLoading: (loading: boolean) => void;
    /** 处理 API 错误 */
    handleError: (error: unknown) => void;
    /** 清除错误 */
    clearError: () => void;
    /** 添加日志 */
    addLog: (type: LogEntryType, message: string) => void;
    /** 清空日志 */
    clearLogs: () => void;
    /** 执行异步操作（带加载和错误处理） */
    execute: <T>(
        fn: () => Promise<T>,
        successMessage?: string,
        skipLoading?: boolean
    ) => Promise<T | undefined>;
}

// ==================== Hook 实现 ====================

/**
 * 设备状态管理 Hook
 * 
 * @param initialState - 初始状态
 * @returns 状态和控制方法
 */
export function useDeviceState<TState extends BaseDeviceState>(
    initialState: TState
): UseDeviceStateReturn<TState> {
    const [state, setState] = useState<TState>(initialState);

    // 部分更新状态
    const updateState = useCallback((updates: Partial<TState>) => {
        setState((prev) => ({ ...prev, ...updates }));
    }, []);

    // 设置加载状态
    const setLoading = useCallback(
        (loading: boolean) => updateState({ loading } as Partial<TState>),
        [updateState]
    );

    // 清除错误
    const clearError = useCallback(
        () => updateState({ error: null } as Partial<TState>),
        [updateState]
    );

    // 添加日志
    const addLog = useCallback((type: LogEntryType, message: string) => {
        setState((prev) => ({
            ...prev,
            logs: [
                {
                    id: Math.random().toString(36).slice(2),
                    timestamp: new Date().toLocaleTimeString(),
                    type,
                    message,
                },
                ...prev.logs,
            ].slice(0, 100), // 保留最近100条
        }));
    }, []);

    // 清空日志
    const clearLogs = useCallback(
        () => updateState({ logs: [] } as Partial<TState>),
        [updateState]
    );

    // 处理 API 错误
    const handleError = useCallback(
        (error: unknown) => {
            const deviceError: DeviceError =
                error && typeof error === 'object' && 'message' in error
                    ? (error as DeviceError)
                    : {
                        code: 'UNKNOWN',
                        message: String(error),
                        status: 0,
                    };

            updateState({
                error: deviceError,
                loading: false,
            } as Partial<TState>);

            addLog('error', deviceError.message);
        },
        [updateState, addLog]
    );

    // 执行异步操作
    const execute = useCallback(
        async <T>(
            fn: () => Promise<T>,
            successMessage?: string,
            skipLoading = false
        ): Promise<T | undefined> => {
            try {
                if (!skipLoading) {
                    updateState({ loading: true, error: null } as Partial<TState>);
                }

                const result = await fn();

                if (successMessage) {
                    addLog('success', successMessage);
                }

                return result;
            } catch (error) {
                handleError(error);
                return undefined;
            } finally {
                if (!skipLoading) {
                    updateState({ loading: false } as Partial<TState>);
                }
            }
        },
        [updateState, handleError, addLog]
    );

    return {
        state,
        updateState,
        setState,
        setLoading,
        handleError,
        clearError,
        addLog,
        clearLogs,
        execute,
    };
}
