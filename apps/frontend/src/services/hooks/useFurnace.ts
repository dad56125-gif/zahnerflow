/**
 * Furnace 状态管理 Hook - 最终优化版本
 *
 * 完全基于WebSocket实时更新，最小化状态管理，严格遵循snake_case参数命名规范
 * 高性能、低复杂性、类型安全
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FurnaceApi } from '../api';
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
  LogEntry,
} from '../../types/devices';

/**
 * 完全优化的状态接口 - 严格snake_case命名
 */
export interface FurnaceState {
  // 核心设备状态 - 最小化状态变量
  device_status: FurnaceStatus | null;
  connection_status: 'connected' | 'disconnected';
  operation_status: DeviceOperationStatus;

  // 核心数据
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
  logs: LogEntry[];

  // UI状态
  loading: boolean;
  error: DeviceError | null;

  // 操作进度 - 简化进度管理
  operation_progress: {
    active: boolean;
    type: 'reading' | 'writing' | null;
    progress: number;
  };
}

/**
 * 优化后的控制方法接口 - 严格snake_case命名
 */
export interface FurnaceControls {
  // 设备连接管理
  connect: (config: FurnaceConnectRequest) => Promise<void>;
  disconnect: () => Promise<void>;

  // 基本设备控制
  set_temperature: (sv: number) => Promise<void>;
  set_segment: (segment: number) => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;

  // 程序段操作
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
 * 状态更新的类型定义
 */
type StateUpdate = Partial<FurnaceState>;

/**
 * 最终优化的Furnace Hook
 */
export function useFurnace(): [FurnaceState, FurnaceControls] {
  // 初始状态 - 严格snake_case命名
  const initial_state: FurnaceState = {
    device_status: null,
    connection_status: 'disconnected',
    operation_status: 'unknown',
    segments: [],
    presets: [],
    selected_preset: null,
    history_data: [],
    history_params: FurnaceApi.getDefaultHistoryParams(),
    logs: [],
    loading: false,
    error: null,
    operation_progress: {
      active: false,
      type: null,
      progress: 0,
    },
  };

  // 单一状态对象 - 最小化重渲染
  const [state, set_state] = useState<FurnaceState>(initial_state);

  // WebSocket状态引用 - 避免不必要的重连接
  const web_socket_status = useRef({
    connected: false,
    subscribed: false,
  });

  // 批量状态更新 - 减少重渲染次数
  const update_state = useCallback((updates: StateUpdate): void => {
    set_state(prev => ({ ...prev, ...updates }));
  }, []);

  // 加载状态管理
  const set_loading = useCallback((loading: boolean): void => {
    update_state({ loading });
  }, [update_state]);

  // 错误处理
  const handle_error = useCallback((error: any): void => {
    const device_error: DeviceError = error as DeviceError;
    update_state({
      error: device_error,
      loading: false,
      connection_status: 'disconnected',
    });
  }, [update_state]);

  // 清除错误
  const clear_error = useCallback((): void => {
    update_state({ error: null });
  }, [update_state]);

  // 进度管理 - 简化进度状态
  const set_progress = useCallback((type: 'reading' | 'writing' | null, progress: number): void => {
    update_state({
      operation_progress: {
        active: type !== null,
        type,
        progress,
      },
    });
  }, [update_state]);

  // 日志管理 - 限制日志数量
  const add_log = useCallback((
    level: 'success' | 'info' | 'warning' | 'error',
    message: string
  ): void => {
    const log_entry: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'operation',
      data: {
        timestamp: new Date().toISOString(),
        level,
        message,
      },
    };

    update_state(prev => ({
      ...prev,
      logs: [...prev.logs, log_entry].slice(-200), // 限制日志数量
    }));
  }, [update_state]);

  // WebSocket事件处理器 - 使用useMemo缓存
  const web_socket_handlers = useMemo(() => ({
    on_status_update: (data: any): void => {
      update_state({
        device_status: data.status,
        connection_status: data.connection_state.status,
        operation_status: data.operation_state,
      });
    },

    on_sampling_data: (data: any): void => {
      const sample = {
        timestamp: data.timestamp,
        temperature: data.temperature,
        sv: data.sv,
        mv: data.mv,
      };

      update_state(prev => ({
        ...prev,
        history_data: [...prev.history_data, sample].slice(-1000), // 限制历史数据
      }));
    },

    on_notification: (data: any): void => {
      add_log(data.type, `[${data.title}] ${data.message}`);
    },

    on_error: handle_error,
  }), [update_state, add_log, handle_error]);

  // WebSocket连接管理
  const ensure_web_socket = useCallback((): void => {
    if (!web_socket_status.current.connected) {
      furnaceWebSocketService.connect();
      web_socket_status.current.connected = true;

      // 注册事件处理器
      furnaceWebSocketService.onStatusUpdate(web_socket_handlers.on_status_update);
      furnaceWebSocketService.onSamplingData(web_socket_handlers.on_sampling_data);
      furnaceWebSocketService.onNotification(web_socket_handlers.on_notification);
      furnaceWebSocketService.onError(web_socket_handlers.on_error);
      furnaceWebSocketService.onConnected(() => {
        furnaceWebSocketService.subscribeToFurnace();
        web_socket_status.current.subscribed = true;
      });
      furnaceWebSocketService.onDisconnected(() => {
        web_socket_status.current.subscribed = false;
      });
    } else if (!web_socket_status.current.subscribed) {
      furnaceWebSocketService.subscribeToFurnace();
      web_socket_status.current.subscribed = true;
    }
  }, [web_socket_handlers]);

  // 统一设备操作处理 - 减少重复代码
  const execute_device_operation = useCallback(async (
    operation: () => Promise<void>,
    success_message?: string
  ): Promise<void> => {
    if (state.connection_status !== 'connected') {
      const error: DeviceError = {
        code: 'DEVICE_NOT_CONNECTED',
        message: '设备未连接，无法执行操作',
        status: 400,
      };
      handle_error(error);
      throw error;
    }

    try {
      set_loading(true);
      clear_error();
      await operation();
      if (success_message) {
        add_log('info', success_message);
      }
    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [state.connection_status, set_loading, clear_error, add_log, handle_error]);

  // ==================== 控制方法实现 ====================

  // 设备连接
  const connect = useCallback(async (config: FurnaceConnectRequest): Promise<void> => {
    try {
      set_loading(true);
      clear_error();

      await FurnaceApi.connect(config);
      update_state({
        connection_status: 'connected',
      });

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
      if (web_socket_status.current.subscribed) {
        furnaceWebSocketService.unsubscribeFromFurnace();
        web_socket_status.current.subscribed = false;
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

  // 基本控制方法
  const set_temperature = useCallback((sv: number): Promise<void> => {
    return execute_device_operation(
      () => FurnaceApi.setTemperature(sv),
      `温度设置为 ${sv}°C`
    );
  }, [execute_device_operation]);

  const set_segment = useCallback((segment: number): Promise<void> => {
    return execute_device_operation(
      () => FurnaceApi.setSegment(segment)
    );
  }, [execute_device_operation]);

  const run = useCallback((): Promise<void> => {
    return execute_device_operation(
      () => FurnaceApi.run(),
      '程序已开始运行'
    );
  }, [execute_device_operation]);

  const pause = useCallback((): Promise<void> => {
    return execute_device_operation(
      () => FurnaceApi.pause(),
      '程序已暂停'
    );
  }, [execute_device_operation]);

  const stop = useCallback((): Promise<void> => {
    return execute_device_operation(
      () => FurnaceApi.stop(),
      '程序已停止'
    );
  }, [execute_device_operation]);

  // 程序段操作
  const load_segments = useCallback(async (): Promise<void> => {
    if (state.connection_status !== 'connected') {
      return;
    }

    try {
      clear_error();
      set_progress('reading', 10);

      const segments = await FurnaceApi.getProgramSegments();
      update_state({ segments });
      set_progress(null, 100);

      add_log('success', `已读取程序段数据，共${segments.length}个段`);

      // 2秒后清除进度显示
      setTimeout(() => set_progress(null, 0), 2000);

    } catch (error) {
      set_progress(null, 0);
      handle_error(error);
      throw error;
    }
  }, [state.connection_status, clear_error, set_progress, update_state, add_log, handle_error]);

  const write_segments = useCallback(async (segments: ProgramSegment[]): Promise<void> => {
    try {
      set_progress('writing', 10);

      await FurnaceApi.writeProgramSegments(segments);
      update_state({ segments });
      set_progress(null, 100);

      add_log('success', `已写入 ${segments.length} 个程序段`);

      // 2秒后清除进度显示
      setTimeout(() => set_progress(null, 0), 2000);

    } catch (error) {
      set_progress(null, 0);
      handle_error(error);
      throw error;
    }
  }, [set_progress, update_state, add_log, handle_error]);

  // 预设管理
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

      // 更新当前选中的预设
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

      // 清除选中状态
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
    return execute_device_operation(
      () => FurnaceApi.applyPreset(name)
    );
  }, [execute_device_operation]);

  // 数据管理
  const load_history_data = useCallback(async (params?: HistoryQueryParams): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      const final_params = params || state.history_params;
      const history_data = await FurnaceApi.getTemperatureHistory(final_params);
      update_state({ history_data, history_params: final_params });

    } catch (error) {
      handle_error(error);
      throw error;
    } finally {
      set_loading(false);
    }
  }, [set_loading, clear_error, state.history_params, update_state, handle_error]);

  const update_history_params = useCallback((params: Partial<HistoryQueryParams>): void => {
    update_state(prev => ({
      history_params: { ...prev.history_params, ...params },
    }));
  }, [update_state]);

  const refresh_logs = useCallback(async (): Promise<void> => {
    try {
      const response = await FurnaceApi.getCommLog();
      const comm_logs = response.logs.map(log => ({
        id: `comm_${log.timestamp}_${Math.random()}`,
        timestamp: log.timestamp,
        type: 'comm' as const,
        data: log,
      }));

      update_state(prev => ({
        ...prev,
        logs: [...prev.logs.filter(log => log.type === 'operation'), ...comm_logs].slice(-500),
      }));
    } catch (error) {
      handle_error(error);
    }
  }, [update_state, handle_error]);

  const clear_logs = useCallback((): void => {
    update_state({ logs: [] });
  }, [update_state]);

  // 状态管理
  const reset = useCallback((): void => {
    set_state(initial_state);
  }, []);

  // 控制方法集合
  const controls: FurnaceControls = {
    connect,
    disconnect,
    set_temperature,
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
  }, [state.connection_status, load_segments]);

  // 清理WebSocket连接
  useEffect(() => {
    return () => {
      if (web_socket_status.current.connected) {
        furnaceWebSocketService.disconnect();
        web_socket_status.current.connected = false;
        web_socket_status.current.subscribed = false;
      }
    };
  }, []);

  return [state, controls];
}

export default useFurnace;