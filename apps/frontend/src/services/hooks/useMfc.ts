/**
 * MFC 状态管理 Hook
 *
 * 封装质量流量控制器设备的所有状态管理和操作逻辑
 */

import { useState, useCallback, useEffect } from 'react';
import { usePolling } from './usePolling';
import { MfcApi } from '../api';
import { mfcWebSocketService, MfcDeviceDiscovered } from '../mfc-websocket.service';
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
  DeviceConnectionStatus,
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

  // 连接状态管理
  connection_status: DeviceConnectionStatus;
  selected_port: string;
  available_ports: string[];

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
  get_available_ports: () => Promise<string[]>;

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

  // WebSocket实时更新
  updateDeviceStatus: (deviceAddress: number, statusData: {
    flow_sccm?: number;
    setpoint_sccm?: number;
    connection_status?: 'connected' | 'disconnected' | 'error';
    last_communication?: string;
  }) => void;
  updateFlowData: (deviceAddress: number, flowData: {
    flow_sccm: number;
    timestamp: string;
    setpoint_sccm?: number;
  }) => void;
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
    connection_status: 'disconnected',
    selected_port: '',
    available_ports: [],
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

  // 更新设备状态（批量更新，用于轮询）
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
          status: 'disconnected' as 'connected' | 'disconnected' | 'error' | 'warning',
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
        mode: (digitalSetpointPercent > activeSetpointPercent ? 'hold' : 'follow') as 'hold' | 'follow',
        status: 'connected' as 'connected' | 'disconnected' | 'error' | 'warning',
      };
    });

    updateState({
      deviceStatuses: statusMap,
      devices: updatedDevices,
      lastUpdate: new Date(),
    });
  }, [state.devices, updateState]);

  // 更新单个设备状态（用于WebSocket实时更新）
  const updateSingleDeviceStatus = useCallback((deviceAddress: number, statusData: {
    flow_sccm?: number;
    setpoint_sccm?: number;
    connection_status?: 'connected' | 'disconnected' | 'error';
    last_communication?: string;
  }) => {
    const updatedDevices = state.devices.map(device => {
      if (device.address !== deviceAddress) {
        return device;
      }

      // 计算流量百分比
      const flowPercent = device.max_flow_sccm > 0 && statusData.flow_sccm !== undefined
        ? (statusData.flow_sccm / device.max_flow_sccm) * 100
        : device.flow_percent;

      // 计算设定点百分比
      const digitalSetpointPercent = device.max_flow_sccm > 0 && statusData.setpoint_sccm !== undefined
        ? (statusData.setpoint_sccm / device.max_flow_sccm) * 100
        : device.digital_setpoint_percent;

      return {
        ...device,
        flow_sccm: statusData.flow_sccm ?? device.flow_sccm,
        flow_percent: flowPercent,
        set_flow: statusData.setpoint_sccm ?? device.set_flow,
        digital_setpoint_percent: digitalSetpointPercent,
        mode: (digitalSetpointPercent > (device.active_setpoint_percent ?? 0) ? 'hold' : 'follow') as 'hold' | 'follow',
        status: (statusData.connection_status ?? device.status) as 'connected' | 'disconnected' | 'error' | 'warning',
      };
    });

    updateState({
      devices: updatedDevices,
      lastUpdate: new Date(),
    });
  }, [state.devices, updateState]);

  // 更新流量数据（用于WebSocket实时更新）
  const updateFlowData = useCallback((deviceAddress: number, flowData: {
    flow_sccm: number;
    timestamp: string;
    setpoint_sccm?: number;
  }) => {
    const updatedDevices = state.devices.map(device => {
      if (device.address !== deviceAddress) {
        return device;
      }

      // 计算流量百分比
      const flowPercent = device.max_flow_sccm > 0
        ? (flowData.flow_sccm / device.max_flow_sccm) * 100
        : device.flow_percent;

      // 计算设定点百分比
      const digitalSetpointPercent = device.max_flow_sccm > 0 && flowData.setpoint_sccm !== undefined
        ? (flowData.setpoint_sccm / device.max_flow_sccm) * 100
        : device.digital_setpoint_percent;

      return {
        ...device,
        flow_sccm: flowData.flow_sccm,
        flow_percent: flowPercent,
        set_flow: flowData.setpoint_sccm ?? device.set_flow,
        digital_setpoint_percent: digitalSetpointPercent,
        mode: (digitalSetpointPercent > (device.active_setpoint_percent ?? 0) ? 'hold' : 'follow') as 'hold' | 'follow',
        status: 'connected' as 'connected' | 'disconnected' | 'error' | 'warning', // 有流量数据表示设备已连接
      };
    });

    updateState({
      devices: updatedDevices,
      lastUpdate: new Date(),
    });
  }, [state.devices, updateState]);

  // 移除前端轮询 - 状态更新现在完全由后端WebSocket推送
  // 前端只负责通过WebSocket接收实时状态更新，不再主动轮询
  console.log('MFC Hook: 前端轮询已移除，依赖后端WebSocket推送');

  // ==================== 端口管理 ====================

  const get_available_ports = useCallback(async (): Promise<string[]> => {
    try {
      const ports = await MfcApi.getPorts();
      updateState({ available_ports: ports });
      return ports;
    } catch (error) {
      handleApiError(error);
      throw error;
    }
  }, [updateState, handleApiError]);

  // ==================== 设备连接 ====================

  const connect = useCallback(async (
    port: string = 'COM1',
    baudrate: number = 19200,
    timeout: number = 1.0
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();
      updateState({
        connection_status: 'connecting',
        selected_port: port
      });

      await MfcApi.connect(port, baudrate, timeout);

      // 连接成功后更新状态
      updateState({ connection_status: 'connected' });

      // 连接成功后自动扫描设备（防重复触发）
      if (!state.isScanning && state.devices.length === 0) {
        const recommendedParams = MfcApi.getRecommendedScanParams();
        await MfcApi.scanDevices(recommendedParams);
      }

    } catch (error) {
      handleApiError(error);
      updateState({
        connection_status: 'error',
        selected_port: ''
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await MfcApi.disconnect();

      // 断开后更新连接状态和设备状态
      updateState({
        connection_status: 'disconnected',
        selected_port: '',
        devices: state.devices.map(device => ({
          ...device,
          status: 'disconnected' as const,
        })),
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState, state.devices]);

  // ==================== 设备发现 ====================

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      const devices = await MfcApi.getDevices();

      // KISS原则：最小必要字段填充，避免组件初始化错误
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
        devices: mfcDevices, // 使用填充了必要字段的设备数据
        deviceStatuses: new Map(), // 状态完全由WebSocket管理
        lastUpdate: new Date(),
      });

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState]);

  const scanDevices = useCallback(async (params: MfcScanRequest = {}): Promise<void> => {
    // 防重复调用检查
    if (state.isScanning) {
      console.log('Scan already in progress, ignoring duplicate request');
      return;
    }

    try {
      setScanning(true);
      clearError();

      // 确保传递当前连接的端口
      const scanParams = {
        ...params,
        port: params.port || state.selected_port,
      };

      console.log('Starting async scan - devices will appear in real-time via WebSocket');

      // 调用异步扫描 - 立即返回，设备通过WebSocket推送
      const currentDevices = await MfcApi.scanDevices(scanParams);

      // 更新当前设备列表（可能包含之前发现的设备）
      const mfcDevices: MfcDevice[] = currentDevices.map(device => ({
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
        availableDevices: currentDevices,
        devices: mfcDevices,
        deviceStatuses: new Map(),
      });

      // 异步刷新状态（不阻塞）
      refreshDevices().catch(error => {
        console.warn('Failed to refresh device status after scan:', error);
      });

      // 扫描在后台继续，新设备会通过WebSocket实时推送

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      // 延迟停止扫描状态，给用户更好的体验
      setTimeout(() => {
        setScanning(false);
      }, 1000);
    }
  }, [setScanning, clearError, handleApiError, refreshDevices, updateState]);

  
  // ==================== 设备控制 ====================

  const setFlowRate = useCallback(async (address: number, sccm: number): Promise<void> => {
    try {
      setLoading(true);
      clearError();

      await MfcApi.setFlowRate(address, sccm);

      // 立即刷新状态
      await refreshDevices();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, refreshDevices]);

  
  
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
      await refreshDevices();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, refreshDevices]);

  
  
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

      updateState({
        historyData: (() => {
          const newHistoryData = new Map(state.historyData);
          newHistoryData.set(address, historyData);
          return newHistoryData;
        })(),
        historyParams: finalParams,
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
      connection_status: 'disconnected',
      selected_port: '',
      available_ports: [],
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

  // 组件挂载时加载可用端口
  useEffect(() => {
    get_available_ports();
  }, [get_available_ports]);

  // WebSocket设备发现事件监听 - 实现实时设备发现
  useEffect(() => {
    // 处理设备发现事件
    const handleDeviceDiscovered = (discovered: MfcDeviceDiscovered) => {
      console.log('Real-time MFC device discovered:', discovered);

      const deviceData = discovered.data;

      // 转换为MfcDevice格式
      const newDevice: MfcDevice = {
        address: deviceData.device_address,
        gas_type: deviceData.gas_type,
        max_flow_sccm: deviceData.max_flow_sccm,
        flow_sccm: 0,
        set_flow: 0,
        flow_percent: 0,
        digital_setpoint_percent: 0,
        active_setpoint_percent: 0,
        mode: 'follow' as const,
        status: deviceData.connection_status === 'connected' ? 'connected' as const : 'disconnected' as const,
      };

      setState(prev => {
        // 检查设备是否已存在
        const existingDeviceIndex = prev.devices.findIndex(d => d.address === newDevice.address);
        const existingDeviceInfoIndex = prev.availableDevices.findIndex(d => d.address === newDevice.address);

        let updatedDevices = [...prev.devices];
        let updatedAvailableDevices = [...prev.availableDevices];

        // 更新或添加设备
        if (existingDeviceIndex >= 0) {
          updatedDevices[existingDeviceIndex] = newDevice;
        } else {
          updatedDevices.push(newDevice);
        }

        // 更新或添加设备信息
        const deviceInfo: MfcDeviceInfo = {
          address: newDevice.address,
          gas_type: newDevice.gas_type,
          max_flow_sccm: newDevice.max_flow_sccm,
        };

        if (existingDeviceInfoIndex >= 0) {
          updatedAvailableDevices[existingDeviceInfoIndex] = deviceInfo;
        } else {
          updatedAvailableDevices.push(deviceInfo);
        }

        return {
          ...prev,
          devices: updatedDevices,
          availableDevices: updatedAvailableDevices,
          lastUpdate: new Date().toISOString(),
        };
      });
    };

    // 注册WebSocket事件监听
    mfcWebSocketService.onDeviceDiscovered(handleDeviceDiscovered);

    // 确保WebSocket连接
    if (!mfcWebSocketService.connected) {
      mfcWebSocketService.connect();
    }

    // 清理函数
    return () => {
      mfcWebSocketService.removeCallback(handleDeviceDiscovered);
    };
  }, []);

  // 控制方法集合
  const controls: MfcControls = {
    scanDevices,
    refreshDevices,
    connect,
    disconnect,
    get_available_ports,
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
    updateDeviceStatus: updateSingleDeviceStatus, // WebSocket使用的单设备状态更新
    updateFlowData, // WebSocket使用的流量数据更新
  };

  return [state, controls];
}

export default useMfc;
