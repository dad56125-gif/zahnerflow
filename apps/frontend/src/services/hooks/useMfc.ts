/**
 * MFC 状态管理 Hook
 *
 * 封装质量流量控制器设备的所有状态管理和操作逻辑
 */

import { useState, useCallback, useEffect } from 'react';
import { usePolling } from './usePolling';
import { MfcApi } from '../api';
import {
  MfcDeviceInfo,
  MfcStatus,
  MfcDevice,
  MfcSample,
  MfcScanRequest,
  HistoryQueryParams,
  DeviceError,
  ConnectionState,
  DEFAULT_MFC_CONFIG,
} from '../../types/devices';
import { isRetryableError } from '../utils/apiUtils';

/**
 * MFC Hook 状态
 */
export interface MfcState {
  // 设备列表
  devices: MfcDevice[];
  availableDevices: MfcDeviceInfo[];

  // 设备状态映射
  deviceStatuses: Map<number, MfcStatus>;

  // 历史数据
  historyData: Map<number, MfcSample[]>;
  historyParams: HistoryQueryParams;

  // UI状态
  isLoading: boolean;
  isScanning: boolean;
  error: DeviceError | null;

  // 统计信息
  lastUpdate: Date | null;
  pollCount: number;
}

/**
 * MFC Hook 控制方法
 */
export interface MfcControls {
  // 设备发现
  scanDevices: (params?: MfcScanRequest) => Promise<void>;
  refreshDevices: () => Promise<void>;

  // 设备连接
  connect: (port?: string, baudrate?: number, timeout?: number) => Promise<void>;
  disconnect: () => Promise<void>;

  // 设备控制
  setFlowRate: (address: number, sccm: number) => Promise<void>;

  // 批量操作
  setAllFlowRates: (settings: { address: number; sccm: number }[]) => Promise<void>;

  // 历史数据
  loadHistoryData: (address: number, params?: HistoryQueryParams) => Promise<void>;
  loadMultipleHistoryData: (addresses: number[], params?: HistoryQueryParams) => Promise<void>;
  updateHistoryParams: (params: Partial<HistoryQueryParams>) => void;

  // 设备管理
  getDeviceByAddress: (address: number) => MfcDevice | null;
  getDeviceStatus: (address: number) => MfcStatus | null;
  getDeviceHistory: (address: number) => MfcSample[];

  // 状态管理
  reset: () => void;
  clearError: () => void;
  refresh: () => Promise<void>;
}

/**
 * MFC Hook
 */
export function useMfc(): [MfcState, MfcControls] {
  // 状态初始化
  const [state, setState] = useState<MfcState>({
    devices: [],
    availableDevices: [],
    deviceStatuses: new Map(),
    historyData: new Map(),
    historyParams: MfcApi.getDefaultHistoryParams(),
    isLoading: false,
    isScanning: false,
    error: null,
    lastUpdate: null,
    pollCount: 0,
  });

  // 更新状态的辅助函数
  const updateState = useCallback((updates: Partial<MfcState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // 设置加载状态
  const setLoading = useCallback((isLoading: boolean) => {
    updateState({ isLoading });
  }, [updateState]);

  // 设置扫描状态
  const setScanning = useCallback((isScanning: boolean) => {
    updateState({ isScanning });
  }, [updateState]);

  // 设置错误状态
  const setError = useCallback((error: DeviceError | null) => {
    updateState({ error, isLoading: false, isScanning: false });
  }, [updateState]);

  // 清除错误
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  // 处理API错误的通用函数
  const handleApiError = useCallback((error: any): void => {
    const deviceError = error as DeviceError;
    setError(deviceError);
  }, [setError]);

  // 更新设备状态
  const updateDeviceStatus = useCallback((statuses: MfcStatus[]) => {
    const statusMap = new Map<number, MfcStatus>();
    statuses.forEach(status => {
      statusMap.set(status.address, status);
    });

    // 更新设备列表中的状态信息
    const updatedDevices = state.devices.map(device => {
      const status = statusMap.get(device.address);
      if (!status) {
        return {
          ...device,
          status: 'disconnected',
        };
      }

      const digitalSetpointPercent = status.digital_setpoint_percent ?? 0;
      const activeSetpointPercent = status.active_setpoint_percent ?? 0;
      const computedSetFlow = device.max_flow_sccm > 0
        ? (digitalSetpointPercent * device.max_flow_sccm) / 100
        : 0;

      return {
        ...device,
        flow_sccm: status.flow_sccm,
        flow_percent: status.flow_percent ?? device.flow_percent,
        set_flow: computedSetFlow,
        digital_setpoint_percent: digitalSetpointPercent,
        active_setpoint_percent: activeSetpointPercent,
        mode: digitalSetpointPercent > activeSetpointPercent ? 'hold' : 'follow',
        status: 'connected',
      };
    });

    updateState({
      deviceStatuses: statusMap,
      devices: updatedDevices,
      lastUpdate: new Date(),
    });
  }, [state.devices, updateState]);

  // 设备状态轮询
  const [, statusControls] = usePolling(
    async () => {
      try {
        if (state.devices.length === 0) {
          return [];
        }

        const statuses = await MfcApi.getAllDevicesStatus();
        updateDeviceStatus(statuses);

        return statuses;
      } catch (error) {
        handleApiError(error);
        throw error;
      }
    },
    {
      interval: DEFAULT_MFC_CONFIG.polling_interval,
      immediate: true,
      onlyWhenVisible: true,
      maxRetries: DEFAULT_MFC_CONFIG.retry_attempts,
      retryDelay: DEFAULT_MFC_CONFIG.retry_delay,
      onError: handleApiError,
      deps: [state.devices.length], // 设备列表变化时重新开始轮询
    }
  );

  // ==================== 设备连接 ====================

  const connect = useCallback(async (
    port: string = 'COM1',
    baudrate: number = 19200,
    timeout: number = 1.0
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await MfcApi.connect(port, baudrate, timeout);

      // 连接成功后刷新状态
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await MfcApi.disconnect();

      // 断开后更新设备状态为disconnected
      updateState(prev => ({
        ...prev,
        devices: prev.devices.map(device => ({
          ...device,
          status: 'disconnected' as const,
        })),
      }));

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  // ==================== 设备发现 ====================

  const scanDevices = useCallback(async (params: MfcScanRequest = {}): Promise<void> => {
    try {
      setScanning(true);
      clearError();

      const devices = await MfcApi.scanDevices(params);

      // 将发现的设备转换为MfcDevice格式
      const mfcDevices: MfcDevice[] = devices.map(device => ({
        ...device,
        flow_sccm: 0,
        set_flow: 0,
        flow_percent: 0,
        digital_setpoint_percent: 0,
        active_setpoint_percent: 0,
        mode: 'follow' as const,
        status: 'disconnected' as const,
      }));

      updateState({
        availableDevices: devices,
        devices: mfcDevices,
        deviceStatuses: new Map(),
      });

      // 如果发现了设备，自动连接到第一个可用端口
      if (devices.length > 0) {
        try {
          await MfcApi.connect('COM1');
          console.log('MFC设备连接成功，模拟已启动');
        } catch (connectError) {
          console.warn('MFC设备连接失败，但可以继续读取基本状态:', connectError);
          // 连接失败不影响基本功能，只是流量不会动态更新
        }
      }

      // 立即刷新状态
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setScanning(false);
    }
  }, [setScanning, clearError, handleApiError, statusControls, updateState]);

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const devices = await MfcApi.getDevices();
      const statuses = await MfcApi.getAllDevicesStatus();

      // 更新设备列表
      const mfcDevices: MfcDevice[] = devices.map(device => {
        const status = statuses.find(s => s.address === device.address);
        const previous = state.devices.find(d => d.address === device.address);

        if (!status) {
          return {
            ...device,
            flow_sccm: previous?.flow_sccm ?? 0,
            flow_percent: previous?.flow_percent ?? 0,
            set_flow: previous?.set_flow ?? 0,
            digital_setpoint_percent: previous?.digital_setpoint_percent ?? 0,
            active_setpoint_percent: previous?.active_setpoint_percent ?? 0,
            mode: previous?.mode ?? 'follow',
            status: 'disconnected',
          };
        }

        const digitalSetpointPercent = status.digital_setpoint_percent ?? 0;
        const activeSetpointPercent = status.active_setpoint_percent ?? 0;
        const computedSetFlow = device.max_flow_sccm > 0
          ? (digitalSetpointPercent * device.max_flow_sccm) / 100
          : 0;

        return {
          ...device,
          flow_sccm: status.flow_sccm,
          flow_percent: status.flow_percent ?? previous?.flow_percent ?? 0,
          set_flow: computedSetFlow,
          digital_setpoint_percent: digitalSetpointPercent,
          active_setpoint_percent: activeSetpointPercent,
          mode: digitalSetpointPercent > activeSetpointPercent ? 'hold' : 'follow',
          status: 'connected',
        };
      });

      updateState({
        availableDevices: devices,
        devices: mfcDevices,
        deviceStatuses: new Map(statuses.map(s => [s.address, s])),
        lastUpdate: new Date(),
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState, state.devices]);

  // ==================== 设备控制 ====================

  const setFlowRate = useCallback(async (address: number, sccm: number): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await MfcApi.setFlowRate(address, sccm);

      // 立即刷新状态
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls]);

  
  
  // ==================== 批量操作 ====================

  const setAllFlowRates = useCallback(async (
    settings: { address: number; sccm: number }[]
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      // 并行设置所有设备的流量
      const promises = settings.map(({ address, sccm }) =>
        MfcApi.setFlowRate(address, sccm)
      );

      await Promise.all(promises);

      // 立即刷新状态
      await statusControls.refresh();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, statusControls]);

  
  
  // ==================== 历史数据 ====================

  const loadHistoryData = useCallback(async (
    address: number,
    params?: HistoryQueryParams
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const finalParams = params || state.historyParams;
      const historyData = await MfcApi.getFlowHistory(address, finalParams);

      updateState(prev => {
        const newHistoryData = new Map(prev.historyData);
        newHistoryData.set(address, historyData);
        return {
          historyData: newHistoryData,
          historyParams: finalParams,
        };
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState, state.historyParams]);

  const loadMultipleHistoryData = useCallback(async (
    addresses: number[],
    params?: HistoryQueryParams
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const finalParams = params || state.historyParams;
      const historyDataMap = await MfcApi.getMultipleDevicesFlowHistory(addresses, finalParams);

      updateState({
        historyData: new Map(Object.entries(historyDataMap).map(([k, v]) => [parseInt(k), v])),
        historyParams: finalParams,
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState, state.historyParams]);

  const updateHistoryParams = useCallback((params: Partial<HistoryQueryParams>): void => {
    updateState({
      historyParams: {
        ...state.historyParams,
        ...params,
      },
    });
  }, [updateState, state.historyParams]);

  // ==================== 设备管理 ====================

  const getDeviceByAddress = useCallback((address: number): MfcDevice | null => {
    return state.devices.find(device => device.address === address) || null;
  }, [state.devices]);

  const getDeviceStatus = useCallback((address: number): MfcStatus | null => {
    return state.deviceStatuses.get(address) || null;
  }, [state.deviceStatuses]);

  const getDeviceHistory = useCallback((address: number): MfcSample[] => {
    return state.historyData.get(address) || [];
  }, [state.historyData]);

  // ==================== 状态管理 ====================

  const reset = useCallback((): void => {
    setState({
      devices: [],
      availableDevices: [],
      deviceStatuses: new Map(),
      historyData: new Map(),
      historyParams: MfcApi.getDefaultHistoryParams(),
      isLoading: false,
      isScanning: false,
      error: null,
      lastUpdate: null,
      pollCount: 0,
    });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await refreshDevices();
    } catch (error) {
      handleApiError(error);
    }
  }, [refreshDevices, handleApiError]);

  // ==================== 初始化 ====================

  // 组件挂载时扫描设备
  useEffect(() => {
    const recommendedParams = MfcApi.getRecommendedScanParams();
    scanDevices(recommendedParams);
  }, []);

  // 控制方法集合
  const controls: MfcControls = {
    scanDevices,
    refreshDevices,
    connect,
    disconnect,
    setFlowRate,
    setAllFlowRates,
    loadHistoryData,
    loadMultipleHistoryData,
    updateHistoryParams,
    getDeviceByAddress,
    getDeviceStatus,
    getDeviceHistory,
    reset,
    clearError,
    refresh,
  };

  return [state, controls];
}

export default useMfc;
