/**
 * MFC API 封装
 *
 * 封装所有与质量流量控制器设备相关的API调用
 */

import { MfcDeviceInfo, MfcStatus, MfcSample, MfcSetpointRequest, MfcScanRequest } from './mfcTypes';
import { HistoryQueryParams, DeviceError } from '../devices';

// API 基础URL
const API_BASE = '/api/devices/mfc';

/**
 * API 请求基础函数
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        code: `HTTP_${response.status}`,
        message: errorData.error || errorData.message || `HTTP ${response.status}`,
        status: response.status,
      } as DeviceError;
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && !(error as unknown as DeviceError).code) {
      throw {
        code: 'NETWORK_ERROR',
        message: error.message,
        status: 0,
      } as DeviceError;
    }
    throw error as unknown as DeviceError;
  }
}

class MfcApi {
  // ==================== 状态同步 (新增) ====================

  /**
   * 获取后端真实的连接状态
   */
  static async getConnectionStatus(): Promise<{
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    connection_info?: any;
    device_count: number;
    polling_status?: any;
  }> {
    return apiRequest('/connection/status');
  }

  // ==================== 设备发现和管理 ====================

  static async scanDevices(params: MfcScanRequest = {}): Promise<MfcDeviceInfo[]> {
    return apiRequest<MfcDeviceInfo[]>('/scan', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  static async getDevices(): Promise<MfcDeviceInfo[]> {
    return apiRequest<MfcDeviceInfo[]>('/devices');
  }

  // ==================== 设备连接 ====================

  static async connect(port: string = 'COM1', baudrate: number = 19200, timeout: number = 1.0): Promise<void> {
    return apiRequest<void>('/connect', {
      method: 'POST',
      body: JSON.stringify({ port, baudrate, timeout }),
    });
  }

  static async disconnect(): Promise<void> {
    return apiRequest<void>('/disconnect', {
      method: 'POST',
    });
  }

  static async getPorts(): Promise<string[]> {
    return apiRequest<string[]>('/ports');
  }

  // ==================== 设备状态 ====================

  static async getStatus(address?: number): Promise<MfcStatus | MfcStatus[]> {
    if (address !== undefined) {
      return apiRequest<MfcStatus>(`/status?address=${address}`);
    }
    return apiRequest<MfcStatus[]>('/status');
  }

  static async getDeviceStatus(address: number): Promise<MfcStatus> {
    const status = await this.getStatus(address);
    if (Array.isArray(status)) throw new Error('Expected single status');
    return status;
  }

  // ==================== 流量控制 ====================

  static async setSetpoint(request: MfcSetpointRequest): Promise<void> {
    return apiRequest<void>('/setpoint', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  static async setFlowRate(address: number, sccm: number): Promise<void> {
    return this.setSetpoint({ address, sccm });
  }

  // ==================== 历史数据 ====================

  static async getFlowHistory(address: number, params: HistoryQueryParams = {}): Promise<MfcSample[]> {
    const searchParams = new URLSearchParams();
    searchParams.set('address', address.toString());
    if (params.from) searchParams.set('from', params.from);
    if (params.to) searchParams.set('to', params.to);
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.downsample) searchParams.set('downsample', params.downsample.toString());

    return apiRequest<MfcSample[]>(`/logs/flow?${searchParams.toString()}`);
  }

  static async getMultipleDevicesFlowHistory(addresses: number[], params: HistoryQueryParams = {}): Promise<{ [address: number]: MfcSample[] }> {
    const results: { [address: number]: MfcSample[] } = {};
    await Promise.all(addresses.map(async (address) => {
      try {
        results[address] = await this.getFlowHistory(address, params);
      } catch (e) {
        results[address] = [];
      }
    }));
    return results;
  }

  // ==================== 工具方法 ====================

  static getDefaultHistoryParams(): HistoryQueryParams {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return {
      from: oneHourAgo.toISOString(),
      to: now.toISOString(),
      limit: 1000,
      downsample: 10,
    };
  }

  static getRecommendedScanParams(): MfcScanRequest {
    return { start_address: 32, end_address: 80 };
  }
}

export { MfcApi };
export default MfcApi;