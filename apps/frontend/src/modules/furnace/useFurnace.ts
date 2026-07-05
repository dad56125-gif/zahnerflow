/**
 * Furnace 状态管理 Hook
 * 
 * 提供炉温控制器的状态管理，包括连接、控制、预设、历史数据等功能
 */

import { useState, useCallback, useEffect } from 'react';
import { runtimeClient } from '../../runtimeClient';
import type { DeviceError, LogEntry, DeviceConnectionStatus, HistoryQueryParams } from '@zahnerflow/types';
import type { CommandLogEntry, DeviceDiagnostics } from '../../components/common/DeviceDiagnosticsPanel';
import type { RuntimeDeviceStatusEnvelope } from '@zahnerflow/types';
import { useRuntimeDeviceStatusSubscription } from '../common/useRuntimeDeviceStatusSubscription';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnaceConnectRequest,
  SegmentProgress,
} from './furnaceTypes';

interface FurnaceHistoryRow {
  timestamp: string;
  pv: number;
  sv?: number;
  mv?: number;
  statusCode?: number;
  segment?: number;
  segmentTime?: number;
  segmentTimeSet?: number;
}

const toBackendHistoryParams = (params: HistoryQueryParams): Record<string, string | number | undefined> => ({
  from_ts: params.from ?? undefined,
  to: params.to ?? undefined,
  limit: params.limit ?? undefined,
  downsample: params.downsample ?? undefined,
});

const furnaceStatusText = (statusCode: unknown): string => {
  const code = Number(statusCode);
  if (code === 0) return 'running';
  if (code === 4) return 'paused';
  if (code === 12) return 'stopped';
  return 'unknown';
};

const toFurnaceStatus = (envelope: RuntimeDeviceStatusEnvelope): FurnaceStatus | null => {
  const status = envelope.payload;
  if (!status || !envelope.connected) return null;
  return {
    ts: envelope.timestamp || new Date().toISOString(),
    pv: Number(status.pv ?? 0),
    sv: Number(status.sv ?? 0),
    mv: Number(status.mv ?? 0),
    status: typeof status.status === 'string' ? status.status : furnaceStatusText(status.statusCode),
    segment: Number(status.segment ?? 0),
    segmentTime: Number(status.segmentTime ?? 0),
    segmentTimeSet: Number(status.segmentTimeSet ?? 0),
  };
};

// ==================== 分梯度降采样 ====================

/** 历史数据样本类型 */
export interface HistorySample {
  timestamp: string;
  temperature: number;
  sv?: number;
  mv?: number;
  status?: string;
  segment?: number;
  segmentTime?: number;
  segmentTimeSet?: number;
}

/** 分层历史数据结构 */
export interface TieredHistory {
  l0: HistorySample[];  // 实时层，最多 100 点 (1:1)
  l1: HistorySample[];  // 第一层，最多 400 点 (1:16)
  l2: HistorySample[];  // 第二层，最多 400 点 (1:64)
  l3: HistorySample[];  // 第三层，最多 100 点 (1:256)
  pendingL0: HistorySample[];  // L0 待降采样缓冲区
}

/** 降采样配置 */
const TIER_CONFIG = {
  L0_MAX: 100,      // L0 最大点数
  L0_KEEP: 50,      // L0 永久保留的前 N 点
  L1_MAX: 400,      // L1 最大点数
  L2_MAX: 400,      // L2 最大点数
  L3_MAX: 100,      // L3 最大点数
  L0_TO_L1: 16,     // L0 → L1 降采样比例
  L1_TO_L2: 4,      // L1 → L2 降采样比例 (16*4=64)
  L2_TO_L3: 4,      // L2 → L3 降采样比例 (64*4=256)
};

/** 创建空的分层历史 */
const createEmptyTieredHistory = (): TieredHistory => ({
  l0: [],
  l1: [],
  l2: [],
  l3: [],
  pendingL0: [],
});

/** 对数组进行 N:1 降采样（保留每 N 个的最后一个） */
const downsampleArray = (arr: HistorySample[], ratio: number): HistorySample[] => {
  if (ratio <= 1 || arr.length === 0) return arr;
  const result: HistorySample[] = [];
  for (let i = ratio - 1; i < arr.length; i += ratio) {
    result.push(arr[i]);
  }
  return result;
};

/** 添加样本到分层历史（核心降采样逻辑） */
const addSampleToTiered = (sample: HistorySample, tiered: TieredHistory): TieredHistory => {
  const result = { ...tiered };

  // 1. 新数据加入 pendingL0
  result.pendingL0 = [...result.pendingL0, sample];

  // 2. pendingL0 达到 16 点时，取 1 点加入 L0，其余加入 L1 缓冲
  if (result.pendingL0.length >= TIER_CONFIG.L0_TO_L1) {
    // 取最后一点作为代表加入 L0
    result.l0 = [...result.l0, result.pendingL0[result.pendingL0.length - 1]];
    // 降采样后加入 L1
    const downsampled = downsampleArray(result.pendingL0, TIER_CONFIG.L0_TO_L1);
    result.l1 = [...result.l1, ...downsampled];
    result.pendingL0 = [];
  }

  // 3. L0 超过上限时，将溢出部分移入 L1（但保留前 L0_KEEP 点）
  if (result.l0.length > TIER_CONFIG.L0_MAX) {
    const excess = result.l0.length - TIER_CONFIG.L0_MAX;
    // 从 L0_KEEP 位置开始移除
    const toMove = result.l0.splice(TIER_CONFIG.L0_KEEP, excess);
    const downsampled = downsampleArray(toMove, TIER_CONFIG.L0_TO_L1);
    result.l1 = [...result.l1, ...downsampled];
  }

  // 4. L1 超过上限时，降采样移入 L2
  if (result.l1.length > TIER_CONFIG.L1_MAX) {
    const excess = result.l1.length - TIER_CONFIG.L1_MAX;
    const toMove = result.l1.splice(0, excess);
    const downsampled = downsampleArray(toMove, TIER_CONFIG.L1_TO_L2);
    result.l2 = [...result.l2, ...downsampled];
  }

  // 5. L2 超过上限时，降采样移入 L3
  if (result.l2.length > TIER_CONFIG.L2_MAX) {
    const excess = result.l2.length - TIER_CONFIG.L2_MAX;
    const toMove = result.l2.splice(0, excess);
    const downsampled = downsampleArray(toMove, TIER_CONFIG.L2_TO_L3);
    result.l3 = [...result.l3, ...downsampled];
  }

  // 6. L3 超过上限时，丢弃最旧的
  if (result.l3.length > TIER_CONFIG.L3_MAX) {
    result.l3 = result.l3.slice(-TIER_CONFIG.L3_MAX);
  }

  return result;
};

/** 获取完整历史数据（合并所有层，按时间排序） */
export const getFullHistory = (tiered: TieredHistory): HistorySample[] => {
  return [...tiered.l3, ...tiered.l2, ...tiered.l1, ...tiered.l0, ...tiered.pendingL0];
};

// ==================== 状态类型 ====================

export interface FurnaceState {
  device_status: FurnaceStatus | null;
  connection_status: DeviceConnectionStatus;
  segments: ProgramSegment[];
  presets: FurnacePresetMeta[];
  tiered_history: TieredHistory;  // 分层历史数据
  history_data: HistorySample[];  // 用于显示的合并历史（从 tiered_history 计算）
  history_params: HistoryQueryParams;
  loading: boolean;
  error: DeviceError | null;
  logs: LogEntry[];
  diagnostics: DeviceDiagnostics;
  command_logs: CommandLogEntry[];
  segment_progress: SegmentProgress | null;
}

export interface FurnaceControls {
  connect: (config: FurnaceConnectRequest & { simulatorProfile?: string }) => Promise<void>;
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
  load_command_logs: () => Promise<void>;
  clear_command_logs: () => Promise<void>;
}

// ==================== 初始状态 ====================

const createInitialState = (): FurnaceState => ({
  device_status: null,
  connection_status: 'disconnected',
  segments: [],
  presets: [],
  tiered_history: createEmptyTieredHistory(),
  history_data: [],
  history_params: { limit: 1000 },
  loading: false,
  error: null,
  logs: [],
  diagnostics: { mode: 'disconnected' },
  command_logs: [],
  segment_progress: null,
});

// ==================== Hook 实现 ====================

export function useFurnace(): [FurnaceState, FurnaceControls] {
  const [state, setState] = useState<FurnaceState>(createInitialState);

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

  const load_command_logs = useCallback(async () => {
    const response = await runtimeClient.devices.furnace.commandLogs<{ logs: CommandLogEntry[] }>();
    updateState({ command_logs: response.logs || [] });
  }, [updateState]);

  const clear_command_logs = useCallback(async () => {
    await runtimeClient.devices.furnace.clearCommandLogs();
    updateState({ command_logs: [] });
  }, [updateState]);

  // 错误处理
  const handleError = useCallback(
    (error: unknown) => {
      const deviceError: DeviceError =
        error && typeof error === 'object' && 'message' in error
          ? (error as DeviceError)
          : { code: 'UNKNOWN', message: String(error), status: 0 };

      // 检测设备断开错误，自动更新连接状态
      const isDisconnected =
        deviceError.status === 503 ||
        deviceError.message?.toLowerCase().includes('disconnected') ||
        deviceError.message?.toLowerCase().includes('device disconnected');

      if (isDisconnected) {
        updateState({
          error: deviceError,
          loading: false,
          segment_progress: null,
          connection_status: 'disconnected',
          device_status: null
        });
      } else {
        updateState({ error: deviceError, loading: false, segment_progress: null });
      }

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
        await load_command_logs().catch(() => undefined);
        if (successMessage) addLog('success', successMessage);
      } catch (error) {
        handleError(error);
        await load_command_logs().catch(() => undefined);
      } finally {
        if (!skipLoading) updateState({ loading: false });
      }
    },
    [updateState, handleError, addLog, load_command_logs]
  );

  const handleRuntimeStatusUpdate = useCallback((envelope: RuntimeDeviceStatusEnvelope) => {
    setState((prev) => {
      const deviceStatus = toFurnaceStatus(envelope);
      const connectionStatus = (envelope.connectionState?.status as DeviceConnectionStatus | undefined)
        ?? (envelope.connected ? 'connected' : 'disconnected');
      const pv = envelope.payload?.pv;
      const isValidPv = typeof pv === 'number' && Number.isFinite(pv) && pv > 0;
      const diagnostics = {
        ...(envelope.diagnostics || {}),
        mode: envelope.mode,
        profile: envelope.profile ?? envelope.connectionState?.profile,
      } as DeviceDiagnostics;

      if (!isValidPv) {
        return {
          ...prev,
          device_status: deviceStatus,
          connection_status: connectionStatus,
          diagnostics,
        };
      }

      const newSample: HistorySample = {
        timestamp: envelope.timestamp || new Date().toISOString(),
        temperature: pv,
        sv: Number(envelope.payload?.sv ?? 0),
        mv: Number(envelope.payload?.mv ?? 0),
        status: typeof envelope.payload?.status === 'string'
          ? envelope.payload.status
          : furnaceStatusText(envelope.payload?.statusCode),
        segment: Number(envelope.payload?.segment ?? 0),
        segmentTime: Number(envelope.payload?.segmentTime ?? 0),
        segmentTimeSet: Number(envelope.payload?.segmentTimeSet ?? 0),
      };

      const newTieredHistory = addSampleToTiered(newSample, prev.tiered_history);
      const newHistoryData = getFullHistory(newTieredHistory);

      return {
        ...prev,
        device_status: deviceStatus,
        connection_status: connectionStatus,
        diagnostics,
        tiered_history: newTieredHistory,
        history_data: newHistoryData,
      };
    });
  }, []);

  const ensureRuntimeStatusSubscription = useRuntimeDeviceStatusSubscription('furnace', handleRuntimeStatusUpdate);

  // ==================== 程序段操作 ====================

  const get_segments = useCallback(async () => {
    await execute(async () => {
      const { segments } = await runtimeClient.devices.furnace.getProgramSegments<{ segments: ProgramSegment[] }>();
      updateState({ segments });
    }, 'Read 27 segments');
  }, [execute, updateState]);

  const set_segments = useCallback(
    async (segments: ProgramSegment[]) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.setProgramSegments(segments);
        updateState({ segments });
      }, `Wrote ${segments.length} segments`);
    },
    [execute, updateState]
  );

  // ==================== 连接控制 ====================

  const connect = useCallback(
    async (config: FurnaceConnectRequest) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.connect(config);
        updateState({ connection_status: 'connected' });
        ensureRuntimeStatusSubscription();
      }, `Connected to ${config.port}`);
    },
    [execute, updateState, ensureRuntimeStatusSubscription]
  );

  const disconnect = useCallback(async () => {
    await execute(async () => {
      await runtimeClient.devices.furnace.disconnectDevice();
      updateState({ connection_status: 'disconnected', device_status: null });
    }, 'Disconnected');
  }, [execute, updateState]);

  // ==================== 设备控制 ====================

  const set_segment = useCallback(
    async (segment: number) => {
      await execute(() => runtimeClient.devices.furnace.setSegment(segment), `Segment ${segment}`);
    },
    [execute]
  );

  const run = useCallback(async () => execute(() => runtimeClient.devices.furnace.run(), 'Run'), [execute]);
  const pause = useCallback(async () => execute(() => runtimeClient.devices.furnace.pause(), 'Pause'), [execute]);
  const stop = useCallback(async () => execute(() => runtimeClient.devices.furnace.stop(), 'Stop'), [execute]);

  // ==================== 预设管理 ====================

  const load_presets = useCallback(async () => {
    await execute(async () => {
      updateState({ presets: await runtimeClient.devices.furnace.presets.list<FurnacePresetMeta[]>() });
    });
  }, [execute, updateState]);

  const create_preset = useCallback(
    async (preset: { name: string; segments: ProgramSegment[]; summary?: string }) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.presets.create(preset);
        updateState({ presets: await runtimeClient.devices.furnace.presets.list<FurnacePresetMeta[]>() });
      });
    },
    [execute, updateState]
  );

  const update_preset = useCallback(
    async (name: string, segments: ProgramSegment[]) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.presets.update(name, segments);
        updateState({ presets: await runtimeClient.devices.furnace.presets.list<FurnacePresetMeta[]>() });
      });
    },
    [execute, updateState]
  );

  const delete_preset = useCallback(
    async (name: string) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.presets.delete(name);
        updateState({ presets: await runtimeClient.devices.furnace.presets.list<FurnacePresetMeta[]>() });
      });
    },
    [execute, updateState]
  );

  const clone_preset = useCallback(
    async (name: string, new_name: string) => {
      await execute(async () => {
        await runtimeClient.devices.furnace.presets.clone(name, new_name);
        updateState({ presets: await runtimeClient.devices.furnace.presets.list<FurnacePresetMeta[]>() });
      });
    },
    [execute, updateState]
  );

  const apply_preset = useCallback(
    async (name: string) => {
      await execute(() => runtimeClient.devices.furnace.presets.apply(name), `Applied ${name}`);
    },
    [execute]
  );

  // ==================== 历史数据 ====================

  const load_history_data = useCallback(
    async (params?: HistoryQueryParams) => {
      await execute(async () => {
        const p = params || state.history_params;
        const rows = await runtimeClient.devices.furnace.temperatureLogs<FurnaceHistoryRow[]>(toBackendHistoryParams(p));
        updateState({
          history_data: rows.map((row) => ({
            timestamp: row.timestamp,
            temperature: row.pv,
            sv: row.sv,
            mv: row.mv,
            segment: row.segment,
            segmentTime: row.segmentTime,
            segmentTimeSet: row.segmentTimeSet,
          })),
        });
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
    runtimeClient.devices.furnace.presets
      .list<FurnacePresetMeta[]>()
      .then((presets) => updateState({ presets }))
      .catch(() => undefined);
  }, [updateState]);

  useEffect(() => {
    ensureRuntimeStatusSubscription();
    runtimeClient.devices.furnace
      .runtimeStatus()
      .then(handleRuntimeStatusUpdate)
      .catch(() => undefined);
    load_command_logs().catch(() => undefined);
  }, [ensureRuntimeStatusSubscription, handleRuntimeStatusUpdate, load_command_logs]);

  useEffect(() => {
    if (state.connection_status === 'connected') {
      get_segments();
    }
  }, [state.connection_status, get_segments]);

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
    load_command_logs,
    clear_command_logs,
  };

  return [state, controls];
}

export default useFurnace;
