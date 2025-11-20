/**
 * API 服务统一导出
 *
 * 提供所有API的统一入口，方便组件使用
 */

// 导出设备API类
export { FurnaceApi } from '../../modules/furnace/furnaceApi';
export { MfcApi } from '../../modules/mfc/mfcApi';

// 导出ZAHNER通信API
export { default as zahnerApi } from './zahnerApi';
export { apiHelpers } from './zahnerApi';

// 重新导出类型定义
export type {
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  MfcDeviceInfo,
  MfcStatus,
  FurnaceSample,
  MfcSample,
  CreatePresetRequest,
  ApplyPresetResult,
  MfcSetpointRequest,
  MfcScanRequest,
  HistoryQueryParams,
  ApiResponse,
  RateLimitResponse,
  DeviceError,
  MfcDevice,
  FurnaceStatus,
  DeviceConnectionStatus,
  DeviceOperationStatus,
  LoadingState,
  ErrorState,
  ConnectionState,
  DeviceCardProps,
  FurnaceControlProps,
  ProgramSegmentEditorProps,
  PresetManagerProps,
  ChartDataPoint,
  TemperatureChartData,
  FlowChartData,
  DeviceConfig,
  FurnaceConfig,
  MfcConfig,
} from '../../types/devices';

// 导出默认配置
export {
  DEFAULT_FURNACE_CONFIG,
  DEFAULT_MFC_CONFIG,
} from '../../types/devices';

/**
 * API 基础配置
 */
export const API_CONFIG = {
  BASE_URL: '/api',
  DEVICES: '/api/devices',
  FURNACE: '/api/devices/furnace',
  MFC: '/api/devices/mfc',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  POLLING_INTERVALS: {
    FURNACE_STATUS: 2000,
    MFC_STATUS: 1000,
    HISTORY_DATA: 30000,
  },
  RATE_LIMIT: {
    FURNACE_PRESET: 5000,
    MAX_HISTORY_LIMIT: 10000,
    MAX_DOWNSAMPLE: 3600,
  },
} as const;
