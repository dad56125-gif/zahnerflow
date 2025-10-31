/**
 * Furnace 状态管理 Hook - 简化版本
 *
 * 基于职责分离原则：前端只负责显示状态和发送操作
 * 信任后端数据，移除不必要的验证逻辑
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FurnaceApi } from '../api/index';
import { furnaceWebSocketService } from '../furnace-websocket.service';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  CreatePresetRequest,
  FurnaceConnectRequest,
  HistoryQueryParams,
  DeviceError,
  DeviceOperationStatus,
  FurnaceOperationResponse,
  SegmentProgress,
} from '../../types/devices';

/**
 * 简化的状态接口 - 只保留核心显示状态
 */
export interface FurnaceState {
  // 核心设备状态
  device_status: FurnaceStatus | null;
  connection_status: 'connected' | 'disconnected';
  operation_status: DeviceOperationStatus;

  // 数据状态
  segments: ProgramSegment[];
  presets: FurnacePresetMeta[];
  selected_preset: FurnacePreset | null;
  history_data: Array<{
    timestamp: string;
    temperature: number;
    sv: number;
    mv: number;
  }>;
  history_params: HistoryQueryParams;

  // UI状态 - 大幅简化
  loading: boolean;
  error: string | null; // 简化为字符串，移除复杂的DeviceError
  segment_progress: SegmentProgress | null; // 程序段操作进度
  logs: Array<{
    id: string;
    timestamp: string;
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
  }>;
}

/**
 * 简化的控制方法接口
 */
export interface FurnaceControls {
  // 设备连接管理
  connect: (config: FurnaceConnectRequest) => Promise<void>;
  disconnect: () => Promise<void>;

  // 基本设备控制
  set_segment: (segment: number) => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;

  // 数据管理
  load_segments: () => Promise<void>;
  write_segments: (segments: ProgramSegment[]) => Promise<void>;

  // 预设管理
  load_presets: () => Promise<void>;
  select_preset: (name: string) => Promise<void>;
  create_preset: (preset: CreatePresetRequest) => Promise<void>;
  update_preset: (name: string, segments: ProgramSegment[]) => Promise<void>;
  delete_preset: (name: string) => Promise<void>;
  clone_preset: (name: string, new_name: string) => Promise<void>;
  apply_preset: (name: string) => Promise<void>;

  // 数据管理
  load_history_data: (params?: HistoryQueryParams) => Promise<void>;
  update_history_params: (params: Partial<HistoryQueryParams>) => void;
  refresh_logs: () => Promise<void>;
  clear_logs: () => void;
  add_log: (level: 'success' | 'info' | 'warning' | 'error', message: string) => void;

  // 状态管理
  reset: () => void;
  clear_error: () => void;
}

/**
 * 简化的Furnace Hook
 */
export function useFurnace(): [FurnaceState, FurnaceControls] {
  // 初始状态 - 简化版本
  const initial_state: FurnaceState = {
    device_status: null,
    connection_status: 'disconnected',
    operation_status: 'idle',
    segments: [],
    presets: [],
    selected_preset: null,
    history_data: [],
    history_params: FurnaceApi.getDefaultHistoryParams(),
    logs: [],
    loading: false,
    error: null,
    segment_progress: null,
  };

  const [state, set_state] = useState<FurnaceState>(initial_state);

  // WebSocket状态管理 - 简化
  const web_socket_connected = useRef(false);

  // 简化的状态更新
  const update_state = useCallback((updates: Partial<FurnaceState>): void => {
    set_state(prev => ({ ...prev, ...updates }));
  }, []);

  // 简化的加载状态管理
  const set_loading = useCallback((loading: boolean): void => {
    update_state({ loading });
  }, [update_state]);

  // 简化的错误处理 - 移除复杂的DeviceError转换
  const handle_error = useCallback((error: any): void => {
    const error_message = error?.message || error?.error || '操作失败';
    update_state({
      error: error_message,
      loading: false,
      connection_status: 'disconnected',
    });
  }, [update_state]);

  // 清除错误
  const clear_error = useCallback((): void => {
    update_state({ error: null });
  }, [update_state]);

  // 简化的日志管理
  const add_log = useCallback((
    level: 'success' | 'info' | 'warning' | 'error',
    message: string
  ): void => {
    const log_entry = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type: level,
      message,
    };

    set_state(prev => ({
      ...prev,
      logs: [...prev.logs, log_entry].slice(-100), // 减少日志数量限制
    }));
  }, []);

  // 简化的WebSocket事件处理 - 移除复杂的验证逻辑
  const web_socket_handlers = useMemo(() => ({
    on_status_update: (data: any): void => {
      // 直接信任后端数据，不进行验证
      update_state({
        device_status: data.status,
        connection_status: data.connection_state?.status || 'connected',
        operation_status: data.operation_state || 'idle',
      });
    },

    on_sampling_data: (data: any): void => {
      const sample = {
        timestamp: data.timestamp,
        temperature: data.temperature,
        sv: data.sv || 0,
        mv: data.mv || 0,
      };

      set_state(prev => ({
        ...prev,
        history_data: [...prev.history_data, sample].slice(-500), // 减少历史数据限制
      }));
    },

    on_notification: (data: any): void => {
      add_log(data.type || 'info', `[${data.title || '通知'}] ${data.message || ''}`);
    },

    on_error: handle_error,
  }), [update_state, handle_error, add_log]);

  // 简化的WebSocket连接管理
  const ensure_web_socket = useCallback((): void => {
    if (!web_socket_connected.current) {
      furnaceWebSocketService.connect();
      web_socket_connected.current = true;

      // 注册事件处理器
      furnaceWebSocketService.onStatusUpdate(web_socket_handlers.on_status_update);
      furnaceWebSocketService.onSamplingData(web_socket_handlers.on_sampling_data);
      furnaceWebSocketService.onNotification(web_socket_handlers.on_notification);
      furnaceWebSocketService.onError(web_socket_handlers.on_error);
      furnaceWebSocketService.onConnected(() => {
        furnaceWebSocketService.subscribeToFurnace();
      });
    }
  }, [web_socket_handlers]);

  // 简化的设备操作处理 - 移除复杂的响应验证
  const execute_device_operation = useCallback(async (
    operation: () => Promise<FurnaceOperationResponse | void>,
    success_message?: string
  ): Promise<void> => {
    if (state.connection_status !== 'connected') {
      handle_error({ message: '设备未连接，无法执行操作' });
      throw new Error('设备未连接');
    }

    try {
      set_loading(true);
      clear_error();

      await operation();

      // 不再直接更新状态，完全依赖WebSocket网关获取设备状态
      // 这样确保前端显示状态与实际设备状态的一致性

      if (success_message) {
        add_log('success', success_message);
      }
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [state.connection_status, set_loading, clear_error, update_state, add_log, handle_error]);

  // ==================== 控制方法实现 ====================

  // 设备连接
  const connect = useCallback(async (config: FurnaceConnectRequest): Promise<void> => {
    try {
      set_loading(true);
      clear_error();

      await FurnaceApi.connect(config);
      update_state({ connection_status: 'connected' });
      add_log('success', `设备已连接到 ${config.port}`);
      ensure_web_socket();

    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, update_state, add_log, ensure_web_socket, handle_error]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      set_loading(true);
      clear_error();

      await FurnaceApi.disconnect();

      // 清理WebSocket连接
      if (web_socket_connected.current) {
        furnaceWebSocketService.unsubscribeFromFurnace();
        furnaceWebSocketService.disconnect();
        web_socket_connected.current = false;
      }

      update_state({
        connection_status: 'disconnected',
        operation_status: 'stopped',
        device_status: null,
      });

    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, update_state, handle_error]);

  // 基本控制方法 - 简化
  const set_segment = useCallback((segment: number): Promise<void> => {
    return execute_device_operation(
      async () => await FurnaceApi.setSegment(segment),
      `切换到程序段 ${segment}`
    );
  }, [execute_device_operation]);

  const run = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => await FurnaceApi.run(),
      '程序已开始运行'
    );
  }, [execute_device_operation]);

  const pause = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => await FurnaceApi.pause(),
      '程序已暂停'
    );
  }, [execute_device_operation]);

  const stop = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => await FurnaceApi.stop(),
      '程序已停止'
    );
  }, [execute_device_operation]);

  // 程序段操作 - 简化
  const load_segments = useCallback(async (): Promise<void> => {
    if (state.connection_status !== 'connected') return;

    try {
      clear_error();
      set_loading(true);

      // 开始5秒模拟进度
      update_state({
        segment_progress: {
          active: true,
          type: 'read',
          progress: 0
        }
      });

      // 模拟5秒进度
      const duration = 5000; // 5秒
      const steps = 50; // 50步，每步100ms
      const stepDuration = duration / steps;

      for (let i = 0; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
        update_state({
          segment_progress: {
            active: true,
            type: 'read',
            progress: (i / steps) * 100
          }
        });
      }

      const segments = await FurnaceApi.getProgramSegments();
      update_state({
        segments,
        segment_progress: null
      });
      add_log('success', `已读取程序段数据，共${segments.length}个段`);

    } catch (error) {
      update_state({ segment_progress: null });
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [state.connection_status, clear_error, set_loading, update_state, add_log, handle_error]);

  const write_segments = useCallback(async (segments: ProgramSegment[]): Promise<void> => {
    if (state.connection_status !== 'connected') {
      handle_error({ message: '设备未连接，无法写入程序段' });
      throw new Error('设备未连接');
    }

    try {
      set_loading(true);
      clear_error();

      // 开始5秒模拟进度
      update_state({
        segment_progress: {
          active: true,
          type: 'write',
          progress: 0
        }
      });

      // 模拟8秒进度
      const duration = 8000; // 8秒
      const steps = 50; // 50步，每步160ms
      const stepDuration = duration / steps;

      for (let i = 0; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, stepDuration));
        update_state({
          segment_progress: {
            active: true,
            type: 'write',
            progress: (i / steps) * 100
          }
        });
      }

      await FurnaceApi.writeProgramSegments(segments);
      update_state({
        segments,
        segment_progress: null
      });
      add_log('success', `已写入 ${segments.length} 个程序段`);

    } catch (error) {
      update_state({ segment_progress: null });
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [state.connection_status, set_loading, clear_error, update_state, add_log, handle_error]);

  // 预设管理 - 保持现有逻辑，但简化错误处理
  const load_presets = useCallback(async (): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      const presets = await FurnaceApi.getPresets();
      update_state({ presets });
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, update_state, handle_error]);

  const select_preset = useCallback(async (name: string): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      const preset = await FurnaceApi.getPreset(name);
      update_state({ selected_preset: preset });
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, update_state, handle_error]);

  const create_preset = useCallback(async (preset: CreatePresetRequest): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      await FurnaceApi.createPreset(preset);
      await load_presets();
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, load_presets, handle_error]);

  const update_preset = useCallback(async (name: string, segments: ProgramSegment[]): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      await FurnaceApi.updatePreset(name, segments);
      await load_presets();

      if (state.selected_preset?.name === name) {
        await select_preset(name);
      }
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, load_presets, select_preset, state.selected_preset, handle_error]);

  const delete_preset = useCallback(async (name: string): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      await FurnaceApi.deletePreset(name);
      await load_presets();

      if (state.selected_preset?.name === name) {
        update_state({ selected_preset: null });
      }
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, load_presets, state.selected_preset, update_state, handle_error]);

  const clone_preset = useCallback(async (name: string, new_name: string): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      await FurnaceApi.clonePreset(name, new_name);
      await load_presets();
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, load_presets, handle_error]);

  const apply_preset = useCallback(async (name: string): Promise<void> => {
    try {
      set_loading(true);
      clear_error();

      const result = await FurnaceApi.applyPreset(name);

      if (result.changed) {
        add_log('success', `预设 "${name}" 应用成功`);
      } else {
        add_log('info', `预设 "${name}" 无需更改`);
      }

    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, add_log, handle_error]);

  // 数据管理 - 简化
  const load_history_data = useCallback(async (params?: HistoryQueryParams): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      const final_params = params || state.history_params;
      const raw_history_data = await FurnaceApi.getTemperatureHistory(final_params);

      // 简化数据转换
      const history_data = raw_history_data.map(sample => ({
        timestamp: sample.timestamp,
        temperature: sample.temperature,
        sv: sample.sv || 0,
        mv: sample.mv || 0,
      }));

      update_state({ history_data, history_params: final_params });
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, state.history_params, update_state, handle_error]);

  const update_history_params = useCallback((params: Partial<HistoryQueryParams>): void => {
    set_state(prev => ({
      ...prev,
      history_params: { ...prev.history_params, ...params },
    }));
  }, []);

  const refresh_logs = useCallback(async (): Promise<void> => {
    try {
      const response = await FurnaceApi.getCommLog();
      const comm_logs = response.logs.map(log => ({
        id: `comm_${log.timestamp}_${Math.random()}`,
        timestamp: log.timestamp,
        type: log.direction === 'tx' ? ('error' as const) : ('info' as const), // 简化日志类型
        message: `${log.direction.toUpperCase()}: ${log.data}`,
      }));

      set_state(prev => {
        const non_comm_logs = prev.logs.filter(log => log.type !== 'error');
        return {
          ...prev,
          logs: [...non_comm_logs, ...comm_logs].slice(-200),
        };
      });
    } catch (error) {
      handle_error(error);
    }
  }, [handle_error]);

  const clear_logs = useCallback((): void => {
    set_state(prev => ({ ...prev, logs: [] }));
  }, []);

  // 状态管理
  const reset = useCallback((): void => {
    set_state(initial_state);
  }, []);

  // 控制方法集合
  const controls: FurnaceControls = {
    connect,
    disconnect,
    set_segment,
    run,
    pause,
    stop,
    load_segments,
    write_segments,
    load_presets,
    select_preset,
    create_preset,
    update_preset,
    delete_preset,
    clone_preset,
    apply_preset,
    load_history_data,
    update_history_params,
    refresh_logs,
    clear_logs,
    add_log,
    reset,
    clear_error,
  };

  // ==================== 初始化和清理 ====================

  // 组件挂载时加载预设数据
  useEffect(() => {
    load_presets();
  }, []);

  // 设备连接时自动加载程序段
  useEffect(() => {
    if (state.connection_status === 'connected') {
      load_segments();
    }
  }, [state.connection_status]);

  // 清理WebSocket连接
  useEffect(() => {
    return () => {
      if (web_socket_connected.current) {
        furnaceWebSocketService.disconnect();
        web_socket_connected.current = false;
      }
    };
  }, []);

  return [state, controls];
}

export default useFurnace;