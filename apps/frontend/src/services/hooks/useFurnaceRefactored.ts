/**
 * Furnace 状态管理 Hook - 重构版本
 *
 * 使用模块化设计，将原来的860行单体Hook拆分为多个专门的子Hook
 * 提高可维护性、可测试性和性能
 */

import { useCallback, useEffect } from 'react';
import { FurnaceApi } from '../api';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  CreatePresetRequest,
  ApplyPresetResult,
  FurnaceConnectRequest,
  HistoryQueryParams,
  DeviceError,
  DeviceOperationStatus,
  LogEntry,
  CommLog,
} from '../../types/devices';
import {
  useFurnaceConnection,
  useFurnaceStatus,
  useFurnaceProgram,
  useFurnacePresets,
  useFurnaceHistory,
  useFurnaceLogs,
  useFurnaceErrorHandler,
  useFurnacePolling,
} from './furnace';
import { DEFAULT_FURNACE_CONFIG } from '../../types/devices';

/**
 * 合并后的Furnace状态接口，保持向后兼容
 */
export interface FurnaceState {
  // 设备状态
  status: FurnaceStatus | null;
  connectionState: {
    status: 'connected' | 'disconnected';
    reconnectAttempts: number;
    lastConnected?: string;
  };
  operationState: DeviceOperationStatus;

  // 程序段数据
  segments: ProgramSegment[];
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
  historyData: any[];
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

  // 日志
  logs: LogEntry[];
}

/**
 * 控制方法接口，保持向后兼容
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
 * 重构后的Furnace Hook
 */
export function useFurnaceRefactored(): [FurnaceState, FurnaceControls] {
  // 初始化各个子Hook
  const [connectionStateData, connectionControls] = useFurnaceConnection();
  const [statusData, statusControls] = useFurnaceStatus();
  const [programData, programControls] = useFurnaceProgram();
  const [presetsData, presetsControls] = useFurnacePresets();
  const [historyData, historyControls] = useFurnaceHistory();
  const [logsData, logsControls] = useFurnaceLogs();
  const [errorData, errorControls] = useFurnaceErrorHandler();

  // 智能轮询
  const [, pollingControls] = useFurnacePolling({
    connectionState: connectionStateData.connectionState,
    onStatusUpdate: (status, operationState) => {
      statusControls.updateStatus(status, operationState);
    },
    onSampleAdd: (sample) => {
      historyControls.addSample(sample);
    },
    onError: errorControls.handleApiError,
  });

  // 合并状态
  const mergedState: FurnaceState = {
    // 设备状态
    status: statusData.status,
    connectionState: connectionStateData.connectionState,
    operationState: statusData.operationState,

    // 程序段数据
    segments: programData.segments,
    segmentOperation: programData.segmentOperation,

    // 预设数据
    presets: presetsData.presets,
    selectedPreset: presetsData.selectedPreset,

    // 历史数据
    historyData: historyData.historyData,
    historyParams: historyData.historyParams,

    // UI状态
    isLoading: connectionStateData.isLoading || statusData.isLoading ||
                presetsData.isLoading || historyData.isLoading ||
                programData.segmentOperation.isLoading,
    error: connectionStateData.error || errorData.error,

    // 限流信息
    rateLimitInfo: errorData.rateLimitInfo,

    // 统计信息
    lastUpdate: statusData.lastUpdate,
    pollCount: statusData.pollCount,

    // 日志
    logs: logsData.logs,
  };

  // ==================== 连接控制 ====================

  const connect = useCallback(async (config?: FurnaceConnectRequest): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      if (!config) {
        throw {
          code: 'INVALID_PARAMETER',
          message: 'Connection configuration is required',
          status: 400,
        } as DeviceError;
      }

      await FurnaceApi.connect(config);
      connectionControls.setConnectionState({
        status: 'connected',
        lastConnected: new Date().toISOString(),
        reconnectAttempts: 0,
      });

      logsControls.addOperationLog('success', `设备已连接到 ${config.port}`);
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, logsControls, pollingControls]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.disconnect();
      connectionControls.setConnectionState({
        status: 'disconnected',
        reconnectAttempts: 0,
      });
      statusControls.setOperationState('stopped');
      statusControls.setStatus(null as any);

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, statusControls]);

  // ==================== 基本控制 ====================

  const setTemperature = useCallback(async (sv: number): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.setTemperature(sv);
      logsControls.addOperationLog('info', `温度设置为 ${sv}°C`);
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, logsControls, pollingControls]);

  const setSegment = useCallback(async (segment: number): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.setSegment(segment);
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, pollingControls]);

  // ==================== 程序控制 ====================

  const run = useCallback(async (): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.run();
      logsControls.addOperationLog('success', '程序已开始运行');
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, logsControls, pollingControls]);

  const pause = useCallback(async (): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.pause();
      logsControls.addOperationLog('info', '程序已进入hold状态');
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, logsControls, pollingControls]);

  const stop = useCallback(async (): Promise<void> => {
    try {
      connectionControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.stop();
      logsControls.addOperationLog('info', '程序已停止');
      await pollingControls.refreshPolling();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      connectionControls.setLoading(false);
    }
  }, [connectionControls, errorControls, logsControls, pollingControls]);

  // ==================== 程序段管理 ====================

  const loadSegments = useCallback(async (): Promise<void> => {
    try {
      errorControls.clearError();
      programControls.updateSegmentOperation('reading', 0, 0);

      // 模拟进度更新
      for (let i = 1; i <= 30; i++) {
        programControls.updateSegmentOperation('reading', i, Math.floor((i / 30) * 100));
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      const segments = await FurnaceApi.getProgramSegments();
      programControls.setSegments(segments);
      programControls.completeSegmentOperation();
      logsControls.addOperationLog('success', '已读取程序段数据');

    } catch (error) {
      errorControls.handleApiError(error);
      programControls.clearSegmentOperation();
      throw error;
    }
  }, [errorControls, programControls, logsControls]);

  const writeSegments = useCallback(async (segments: ProgramSegment[]): Promise<void> => {
    try {
      errorControls.clearError();
      programControls.updateSegmentOperation('writing', 0, 0);

      // 模拟进度更新
      for (let i = 1; i <= 30; i++) {
        programControls.updateSegmentOperation('writing', i, Math.floor((i / 30) * 100));
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      await FurnaceApi.writeProgramSegments(segments);
      programControls.setSegments(segments);
      programControls.completeSegmentOperation();
      logsControls.addOperationLog('success', `已写入 ${segments.length} 个程序段`);

    } catch (error) {
      errorControls.handleApiError(error);
      programControls.clearSegmentOperation();
      throw error;
    }
  }, [errorControls, programControls, logsControls]);

  // ==================== 预设管理 ====================

  const loadPresets = useCallback(async (): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      const presets = await FurnaceApi.getPresets();
      presetsControls.setPresets(presets);

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls]);

  const selectPreset = useCallback(async (name: string): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      const preset = await FurnaceApi.getPreset(name);
      presetsControls.setSelectedPreset(preset);

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls]);

  const createPreset = useCallback(async (preset: CreatePresetRequest): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.createPreset(preset);
      await loadPresets();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls, loadPresets]);

  const updatePreset = useCallback(async (name: string, segments: ProgramSegment[]): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.updatePreset(name, segments);
      await loadPresets();

      // 如果更新的是当前选中的预设，也更新选中状态
      if (presetsData.selectedPreset?.name === name) {
        await selectPreset(name);
      }

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls, loadPresets, presetsData.selectedPreset, selectPreset]);

  const deletePreset = useCallback(async (name: string): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.deletePreset(name);
      await loadPresets();

      // 如果删除的是当前选中的预设，清除选中状态
      if (presetsData.selectedPreset?.name === name) {
        presetsControls.setSelectedPreset(null);
      }

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls, loadPresets, presetsData.selectedPreset]);

  const clonePreset = useCallback(async (name: string, newName: string): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      await FurnaceApi.clonePreset(name, newName);
      await loadPresets();

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls, loadPresets]);

  const applyPreset = useCallback(async (name: string): Promise<void> => {
    try {
      presetsControls.setLoading(true);
      errorControls.clearError();

      const result = await FurnaceApi.applyPreset(name);

      if (result.changed) {
        await pollingControls.refreshPolling();
      }

    } catch (error) {
      errorControls.handleApiError(error);
      throw error;
    } finally {
      presetsControls.setLoading(false);
    }
  }, [presetsControls, errorControls, pollingControls]);

  // ==================== 历史数据 ====================

  const updateHistoryParams = useCallback((params: Partial<HistoryQueryParams>): void => {
    historyControls.updateHistoryParams(params);
  }, [historyControls]);

  // ==================== 日志管理 ====================

  const refreshLogs = useCallback(async (): Promise<void> => {
    try {
      const response = await FurnaceApi.getCommLog();
      logsControls.addCommLogs(response.logs);
    } catch (error) {
      errorControls.handleApiError(error);
    }
  }, [logsControls, errorControls]);

  // ==================== 状态管理 ====================

  const reset = useCallback((): void => {
    connectionControls.resetConnection();
    statusControls.resetStatus();
    programControls.resetProgram();
    presetsControls.resetPresets();
    historyControls.resetHistory();
    logsControls.resetLogs();
    errorControls.resetErrorHandler();
  }, [connectionControls, statusControls, programControls, presetsControls, historyControls, logsControls, errorControls]);

  const clearError = useCallback((): void => {
    connectionControls.clearError();
    errorControls.clearError();
  }, [connectionControls, errorControls]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await pollingControls.refreshPolling();
    } catch (error) {
      errorControls.handleApiError(error);
    }
  }, [pollingControls, errorControls]);

  // ==================== 初始化 ====================

  // 组件挂载时加载基础数据
  useEffect(() => {
    loadPresets();
    loadSegments();
  }, []);

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
    loadHistoryData: historyControls.loadHistoryData,
    updateHistoryParams,
    refreshLogs,
    clearLogs: logsControls.clearLogs,
    addOperationLog: logsControls.addOperationLog,
    reset,
    clearError,
    refresh,
  };

  return [mergedState, controls];
}

export default useFurnaceRefactored;