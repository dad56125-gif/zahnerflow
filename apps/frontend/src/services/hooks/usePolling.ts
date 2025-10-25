/**
 * 通用轮询 Hook
 *
 * 提供自动轮询功能，支持启停控制、错误重试、防抖等特性
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceError } from '../api';
import { isRetryableError } from '../utils/apiUtils';

/**
 * 轮询配置选项
 */
export interface PollingOptions<T> {
  /** 轮询间隔时间（毫秒） */
  interval: number;
  /** 是否立即执行第一次 */
  immediate?: boolean;
  /** 是否在组件可见时才轮询 */
  onlyWhenVisible?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟时间（毫秒） */
  retryDelay?: number;
  /** 指数退避因子 */
  backoffFactor?: number;
  /** 错误回调 */
  onError?: (error: DeviceError) => void;
  /** 成功回调 */
  onSuccess?: (data: T) => void;
  /** 轮询状态变化回调 */
  onPollingStateChange?: (isPolling: boolean) => void;
  /** 依赖数组，当依赖变化时重新开始轮询 */
  deps?: React.DependencyList;
  /** 是否在挂载时自动启动轮询（默认 true）*/
  auto_start?: boolean;
}

/**
 * 轮询状态
 */
export interface PollingState<T> {
  /** 数据 */
  data: T | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否正在轮询 */
  isPolling: boolean;
  /** 错误信息 */
  error: DeviceError | null;
  /** 最后更新时间 */
  lastUpdate: Date | null;
  /** 重试次数 */
  retryCount: number;
  /** 轮询次数 */
  pollCount: number;
}

/**
 * 轮询控制方法
 */
export interface PollingControls {
  /** 开始轮询 */
  start: () => void;
  /** 停止轮询 */
  stop: () => void;
  /** 手动刷新 */
  refresh: () => Promise<void>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 通用轮询 Hook
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: PollingOptions<T>
): [PollingState<T>, PollingControls] {
  const {
    interval,
    immediate = true,
    onlyWhenVisible = true,
    maxRetries = 3,
    retryDelay = 1000,
    backoffFactor = 2,
    onError,
    onSuccess,
    onPollingStateChange,
    deps = [],
    auto_start = true,
  } = options;

  // 状态管理
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    isLoading: false,
    isPolling: false,
    error: null,
    lastUpdate: null,
    retryCount: 0,
    pollCount: 0,
  });

  // 引用管理
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理所有定时器
  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // 更新状态的辅助函数
  const updateState = useCallback((updates: Partial<PollingState<T>>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  // 执行数据获取
  const fetchData = useCallback(async (isRetry = false): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });

      const data = await fetchFn();

      if (!mountedRef.current) return;

      // 成功获取数据
      updateState(prev => ({
        ...prev,
        data,
        isLoading: false,
        error: null,
        lastUpdate: new Date(),
        retryCount: 0,
        pollCount: prev.pollCount + 1,
      }));

      // 调用成功回调
      if (onSuccess) {
        onSuccess(data);
      }

    } catch (error) {
      if (!mountedRef.current) return;

      const deviceError = error as DeviceError;

      // 更新错误状态
      updateState(prev => ({
        ...prev,
        data: null,
        isLoading: false,
        error: deviceError,
        retryCount: isRetry ? prev.retryCount + 1 : 1,
      }));

      // 调用错误回调
      if (onError) {
        onError(deviceError);
      }

      // 如果可以重试且未达到最大重试次数
      if (apiUtils.isRetryableError(deviceError) && state.retryCount < maxRetries) {
        const nextRetryDelay = retryDelay * Math.pow(backoffFactor, state.retryCount);

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            fetchData(true);
          }
        }, nextRetryDelay);
      } else {
        // 无法重试或达到最大重试次数，停止轮询
        stop();
      }
    }
  }, [fetchFn, onError, onSuccess, retryDelay, backoffFactor, maxRetries, state.retryCount, updateState]);

  // 开始轮询
  const start = useCallback(() => {
    if (intervalRef.current) return; // 已经在轮询

    // 检查页面可见性
    if (onlyWhenVisible && typeof document !== 'undefined' && document.hidden) {
      return;
    }

    // 立即执行第一次
    if (immediate) {
      fetchData();
    }

    // 设置定时轮询
    intervalRef.current = setInterval(() => {
      // 检查页面可见性
      if (onlyWhenVisible && typeof document !== 'undefined' && document.hidden) {
        return;
      }

      fetchData();
    }, interval);

    updateState({ isPolling: true });

    // 调用轮询状态变化回调
    if (onPollingStateChange) {
      onPollingStateChange(true);
    }
  }, [interval, immediate, onlyWhenVisible, fetchData, updateState, onPollingStateChange]);

  // 停止轮询
  const stop = useCallback(() => {
    clearTimers();
    updateState({ isPolling: false, isLoading: false });

    // 调用轮询状态变化回调
    if (onPollingStateChange) {
      onPollingStateChange(false);
    }
  }, [clearTimers, updateState, onPollingStateChange]);

  // 手动刷新
  const refresh = useCallback(async (): Promise<void> => {
    await fetchData();
  }, [fetchData]);

  // 重置状态
  const reset = useCallback(() => {
    stop();
    updateState({
      data: null,
      error: null,
      lastUpdate: null,
      retryCount: 0,
      pollCount: 0,
    });
  }, [stop, updateState]);

  // 页面可见性变化处理
  useEffect(() => {
    if (!onlyWhenVisible) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏时暂停轮询
        if (intervalRef.current) {
          stop();
        }
      } else {
        // 页面显示时恢复轮询
        if (!intervalRef.current) {
          start();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onlyWhenVisible, start, stop]);

  // 依赖变化时重新开始轮询
  useEffect(() => {
    reset();
    if (auto_start) {
      start();
    }

    return () => {
      reset();
    };
  }, deps);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  // 控制方法
  const controls: PollingControls = {
    start,
    stop,
    refresh,
    reset,
  };

  return [state, controls];
}

/**
 * 简化的轮询 Hook，适用于大多数场景
 */
export function useSimplePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number = 2000,
  options: Partial<PollingOptions<T>> = {}
): [T | null, boolean, DeviceError | null, () => void, () => void] {
  const [state, controls] = usePolling(fetchFn, {
    interval,
    immediate: true,
    onlyWhenVisible: true,
    maxRetries: 3,
    retryDelay: 1000,
    ...options,
  });

  return [
    state.data,
    state.isLoading,
    state.error,
    controls.refresh,
    controls.stop,
  ];
}

/**
 * 带有条件轮询的 Hook
 */
export function useConditionalPolling<T>(
  fetchFn: () => Promise<T>,
  shouldPoll: () => boolean,
  interval: number = 2000,
  options: Partial<PollingOptions<T>> = {}
): [PollingState<T>, PollingControls] {
  const [state, controls] = usePolling(fetchFn, {
    interval,
    immediate: false,
    onlyWhenVisible: true,
    maxRetries: 3,
    retryDelay: 1000,
    ...options,
  });

  // 根据条件自动启动/停止轮询
  useEffect(() => {
    if (shouldPoll()) {
      controls.start();
    } else {
      controls.stop();
    }
  }, [shouldPoll, controls.start, controls.stop]);

  return [state, controls];
}

/**
 * 多数据源轮询 Hook
 */
export function useMultiPolling<T extends Record<string, any>>(
  fetchers: {
    [K in keyof T]: () => Promise<T[K]>;
  },
  interval: number = 2000,
  options: Partial<PollingOptions<T>> = {}
): [Partial<T> | null, boolean, DeviceError | null] {
  const [state, setState] = useState<{
    data: Partial<T> | null;
    isLoading: boolean;
    error: DeviceError | null;
  }>({
    data: null,
    isLoading: false,
    error: null,
  });

  const fetchAllData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const promises = Object.entries(fetchers).map(async ([key, fetcher]) => {
        const value = await fetcher();
        return [key, value] as [string, any];
      });

      const results = await Promise.allSettled(promises);

      const data: Partial<T> = {};
      let hasError = false;
      let firstError: DeviceError | null = null;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const [key] = Object.keys(fetchers)[index];
          data[key as keyof T] = result.value[1];
        } else {
          hasError = true;
          if (!firstError) {
            firstError = result.reason as DeviceError;
          }
        }
      });

      setState({
        data,
        isLoading: false,
        error: hasError ? firstError : null,
      });

    } catch (error) {
      setState({
        data: null,
        isLoading: false,
        error: error as DeviceError,
      });
    }
  }, [fetchers]);

  // 使用简单轮询
  const [data, isLoading, error, refresh] = useSimplePolling(
    fetchAllData,
    interval,
    options
  );

  return [data, isLoading, error];
}

export default usePolling;
