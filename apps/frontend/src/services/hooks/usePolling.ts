/**
 * 閫氱敤杞 Hook
 *
 * 鎻愪緵鑷姩杞鍔熻兘锛屾敮鎸佸惎鍋滄帶鍒躲€侀敊璇噸璇曘€侀槻鎶栫瓑鐗规€? */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceError } from '../api';
import { isRetryableError } from '../utils/apiUtils';

/**
 * 杞閰嶇疆閫夐」
 */
export interface PollingOptions<T> {
  /** 杞闂撮殧鏃堕棿锛堟绉掞級 */
  interval: number;
  /** 鏄惁绔嬪嵆鎵ц绗竴娆?*/
  immediate?: boolean;
  /** 鏄惁鍦ㄧ粍浠跺彲瑙佹椂鎵嶈疆璇?*/
  onlyWhenVisible?: boolean;
  /** 鏈€澶ч噸璇曟鏁?*/
  maxRetries?: number;
  /** 閲嶈瘯寤惰繜鏃堕棿锛堟绉掞級 */
  retryDelay?: number;
  /** 鎸囨暟閫€閬垮洜瀛?*/
  backoffFactor?: number;
  /** 閿欒鍥炶皟 */
  onError?: (error: DeviceError) => void;
  /** 鎴愬姛鍥炶皟 */
  onSuccess?: (data: T) => void;
  /** 杞鐘舵€佸彉鍖栧洖璋?*/
  onPollingStateChange?: (isPolling: boolean) => void;
  /** 渚濊禆鏁扮粍锛屽綋渚濊禆鍙樺寲鏃堕噸鏂板紑濮嬭疆璇?*/
  deps?: React.DependencyList;
  /** 鏄惁鍦ㄦ寕杞芥椂鑷姩鍚姩杞锛堥粯璁?true锛?/
  auto_start?: boolean;
}

/**
 * 杞鐘舵€? */
export interface PollingState<T> {
  /** 鏁版嵁 */
  data: T | null;
  /** 鏄惁姝ｅ湪鍔犺浇 */
  isLoading: boolean;
  /** 鏄惁姝ｅ湪杞 */
  isPolling: boolean;
  /** 閿欒淇℃伅 */
  error: DeviceError | null;
  /** 鏈€鍚庢洿鏂版椂闂?*/
  lastUpdate: Date | null;
  /** 閲嶈瘯娆℃暟 */
  retryCount: number;
  /** 杞娆℃暟 */
  pollCount: number;
}

/**
 * 杞鎺у埗鏂规硶
 */
export interface PollingControls {
  /** 寮€濮嬭疆璇?*/
  start: () => void;
  /** 鍋滄杞 */
  stop: () => void;
  /** 鎵嬪姩鍒锋柊 */
  refresh: () => Promise<void>;
  /** 閲嶇疆鐘舵€?*/
  reset: () => void;
}

/**
 * 閫氱敤杞 Hook
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

  // 鐘舵€佺鐞?  const [state, setState] = useState<PollingState<T>>({
    data: null,
    isLoading: false,
    isPolling: false,
    error: null,
    lastUpdate: null,
    retryCount: 0,
    pollCount: 0,
  });

  // 寮曠敤绠＄悊
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 娓呯悊鎵€鏈夊畾鏃跺櫒
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

  // 鏇存柊鐘舵€佺殑杈呭姪鍑芥暟
  const updateState = useCallback((updates: Partial<PollingState<T>>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  // 鎵ц鏁版嵁鑾峰彇
  const fetchData = useCallback(async (isRetry = false): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });

      const data = await fetchFn();

      if (!mountedRef.current) return;

      // 鎴愬姛鑾峰彇鏁版嵁
      updateState({
        data,
        isLoading: false,
        error: null,
        lastUpdate: new Date(),
        retryCount: 0,
        pollCount: (prev as number) + 1,
      });

      // 璋冪敤鎴愬姛鍥炶皟
      if (onSuccess) {
        onSuccess(data);
      }

    } catch (error) {
      if (!mountedRef.current) return;

      const deviceError = error as DeviceError;

      // 鏇存柊閿欒鐘舵€?      updateState({
        data: null,
        isLoading: false,
        error: deviceError,
        retryCount: isRetry ? (state.retryCount + 1) : 1,
      });

      // 璋冪敤閿欒鍥炶皟
      if (onError) {
        onError(deviceError);
      }

      // 濡傛灉鍙互閲嶈瘯涓旀湭杈惧埌鏈€澶ч噸璇曟鏁?      if (isRetryableError(deviceError) && state.retryCount < maxRetries) {
        const nextRetryDelay = retryDelay * Math.pow(backoffFactor, state.retryCount);

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            fetchData(true);
          }
        }, nextRetryDelay);
      } else {
        // 鏃犳硶閲嶈瘯鎴栬揪鍒版渶澶ч噸璇曟鏁帮紝鍋滄杞
        stop();
      }
    }
  }, [fetchFn, onError, onSuccess, retryDelay, backoffFactor, maxRetries, state.retryCount, updateState]);

  // 寮€濮嬭疆璇?  const start = useCallback(() => {
    if (intervalRef.current) return; // 宸茬粡鍦ㄨ疆璇?
    // 妫€鏌ラ〉闈㈠彲瑙佹€?    if (onlyWhenVisible && typeof document !== 'undefined' && document.hidden) {
      return;
    }

    // 绔嬪嵆鎵ц绗竴娆?    if (immediate) {
      fetchData();
    }

    // 璁剧疆瀹氭椂杞
    intervalRef.current = setInterval(() => {
      // 妫€鏌ラ〉闈㈠彲瑙佹€?      if (onlyWhenVisible && typeof document !== 'undefined' && document.hidden) {
        return;
      }

      fetchData();
    }, interval);

    updateState({ isPolling: true });

    // 璋冪敤杞鐘舵€佸彉鍖栧洖璋?    if (onPollingStateChange) {
      onPollingStateChange(true);
    }
  }, [interval, immediate, onlyWhenVisible, fetchData, updateState, onPollingStateChange]);

  // 鍋滄杞
  const stop = useCallback(() => {
    clearTimers();
    updateState({ isPolling: false, isLoading: false });

    // 璋冪敤杞鐘舵€佸彉鍖栧洖璋?    if (onPollingStateChange) {
      onPollingStateChange(false);
    }
  }, [clearTimers, updateState, onPollingStateChange]);

  // 鎵嬪姩鍒锋柊
  const refresh = useCallback(async (): Promise<void> => {
    await fetchData();
  }, [fetchData]);

  // 閲嶇疆鐘舵€?  const reset = useCallback(() => {
    stop();
    updateState({
      data: null,
      error: null,
      lastUpdate: null,
      retryCount: 0,
      pollCount: 0,
    });
  }, [stop, updateState]);

  // 椤甸潰鍙鎬у彉鍖栧鐞?  useEffect(() => {
    if (!onlyWhenVisible) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 椤甸潰闅愯棌鏃舵殏鍋滆疆璇?        if (intervalRef.current) {
          stop();
        }
      } else {
        // 椤甸潰鏄剧ず鏃舵仮澶嶈疆璇?        if (!intervalRef.current) {
          start();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onlyWhenVisible, start, stop]);

  // 渚濊禆鍙樺寲鏃堕噸鏂板紑濮嬭疆璇?  useEffect(() => {
    reset();
    if (auto_start) {
      start();
    }

    return () => {
      reset();
    };
  }, deps);

  // 缁勪欢鍗歌浇鏃舵竻鐞?  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  // 鎺у埗鏂规硶
  const controls: PollingControls = {
    start,
    stop,
    refresh,
    reset,
  };

  return [state, controls];
}

/**
 * 绠€鍖栫殑杞 Hook锛岄€傜敤浜庡ぇ澶氭暟鍦烘櫙
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
 * 甯︽湁鏉′欢杞鐨?Hook
 */
export function useConditionalPolling<T>(
  fetchFn: () => Promise<T>,
  shouldPoll: () => boolean,
  interval: number = 2000,
  options: Partial<PollingOptions<T>> = {}
): [PollingState<T>, PollingControls] {
  const [state, controls] = usePolling(fetchFn, {
    ...options,
    interval,
    immediate: false,
    auto_start: false,
    onlyWhenVisible: true,
    maxRetries: 3,
    retryDelay: 1000,
  });

  // 鏍规嵁鏉′欢鑷姩鍚姩/鍋滄杞
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
 * 澶氭暟鎹簮杞 Hook
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

  const fetchAllData = useCallback(async (): Promise<Partial<T>> => {
    try {
      

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

      return data;

    } catch (error) {
      throw error;
    }
  }, [fetchers]);

  // 浣跨敤绠€鍗曡疆璇?  const [data, isLoading, error] = useSimplePolling<Partial<T>>(
    fetchAllData,
    interval,
    options
  );

  return [data, isLoading, error];
}

export default usePolling;








