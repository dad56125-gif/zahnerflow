/**
 * 设备连接状态管理Hook
 */

import { useState, useCallback } from 'react';
import { ConnectionState, DeviceError } from '../../../types/devices';

export interface ConnectionStateData {
  connectionState: ConnectionState;
  isLoading: boolean;
  error: DeviceError | null;
}

export interface ConnectionControls {
  setConnectionState: (state: ConnectionState) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: DeviceError | null) => void;
  clearError: () => void;
  resetConnection: () => void;
}

export function useFurnaceConnection(): [ConnectionStateData, ConnectionControls] {
  const [state, setState] = useState<ConnectionStateData>({
    connectionState: {
      status: 'disconnected',
      reconnectAttempts: 0,
    },
    isLoading: false,
    error: null,
  });

  const setConnectionState = useCallback((connectionState: ConnectionState) => {
    setState(prev => ({ ...prev, connectionState }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: DeviceError | null) => {
    setState(prev => ({ ...prev, error, isLoading: false }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const resetConnection = useCallback(() => {
    setState({
      connectionState: {
        status: 'disconnected',
        reconnectAttempts: 0,
      },
      isLoading: false,
      error: null,
    });
  }, []);

  const controls: ConnectionControls = {
    setConnectionState,
    setLoading,
    setError,
    clearError,
    resetConnection,
  };

  return [state, controls];
}