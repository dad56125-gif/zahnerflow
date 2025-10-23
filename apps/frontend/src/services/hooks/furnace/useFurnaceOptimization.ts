/**
 * Furnace 性能优化工具Hook
 */

import { useCallback, useMemo, useRef } from 'react';

// 智能缓存接口
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // 生存时间（毫秒）
}

/**
 * 智能缓存Hook
 */
export function useFurnaceCache<T>(ttl: number = 5000) {
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());

  const get = useCallback((key: string): T | null => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      cacheRef.current.delete(key);
      return null;
    }

    return entry.data;
  }, []);

  const set = useCallback((key: string, data: T, customTtl?: number): void => {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTtl || ttl,
    };
    cacheRef.current.set(key, entry);
  }, [ttl]);

  const clear = useCallback((): void => {
    cacheRef.current.clear();
  }, []);

  const cleanExpired = useCallback((): void => {
    const now = Date.now();
    for (const [key, entry] of cacheRef.current.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        cacheRef.current.delete(key);
      }
    }
  }, []);

  return { get, set, clear, cleanExpired };
}

/**
 * 防抖Hook
 */
export function useFurnaceDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      fn(...args);
    }, delay);
  }, [fn, delay]) as T;
}

/**
 * 节流Hook
 */
export function useFurnaceThrottle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      return fn(...args);
    }
  }, [fn, delay]) as T;
}

/**
 * 虚拟滚动Hook - 用于大列表优化
 */
export function useFurnaceVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  return useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, 0 - overscan); // 实际使用时会传入scrollTop
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2);

    const visibleItems = items.slice(startIndex, endIndex + 1);
    const totalHeight = items.length * itemHeight;
    const offsetY = startIndex * itemHeight;

    return {
      visibleItems,
      startIndex,
      endIndex,
      totalHeight,
      offsetY,
      visibleCount,
    };
  }, [items, itemHeight, containerHeight, overscan]);
}

/**
 * 批量状态更新Hook
 */
export function useFurnaceBatchUpdate() {
  const pendingUpdatesRef = useRef<Array<() => void>>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const scheduleUpdate = useCallback((updateFn: () => void): void => {
    pendingUpdatesRef.current.push(updateFn);

    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        // 批量执行所有更新
        const updates = pendingUpdatesRef.current.splice(0);
        updates.forEach(update => update());
        timeoutRef.current = null;
      }, 0);
    }
  }, []);

  const flushUpdates = useCallback((): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const updates = pendingUpdatesRef.current.splice(0);
    updates.forEach(update => update());
  }, []);

  return { scheduleUpdate, flushUpdates };
}

/**
 * 内存监控Hook
 */
export function useFurnaceMemoryMonitor() {
  const statsRef = useRef<{
    cacheHits: number;
    cacheMisses: number;
    renderCount: number;
  }>({
    cacheHits: 0,
    cacheMisses: 0,
    renderCount: 0,
  });

  const recordCacheHit = useCallback(() => {
    statsRef.current.cacheHits++;
  }, []);

  const recordCacheMiss = useCallback(() => {
    statsRef.current.cacheMisses++;
  }, []);

  const recordRender = useCallback(() => {
    statsRef.current.renderCount++;
  }, []);

  const getStats = useCallback(() => {
    const { cacheHits, cacheMisses, renderCount } = statsRef.current;
    const totalCacheRequests = cacheHits + cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0;

    return {
      cacheHits,
      cacheMisses,
      cacheHitRate: cacheHitRate.toFixed(2) + '%',
      renderCount,
      totalCacheRequests,
    };
  }, []);

  return { recordCacheHit, recordCacheMiss, recordRender, getStats };
}

/**
 * 性能监控Hook
 */
export function useFurnacePerformanceMonitor() {
  const timersRef = useRef<Map<string, number>>(new Map());

  const startTimer = useCallback((name: string): void => {
    timersRef.current.set(name, performance.now());
  }, []);

  const endTimer = useCallback((name: string): number => {
    const startTime = timersRef.current.get(name);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    timersRef.current.delete(name);

    // 记录性能数据（可以发送到监控系统）
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);

    return duration;
  }, []);

  const measureAsync = useCallback(async <T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    startTimer(name);
    try {
      const result = await fn();
      return result;
    } finally {
      endTimer(name);
    }
  }, [startTimer, endTimer]);

  return { startTimer, endTimer, measureAsync };
}