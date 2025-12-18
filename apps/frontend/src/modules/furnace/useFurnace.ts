/**
 * Furnace 状态管理 Hook
 * 
 * 提供炉温控制器的状态管理，包括连接、控制、预设、历史数据等功能
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { FurnaceApi } from './furnaceApi';
import { furnaceWebSocketService, FurnaceStatusUpdate } from './furnaceWebSocket.service';
import type { DeviceError, LogEntry, DeviceConnectionStatus, HistoryQueryParams } from '../common/types';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnaceConnectRequest,
  SegmentProgress,
} from './furnaceTypes';

// ==================== 状态类型 ====================

export interface FurnaceState {
  device_status: FurnaceStatus | null;
  connection_status: DeviceConnectionStatus;
  segments: ProgramSegment[];
  presets: FurnacePresetMeta[];
  history_data: Array<{
    timestamp: string;
    temperature: number;
    sv?: number;
    mv?: number;
    status?: string;
    segment?: number;
    segment_time?: number;
    segment_time_set?: number;
  }>;
  history_params: HistoryQueryParams;
  loading: boolean;
  error: DeviceError | null;
  logs: LogEntry[];
  segment_progress: SegmentProgress | null;
}

export interface FurnaceControls {
  connect: (config: FurnaceConnectRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  set_segment: (segment: number) => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  get_segments: () => Promise<void>;
  set_segments: (segments: ProgramSegment[]) => Promise<void>;
  load_presets: () => Promise<void>;
  create_preset: (preset: { name: string; segments: ProgramSegment[]; summary?: string }) => Promise<void>;
  update_preset: (name: string, segments: ProgramSegment[]) => Promise<void>;
  delete_preset: (name: string) => Promise<void>;
  clone_preset: (name: string, new_name: string) => Promise<void>;
  apply_preset: (name: string) => Promise<void>;
  load_history_data: (params?: HistoryQueryParams) => Promise<void>;
  update_history_params: (params: Partial<HistoryQueryParams>) => void;
  reset: () => void;
  clear_error: () => void;
  add_log: (type: LogEntry['type'], message: string) => void;
  clear_logs: () => void;
}

// ==================== 初始状态 ====================

const createInitialState = (): FurnaceState => ({
  device_status: null,
  connection_status: 'disconnected',
  segments: [],
  presets: [],
  history_data: [],
  history_params: { limit: 1000 },
  loading: false,
  error: null,
  logs: [],
  segment_progress: null,
});

// ==================== Hook 实现 ====================

export function useFurnace(): [FurnaceState, FurnaceControls] {
  const [state, setState] = useState<FurnaceState>(createInitialState);
  const wsConnected = useRef(false);

  // 状态更新辅助函数
  const updateState = useCallback((updates: Partial<FurnaceState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // 添加日志
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
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
      ].slice(0, 100),
    }));
  }, []);

  // 错误处理
  const handleError = useCallback(
    (error: unknown) => {
      const deviceError: DeviceError =
        error && typeof error === 'object' && 'message' in error
          ? (error as DeviceError)
          : { code: 'UNKNOWN', message: String(error), status: 0 };

      updateState({ error: deviceError, loading: false, segment_progress: null });
      addLog('error', deviceError.message);
    },
    [updateState, addLog]
  );

  // 执行异步操作
  const execute = useCallback(
    async <T>(fn: () => Promise<T>, successMessage?: string, skipLoading = false): Promise<void> => {
      try {
        if (!skipLoading) updateState({ loading: true, error: null });
        await fn();
        if (successMessage) addLog('success', successMessage);
      } catch (error) {
        handleError(error);
      } finally {
        if (!skipLoading) updateState({ loading: false });
      }
    },
    [updateState, handleError, addLog]
  );

  // WebSocket 连接管理
  const ensureWebSocket = useCallback(() => {
    if (wsConnected.current) return;

    wsConnected.current = true;
    furnaceWebSocketService.connect();

    furnaceWebSocketService.onStatusUpdate((update: FurnaceStatusUpdate) => {
      // 更新设备状态
      setState((prev) => {
        // 同时将温度数据追加到 history_data（用于实时数据记录）
        const newHistoryEntry = {
          timestamp: update.timestamp || new Date().toISOString(),
          temperature: update.status?.pv ?? 0,
          sv: update.status?.sv,
          mv: update.status?.mv,
          status: update.status?.status,
          segment: update.status?.segment,
          segment_time: update.status?.segment_time,
          segment_time_set: update.status?.segment_time_set,
        };

        return {
          ...prev,
          device_status: update.status,
          connection_status: update.connection_state?.status ?? prev.connection_status,
          history_data: [...prev.history_data, newHistoryEntry].slice(-500),
        };
      });
    });

    // 保留 onSamplingData 监听（如果后端将来发送单独的采样事件）
    furnaceWebSocketService.onSamplingData((data) => {
      setState((prev) => ({
        ...prev,
        history_data: [
          ...prev.history_data,
          { timestamp: data.timestamp, temperature: data.temperature, sv: data.sv, mv: data.mv },
        ].slice(-500),
      }));
    });

    furnaceWebSocketService.onConnected(() => {
      furnaceWebSocketService.subscribe();
    });

    furnaceWebSocketService.onReadProgress((data) => {
      updateState({
        segment_progress: {
          active: true,
          type: 'read',
          progress: data.progress,
          message: data.message || `读取中... ${data.progress}%`,
        },
      });
    });

    furnaceWebSocketService.onWriteProgress((data) => {
      updateState({
        segment_progress: {
          active: true,
          type: 'write',
          progress: data.progress,
          message: data.message || `写入中... ${data.progress}%`,
        },
      });
    });
  }, [updateState]);

  // ==================== 程序段操作 ====================

  const get_segments = useCallback(async () => {
    await execute(async () => {
      const segments = await FurnaceApi.getSegments();
      updateState({ segments });
    }, 'Read 27 segments');
  }, [execute, updateState]);

  const set_segments = useCallback(
    async (segments: ProgramSegment[]) => {
      await execute(async () => {
        await FurnaceApi.setSegments(segments);
        updateState({ segments });
      }, `Wrote ${segments.length} segments`);
    },
    [execute, updateState]
  );

  // ==================== 连接控制 ====================

  const connect = useCallback(
    async (config: FurnaceConnectRequest) => {
      await execute(async () => {
        await FurnaceApi.connect(config);
        updateState({ connection_status: 'connected' });
        ensureWebSocket();
      }, `Connected to ${config.port}`);
    },
    [execute, updateState, ensureWebSocket]
  );

  const disconnect = useCallback(async () => {
    await execute(async () => {
      await FurnaceApi.disconnect();
      updateState({ connection_status: 'disconnected', device_status: null });
    }, 'Disconnected');
  }, [execute, updateState]);

  // ==================== 设备控制 ====================

  const set_segment = useCallback(
    async (segment: number) => {
      await execute(() => FurnaceApi.setSegment(segment), `Segment ${segment}`);
    },
    [execute]
  );

  const run = useCallback(async () => execute(() => FurnaceApi.run(), 'Run'), [execute]);
  const pause = useCallback(async () => execute(() => FurnaceApi.pause(), 'Pause'), [execute]);
  const stop = useCallback(async () => execute(() => FurnaceApi.stop(), 'Stop'), [execute]);

  // ==================== 预设管理 ====================

  const load_presets = useCallback(async () => {
    await execute(async () => {
      updateState({ presets: await FurnaceApi.getPresets() });
    });
  }, [execute, updateState]);

  const create_preset = useCallback(
    async (preset: { name: string; segments: ProgramSegment[]; summary?: string }) => {
      await execute(async () => {
        await FurnaceApi.createPreset(preset);
        updateState({ presets: await FurnaceApi.getPresets() });
      });
    },
    [execute, updateState]
  );

  const update_preset = useCallback(
    async (name: string, segments: ProgramSegment[]) => {
      await execute(async () => {
        await FurnaceApi.updatePreset(name, segments);
        updateState({ presets: await FurnaceApi.getPresets() });
      });
    },
    [execute, updateState]
  );

  const delete_preset = useCallback(
    async (name: string) => {
      await execute(async () => {
        await FurnaceApi.deletePreset(name);
        updateState({ presets: await FurnaceApi.getPresets() });
      });
    },
    [execute, updateState]
  );

  const clone_preset = useCallback(
    async (name: string, new_name: string) => {
      await execute(async () => {
        await FurnaceApi.clonePreset(name, new_name);
        updateState({ presets: await FurnaceApi.getPresets() });
      });
    },
    [execute, updateState]
  );

  const apply_preset = useCallback(
    async (name: string) => {
      await execute(() => FurnaceApi.applyPreset(name), `Applied ${name}`);
    },
    [execute]
  );

  // ==================== 历史数据 ====================

  const load_history_data = useCallback(
    async (params?: HistoryQueryParams) => {
      await execute(async () => {
        const p = params || state.history_params;
        updateState({ history_data: await FurnaceApi.getTemperatureHistory(p) });
      });
    },
    [execute, updateState, state.history_params]
  );

  const update_history_params = useCallback(
    (params: Partial<HistoryQueryParams>) => {
      updateState({ history_params: { ...state.history_params, ...params } });
    },
    [updateState, state.history_params]
  );

  // ==================== 工具方法 ====================

  const reset = useCallback(() => setState(createInitialState()), []);
  const clear_error = useCallback(() => updateState({ error: null }), [updateState]);
  const clear_logs = useCallback(() => updateState({ logs: [] }), [updateState]);

  // ==================== Effects ====================

  useEffect(() => {
    load_presets();
  }, [load_presets]);

  useEffect(() => {
    if (state.connection_status === 'connected') {
      get_segments();
    }
  }, [state.connection_status, get_segments]);

  useEffect(() => {
    return () => {
      if (wsConnected.current) {
        furnaceWebSocketService.disconnect();
      }
    };
  }, []);

  // ==================== 导出 ====================

  const controls: FurnaceControls = {
    connect,
    disconnect,
    set_segment,
    run,
    pause,
    stop,
    get_segments,
    set_segments,
    load_presets,
    create_preset,
    update_preset,
    delete_preset,
    clone_preset,
    apply_preset,
    load_history_data,
    update_history_params,
    reset,
    clear_error,
    add_log: addLog,
    clear_logs,
  };

  return [state, controls];
}

export default useFurnace;