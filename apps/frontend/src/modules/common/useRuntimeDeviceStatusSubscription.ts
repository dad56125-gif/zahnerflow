import { useCallback, useEffect, useRef } from 'react';
import type { RuntimeDeviceKind, RuntimeDeviceStatusEnvelope } from '@zahnerflow/types';
import { runtimeSocket } from '../../runtimeClient';

type RuntimeDeviceStatusHandler = (status: RuntimeDeviceStatusEnvelope) => void;

export function useRuntimeDeviceStatusSubscription(
  device: RuntimeDeviceKind,
  onStatus: RuntimeDeviceStatusHandler
): () => void {
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const handleStatus = useCallback(
    (status: RuntimeDeviceStatusEnvelope) => {
      if (status.device === device) {
        onStatus(status);
      }
    },
    [device, onStatus]
  );

  const ensureSubscribed = useCallback(() => {
    if (unsubscribeRef.current) return;
    unsubscribeRef.current = runtimeSocket.onDeviceStatus(handleStatus);
  }, [handleStatus]);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  return ensureSubscribed;
}
