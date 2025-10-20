import { apiHelpers } from './api/zahnerApi';
import { Device, DeviceStatus } from '@zahnerflow/types';

// 设备管理API
export const deviceService = {
  // 获取设备列表
  getDevices: (): Promise<Device[]> => {
    return apiHelpers.get<Device[]>('/devices');
  },

  // 获取设备状态
  getDeviceStatus: (deviceType: string): Promise<{
    deviceId: string;
    status: DeviceStatus;
    isConnected: boolean;
    mode?: string;
    parameters?: Record<string, any>;
    lastUpdate: string;
    error?: string;
  }> => {
    return apiHelpers.get(`/devices/${deviceType}/status`);
  },

  // 连接设备
  connectDevice: (deviceType: string, config?: {
    deviceId?: string;
    port?: string;
    baudRate?: number;
    parameters?: Record<string, any>;
  }): Promise<{
    deviceId: string;
    status: DeviceStatus;
    message: string;
  }> => {
    console.log('🔌 连接设备:', { deviceType, config });
    return apiHelpers.post(`/devices/${deviceType}/connect`, config);
  },

  // 断开设备
  disconnectDevice: (deviceType: string, deviceId?: string): Promise<void> => {
    console.log('🔌 断开设备:', { deviceType, deviceId });
    return apiHelpers.post<void>(`/devices/${deviceType}/disconnect`, { deviceId });
  },

  // 设备自检
  selfTest: (deviceType: string): Promise<{
    success: boolean;
    results: Record<string, any>;
    issues: Array<{
      component: string;
      severity: string;
      message: string;
    }>;
    duration: number;
  }> => {
    console.log('🔍 设备自检:', deviceType);
    return apiHelpers.post(`/devices/${deviceType}/self-test`);
  },

  // 重启设备
  restartDevice: (deviceType: string): Promise<void> => {
    console.log('🔄 重启设备:', deviceType);
    return apiHelpers.post<void>(`/devices/${deviceType}/restart`);
  },

  // 获取设备配置
  getDeviceConfig: (deviceType: string): Promise<Record<string, any>> => {
    return apiHelpers.get(`/devices/${deviceType}/config`);
  },

  // 更新设备配置
  updateDeviceConfig: (deviceType: string, config: Record<string, any>): Promise<void> => {
    return apiHelpers.put<void>(`/devices/${deviceType}/config`, config);
  },

  // 获取设备日志
  getDeviceLogs: (deviceType: string, params?: {
    level?: 'error' | 'warn' | 'info' | 'debug';
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    timestamp: string;
    level: string;
    message: string;
    data?: any;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, String(value));
        }
      });
    }
    
    const url = `/devices/${deviceType}/logs${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return apiHelpers.get(url);
  },
};

// Zahner 设备专用API
export const zahnerService = {
  // 获取Zahner设备特定状态
  getStatus: (): Promise<{
    deviceId: string;
    status: DeviceStatus;
    isConnected: boolean;
    thalesMode: string;
    impedanceRange: string;
    potentiostatMode: string;
    parameters: {
      potential: number;
      current: number;
      temperature: number;
      frequency: number;
      amplitude: number;
    };
    lastUpdate: string;
  }> => {
    return apiHelpers.get('/devices/zahner-zennium/status');
  },

  // 执行EIS测量
  performEIS: (params: {
    startFrequency: number;
    endFrequency: number;
    amplitude: number;
    pointsPerDecade: number;
    potential: number;
  }): Promise<{
    measurementId: string;
    status: 'running' | 'completed' | 'error';
    progress: number;
    data?: Array<{
      frequency: number;
      impedance: number;
      phase: number;
    }>;
  }> => {
    return apiHelpers.post('/devices/zahner-zennium/eis', params);
  },

  // 执行开路电压测量
  measureOpenCircuit: (params: {
    duration: number;
    interval: number;
  }): Promise<{
    measurementId: string;
    status: 'running' | 'completed' | 'error';
    data?: Array<{
      time: number;
      voltage: number;
    }>;
  }> => {
    return apiHelpers.post('/devices/zahner-zennium/open-circuit', params);
  },

  // 执行恒电位测量
  performPotentiostatic: (params: {
    potential: number;
    duration: number;
    samplingRate: number;
  }): Promise<{
    measurementId: string;
    status: 'running' | 'completed' | 'error';
    data?: Array<{
      time: number;
      voltage: number;
      current: number;
    }>;
  }> => {
    return apiHelpers.post('/devices/zahner-zennium/potentiostatic', params);
  },

  // 获取测量数据
  getMeasurementData: (measurementId: string): Promise<{
    id: string;
    type: string;
    status: string;
    data: any;
    metadata: Record<string, any>;
  }> => {
    return apiHelpers.get(`/devices/zahner-zennium/measurements/${measurementId}`);
  },

  // 导出测量数据
  exportMeasurement: (measurementId: string, format: 'csv' | 'json' | 'xlsx'): Promise<{
    downloadUrl: string;
    filename: string;
    size: number;
  }> => {
    return apiHelpers.get(`/devices/zahner-zennium/measurements/${measurementId}/export/${format}`);
  },
};


export default {
  device: deviceService,
  zahner: zahnerService,
};