import { registerWorkspaceParticipant } from '../../tutorialEnvironment';
/**
 * MFC 状态管理 Hook
 * 
 * 提供质量流量控制器的状态管理，包括连接、设备发现、流量控制等功能
 */

import { useLayoutEffect, useState, useCallback, useEffect, useRef } from 'react';
import { runtimeClient } from '../../runtimeClient';
import type { DeviceError, DeviceConnectionStatus, HistoryQueryParams, LogEntry } from '@zahnerflow/types';
import type { CommandLogEntry, DeviceDiagnostics } from '../../components/common/DeviceDiagnosticsPanel';
import type { RuntimeDeviceState, RuntimeDeviceStatusEnvelope } from '@zahnerflow/types';
import { useRuntimeDeviceStatusSubscription } from '../common/useRuntimeDeviceStatusSubscription';
import {
  MfcDeviceInfo,
  MfcStatus,
  MfcDevice,
  MfcSample,
  MfcScanRequest,
} from './mfcTypes';

type RuntimeMfcDeviceStatus = {
  address: number;
  flowSccm?: number;
  flowPercent?: number;
  setpointSccm?: number;
  digitalSetpointPercent?: number;
  activeSetpointPercent?: number;
  gasType?: string;
  maxFlowSccm?: number;
  name?: string;
  port?: string | null;
  connectionStatus?: 'connected' | 'disconnected' | 'warning' | 'error';
};

type MfcScanParams = MfcScanRequest & { address?: number };

const getDefaultHistoryParams = (): HistoryQueryParams => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return {
    from: oneHourAgo.toISOString(),
    to: now.toISOString(),
    limit: 1000,
    downsample: 10,
  };
};

const toBackendHistoryParams = (address: number, params: HistoryQueryParams): Record<string, string | number | undefined> => ({
  address,
  from_ts: params.from ?? undefined,
  to: params.to ?? undefined,
  limit: params.limit ?? undefined,
  downsample: params.downsample ?? undefined,
});

const toMfcDevice = (
  statusData: RuntimeMfcDeviceStatus,
  existing?: MfcDevice,
  forcedStatus?: MfcDevice['status'],
): MfcDevice => {
  const maxFlowSccm = statusData.maxFlowSccm ?? existing?.maxFlowSccm ?? 0;
  const activeSetpointPercent = statusData.activeSetpointPercent ?? existing?.activeSetpointPercent ?? 0;
  const setFlow = statusData.setpointSccm ?? existing?.setFlow ?? (maxFlowSccm * activeSetpointPercent / 100);
  return {
    address: statusData.address,
    gasType: statusData.gasType ?? existing?.gasType ?? 'Unknown',
    maxFlowSccm,
    name: statusData.name ?? existing?.name ?? 'MFC',
    port: statusData.port ?? existing?.port,
    timeout: existing?.timeout,
    pollingInterval: existing?.pollingInterval,
    flowSccm: statusData.flowSccm ?? existing?.flowSccm ?? 0,
    setFlow,
    flowPercent: statusData.flowPercent ?? (maxFlowSccm ? ((statusData.flowSccm ?? 0) / maxFlowSccm) * 100 : 0),
    digitalSetpointPercent: statusData.digitalSetpointPercent ?? existing?.digitalSetpointPercent ?? activeSetpointPercent,
    activeSetpointPercent,
    mode: existing?.mode ?? 'follow',
    status: forcedStatus ?? statusData.connectionStatus ?? existing?.status ?? 'disconnected',
  };
};

const toMfcDeviceInfo = (device: MfcDevice): MfcDeviceInfo => ({
  address: device.address,
  gasType: device.gasType,
  maxFlowSccm: device.maxFlowSccm,
  name: device.name,
  port: device.port,
  timeout: device.timeout,
  pollingInterval: device.pollingInterval,
});

// ==================== 状态类型 ====================

export interface MfcState {
  devices: MfcDevice[];
  availableDevices: MfcDeviceInfo[];
  deviceStatuses: Map<number, MfcStatus>;
  connection_status: DeviceConnectionStatus;
  runtime_state: RuntimeDeviceState | null;
  selected_port: string;
  available_ports: string[];
  historyData: Map<number, MfcSample[]>;
  historyParams: HistoryQueryParams;
  isLoading: boolean;
  isScanning: boolean;
  isScanStopping: boolean;
  error: DeviceError | null;
  lastUpdate: Date | null;
  pollCount: number;
  loading: boolean;
  logs: LogEntry[];
  diagnostics: DeviceDiagnostics;
  commandLogs: CommandLogEntry[];
  scanProgress: { current: number; start: number; end: number; percent: number; foundCount: number } | null;
}

export interface MfcControls {
  ensureConnection: () => void;
  scanDevices: (params?: MfcScanRequest) => Promise<void>;
  stopScan: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  selectPort: (port: string) => void;
  connect: (port?: string, baudrate?: number, timeout?: number, simulatorProfile?: string) => Promise<void>;
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
  clearLogs: () => void;
  loadCommandLogs: () => Promise<void>;
  clearCommandLogs: () => Promise<void>;
}

// ==================== 初始状态 ====================

const createInitialState = (): MfcState => ({
  devices: [],
  availableDevices: [],
  deviceStatuses: new Map(),
  connection_status: 'disconnected',
  runtime_state: null,
  selected_port: '',
  available_ports: [],
  historyData: new Map(),
  historyParams: getDefaultHistoryParams(),
  isLoading: false,
  isScanning: false,
  isScanStopping: false,
  error: null,
  lastUpdate: null,
  pollCount: 0,
  loading: false,
  logs: [],
  diagnostics: { mode: 'disconnected' },
  commandLogs: [],
  scanProgress: null,
});

// ==================== Hook 实现 ====================

export function useMfc(): [MfcState, MfcControls] {
  const [state, setState] = useState<MfcState>(createInitialState);
  const scanStopRequestedRef = useRef(false);
  const lastRuntimeStateVersionRef = useRef(0);
  const connectionAttemptIdRef = useRef(0);
  const connectInFlightRef = useRef(false);
  const scanRunIdRef = useRef(0);
  const commandLogsRequestIdRef = useRef(0);
  const loadingOwnerIdRef = useRef(0);
  const loadingOwnersRef = useRef<Set<number>>(new Set());
  const stateRef = useRef(state);
  stateRef.current = state;
  const invalidateAsyncRequests = useCallback(() => {
    connectionAttemptIdRef.current += 1;
    connectInFlightRef.current = false;
    scanRunIdRef.current += 1;
    commandLogsRequestIdRef.current += 1;
    scanStopRequestedRef.current = false;
    loadingOwnersRef.current.clear();
  }, []);
  useLayoutEffect(() => registerWorkspaceParticipant(() => {
    const previous = stateRef.current;
    const version = lastRuntimeStateVersionRef.current;
    lastRuntimeStateVersionRef.current = 0;
    invalidateAsyncRequests();
    setState(createInitialState());
    return () => {
      lastRuntimeStateVersionRef.current = version;
      invalidateAsyncRequests();
      setState({
        ...previous,
        loading: false,
        isLoading: false,
        isScanning: false,
        isScanStopping: false,
        scanProgress: null,
      });
    };
  }), [invalidateAsyncRequests]);


  // 状态更新辅助函数
  const updateState = useCallback((updates: Partial<MfcState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const beginLoading = useCallback(() => {
    const ownerId = loadingOwnerIdRef.current + 1;
    loadingOwnerIdRef.current = ownerId;
    loadingOwnersRef.current.add(ownerId);
    updateState({ loading: true, isLoading: true });
    return ownerId;
  }, [updateState]);

  const endLoading = useCallback((ownerId: number) => {
    if (!loadingOwnersRef.current.has(ownerId)) return;
    loadingOwnersRef.current.delete(ownerId);
    if (loadingOwnersRef.current.size === 0) {
      updateState({ loading: false, isLoading: false });
    }
  }, [updateState]);

  const clearError = useCallback(() => updateState({ error: null }), [updateState]);

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

  const clearLogs = useCallback(() => updateState({ logs: [] }), [updateState]);

  const loadCommandLogs = useCallback(async () => {
    const requestId = commandLogsRequestIdRef.current + 1;
    commandLogsRequestIdRef.current = requestId;
    const response = await runtimeClient.devices.mfc.commandLogs<{ logs: CommandLogEntry[] }>();
    if (requestId !== commandLogsRequestIdRef.current) return;
    updateState({ commandLogs: response.logs || [] });
  }, [updateState]);

  const clearCommandLogs = useCallback(async () => {
    const requestId = commandLogsRequestIdRef.current + 1;
    commandLogsRequestIdRef.current = requestId;
    await runtimeClient.devices.mfc.clearCommandLogs();
    if (requestId !== commandLogsRequestIdRef.current) return;
    updateState({ commandLogs: [] });
  }, [updateState]);

  const handleError = useCallback(
    (error: unknown) => {
      const deviceError: DeviceError =
        error && typeof error === 'object' && 'message' in error
          ? (error as DeviceError)
          : { code: 'UNKNOWN', message: String(error), status: 0 };
      updateState({ error: deviceError });
      addLog('error', deviceError.message);
    },
    [updateState, addLog]
  );

  // ==================== 端口与设备发现 ====================

  const get_available_ports = useCallback(async (): Promise<string[]> => {
    const lifecycleToken = connectionAttemptIdRef.current;
    try {
      const ports = await runtimeClient.devices.mfc.ports();
      if (lifecycleToken !== connectionAttemptIdRef.current) return ports;
      updateState({ available_ports: ports });
      return ports;
    } catch (error) {
      if (lifecycleToken !== connectionAttemptIdRef.current) return [];
      handleError(error);
      return [];
    }
  }, [updateState, handleError]);

  // ==================== WebSocket 事件处理 ====================

  const handleRuntimeStatusUpdate = useCallback((envelope: RuntimeDeviceStatusEnvelope) => {
    const version = Number(envelope.stateVersion ?? envelope.runtimeState?.stateVersion ?? 0);
    if (version > 0 && version < lastRuntimeStateVersionRef.current) return;
    if (version > 0) lastRuntimeStateVersionRef.current = version;
    const statusDevices = Array.isArray(envelope.payload?.devices)
      ? envelope.payload.devices as RuntimeMfcDeviceStatus[]
      : [];

    setState((prev) => {
      const runtimeConnectionStatus = envelope.runtimeState?.connectionStatus
        ?? envelope.connectionState?.status;
      const isCommunicationError = runtimeConnectionStatus === 'communication_error';
      const connectionStatus = (isCommunicationError ? 'error' : runtimeConnectionStatus) as DeviceConnectionStatus
        ?? (envelope.connected ? 'connected' : 'disconnected');
      const connectedPort = typeof envelope.connectionState?.port === 'string'
        ? envelope.connectionState.port
        : (envelope.runtimeState?.connectedPort ?? '');
      const previousByAddress = new Map(prev.devices.map((device) => [device.address, device]));
      const updatedDevices = statusDevices.map((device) =>
        toMfcDevice(device, previousByAddress.get(device.address), isCommunicationError ? 'error' : undefined)
      );
      // 通信错误时以 backend payload 的设备快照为准：后端会显式保留 scannedDevices 并标 error，
      // 明确返回空快照即为当前真相，不得回退 prev.devices 复活旧设备。
      const runtimeDevices = isCommunicationError
        ? updatedDevices.map((device) => ({
          ...device,
          status: 'error' as const,
        }))
        : (envelope.connected ? updatedDevices : []);
      const availableDevices = runtimeDevices.map(toMfcDeviceInfo);
      return {
        ...prev,
        connection_status: connectionStatus,
        runtime_state: envelope.runtimeState ?? prev.runtime_state,
        selected_port: connectedPort || prev.selected_port,
        devices: runtimeDevices,
        availableDevices,
        diagnostics: {
          ...(envelope.diagnostics || {}),
          mode: envelope.mode,
          profile: envelope.profile ?? envelope.connectionState?.profile,
        },
        lastUpdate: new Date(),
      };
    });
  }, []);

  const refreshDevices = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    const lifecycleToken = connectionAttemptIdRef.current;
    const loadingOwner = options?.silent ? null : beginLoading();
    try {
      const status = await runtimeClient.devices.mfc.runtimeStatus();
      if (lifecycleToken !== connectionAttemptIdRef.current) return;
      handleRuntimeStatusUpdate(status);
    } catch (error) {
      if (lifecycleToken !== connectionAttemptIdRef.current) return;
      handleError(error);
    } finally {
      if (loadingOwner !== null) endLoading(loadingOwner);
    }
  }, [beginLoading, endLoading, handleError, handleRuntimeStatusUpdate]);

  const reloadRuntimeStatus = useCallback(async () => {
    const lifecycleToken = connectionAttemptIdRef.current;
    try {
      const status = await runtimeClient.devices.mfc.runtimeStatus();
      if (lifecycleToken !== connectionAttemptIdRef.current) return;
      handleRuntimeStatusUpdate(status);
    } catch {
      // Socket 重连期间没有完整快照时，不由前端猜测设备已经断开。
    }
  }, [handleRuntimeStatusUpdate]);

  const ensureRuntimeStatusSubscription = useRuntimeDeviceStatusSubscription(
    'mfc',
    handleRuntimeStatusUpdate,
    reloadRuntimeStatus,
  );

  useEffect(() => {
    ensureRuntimeStatusSubscription();
    reloadRuntimeStatus();
  }, [ensureRuntimeStatusSubscription, reloadRuntimeStatus]);

  // ==================== 智能初始化 ====================

  const ensureConnection = useCallback(async () => {
    ensureRuntimeStatusSubscription();
    const lifecycleToken = connectionAttemptIdRef.current;

    try {
      const statusData = await runtimeClient.devices.mfc.runtimeStatus();
      if (lifecycleToken !== connectionAttemptIdRef.current) return;
      handleRuntimeStatusUpdate(statusData);

      if (statusData.connected) {
        const statusDevices = Array.isArray(statusData.payload?.devices) ? statusData.payload.devices : [];
        if (statusData.deviceCount > 0 && statusDevices.length === 0) {
          await refreshDevices({ silent: true });
        }
      } else {
        await get_available_ports();
      }
    } catch (error) {
      console.warn('设备运行时状态同步失败:', error);
      await get_available_ports();
    }
  }, [get_available_ports, refreshDevices, handleRuntimeStatusUpdate, ensureRuntimeStatusSubscription]);

  // ==================== 连接与断开 ====================

  const selectPort = useCallback((port: string) => {
    updateState({ selected_port: port });
  }, [updateState]);

  const runDeviceScan = useCallback(
    async (
      params: MfcScanRequest = {},
      lifecycleToken: number = connectionAttemptIdRef.current,
    ): Promise<{ devices: MfcDeviceInfo[]; cancelled: boolean } | null> => {
      if (state.isScanning) return null;

      const scanRunId = scanRunIdRef.current + 1;
      scanRunIdRef.current = scanRunId;
      const scanParams = params as MfcScanParams;
      const requestedAddress = scanParams.address;
      const rawStart = requestedAddress ?? scanParams.startAddress ?? 32;
      const rawEnd = requestedAddress ?? scanParams.endAddress ?? 80;
      const start = Math.min(rawStart, rawEnd);
      const end = Math.max(rawStart, rawEnd);
      const total = end - start + 1;
      const port = scanParams.port || state.selected_port;
      let currentDevices: MfcDeviceInfo[] = [];

      scanStopRequestedRef.current = false;
      updateState({
        isScanning: true,
        isScanStopping: false,
        devices: [],
        availableDevices: [],
        scanProgress: { current: start, start, end, percent: 0, foundCount: 0 },
      });

      const isCurrentScan = () => (
        scanRunId === scanRunIdRef.current
        && lifecycleToken === connectionAttemptIdRef.current
      );

      try {
        for (let address = start; address <= end; address += 1) {
          if (!isCurrentScan() || scanStopRequestedRef.current) break;

          const completedBefore = address - start;
          updateState({
            scanProgress: {
              current: address,
              start,
              end,
              percent: Math.round((completedBefore / total) * 100),
              foundCount: currentDevices.length,
            },
          });

          const scannedDevices = await runtimeClient.devices.mfc.scan<MfcDeviceInfo[]>({
            ...scanParams,
            port,
            address,
            scanStartAddress: start,
            scanEndAddress: end,
          });
          if (!isCurrentScan()) break;
          // 后端路由返回的是当前扫描 session 的完整快照；前端只镜像本次返回，
          // 不再把多个响应重新累加成第二份设备集合。
          currentDevices = Array.isArray(scannedDevices) ? scannedDevices : [];
          updateState({
            availableDevices: currentDevices,
            devices: currentDevices.map((device) => toMfcDevice(device)),
            scanProgress: {
              current: address,
              start,
              end,
              percent: Math.round(((completedBefore + 1) / total) * 100),
              foundCount: currentDevices.length,
            },
          });
        }

        return { devices: currentDevices, cancelled: !isCurrentScan() || scanStopRequestedRef.current };
      } finally {
        if (isCurrentScan()) {
          scanStopRequestedRef.current = false;
          updateState({ isScanning: false, isScanStopping: false, scanProgress: null });
        }
      }
    },
    [state.isScanning, state.selected_port, updateState]
  );

  const connect = useCallback(
    async (port: string = 'COM1', baudrate: number = 19200, timeout: number = 1.0, simulatorProfile?: string): Promise<void> => {
      if (connectInFlightRef.current) return;
      const requestId = connectionAttemptIdRef.current + 1;
      connectionAttemptIdRef.current = requestId;
      connectInFlightRef.current = true;
      const loadingOwner = beginLoading();
      try {
        clearError();
        updateState({ selected_port: port, connection_status: 'connecting' });
        ensureRuntimeStatusSubscription();

        const response = await runtimeClient.devices.mfc.connect<{
          runtimeStatus?: RuntimeDeviceStatusEnvelope;
        }>({ port, baudrate, timeout, ...(simulatorProfile && { simulatorProfile }) });
        if (requestId !== connectionAttemptIdRef.current) return;
        if (response?.runtimeStatus) handleRuntimeStatusUpdate(response.runtimeStatus);
        addLog('success', `Connected to ${port}`);

        // 连接成功后自动扫描设备
        const scanResult = await runDeviceScan({ port }, requestId);
        if (requestId !== connectionAttemptIdRef.current) return;
        if (scanResult) {
          addLog(
            scanResult.cancelled ? 'warning' : (scanResult.devices.length > 0 ? 'success' : 'warning'),
            scanResult.cancelled
              ? `Scan stopped; found ${scanResult.devices.length} MFC device(s)`
              : `Scanned ${scanResult.devices.length} MFC device(s)`
          );
        }
        await loadCommandLogs().catch(() => undefined);
      } catch (error) {
        if (requestId !== connectionAttemptIdRef.current) return;
        handleError(error);
        // 连接状态由后端 runtime 快照决定；错误路径只保留错误提示，并重新
        // hydrate 一次，避免这里生成第二个“前端连接状态”。
        await reloadRuntimeStatus().catch(() => undefined);
        if (requestId !== connectionAttemptIdRef.current) return;
        updateState({ isScanning: false });
        void get_available_ports();
        throw error;
      } finally {
        if (requestId === connectionAttemptIdRef.current) connectInFlightRef.current = false;
        endLoading(loadingOwner);
      }
    },
    [beginLoading, endLoading, clearError, handleError, updateState, get_available_ports, ensureRuntimeStatusSubscription, addLog, loadCommandLogs, runDeviceScan, handleRuntimeStatusUpdate, reloadRuntimeStatus]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    invalidateAsyncRequests();
    const requestId = connectionAttemptIdRef.current;
    updateState({ isScanning: false, isScanStopping: false, scanProgress: null });
    const loadingOwner = beginLoading();
    try {
      const response = await runtimeClient.devices.mfc.disconnectDevice<{
        runtimeStatus?: RuntimeDeviceStatusEnvelope;
      }>();
      if (requestId !== connectionAttemptIdRef.current) return;
      if (response?.runtimeStatus) handleRuntimeStatusUpdate(response.runtimeStatus);
      addLog('info', 'Disconnected');
      await get_available_ports();
      await loadCommandLogs().catch(() => undefined);
    } catch (error) {
      if (requestId !== connectionAttemptIdRef.current) return;
      handleError(error);
      throw error;
    } finally {
      endLoading(loadingOwner);
    }
  }, [invalidateAsyncRequests, updateState, beginLoading, endLoading, handleError, get_available_ports, addLog, loadCommandLogs, handleRuntimeStatusUpdate]);

  // ==================== 扫描与控制 ====================

  const scanDevices = useCallback(
    async (params: MfcScanRequest = {}): Promise<void> => {
      if (state.isScanning) return;
      const lifecycleToken = connectionAttemptIdRef.current;

      try {
        clearError();

        const scanResult = await runDeviceScan(
          { ...params, port: params.port || state.selected_port },
          lifecycleToken,
        );
        if (!scanResult || lifecycleToken !== connectionAttemptIdRef.current) return;
        addLog(
          scanResult.cancelled ? 'warning' : (scanResult.devices.length > 0 ? 'success' : 'warning'),
          scanResult.cancelled
            ? `Scan stopped; found ${scanResult.devices.length} MFC device(s)`
            : `Scanned ${scanResult.devices.length} MFC device(s)`
        );
        await loadCommandLogs().catch(() => undefined);
      } catch (error) {
        if (lifecycleToken !== connectionAttemptIdRef.current) return;
        handleError(error);
      }
    },
    [state.isScanning, state.selected_port, clearError, handleError, addLog, loadCommandLogs, runDeviceScan]
  );

  const stopScan = useCallback(async (): Promise<void> => {
    if (!state.isScanning || state.isScanStopping) return;
    const lifecycleToken = connectionAttemptIdRef.current;

    scanStopRequestedRef.current = true;
    updateState({ isScanStopping: true });
    addLog('warning', 'Stopping MFC scan after the current address');

    await runtimeClient.devices.mfc.stopScan().catch(() => undefined);
    if (lifecycleToken === connectionAttemptIdRef.current) {
      await loadCommandLogs().catch(() => undefined);
    }
  }, [state.isScanning, state.isScanStopping, updateState, addLog, loadCommandLogs]);

  const setFlowRate = useCallback(
    async (address: number, sccm: number): Promise<void> => {
      const lifecycleToken = connectionAttemptIdRef.current;
      await runtimeClient.devices.mfc.setpoint({ address, sccm });
      if (lifecycleToken !== connectionAttemptIdRef.current) return;
      addLog('success', `Set MFC ${address} to ${sccm} sccm`);
      await loadCommandLogs().catch(() => undefined);
    },
    [addLog, loadCommandLogs]
  );

  const setAllFlowRates = useCallback(
    async (settings: { address: number; sccm: number }[]): Promise<void> => {
      const lifecycleToken = connectionAttemptIdRef.current;
      const loadingOwner = beginLoading();
      try {
        await Promise.all(settings.map((s) => runtimeClient.devices.mfc.setpoint({ address: s.address, sccm: s.sccm })));
        if (lifecycleToken !== connectionAttemptIdRef.current) return;
        addLog('success', `Set ${settings.length} MFC flow rates`);
        await loadCommandLogs().catch(() => undefined);
      } catch (error) {
        if (lifecycleToken !== connectionAttemptIdRef.current) return;
        handleError(error);
      } finally {
        endLoading(loadingOwner);
      }
    },
    [beginLoading, endLoading, handleError, addLog, loadCommandLogs]
  );

  // ==================== 历史数据 ====================

  const loadHistoryData = useCallback(
    async (address: number, params?: HistoryQueryParams): Promise<void> => {
      try {
        const finalParams = params || state.historyParams;
        const response = await runtimeClient.devices.mfc.flowLogs<{ samples: MfcSample[] }>(
          toBackendHistoryParams(address, finalParams)
        );
        const data = response.samples;

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
        const entries = await Promise.all(
          addresses.map(async (address) => {
            try {
              const response = await runtimeClient.devices.mfc.flowLogs<{ samples: MfcSample[] }>(
                toBackendHistoryParams(address, finalParams)
              );
              return [address, response.samples] as const;
            } catch {
              return [address, [] as MfcSample[]] as const;
            }
          })
        );

        const newMap = new Map(state.historyData);
        entries.forEach(([address, samples]) => newMap.set(address, samples));
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

  const reset = useCallback(() => {
    invalidateAsyncRequests();
    setState(createInitialState());
  }, [invalidateAsyncRequests]);
  const refresh = useCallback(async () => refreshDevices(), [refreshDevices]);

  // 占位符函数（兼容性）
  const updateDeviceStatus = useCallback((_address: number, _data: unknown) => { }, []);
  const updateFlowData = useCallback((_address: number, _data: unknown) => { }, []);

  // ==================== 导出 ====================

  const controls: MfcControls = {
    ensureConnection,
    scanDevices,
    stopScan,
    refreshDevices,
    selectPort,
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
    clearLogs,
    loadCommandLogs,
    clearCommandLogs,
  };

  return [state, controls];
}

export default useMfc;
