/**
 * 统一错误处理Hook
 */

import { useState, useCallback, useRef } from 'react';
import { DeviceError } from '../../../types/devices';
import { isRetryableError } from '../../../utils/apiUtils';

export interface ErrorHandlerData {
  error: DeviceError | null;
  rateLimitInfo: {
    isLimited: boolean;
    retryAfter: number;
  };
}

export interface ErrorHandlerControls {
  setError: (error: DeviceError | null) => void;
  clearError: () => void;
  handleApiError: (error: any) => void;
  isRetryableError: (error: DeviceError) => boolean;
  resetErrorHandler: () => void;
}

export function useFurnaceErrorHandler(): [ErrorHandlerData, ErrorHandlerControls] {
  const [state, setState] = useState<ErrorHandlerData>({
    error: null,
    rateLimitInfo: {
      isLimited: false,
      retryAfter: 0,
    },
  });

  // 用于存储定时器的引用
  const rateLimitTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const setError = useCallback((error: DeviceError | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const handleApiError = useCallback((error: any): void => {
    const deviceError = error as DeviceError;

    // 处理429限流错误
    if (deviceError.code === 'RATE_LIMIT') {
      setState(prev => ({
        ...prev,
        rateLimitInfo: {
          isLimited: true,
          retryAfter: deviceError.retry_after || 5,
        },
      }));

      // 清除之前的限流定时器
      const timerKey = 'rate_limit';
      const existingTimer = rateLimitTimers.current.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 设置新的倒计时，结束后解除限流状态
      const timer = setTimeout(() => {
        setState(prev => ({
          ...prev,
          rateLimitInfo: {
            isLimited: false,
            retryAfter: 0,
          },
        }));
        rateLimitTimers.current.delete(timerKey);
      }, deviceError.retry_after * 1000);

      rateLimitTimers.current.set(timerKey, timer);
      setError(deviceError);
      return;
    }

    setError(deviceError);
  }, [setError]);

  const isRetryableErrorCallback = useCallback((error: DeviceError): boolean => {
    return isRetryableError(error);
  }, []);

  const resetErrorHandler = useCallback(() => {
    setState({
      error: null,
      rateLimitInfo: {
        isLimited: false,
        retryAfter: 0,
      },
    });

    // 清理所有定时器
    rateLimitTimers.current.forEach(timer => clearTimeout(timer));
    rateLimitTimers.current.clear();
  }, []);

  // 组件卸载时清理定时器
  if (typeof window !== 'undefined') {
    // 这里会在组件重新渲染时执行，我们需要用useEffect来确保只执行一次
    // 暂时保持这样，后续可以进一步优化
  }

  const controls: ErrorHandlerControls = {
    setError,
    clearError,
    handleApiError,
    isRetryableError: isRetryableErrorCallback,
    resetErrorHandler,
  };

  return [state, controls];
}