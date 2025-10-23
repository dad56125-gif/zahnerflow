/**
 * 设备状态管理Hook
 */

import { useState, useCallback } from 'react';
import { FurnaceStatus, DeviceOperationStatus } from '../../../types/devices';

export interface FurnaceStatusData {
  status: FurnaceStatus | null;
  operationState: DeviceOperationStatus;
  lastUpdate: Date | null;
  pollCount: number;
}

export interface FurnaceStatusControls {
  setStatus: (status: FurnaceStatus) => void;
  setOperationState: (state: DeviceOperationStatus) => void;
  updateStatus: (status: FurnaceStatus, operationState: DeviceOperationStatus) => void;
  incrementPollCount: () => void;
  resetStatus: () => void;
}

export function useFurnaceStatus(): [FurnaceStatusData, FurnaceStatusControls] {
  const [state, setState] = useState<FurnaceStatusData>({
    status: null,
    operationState: 'idle',
    lastUpdate: null,
    pollCount: 0,
  });

  const setStatus = useCallback((status: FurnaceStatus) => {
    setState(prev => ({
      ...prev,
      status,
      lastUpdate: new Date()
    }));
  }, []);

  const setOperationState = useCallback((operationState: DeviceOperationStatus) => {
    setState(prev => ({
      ...prev,
      operationState,
      lastUpdate: new Date()
    }));
  }, []);

  const updateStatus = useCallback((status: FurnaceStatus, operationState: DeviceOperationStatus) => {
    setState(prev => ({
      ...prev,
      status,
      operationState,
      lastUpdate: new Date(),
      pollCount: prev.pollCount + 1
    }));
  }, []);

  const incrementPollCount = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastUpdate: new Date(),
      pollCount: prev.pollCount + 1
    }));
  }, []);

  const resetStatus = useCallback(() => {
    setState({
      status: null,
      operationState: 'idle',
      lastUpdate: null,
      pollCount: 0,
    });
  }, []);

  const controls: FurnaceStatusControls = {
    setStatus,
    setOperationState,
    updateStatus,
    incrementPollCount,
    resetStatus,
  };

  return [state, controls];
}