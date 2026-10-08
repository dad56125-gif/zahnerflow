import type { DeviceError } from './furnaceTypes';

export const toFurnaceDeviceError = (
  error: unknown,
  fallbackMessage = '未知错误',
): DeviceError => {
  if (error && typeof error === 'object' && 'message' in error) {
    const deviceError = error as DeviceError;
    return {
      ...deviceError,
      message: deviceError.message || fallbackMessage,
    };
  }

  return {
    code: 'UNKNOWN',
    message: typeof error === 'string' && error ? error : fallbackMessage,
    status: 0,
  };
};
