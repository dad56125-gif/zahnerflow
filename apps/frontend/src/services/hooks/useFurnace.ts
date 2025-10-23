/**
 * Furnace 状态管理 Hook
 *
 * 封装加热炉设备的所有状态管理和操作逻辑
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useConditionalPolling } from './usePolling';
import { FurnaceApi } from '../api';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  CreatePresetRequest,
  ApplyPresetResult,
  FurnaceSample,
  HistoryQueryParams,
  DeviceError,
  ConnectionState,
  DeviceOperationStatus,
  DEFAULT_FURNACE_CONFIG,
  FurnaceConnectRequest,
  CommLog,
  OperationLog,
  LogEntry,
  LogType,
} from '../../types/devices';
import { isRetryableError } from '../utils/apiUtils';

/**
 * Furnace Hook 状态
 */
export interface FurnaceState {
  // 设备状态
  status: FurnaceStatus | null;
  connectionState: ConnectionState;
  operationState: DeviceOperationStatus;

  // 程序段数据
  segments: ProgramSegment[];

  // 程序段操作进度
  segmentOperation: {
    isLoading: boolean;
    operation: 'reading' | 'writing' | null;
    progress: number; // 0-100
    currentSegment: number; // 1-30
  };

  // 预设数据
  presets: FurnacePresetMeta[];
  selectedPreset: FurnacePreset | null;

  // 历史数据
  historyData: FurnaceSample[];
  historyParams: HistoryQueryParams;

  // UI状态
  isLoading: boolean;
  error: DeviceError | null;

  // 限流信息
  rateLimitInfo: {
    isLimited: boolean;
    retryAfter: number;
  };

  // 统计信息
  lastUpdate: Date | null;
  pollCount: number;

  // 日志（包含通信日志和操作日志）
  logs: LogEntry[];
}

/**
 * Furnace Hook 控制方法
 */
export interface FurnaceControls {
  // 连接控制
  connect: (config?: FurnaceConnectRequest) => Promise<void>;
  disconnect: () => Promise<void>;

  // 基本控制
  setTemperature: (sv: number) => Promise<void>;
  setSegment: (segment: number) => Promise<void>;

  // 程序控制
  run: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;

  // 程序段管理
  loadSegments: () => Promise<void>;
  writeSegments: (segments: ProgramSegment[]) => Promise<void>;

  // 预设管理
  loadPresets: () => Promise<void>;
  selectPreset: (name: string) => Promise<void>;
  createPreset: (preset: CreatePresetRequest) => Promise<void>;
  updatePreset: (name: string, segments: ProgramSegment[]) => Promise<void>;
  deletePreset: (name: string) => Promise<void>;
  clonePreset: (name: string, newName: string) => Promise<void>;
  applyPreset: (name: string) => Promise<void>;

  // 历史数据
  loadHistoryData: (params?: HistoryQueryParams) => Promise<void>;
  updateHistoryParams: (params: Partial<HistoryQueryParams>) => void;

  // 日志管理
  refreshLogs: () => Promise<void>;
  clearLogs: () => void;
  addOperationLog: (level: 'success' | 'info' | 'warning' | 'error', message: string) => void;

  // 状态管理
  reset: () => void;
  clearError: () => void;
  refresh: () => Promise<void>;
}

/**
 * Furnace Hook
 */
export function useFurnace(): [FurnaceState, FurnaceControls] {
  // 状态初始化
  const [state, setState] = useState<FurnaceState>({
    status: null,
    connectionState: {
      status: 'disconnected',
      reconnectAttempts: 0,
    },
    operationState: 'idle',
    segments: [],
    segmentOperation: {
      isLoading: false,
      operation: null,
      progress: 0,
      currentSegment: 0,
    },
    presets: [],
    selectedPreset: null,
    historyData: [],
    historyParams: FurnaceApi.getDefaultHistoryParams(),
    isLoading: false,
    error: null,
    rateLimitInfo: {
      isLimited: false,
      retryAfter: 0,
    },
    lastUpdate: null,
    pollCount: 0,
    logs: [],
  });

  // 更新状态的辅助函数
  const updateState = useCallback((updates: Partial<FurnaceState> | ((prevState: FurnaceState) => Partial<FurnaceState>)) => {
    setState(prev => {
      const updatesToApply = typeof updates === 'function' ? updates(prev) : updates;
      return { ...prev, ...updatesToApply };
    });
  }, []);

  // 设置加载状态
  const setLoading = useCallback((isLoading: boolean) => {
    updateState({ isLoading });
  }, [updateState]);

  // 更新程序段操作进度
  const updateSegmentOperation = useCallback((operation: 'reading' | 'writing' | null, currentSegment: number, progress: number) => {
    updateState({
      segmentOperation: {
        isLoading: operation !== null,
        operation,
        currentSegment,
        progress,
      }
    });
  }, [updateState]);

  // 完成程序段操作
  const completeSegmentOperation = useCallback(() => {
    updateState({
      segmentOperation: {
        isLoading: false,
        operation: null,
        progress: 100,
        currentSegment: 0,
      }
    });
    // 2秒后重置进度显示
    const timer = setTimeout(() => {
      updateState({
        segmentOperation: {
          isLoading: false,
          operation: null,
          progress: 0,
          currentSegment: 0,
        }
      });
    }, 2000);

    // 返回清理函数
    return () => clearTimeout(timer);
  }, [updateState]);

  // 设置错误状态
  const setError = useCallback((error: DeviceError | null) => {
    updateState({ error, isLoading: false });
  }, [updateState]);

  // 清除错误
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  // 用于存储定时器的引用
  const rateLimitTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const samplingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 处理API错误的通用函数
  const handleApiError = useCallback((error: any): void => {
    const deviceError = error as DeviceError;

    // 处理429限流错误
    if (deviceError.code === 'RATE_LIMIT') {
      updateState({
        rateLimitInfo: {
          isLimited: true,
          retryAfter: deviceError.retry_after || 5,
        },
      });

      // 清除之前的限流定时器
      const timerKey = 'rate_limit';
      const existingTimer = rateLimitTimers.current.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 设置新的倒计时，结束后解除限流状态
      const timer = setTimeout(() => {
        updateState({
          rateLimitInfo: {
            isLimited: false,
            retryAfter: 0,
          },
        });
        rateLimitTimers.current.delete(timerKey);
      }, deviceError.retry_after * 1000);

      rateLimitTimers.current.set(timerKey, timer);
      setError(deviceError);
      return;
    }

    // 处理网络错误或连接错误
    if (deviceError.code === 'NETWORK_ERROR' ||
        deviceError.status === 404 ||
        deviceError.status === 500 ||
        (deviceError.status && deviceError.status >= 400)) {
      updateState({
        connectionState: {
          status: 'disconnected',
          reconnectAttempts: prev => prev + 1,
        },
      });
    }

    setError(deviceError);
  }, [updateState, setError]);

  // 设备状态轮询 - 只在设备连接时才轮询
  const [, statusControls] = useConditionalPolling(
    async () => {
      try {
        const status = await FurnaceApi.getStatus();
        const rawStatus = String(status?.status ?? '').toLowerCase();
        const displayStatus =
          rawStatus === 'pause' || rawStatus === 'hold' ? 'hold' :
          rawStatus === 'paused' ? 'hold' :
          rawStatus === 'run' ? 'run' :
          rawStatus === 'running' ? 'run' :
          rawStatus === 'stop' ? 'stop' :
          rawStatus === 'stopped' ? 'stop' :
          rawStatus || 'unknown';

        // 数据验证和默认值处理
        const validatedStatus: FurnaceStatus = {
          pv: status?.pv ?? 0,
          sv: status?.sv ?? 0,
          mv: status?.mv ?? 0,
          status: displayStatus,
          segment: status?.segment ?? 0,
          segment_time: status?.segment_time ?? 0,
          segment_time_set: status?.segment_time_set ?? 0,
        };
        const derivedOperationState: DeviceOperationStatus =
          rawStatus === 'run' || rawStatus === 'running' ? 'running' :
          rawStatus === 'pause' || rawStatus === 'paused' || rawStatus === 'hold' ? 'paused' :
          rawStatus === 'stop' || rawStatus === 'stopped' ? 'stopped' :
          (() => {
            console.warn(`[Furnace] 未知状态: "${rawStatus}"，按停止处理`);
            addOperationLog('warning', `未知状态: ${rawStatus || 'null'}`);
            return 'stopped' as DeviceOperationStatus;
          })();

        // 更新设备状态
        updateState({
          status: validatedStatus,
          // 保持 connection_state 不变，由 connect()/disconnect() 控制
          operationState: derivedOperationState,
          lastUpdate: new Date(),
        });

        return validatedStatus;
      } catch (error) {
        handleApiError(error);
        throw error;
      }
    },
    () => state.connectionState.status === 'connected',
    DEFAULT_FURNACE_CONFIG.polling_interval,
    {
      immediate: true,
      onlyWhenVisible: true,
      maxRetries: DEFAULT_FURNACE_CONFIG.retry_attempts,
      retryDelay: DEFAULT_FURNACE_CONFIG.retry_delay,
      onError: handleApiError,
    }
  );

  // ==================== 日志管理 ====================

  const addOperationLog = useCallback((
    level: 'success' | 'info' | 'warning' | 'error',
    message: string
  ): void => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry: LogEntry = {
      id: Date.now().toString(),
      timestamp,
      type: 'operation',
      data: {
        timestamp,
        level,
        message
      } as OperationLog
    };

    updateState((prevState) => ({
      logs: [...(prevState.logs || []), logEntry].slice(-500)
    }));
  }, [updateState]);

  // ==================== 连接控制 ====================

  const connect = useCallback(async (config?: FurnaceConnectRequest): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      if (!config) {
        throw {
          code: 'INVALID_PARAMETER',
          message: 'Connection configuration is required',
          status: 400,
        } as DeviceError;
      }

      await FurnaceApi.connect(config);

      updateState({
        connectionState: {
          status: 'connected',
          lastConnected: new Date().toISOString(),
          reconnectAttempts: 0,
        },
      });

      // 添加操作日志
      addOperationLog('success', `设备已连接到 ${config.port}`);

      // 等待状态更新
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls, updateState, addOperationLog]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.disconnect();

      updateState({
        connectionState: {
          status: 'disconnected',
          reconnectAttempts: 0,
        },
        operationState: 'stopped',
        status: null,
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  // ==================== 基本控制 ====================

  const setTemperature = useCallback(async (sv: number): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.setTemperature(sv);

      // 添加操作日志
      addOperationLog('info', `温度设置为 ${sv}°C`);

      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls, addOperationLog]);

  const setSegment = useCallback(async (segment: number): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.setSegment(segment);
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls]);

  // ==================== 程序控制 ====================

  const run = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.run();

      // 添加操作日志
      addOperationLog('success', '程序已开始运行');

      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls, addOperationLog]);

  const pause = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.pause();

      // 添加操作日志
      addOperationLog('info', '程序已进入hold状态');

      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls, addOperationLog]);

  const stop = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.stop();

      // 添加操作日志
      addOperationLog('info', '程序已停止');

      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls, addOperationLog]);

  // ==================== 程序段管理 ====================

  const loadSegments = useCallback(async (): Promise<void> => {
    try {
      clearError();

      // 添加调试信息
      console.log('开始读取程序段...');

      // 开始读取程序段
      updateSegmentOperation('reading', 0, 0);

      // 先获取实际数据，不要模拟进度
      const segments = await FurnaceApi.getProgramSegments();

      // 添加验证日志
      console.log('API返回的段数据:', segments);
      if (segments.length > 0) {
        console.log('第一个段的数据:', segments[0]);
      }

      updateState({ segments });
      completeSegmentOperation();

      // 添加操作日志
      addOperationLog('success', `已读取程序段数据，共${segments.length}个段`);

    } catch (error) {
      handleApiError(error);
      updateSegmentOperation(null, 0, 0);
      throw error;
    }
  }, [clearError, handleApiError, updateState, updateSegmentOperation, completeSegmentOperation, addOperationLog]);

  const writeSegments = useCallback(async (segments: ProgramSegment[]): Promise<void> => {
    try {
      clearError();

      // 开始写入程序段
      updateSegmentOperation('writing', 0, 0);

      // 模拟写入进度更新 (1-30段)
      for (let i = 1; i <= 30; i++) {
        updateSegmentOperation('writing', i, Math.floor((i / 30) * 100));
        // 添加小延迟以显示进度效果
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      await FurnaceApi.writeProgramSegments(segments);
      updateState({ segments });
      completeSegmentOperation();

      // 添加操作日志
      addOperationLog('success', `已写入 ${segments.length} 个程序段`);

    } catch (error) {
      handleApiError(error);
      updateSegmentOperation(null, 0, 0);
      throw error;
    }
  }, [clearError, handleApiError, updateState, updateSegmentOperation, completeSegmentOperation, addOperationLog]);

  // ==================== 预设管理 ====================

  const loadPresets = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const presets = await FurnaceApi.getPresets();
      updateState({ presets });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  const selectPreset = useCallback(async (name: string): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const preset = await FurnaceApi.getPreset(name);
      updateState({ selectedPreset: preset });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  const createPreset = useCallback(async (preset: CreatePresetRequest): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.createPreset(preset);
      await loadPresets();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, loadPresets]);

  const updatePreset = useCallback(async (name: string, segments: ProgramSegment[]): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.updatePreset(name, segments);
      await loadPresets();

      // 如果更新的是当前选中的预设，也更新选中状态
      updateState((prevState) => {
        if (prevState.selectedPreset?.name === name) {
          // 异步更新预设，不在这里等待
          selectPreset(name);
        }
        return {};
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, loadPresets, selectPreset, state.selectedPreset]);

  const deletePreset = useCallback(async (name: string): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.deletePreset(name);
      await loadPresets();

      // 如果删除的是当前选中的预设，清除选中状态
      updateState((prevState) => {
        if (prevState.selectedPreset?.name === name) {
          return { selectedPreset: null };
        }
        return {};
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, loadPresets, updateState, state.selectedPreset]);

  const clonePreset = useCallback(async (name: string, newName: string): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await FurnaceApi.clonePreset(name, newName);
      await loadPresets();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, loadPresets]);

  const applyPreset = useCallback(async (name: string): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const result = await FurnaceApi.applyPreset(name);

      if (result.changed) {
        await statusControls.refresh();
      }

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls]);

  // ==================== 历史数据 ====================

  const loadHistoryData = useCallback(async (params?: HistoryQueryParams): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      updateState((prevState) => {
        const finalParams = params || prevState.historyParams;

        // 异步加载数据
        FurnaceApi.getTemperatureHistory(finalParams)
          .then(historyData => {
            updateState({
              historyData,
              historyParams: finalParams,
            });
          })
          .catch(handleApiError);

        return {};
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  const updateHistoryParams = useCallback((params: Partial<HistoryQueryParams>): void => {
    updateState((prevState) => ({
      historyParams: {
        ...prevState.historyParams,
        ...params,
      },
    }));
  }, [updateState]);

  // ==================== 状态管理 ====================

  const reset = useCallback((): void => {
    setState({
      status: null,
      connectionState: {
        status: 'disconnected',
        reconnectAttempts: 0,
      },
      operationState: 'idle',
      segments: [],
      presets: [],
      selectedPreset: null,
      historyData: [],
      historyParams: FurnaceApi.getDefaultHistoryParams(),
      isLoading: false,
      error: null,
      rateLimitInfo: {
        isLimited: false,
        retryAfter: 0,
      },
      lastUpdate: null,
      pollCount: 0,
      logs: [],
    });
  }, []);

  // 日志管理方法

  const refreshLogs = useCallback(async (): Promise<void> => {
    try {
      const response = await FurnaceApi.getCommLog();

      // 将通信日志转换为LogEntry格式
      const commLogEntries: LogEntry[] = response.logs.map((log: CommLog) => ({
        id: `comm_${log.timestamp}_${Math.random()}`,
        timestamp: log.timestamp,
        type: 'comm' as LogType,
        data: log
      }));

      updateState((prevState) => ({
        // 合并现有操作日志和新通信日志，保持最多500条
        logs: [...(prevState.logs || []).filter((log: LogEntry) => log.type === 'operation'), ...commLogEntries].slice(-500)
      }));
    } catch (error) {
      handleApiError(error);
    }
  }, [updateState, handleApiError]);

  const clearLogs = useCallback((): void => {
    updateState({ logs: [] });
  }, [updateState]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await statusControls.refresh();
    } catch (error) {
      handleApiError(error);
    }
  }, [statusControls, handleApiError]);

  // ==================== 初始化 ====================

  // 组件挂载时加载基础数据
  useEffect(() => {
    loadPresets();
    loadSegments();
  }, []);

  // 清理所有定时器的effect
  useEffect(() => {
    return () => {
      // 组件卸载时清理所有定时器
      rateLimitTimers.current.forEach(timer => clearTimeout(timer));
      rateLimitTimers.current.clear();

      if (samplingTimerRef.current) {
        clearInterval(samplingTimerRef.current);
        samplingTimerRef.current = null;
      }
    };
  }, []);

  // 实时采样：连接状态下按轮询间隔追加温度样本到 historyData
  useEffect(() => {
    if (state.connectionState.status !== 'connected') {
      return;
    }
    let alive = true;

    // 清除之前的采样定时器
    if (samplingTimerRef.current) {
      clearInterval(samplingTimerRef.current);
    }

    samplingTimerRef.current = setInterval(async () => {
      try {
        const s = await FurnaceApi.getStatus();
        if (!alive) return;

        const sample: FurnaceSample = {
          timestamp: new Date().toISOString(),
          temperature: (s?.pv as number) ?? 0,
          sv: (s?.sv as number) ?? 0,
          mv: (s?.mv as number) ?? 0,
        };

        setState(prev => ({
          ...prev,
          status: {
            pv: (s?.pv as number) ?? (prev.status?.pv ?? 0),
            sv: (s?.sv as number) ?? (prev.status?.sv ?? 0),
            mv: (s?.mv as number) ?? (prev.status?.mv ?? 0),
            status: (s?.status as string) ?? prev.status?.status ?? 'unknown',
            segment: (s?.segment as number) ?? (prev.status?.segment ?? 0),
            segment_time: (s?.segment_time as number) ?? (prev.status?.segment_time ?? 0),
            segment_time_set: (s?.segment_time_set as number) ?? (prev.status?.segment_time_set ?? 0),
          },
          lastUpdate: new Date(),
          historyData: [...(prev.historyData || []), sample],
        }));
      } catch (e) {
        // 静默处理实时轮询错误，避免打断 UI
      }
    }, DEFAULT_FURNACE_CONFIG.polling_interval);

    return () => {
      alive = false;
      if (samplingTimerRef.current) {
        clearInterval(samplingTimerRef.current);
        samplingTimerRef.current = null;
      }
    };
  }, [state.connectionState.status]);

  // 控制方法集合
  const controls: FurnaceControls = {
    connect,
    disconnect,
    setTemperature,
    setSegment,
    run,
    pause,
    stop,
    loadSegments,
    writeSegments,
    loadPresets,
    selectPreset,
    createPreset,
    updatePreset,
    deletePreset,
    clonePreset,
    applyPreset,
    loadHistoryData,
    updateHistoryParams,
    refreshLogs,
    clearLogs,
    addOperationLog,
    reset,
    clearError,
    refresh,
  };

  return [state, controls];
}

export default useFurnace;

