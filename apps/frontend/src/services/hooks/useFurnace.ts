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
  FurnaceOperationResponse,
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
 * 处理 FurnaceOperationResponse 响应的辅助函数
 *
 * @param response API 返回的 FurnaceOperationResponse
 * @param successMessage 操作成功时的日志消息
 * @param updateState 状态更新函数
 * @param addLog 日志添加函数
 * @returns 处理结果，成功返回 true，失败返回 false
 */
const handle_furnace_response = (
  response: FurnaceOperationResponse,
  successMessage?: string,
  updateState?: (updates: StateUpdate) => void,
  addLog?: (level: 'success' | 'info' | 'warning' | 'error', message: string) => void
): boolean => {
  // TypeScript 类型守卫：确保 response 是有效的 FurnaceOperationResponse
  if (!response || typeof response !== 'object') {
    throw {
      code: 'INVALID_RESPONSE',
      message: 'API 响应格式无效',
      status: 500,
    } as DeviceError;
  }

  if (!response.ok) {
    const errorMessage = response.error || '操作失败';
    if (addLog) {
      addLog('error', errorMessage);
    }
    throw {
      code: 'FURNACE_OPERATION_FAILED',
      message: errorMessage,
      status: 400,
      details: response,
    } as DeviceError;
  }

  // 如果有数据更新，更新设备状态
  if (response.data && updateState) {
    // 验证数据完整性
    if (
      typeof response.data.pv !== 'number' ||
      typeof response.data.sv !== 'number' ||
      typeof response.data.mv !== 'number' ||
      typeof response.data.status !== 'number' ||
      typeof response.data.timestamp !== 'string'
    ) {
      throw {
        code: 'INVALID_RESPONSE_DATA',
        message: 'API 响应数据格式不完整',
        status: 500,
        details: response.data,
      } as DeviceError;
    }

    const device_status: FurnaceStatus = {
      pv: response.data.pv,
      sv: response.data.sv,
      mv: response.data.mv,
      status: response.data.status.toString(),
      segment: response.data.segment,
      segment_time: response.data.segment_time,
      segment_time_set: response.data.segment_time_set,
    };

    // 验证设备状态完整性
    if (!validate_device_status(device_status)) {
      console.warn('设备状态验证失败，但仍将更新状态:', device_status);
    }

    updateState({
      device_status,
      // 根据状态字节更新操作状态
      operation_status: get_operation_status_from_byte(response.data.status),
    });
  }

  // 记录成功日志
  if (successMessage && addLog) {
    addLog('success', successMessage);
  }

  return true;
};

/**
 * 根据状态字节转换为操作状态
 */
const get_operation_status_from_byte = (statusByte: number): DeviceOperationStatus => {
  // TypeScript 类型安全检查
  if (typeof statusByte !== 'number' || statusByte < 0 || statusByte > 255) {
    console.warn('无效的状态字节:', statusByte);
    return 'idle';
  }

  // 根据设备协议解析状态字节
  // 这里需要根据实际的 AI518P 协议来解析
  // 假设状态字节的某些位表示运行状态

  // 例如：如果运行位为1，返回 'running'
  // 如果暂停位为1，返回 'paused'
  // 如果停止位为1，返回 'stopped'
  // 否则返回 'idle'

  // 这是一个简化的实现，需要根据实际协议调整
  if (statusByte & 0x01) { // 假设bit 0表示运行
    return 'running';
  } else if (statusByte & 0x02) { // 假设bit 1表示暂停
    return 'paused';
  } else if (statusByte & 0x04) { // 假设bit 2表示停止
    return 'stopped';
  }

  return 'idle';
};

/**
 * 验证设备状态的完整性
 */
const validate_device_status = (status: FurnaceStatus): boolean => {
  if (!status || typeof status !== 'object') {
    return false;
  }

  // 检查必需的数值字段
  const number_fields = ['pv', 'sv', 'mv'];
  for (const field of number_fields) {
    const value = status[field as keyof FurnaceStatus];
    if (value !== undefined && (typeof value !== 'number' || isNaN(value))) {
      console.warn(`设备状态字段 ${field} 格式无效:`, value);
      return false;
    }
  }

  // 检查可选字段
  const optional_fields = ['segment', 'segment_time', 'segment_time_set'];
  for (const field of optional_fields) {
    const value = status[field as keyof FurnaceStatus];
    if (value !== undefined && (typeof value !== 'number' || isNaN(value))) {
      console.warn(`设备状态字段 ${field} 格式无效:`, value);
      return false;
    }
  }

  return true;
};

/**
 * 最终优化的Furnace Hook
 */
export function useFurnace(): [FurnaceState, FurnaceControls] {
  // 初始状态 - 严格snake_case命名
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

  // 清除错误
  const clear_error = useCallback((): void => {
    update_state({ error: null });
  }, [update_state]);

  // 日志管理 - 限制日志数量，适配新格式
  const add_log = useCallback((
    level: 'success' | 'info' | 'warning' | 'error',
    message: string
  ): void => {
    const log_entry: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type: level as 'info' | 'success' | 'warning' | 'error', // 确保类型匹配
      message,
      details: {
        operation_time: new Date().toISOString(),
      },
    };

    set_state(prev => ({
      ...prev,
      logs: [...prev.logs, log_entry].slice(-200), // 限制日志数量
    }));
  }, []);

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

  // 错误处理 - 增强处理，适配 FurnaceOperationResponse 格式
  const handle_error = useCallback((error: any): void => {
    let device_error: DeviceError;

    // 检查是否是 FurnaceOperationResponse 格式的错误
    if (error && typeof error === 'object' && 'ok' in error && !error.ok) {
      // 这是 FurnaceOperationResponse 格式的错误
      device_error = {
        code: 'FURNACE_OPERATION_FAILED',
        message: error.error || '设备操作失败',
        status: 400,
        details: error,
      };
    } else if (error && typeof error === 'object' && 'code' in error) {
      // 标准的 DeviceError 格式
      device_error = error as DeviceError;
    } else if (error instanceof Error) {
      // JavaScript Error 对象
      device_error = {
        code: 'JAVASCRIPT_ERROR',
        message: error.message,
        status: 500,
        details: {
          stack: error.stack,
          name: error.name,
        },
      };
    } else {
      // 未知错误格式
      device_error = {
        code: 'UNKNOWN_ERROR',
        message: '未知错误',
        status: 500,
        details: error,
      };
    }

    // 添加错误日志
    add_log('error', `错误: ${device_error.message}`);

    update_state({
      error: device_error,
      loading: false,
      connection_status: 'disconnected',
    });
  }, [update_state, add_log]);

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
        sv: data.sv || 0,
        mv: data.mv,
      };

      set_state(prev => ({
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

  // 统一设备操作处理 - 减少重复代码，适配 FurnaceOperationResponse
  // 类型安全：确保 operation 返回正确的类型
  const execute_device_operation = useCallback(async (
    operation: () => Promise<FurnaceOperationResponse | void>,
    success_message?: string
  ): Promise<void> => {
    // 连接状态检查
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

      // 执行操作并获取响应
      const response = await operation();

      // 类型安全检查：确保响应格式正确
      if (response && typeof response === 'object' && 'ok' in response) {
        // 这是 FurnaceOperationResponse 格式
        handle_furnace_response(
          response as FurnaceOperationResponse,
          success_message,
          update_state,
          add_log
        );
      } else if (response) {
        // 未知响应格式，记录警告
        console.warn('收到未知格式的响应:', response);
        if (success_message) {
          add_log('success', success_message);
        }
      } else if (success_message) {
        // 如果没有响应但有成功消息，记录日志
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

  // 基本控制方法 - 已适配 FurnaceOperationResponse
  const set_temperature = useCallback((sv: number): Promise<void> => {
    return execute_device_operation(
      async () => {
        const response = await FurnaceApi.setTemperature(sv);
        return response; // 返回 FurnaceOperationResponse
      },
      `温度设置为 ${sv}°C`
    );
  }, [execute_device_operation]);

  const set_segment = useCallback((segment: number): Promise<void> => {
    return execute_device_operation(
      async () => {
        const response = await FurnaceApi.setSegment(segment);
        return response; // 返回 FurnaceOperationResponse
      },
      `切换到程序段 ${segment}`
    );
  }, [execute_device_operation]);

  const run = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => {
        const response = await FurnaceApi.run();
        return response; // 返回 FurnaceOperationResponse
      },
      '程序已开始运行'
    );
  }, [execute_device_operation]);

  const pause = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => {
        const response = await FurnaceApi.pause();
        return response; // 返回 FurnaceOperationResponse
      },
      '程序已暂停'
    );
  }, [execute_device_operation]);

  const stop = useCallback((): Promise<void> => {
    return execute_device_operation(
      async () => {
        const response = await FurnaceApi.stop();
        return response; // 返回 FurnaceOperationResponse
      },
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
    if (state.connection_status !== 'connected') {
      const error: DeviceError = {
        code: 'DEVICE_NOT_CONNECTED',
        message: '设备未连接，无法写入程序段',
        status: 400,
      };
      handle_error(error);
      throw error;
    }

    try {
      set_progress('writing', 10);
      clear_error();

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
  }, [state.connection_status, set_progress, clear_error, update_state, add_log, handle_error]);

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
    try {
      set_loading(true);
      clear_error();

      const result = await FurnaceApi.applyPreset(name);

      // 处理应用预设的结果
      if (result.changed) {
        add_log('success', `预设 "${name}" 应用成功`);
        if (result.steps && result.steps.length > 0) {
          result.steps.forEach(step => {
            add_log('info', `执行步骤: ${step}`);
          });
        }
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

  // 数据管理
  const load_history_data = useCallback(async (params?: HistoryQueryParams): Promise<void> => {
    try {
      set_loading(true);
      clear_error();
      const final_params = params || state.history_params;
      const raw_history_data = await FurnaceApi.getTemperatureHistory(final_params);

      // 转换 FurnaceSample[] 到所需的格式，确保 sv 和 mv 是必选的
      const history_data = raw_history_data.map(sample => ({
        timestamp: sample.timestamp,
        temperature: sample.temperature,
        sv: sample.sv || 0, // 提供默认值
        mv: sample.mv || 0, // 提供默认值
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
        type: log.direction === 'tx' ? ('comm_tx' as const) : ('comm_rx' as const), // 使用正确的 LogEntry 类型
        message: `${log.direction.toUpperCase()}: ${log.data}`,
        details: log,
      }));

      set_state(prev => {
        const non_comm_logs = prev.logs.filter(log => log.type !== 'comm_rx' && log.type !== 'comm_tx');
        return {
          ...prev,
          logs: [...non_comm_logs, ...comm_logs].slice(-500),
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