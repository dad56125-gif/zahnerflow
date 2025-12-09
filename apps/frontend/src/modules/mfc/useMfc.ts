/**
 * MFC 状态管理 Hook
 * 
 * 包含智能初始化、状态同步和无感端口刷新逻辑
 */

import { useState, useCallback, useEffect } from 'react';
import { MfcApi } from './mfcApi';
import { mfcWebSocketService, MfcDeviceDiscovered, MfcStatusUpdate } from './mfcWebSocket.service';
import {
  MfcDeviceInfo,
  MfcStatus,
  MfcDevice,
  MfcSample,
  MfcScanRequest,
  MfcConfig,
  DEFAULT_MFC_CONFIG,
} from './mfcTypes';
import { HistoryQueryParams, DeviceError, DeviceConnectionStatus } from '../devices';

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
  updateDeviceStatus: (address: number, data: any) => void;
  updateFlowData: (address: number, data: any) => void;
}

export function useMfc(): [MfcState, MfcControls] {
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

  const updateState = useCallback((updates: Partial<MfcState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => updateState({ isLoading }), [updateState]);
  const clearError = useCallback(() => updateState({ error: null }), [updateState]);

  const handleApiError = useCallback((error: any): void => {
    updateState({ error: error as DeviceError, isLoading: false, isScanning: false });
  }, [updateState]);

  // ==================== 核心功能：端口与发现 ====================

  const get_available_ports = useCallback(async (): Promise<string[]> => {
    try {
      const ports = await MfcApi.getPorts();
      updateState({ available_ports: ports });
      return ports;
    } catch (error) {
      handleApiError(error);
      return [];
    }
  }, [updateState, handleApiError]);

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const devices = await MfcApi.getDevices();

      const mfcDevices: MfcDevice[] = devices.map(device => ({
        ...device,
        flow_sccm: 0,
        set_flow: 0,
        flow_percent: 0,
        digital_setpoint_percent: 0,
        active_setpoint_percent: 0,
        mode: 'follow',
        status: 'connected', // 既然能获取到设备列表，说明已连接
      }));

      updateState({
        availableDevices: devices,
        devices: mfcDevices,
        lastUpdate: new Date(),
      });
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleApiError, updateState]);

  // ==================== 智能初始化 (Modal 打开时调用) ====================

  const ensureConnection = useCallback(async () => {
    // 1. 建立 WebSocket 连接
    if (!mfcWebSocketService.connected) {
      mfcWebSocketService.onDeviceDiscovered(handleDeviceDiscovered);
      mfcWebSocketService.onStatusUpdate(handleStatusUpdate);
      mfcWebSocketService.onConnected(handleConnected);
      mfcWebSocketService.connect();
    }

    try {
      // 2. 询问后端真实状态
      const statusData = await MfcApi.getConnectionStatus();
      console.log('Synced status:', statusData);

      if (statusData.status === 'connected') {
        // 场景 A：后端已连接 -> 显示已连接状态 + 拉取设备
        updateState({
          connection_status: 'connected',
          selected_port: statusData.connection_info?.port || state.selected_port,
        });
        if (statusData.device_count > 0) {
          refreshDevices();
        }
      } else {
        // 场景 B：后端未连接 -> 显示未连接 + 【自动拉取端口】
        updateState({ connection_status: 'disconnected' });
        await get_available_ports(); // 无感刷新端口
      }
    } catch (error) {
      console.warn('Sync failed, assuming disconnected:', error);
      updateState({ connection_status: 'disconnected' });
      // 即使同步失败，也尝试获取端口，方便用户重连
      get_available_ports();
    }
  }, [get_available_ports, refreshDevices, updateState, state.selected_port]);

  // ==================== 连接与断开 ====================

  const connect = useCallback(async (
    port: string = 'COM1',
    baudrate: number = 19200,
    timeout: number = 1.0
  ): Promise<void> => {
    try {
      setLoading(true);
      clearError();
      updateState({ connection_status: 'connecting', selected_port: port });

      await MfcApi.connect(port, baudrate, timeout);

      updateState({ connection_status: 'connected' });
      // 连接成功后自动尝试拉取一次设备（后端也会自动开始轮询）
      await refreshDevices();

    } catch (error) {
      handleApiError(error);
      updateState({ connection_status: 'error', selected_port: '' });
      // 失败后刷新端口列表，防止端口已消失
      get_available_ports();
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearError, handleApiError, updateState, refreshDevices, get_available_ports]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      await MfcApi.disconnect();

      // 断开后重置所有状态，并刷新端口列表等待下一次连接
      updateState({
        connection_status: 'disconnected',
        selected_port: '',
        devices: [],
        availableDevices: [],
        deviceStatuses: new Map()
      });

      await get_available_ports();

    } catch (error) {
      handleApiError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleApiError, updateState, get_available_ports]);

  // ==================== 扫描与控制 ====================

  const scanDevices = useCallback(async (params: MfcScanRequest = {}): Promise<void> => {
    if (state.isScanning) return;

    try {
      updateState({ isScanning: true });
      clearError();

      const scanParams = { ...params, port: params.port || state.selected_port };
      // 异步扫描，立即返回，设备通过 WS 推送
      const currentDevices = await MfcApi.scanDevices(scanParams);

      updateState({ availableDevices: currentDevices });
      // 稍微延迟关闭扫描状态，提升体验
      setTimeout(() => updateState({ isScanning: false }), 1000);

    } catch (error) {
      handleApiError(error);
      updateState({ isScanning: false });
    }
  }, [state.isScanning, state.selected_port, updateState, clearError, handleApiError]);

  const setFlowRate = useCallback(async (address: number, sccm: number): Promise<void> => {
    try {
      setLoading(true);
      await MfcApi.setFlowRate(address, sccm);
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleApiError]);

  const setAllFlowRates = useCallback(async (settings: { address: number; sccm: number }[]): Promise<void> => {
    try {
      setLoading(true);
      await Promise.all(settings.map(s => MfcApi.setFlowRate(s.address, s.sccm)));
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, handleApiError]);

  // ==================== 历史数据 ====================

  const loadHistoryData = useCallback(async (address: number, params?: HistoryQueryParams): Promise<void> => {
    try {
      const finalParams = params || state.historyParams;
      const data = await MfcApi.getFlowHistory(address, finalParams);

      const newMap = new Map(state.historyData);
      newMap.set(address, data);
      updateState({ historyData: newMap, historyParams: finalParams });
    } catch (error) {
      handleApiError(error);
    }
  }, [state.historyData, state.historyParams, updateState, handleApiError]);

  const loadMultipleHistoryData = useCallback(async (addresses: number[], params?: HistoryQueryParams): Promise<void> => {
    try {
      const finalParams = params || state.historyParams;
      const dataMap = await MfcApi.getMultipleDevicesFlowHistory(addresses, finalParams);

      const newMap = new Map(state.historyData);
      Object.entries(dataMap).forEach(([k, v]) => newMap.set(parseInt(k), v));
      updateState({ historyData: newMap, historyParams: finalParams });
    } catch (error) {
      handleApiError(error);
    }
  }, [state.historyData, state.historyParams, updateState, handleApiError]);

  const updateHistoryParams = useCallback((params: Partial<HistoryQueryParams>) => {
    updateState({ historyParams: { ...state.historyParams, ...params } });
  }, [state.historyParams, updateState]);

  // ==================== 辅助查询 ====================

  const getDeviceByAddress = useCallback((address: number) => state.devices.find(d => d.address === address) || null, [state.devices]);
  const getDeviceStatus = useCallback((address: number) => state.deviceStatuses.get(address) || null, [state.deviceStatuses]);
  const getDeviceHistory = useCallback((address: number) => state.historyData.get(address) || [], [state.historyData]);

  const reset = useCallback(() => {
    setState({
      devices: [], availableDevices: [], deviceStatuses: new Map(),
      connection_status: 'disconnected', selected_port: '', available_ports: [],
      historyData: new Map(), historyParams: MfcApi.getDefaultHistoryParams(),
      isLoading: false, isScanning: false, error: null, lastUpdate: null, pollCount: 0,
    });
  }, []);

  const refresh = useCallback(async () => { refreshDevices(); }, [refreshDevices]);

  // ==================== WebSocket 事件处理 ====================

  // 此函数必须定义在 useEffect 之前，被 ensureConnection 使用
  const handleDeviceDiscovered = (discovered: MfcDeviceDiscovered) => {
    const d = discovered.data;
    setState(prev => {
      const newDevice: MfcDevice = {
        address: d.device_address,
        gas_type: d.gas_type,
        max_flow_sccm: d.max_flow_sccm,
        flow_sccm: 0, set_flow: 0, flow_percent: 0, digital_setpoint_percent: 0, active_setpoint_percent: 0,
        mode: 'follow', status: 'connected'
      };

      const devices = [...prev.devices];
      const idx = devices.findIndex(x => x.address === newDevice.address);
      if (idx >= 0) devices[idx] = newDevice; else devices.push(newDevice);

      return { ...prev, devices, lastUpdate: new Date() };
    });
  };

  const handleStatusUpdate = (update: MfcStatusUpdate) => {
    setState(prev => {
      const updatedDevices = prev.devices.map(device => {
        const statusData = update.data.find(d => d.device_address === device.address);
        if (!statusData) return device;

        const max = device.max_flow_sccm || 1;
        return {
          ...device,
          flow_sccm: statusData.flow_sccm,
          set_flow: statusData.setpoint_sccm,
          flow_percent: (statusData.flow_sccm / max) * 100,
          status: statusData.connection_status as any,
        };
      });
      return { ...prev, devices: updatedDevices, lastUpdate: new Date() };
    });
  };

  const handleConnected = () => {
    mfcWebSocketService.subscribeToMfc();
  };

  // 供 WebSocket Service 调用的辅助更新
  const updateSingleDeviceStatus = (address: number, data: any) => { };
  const updateFlowData = (address: number, data: any) => { };

  // 导出控制方法
  const controls: MfcControls = {
    ensureConnection, scanDevices, refreshDevices, connect, disconnect,
    get_available_ports, setFlowRate, setAllFlowRates,
    loadHistoryData, loadMultipleHistoryData, updateHistoryParams,
    getDeviceByAddress, getDeviceStatus, getDeviceHistory,
    reset, clearError, refresh, updateDeviceStatus: updateSingleDeviceStatus, updateFlowData
  };

  return [state, controls];
}

export default useMfc;