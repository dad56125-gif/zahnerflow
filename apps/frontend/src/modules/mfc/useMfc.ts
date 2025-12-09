/**
 * MFC 状态管理 Hook
 * 
 * 提供质量流量控制器的状态管理，包括连接、设备发现、流量控制等功能
 */

import { useState, useCallback } from 'react';
import { MfcApi } from './mfcApi';
import { mfcWebSocketService, MfcDeviceDiscovered, MfcStatusUpdate } from './mfcWebSocket.service';
import type { DeviceError, DeviceConnectionStatus, HistoryQueryParams, LogEntry } from '../common/types';
import {
  MfcDeviceInfo,
  MfcStatus,
  MfcDevice,
  MfcSample,
  MfcScanRequest,
} from './mfcTypes';

// ==================== 状态类型 ====================

export interface MfcState {
  devices: MfcDevice[];
  availableDevices: MfcDeviceInfo[];
  deviceStatuses: Map<number, MfcStatus>;
  connection_status: DeviceConnectionStatus;
  selected_port: string;
  available_ports: string[];
  historyData: Map<number, MfcSample[]>;
  historyParams: HistoryQueryParams;
  isLoading: boolean;
  isScanning: boolean;
  error: DeviceError | null;
  lastUpdate: Date | null;
  pollCount: number;
  loading: boolean;
  logs: LogEntry[];
}

export interface MfcControls {
  ensureConnection: () => void;
  scanDevices: (params?: MfcScanRequest) => Promise<void>;
  refreshDevices: () => Promise<void>;
  connect: (port?: string, baudrate?: number, timeout?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  get_available_ports: () => Promise<string[]>;
  setFlowRate: (address: number, sccm: number) => Promise<void>;
  setAllFlowRates: (settings: { address: number; sccm: number }[]) => Promise<void>;
  loadHistoryData: (address: number, params?: HistoryQueryParams) => Promise<void>;
  loadMultipleHistoryData: (addresses: number[], params?: HistoryQueryParams) => Promise<void>;
  updateHistoryParams: (params: Partial<HistoryQueryParams>) => void;
  getDeviceByAddress: (address: number) => MfcDevice | null;
  getDeviceStatus: (address: number) => MfcStatus | null;
  getDeviceHistory: (address: number) => MfcSample[];
  reset: () => void;
  clearError: () => void;
  refresh: () => Promise<void>;
  updateDeviceStatus: (address: number, data: unknown) => void;
  updateFlowData: (address: number, data: unknown) => void;
}

// ==================== 初始状态 ====================

const createInitialState = (): MfcState => ({
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
  loading: false,
  logs: [],
});

// ==================== Hook 实现 ====================

export function useMfc(): [MfcState, MfcControls] {
  const [state, setState] = useState<MfcState>(createInitialState);

  // 状态更新辅助函数
  const updateState = useCallback((updates: Partial<MfcState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setLoading = useCallback((loading: boolean) => updateState({ loading, isLoading: loading }), [updateState]);
  const clearError = useCallback(() => updateState({ error: null }), [updateState]);

  const handleError = useCallback(
    (error: unknown) => {
      const deviceError: DeviceError =
        error && typeof error === 'object' && 'message' in error
          ? (error as DeviceError)
          : { code: 'UNKNOWN', message: String(error), status: 0 };
      updateState({ error: deviceError, loading: false, isLoading: false, isScanning: false });
    },
    [updateState]
  );

  // ==================== 端口与设备发现 ====================

  const get_available_ports = useCallback(async (): Promise<string[]> => {
    try {
      const ports = await MfcApi.getPorts();
      updateState({ available_ports: ports });
      return ports;
    } catch (error) {
      handleError(error);
      return [];
    }
  }, [updateState, handleError]);

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const devices = await MfcApi.getDevices();
      const mfcDevices: MfcDevice[] = devices.map((device) => ({
        ...device,
        flow_sccm: 0,
        set_flow: 0,
        flow_percent: 0,
        digital_setpoint_percent: 0,
        active_setpoint_percent: 0,
        mode: 'follow' as const,
        status: 'connected' as const,
      }));
      updateState({
        availableDevices: devices,
        devices: mfcDevices,
        lastUpdate: new Date(),
      });
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleError, updateState]);

  // ==================== WebSocket 事件处理 ====================

  const handleDeviceDiscovered = useCallback(
    (discovered: MfcDeviceDiscovered) => {
      const d = discovered.data;
      setState((prev) => {
        const newDevice: MfcDevice = {
          address: d.device_address,
          gas_type: d.gas_type,
          max_flow_sccm: d.max_flow_sccm,
          flow_sccm: 0,
          set_flow: 0,
          flow_percent: 0,
          digital_setpoint_percent: 0,
          active_setpoint_percent: 0,
          mode: 'follow',
          status: 'connected',
        };

        const devices = [...prev.devices];
        const idx = devices.findIndex((x) => x.address === newDevice.address);
        if (idx >= 0) devices[idx] = newDevice;
        else devices.push(newDevice);

        return { ...prev, devices, lastUpdate: new Date() };
      });
    },
    []
  );

  const handleStatusUpdate = useCallback((update: MfcStatusUpdate) => {
    setState((prev) => {
      const updatedDevices = prev.devices.map((device) => {
        const statusData = update.data.find((d) => d.device_address === device.address);
        if (!statusData) return device;

        const max = device.max_flow_sccm || 1;
        return {
          ...device,
          flow_sccm: statusData.flow_sccm,
          set_flow: statusData.setpoint_sccm,
          flow_percent: (statusData.flow_sccm / max) * 100,
          status: statusData.connection_status as MfcDevice['status'],
        };
      });
      return { ...prev, devices: updatedDevices, lastUpdate: new Date() };
    });
  }, []);

  // ==================== 智能初始化 ====================

  const ensureConnection = useCallback(async () => {
    // 建立 WebSocket 连接
    if (!mfcWebSocketService.connected) {
      mfcWebSocketService.onDeviceDiscovered(handleDeviceDiscovered);
      mfcWebSocketService.onStatusUpdate(handleStatusUpdate);
      mfcWebSocketService.onConnected(() => mfcWebSocketService.subscribe());
      mfcWebSocketService.connect();
    }

    try {
      const statusData = await MfcApi.getConnectionStatus();
      console.log('Synced status:', statusData);

      if (statusData.status === 'connected') {
        updateState({
          connection_status: 'connected',
          selected_port: (statusData.connection_info as { port?: string })?.port || state.selected_port,
        });
        if (statusData.device_count > 0) {
          refreshDevices();
        }
      } else {
        updateState({ connection_status: 'disconnected' });
        await get_available_ports();
      }
    } catch (error) {
      console.warn('Sync failed, assuming disconnected:', error);
      updateState({ connection_status: 'disconnected' });
      get_available_ports();
    }
  }, [get_available_ports, refreshDevices, updateState, state.selected_port, handleDeviceDiscovered, handleStatusUpdate]);

  // ==================== 连接与断开 ====================

  const connect = useCallback(
    async (port: string = 'COM1', baudrate: number = 19200, timeout: number = 1.0): Promise<void> => {
      try {
        setLoading(true);
        clearError();
        updateState({ connection_status: 'connecting', selected_port: port });

        await MfcApi.connect(port, baudrate, timeout);
        updateState({ connection_status: 'connected' });
        await refreshDevices();
      } catch (error) {
        handleError(error);
        updateState({ connection_status: 'error', selected_port: '' });
        get_available_ports();
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, clearError, handleError, updateState, refreshDevices, get_available_ports]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      await MfcApi.disconnect();
      updateState({
        connection_status: 'disconnected',
        selected_port: '',
        devices: [],
        availableDevices: [],
        deviceStatuses: new Map(),
      });
      await get_available_ports();
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleError, updateState, get_available_ports]);

  // ==================== 扫描与控制 ====================

  const scanDevices = useCallback(
    async (params: MfcScanRequest = {}): Promise<void> => {
      if (state.isScanning) return;

      try {
        updateState({ isScanning: true });
        clearError();

        const scanParams = { ...params, port: params.port || state.selected_port };
        const currentDevices = await MfcApi.scanDevices(scanParams);
        updateState({ availableDevices: currentDevices });
        setTimeout(() => updateState({ isScanning: false }), 1000);
      } catch (error) {
        handleError(error);
        updateState({ isScanning: false });
      }
    },
    [state.isScanning, state.selected_port, updateState, clearError, handleError]
  );

  const setFlowRate = useCallback(
    async (address: number, sccm: number): Promise<void> => {
      try {
        setLoading(true);
        await MfcApi.setFlowRate(address, sccm);
      } catch (error) {
        handleError(error);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, handleError]
  );

  const setAllFlowRates = useCallback(
    async (settings: { address: number; sccm: number }[]): Promise<void> => {
      try {
        setLoading(true);
        await Promise.all(settings.map((s) => MfcApi.setFlowRate(s.address, s.sccm)));
      } catch (error) {
        handleError(error);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, handleError]
  );

  // ==================== 历史数据 ====================

  const loadHistoryData = useCallback(
    async (address: number, params?: HistoryQueryParams): Promise<void> => {
      try {
        const finalParams = params || state.historyParams;
        const data = await MfcApi.getFlowHistory(address, finalParams);

        const newMap = new Map(state.historyData);
        newMap.set(address, data);
        updateState({ historyData: newMap, historyParams: finalParams });
      } catch (error) {
        handleError(error);
      }
    },
    [state.historyData, state.historyParams, updateState, handleError]
  );

  const loadMultipleHistoryData = useCallback(
    async (addresses: number[], params?: HistoryQueryParams): Promise<void> => {
      try {
        const finalParams = params || state.historyParams;
        const dataMap = await MfcApi.getMultipleDevicesFlowHistory(addresses, finalParams);

        const newMap = new Map(state.historyData);
        Object.entries(dataMap).forEach(([k, v]) => newMap.set(parseInt(k), v));
        updateState({ historyData: newMap, historyParams: finalParams });
      } catch (error) {
        handleError(error);
      }
    },
    [state.historyData, state.historyParams, updateState, handleError]
  );

  const updateHistoryParams = useCallback(
    (params: Partial<HistoryQueryParams>) => {
      updateState({ historyParams: { ...state.historyParams, ...params } });
    },
    [state.historyParams, updateState]
  );

  // ==================== 辅助查询 ====================

  const getDeviceByAddress = useCallback(
    (address: number) => state.devices.find((d) => d.address === address) || null,
    [state.devices]
  );

  const getDeviceStatus = useCallback(
    (address: number) => state.deviceStatuses.get(address) || null,
    [state.deviceStatuses]
  );

  const getDeviceHistory = useCallback(
    (address: number) => state.historyData.get(address) || [],
    [state.historyData]
  );

  // ==================== 工具方法 ====================

  const reset = useCallback(() => setState(createInitialState()), []);
  const refresh = useCallback(async () => refreshDevices(), [refreshDevices]);

  // 占位符函数（兼容性）
  const updateDeviceStatus = useCallback((_address: number, _data: unknown) => { }, []);
  const updateFlowData = useCallback((_address: number, _data: unknown) => { }, []);

  // ==================== 导出 ====================

  const controls: MfcControls = {
    ensureConnection,
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
    updateDeviceStatus,
    updateFlowData,
  };

  return [state, controls];
}

export default useMfc;