/**
 * 智能轮询管理Hook
 * 整合状态轮询和实时采样，避免重复的API调用
 */

import { useCallback, useEffect, useRef } from 'react';
import { useConditionalPolling } from '../usePolling';
import { FurnaceApi } from '../../../api';
import { FurnaceStatus, DeviceError, ConnectionState, DEFAULT_FURNACE_CONFIG } from '../../../types/devices';

export interface FurnacePollingData {
  isPolling: boolean;
  lastPollTime: Date | null;
  pollError: DeviceError | null;
}

export interface FurnacePollingControls {
  startPolling: () => void;
  stopPolling: () => void;
  refreshPolling: () => Promise<void>;
  clearPollError: () => void;
}

interface UseFurnacePollingOptions {
  connectionState: ConnectionState;
  onStatusUpdate: (status: FurnaceStatus, operationState: DeviceOperationStatus) => void;
  onSampleAdd: (sample: any) => void;
  onError: (error: any) => void;
}

export function useFurnacePolling({
  connectionState,
  onStatusUpdate,
  onSampleAdd,
  onError
}: UseFurnacePolling): [FurnacePollingData, FurnacePollingControls] {
  const samplingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [, statusControls] = useConditionalPolling(
    async () => {
      try {
        const status = await FurnaceApi.getStatus();
        const rawStatus = String(status?.status ?? '').toLowerCase();
        const displayStatus =
          rawStatus === 'pause' || rawStatus === 'hold' ? 'hold' :
          rawStatus === 'paused' ? 'hold' :
          rawStatus === 'run' ? 'run' :
          rawStatus === 'running' ? 'run' :
          rawStatus === 'stop' ? 'stop' :
          rawStatus === 'stopped' ? 'stop' :
          rawStatus || 'unknown';

        // 数据验证和默认值处理
        const validatedStatus: FurnaceStatus = {
          pv: status?.pv ?? 0,
          sv: status?.sv ?? 0,
          mv: status?.mv ?? 0,
          status: displayStatus,
          segment: status?.segment ?? 0,
          segment_time: status?.segment_time ?? 0,
          segment_time_set: status?.segment_time_set ?? 0,
        };

        const derivedOperationState: DeviceOperationStatus =
          rawStatus === 'run' || rawStatus === 'running' ? 'running' :
          rawStatus === 'pause' || rawStatus === 'paused' || rawStatus === 'hold' ? 'paused' :
          rawStatus === 'stop' || rawStatus === 'stopped' ? 'stopped' :
          (() => {
            console.warn(`[Furnace] 未知状态: "${rawStatus}"，按停止处理`);
            return 'stopped' as DeviceOperationStatus;
          })();

        onStatusUpdate(validatedStatus, derivedOperationState);
        return validatedStatus;
      } catch (error) {
        onError(error);
        throw error;
      }
    },
    () => connectionState.status === 'connected',
    DEFAULT_FURNACE_CONFIG.polling_interval,
    {
      immediate: true,
      onlyWhenVisible: true,
      maxRetries: DEFAULT_FURNACE_CONFIG.retry_attempts,
      retryDelay: DEFAULT_FURNACE_CONFIG.retry_delay,
      onError,
    }
  );

  // 实时采样 - 只在连接状态下运行，与主轮询错开
  useEffect(() => {
    if (connectionState.status !== 'connected') {
      return;
    }
    let alive = true;

    // 清除之前的采样定时器
    if (samplingTimerRef.current) {
      clearInterval(samplingTimerRef.current);
    }

    // 使用更长的采样间隔，避免与主轮询冲突
    const samplingInterval = DEFAULT_FURNACE_CONFIG.polling_interval * 2;

    samplingTimerRef.current = setInterval(async () => {
      try {
        const s = await FurnaceApi.getStatus();
        if (!alive) return;

        const sample = {
          timestamp: new Date().toISOString(),
          temperature: (s?.pv as number) ?? 0,
          sv: (s?.sv as number) ?? 0,
          mv: (s?.mv as number) ?? 0,
        };

        onSampleAdd(sample);
      } catch (e) {
        // 静默处理实时轮询错误，避免打断 UI
      }
    }, samplingInterval);

    return () => {
      alive = false;
      if (samplingTimerRef.current) {
        clearInterval(samplingTimerRef.current);
        samplingTimerRef.current = null;
      }
    };
  }, [connectionState.status, onSampleAdd]);

  const clearPollError = useCallback(() => {
    // 这个函数会被外部状态管理调用
  }, []);

  const controls: FurnacePollingControls = {
    startPolling: statusControls.start,
    stopPolling: statusControls.stop,
    refreshPolling: statusControls.refresh,
    clearPollError,
  };

  const pollingData: FurnacePollingData = {
    isPolling: connectionState.status === 'connected',
    lastPollTime: new Date(), // 这里应该从statusControls获取，但接口不支持
    pollError: null,
  };

  return [pollingData, controls];
}