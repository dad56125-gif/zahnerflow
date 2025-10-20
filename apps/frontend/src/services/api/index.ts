/**
 * API 服务统一导出
 *
 * 提供所有API的统一入口，方便组件使用
 */

// 导出设备API类
export { FurnaceApi } from './furnaceApi';
export { MfcApi } from './mfcApi';

// 导出ZAHNER通信API
export { default as zahnerApi } from './zahnerApi';
export { apiHelpers } from './zahnerApi';

// 导出默认实例（可选，为了方便使用）
import { FurnaceApi } from './furnaceApi';
import { MfcApi } from './mfcApi';
import zahnerApiImport from './zahnerApi';

export default {
  furnace: FurnaceApi,
  mfc: MfcApi,
  zahner: zahnerApiImport,
};

// 重新导出类型定义
export type {
  // 基础类型
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  MfcDeviceInfo,
  MfcStatus,
  FurnaceSample,
  MfcSample,

  // 请求类型
  CreatePresetRequest,
  ApplyPresetResult,
  MfcSetpointRequest,
  MfcScanRequest,
  HistoryQueryParams,

  // 响应类型
  ApiResponse,
  RateLimitResponse,

  // 错误类型
  DeviceError,

  // 前端扩展类型
  MfcDevice,
  FurnaceStatus,

  // 状态类型
  DeviceConnectionStatus,
  DeviceOperationStatus,

  // UI状态类型
  LoadingState,
  ErrorState,
  ConnectionState,

  // 组件Props类型
  DeviceCardProps,
  FurnaceControlProps,
  ProgramSegmentEditorProps,
  PresetManagerProps,

  // 图表类型
  ChartDataPoint,
  TemperatureChartData,
  FlowChartData,

  // 配置类型
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

  // 请求配置
  TIMEOUT: 10000, // 10秒超时
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // 轮询配置
  POLLING_INTERVALS: {
    FURNACE_STATUS: 2000,  // 2秒
    MFC_STATUS: 3000,      // 3秒
    HISTORY_DATA: 30000,   // 30秒
  },

  // 限制配置
  RATE_LIMIT: {
    FURNACE_PRESET: 5000,  // 5秒
    MAX_HISTORY_LIMIT: 10000,
    MAX_DOWNSAMPLE: 3600,   // 1小时
  },
} as const;

/**
 * 常用API方法快速访问
 */
export const api = {
  // Furnace 快速访问
  furnace: {
    getStatus: FurnaceApi.getStatus,
    setTemperature: FurnaceApi.setTemperature,
    setSegment: FurnaceApi.setSegment,
    connect: FurnaceApi.connect,
    disconnect: FurnaceApi.disconnect,
    run: FurnaceApi.run,
    pause: FurnaceApi.pause,
    stop: FurnaceApi.stop,
    getProgramSegments: FurnaceApi.getProgramSegments,
    writeProgramSegments: FurnaceApi.writeProgramSegments,
    getPresets: FurnaceApi.getPresets,
    createPreset: FurnaceApi.createPreset,
    applyPreset: FurnaceApi.applyPreset,
    getTemperatureHistory: FurnaceApi.getTemperatureHistory,
  },

  // MFC 快速访问
  mfc: {
    scanDevices: MfcApi.scanDevices,
    getDevices: MfcApi.getDevices,
    getStatus: MfcApi.getStatus,
    setFlowRate: MfcApi.setFlowRate,
    getFlowHistory: MfcApi.getFlowHistory,
    setHoldMode: MfcApi.setHoldMode,
    setFollowMode: MfcApi.setFollowMode,
  },
};

/**
 * API 实用工具
 */
export const apiUtils = {
  /**
   * 检查API是否可用
   */
  async checkApiHealth(): Promise<boolean> {
    try {
      // 尝试调用一个简单的API来检查连接
      await MfcApi.getDevices();
      return true;
    } catch (error) {
      console.warn('API health check failed:', error);
      return false;
    }
  },

  /**
   * 获取所有设备连接状态
   */
  async getAllDevicesStatus() {
    try {
      const [furnaceStatus, mfcDevices] = await Promise.allSettled([
        FurnaceApi.getStatus(),
        MfcApi.getAllDevicesStatus(),
      ]);

      return {
        furnace: furnaceStatus.status === 'fulfilled' ? furnaceStatus.value : null,
        mfc: mfcDevices.status === 'fulfilled' ? mfcDevices.value : [],
        hasFurnaceConnection: furnaceStatus.status === 'fulfilled',
        hasMfcConnection: mfcDevices.status === 'fulfilled' && mfcDevices.value.length > 0,
      };
    } catch (error) {
      console.error('Failed to get all devices status:', error);
      return {
        furnace: null,
        mfc: [],
        hasFurnaceConnection: false,
        hasMFCConnection: false,
      };
    }
  },

  /**
   * 断开所有设备连接
   */
  async disconnectAllDevices(): Promise<void> {
    const promises = [];

    try {
      promises.push(FurnaceApi.disconnect());
    } catch (error) {
      console.warn('Failed to disconnect furnace:', error);
    }

    // MFC 设备通常不需要显式断开，但如果有的话可以在这里添加

    await Promise.allSettled(promises);
  },

  /**
   * 格式化API错误信息
   */
  formatError(error: any): string {
    if (error?.code === 'RATE_LIMIT') {
      return `请求过于频繁，请等待 ${error.retry_after} 秒后重试`;
    }

    if (error?.code === 'NETWORK_ERROR') {
      return '网络连接失败，请检查网络连接';
    }

    if (error?.code?.startsWith('HTTP_')) {
      return `服务器错误 (${error.status}): ${error.message}`;
    }

    if (error?.message) {
      return error.message;
    }

    return '未知错误';
  },

  /**
   * 判断错误是否可重试
   */
  isRetryableError(error: any): boolean {
    if (!error) return false;

    // 网络错误通常可以重试
    if (error.code === 'NETWORK_ERROR') return true;

    // 5xx 服务器错误可以重试
    if (error.status >= 500 && error.status < 600) return true;

    // 429 限流错误可以重试
    if (error.code === 'RATE_LIMIT') return true;

    // 408 请求超时可以重试
    if (error.status === 408) return true;

    return false;
  },
};