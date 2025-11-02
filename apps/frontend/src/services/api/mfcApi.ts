/**
 * MFC API 封装
 *
 * 封装所有与质量流量控制器设备相关的API调用，包括设备扫描、
 * 状态获取、流量设定和历史数据查询
 */

import {
  MfcDeviceInfo,
  MfcStatus,
  MfcSample,
  MfcSetpointRequest,
  MfcScanRequest,
  HistoryQueryParams,
  ApiResponse,
  DeviceError,
} from '../../types/devices';

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

    // 处理 HTTP 错误
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        code: `HTTP_${response.status}`,
        message: errorData.error || errorData.message || `HTTP ${response.status}`,
        status: response.status,
      } as DeviceError;
    }

    // 处理 204 No Content 响应
    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  } catch (error) {
    // 网络错误或其他异常
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

/**
 * MFC API 类
 */
class MfcApi {
  // ==================== 设备发现和管理 ====================

  /**
   * 扫描MFC设备
   */
  static async scanDevices(params: MfcScanRequest = {}): Promise<MfcDeviceInfo[]> {
    const { start_address: start = 32, end_address: end = 80, port } = params;

    if (typeof start !== 'number' || start < 1 || start > 127) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Start address must be between 1 and 127',
        status: 400,
      } as DeviceError;
    }

    if (typeof end !== 'number' || end < 1 || end > 127) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'End address must be between 1 and 127',
        status: 400,
      } as DeviceError;
    }

    if (start > end) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Start address must be less than or equal to end address',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<MfcDeviceInfo[]>('/scan', {
      method: 'POST',
      body: JSON.stringify({ start, end, port }),
    });
  }

  /**
   * 获取缓存的设备列表
   */
  static async getDevices(): Promise<MfcDeviceInfo[]> {
    return apiRequest<MfcDeviceInfo[]>('/devices');
  }

  // ==================== 设备连接 ====================

  /**
   * 连接到MFC虚拟设备
   */
  static async connect(port: string = 'COM1', baudrate: number = 19200, timeout: number = 1.0): Promise<void> {
    return apiRequest<void>('/connect', {
      method: 'POST',
      body: JSON.stringify({ port, baudrate, timeout }),
    });
  }

  /**
   * 断开MFC设备连接
   */
  static async disconnect(): Promise<void> {
    return apiRequest<void>('/disconnect', {
      method: 'POST',
    });
  }

  /**
   * 获取可用端口列表
   */
  static async getPorts(): Promise<string[]> {
    return apiRequest<string[]>('/ports');
  }

  // ==================== 设备状态 ====================

  /**
   * 获取设备状态
   * @param address 可选，如果提供则返回指定设备状态，否则返回所有设备状态
   */
  static async getStatus(address?: number): Promise<MfcStatus | MfcStatus[]> {
    if (address !== undefined) {
      if (typeof address !== 'number' || address < 1 || address > 127) {
        throw {
          code: 'INVALID_PARAMETER',
          message: 'Device address must be between 1 and 127',
          status: 400,
        } as DeviceError;
      }

      return apiRequest<MfcStatus>(`/status?address=${address}`);
    }

    return apiRequest<MfcStatus[]>('/status');
  }

  /**
   * 获取指定设备的详细状态
   */
  static async getDeviceStatus(address: number): Promise<MfcStatus> {
    const status = await this.getStatus(address);
    if (Array.isArray(status)) {
      throw {
        code: 'UNEXPECTED_RESPONSE',
        message: 'Expected single device status but received array',
        status: 500,
      } as DeviceError;
    }
    return status;
  }

  /**
   * 获取所有设备状态
   */
  static async getAllDevicesStatus(): Promise<MfcStatus[]> {
    const status = await this.getStatus();
    if (!Array.isArray(status)) {
      throw {
        code: 'UNEXPECTED_RESPONSE',
        message: 'Expected array of device statuses but received single status',
        status: 500,
      } as DeviceError;
    }
    return status;
  }

  // ==================== 流量控制 ====================

  /**
   * 设置流量设定值
   */
  static async setSetpoint(request: MfcSetpointRequest): Promise<void> {
    const { address, sccm } = request;

    if (typeof address !== 'number' || address < 1 || address > 127) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Device address must be between 1 and 127',
        status: 400,
      } as DeviceError;
    }

    if (typeof sccm !== 'number' || sccm < 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Flow rate must be a non-negative number',
        status: 400,
      } as DeviceError;
    }

    // 检查是否超出设备最大流量（需要先获取设备信息）
    try {
      const devices = await this.getDevices();
      const device = devices.find(d => d.address === address);
      if (device && sccm > device.max_flow_sccm) {
        throw {
          code: 'INVALID_PARAMETER',
          message: `Flow rate ${sccm} sccm exceeds device maximum ${device.max_flow_sccm} sccm`,
          status: 400,
        } as DeviceError;
      }
    } catch (error) {
      // 如果无法获取设备信息，继续执行请求，让后端验证
      console.warn('Could not validate flow rate against device maximum:', error);
    }

    return apiRequest<void>('/setpoint', {
      method: 'POST',
      body: JSON.stringify({ address, sccm }),
    });
  }

  /**
   * 设置流量设定值（简化接口）
   */
  static async setFlowRate(address: number, sccm: number): Promise<void> {
    return this.setSetpoint({ address, sccm });
  }

  // ==================== 高级控制功能（如果后端支持） ====================

  
  
  // ==================== 历史数据查询 ====================

  /**
   * 获取设备流量历史数据
   */
  static async getFlowHistory(
    address: number,
    params: HistoryQueryParams = {}
  ): Promise<MfcSample[]> {
    if (typeof address !== 'number' || address < 1 || address > 127) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Device address must be between 1 and 127',
        status: 400,
      } as DeviceError;
    }

    const searchParams = new URLSearchParams();
    searchParams.set('address', address.toString());

    if (params.from) {
      searchParams.set('from', params.from);
    }

    if (params.to) {
      searchParams.set('to', params.to);
    }

    if (params.limit) {
      if (params.limit < 1 || params.limit > 10000) {
        throw {
          code: 'INVALID_PARAMETER',
          message: 'Limit must be between 1 and 10000',
          status: 400,
        } as DeviceError;
      }
      searchParams.set('limit', params.limit.toString());
    }

    if (params.downsample) {
      if (params.downsample < 1) {
        throw {
          code: 'INVALID_PARAMETER',
          message: 'Downsample must be positive',
          status: 400,
        } as DeviceError;
      }
      searchParams.set('downsample', params.downsample.toString());
    }

    const query = searchParams.toString();
    return apiRequest<MfcSample[]>(`/logs/flow${query ? `?${query}` : ''}`);
  }

  /**
   * 获取多个设备的流量历史数据
   */
  static async getMultipleDevicesFlowHistory(
    addresses: number[],
    params: HistoryQueryParams = {}
  ): Promise<{ [address: number]: MfcSample[] }> {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'At least one device address must be provided',
        status: 400,
      } as DeviceError;
    }

    // 验证地址
    for (const address of addresses) {
      if (typeof address !== 'number' || address < 1 || address > 127) {
        throw {
          code: 'INVALID_PARAMETER',
          message: `Invalid device address: ${address}. Must be between 1 and 127`,
          status: 400,
        } as DeviceError;
      }
    }

    const results: { [address: number]: MfcSample[] } = {};

    // 并行获取所有设备的历史数据
    const promises = addresses.map(async (address) => {
      try {
        const history = await this.getFlowHistory(address, params);
        results[address] = history;
      } catch (error) {
        console.warn(`Failed to get flow history for device ${address}:`, error);
        results[address] = [];
      }
    });

    await Promise.all(promises);
    return results;
  }

  // ==================== 工具方法 ====================

  /**
   * 检查设备连接状态
   */
  static async checkDeviceConnection(address: number): Promise<boolean> {
    try {
      await this.getDeviceStatus(address);
      return true;
    } catch (error) {
      const deviceError = error as DeviceError;
      return deviceError.code !== 'NETWORK_ERROR';
    }
  }

  /**
   * 批量检查多个设备的连接状态
   */
  static async checkMultipleDevicesConnection(
    addresses: number[]
  ): Promise<{ [address: number]: boolean }> {
    const results: { [address: number]: boolean } = {};

    const promises = addresses.map(async (address) => {
      results[address] = await this.checkDeviceConnection(address);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 获取默认历史查询参数
   */
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

  /**
   * 验证流量设定值
   */
  static validateFlowRate(sccm: number, maxFlowSccm?: number): boolean {
    if (typeof sccm !== 'number' || sccm < 0) {
      return false;
    }

    if (maxFlowSccm !== undefined && sccm > maxFlowSccm) {
      return false;
    }

    return true;
  }

  /**
   * 获取推荐的扫描参数
   */
  static getRecommendedScanParams(): MfcScanRequest {
    return {
      start_address: 32,
      end_address: 80,
    };
  }

  /**
   * 格式化流量值显示
   */
  static formatFlowValue(sccm: number, precision: number = 1): string {
    return sccm.toFixed(precision);
  }

  /**
   * 格式化流量百分比显示
   */
  static formatFlowPercent(percent: number, precision: number = 1): string {
    return percent.toFixed(precision);
  }
}

export { MfcApi };

export default MfcApi;