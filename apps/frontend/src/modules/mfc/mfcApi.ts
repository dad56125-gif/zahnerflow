/**
 * MFC API 封装
 *
 * 继承自 BaseDeviceApi，添加质量流量控制器特定的端点
 */

import { BaseDeviceApi } from '../common';
import { HistoryQueryParams } from '../common/types';
import {
  MfcDeviceInfo,
  MfcStatus,
  MfcSample,
  MfcSetpointRequest,
  MfcScanRequest,
} from './mfcTypes';

export class MfcApi extends BaseDeviceApi {
  protected static API_BASE = '/api/devices/mfc';

  // ==================== 状态同步 ====================

  static async getConnectionStatus(): Promise<{
    status: 'connected' | 'disconnected' | 'connecting' | 'error';
    connection_info?: unknown;
    device_count: number;
    polling_status?: unknown;
  }> {
    return this.request('/connection/status');
  }

  // ==================== 设备连接 ====================

  static async connect(
    port: string = 'COM1',
    baudrate: number = 19200,
    timeout: number = 1.0
  ): Promise<void> {
    return this.request('/connect', {
      method: 'POST',
      body: JSON.stringify({ port, baudrate, timeout }),
    });
  }

  // ==================== 设备发现和管理 ====================

  static async scanDevices(params: MfcScanRequest = {}): Promise<MfcDeviceInfo[]> {
    return this.request('/scan', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  static async getDevices(): Promise<MfcDeviceInfo[]> {
    return this.request('/devices');
  }

  // ==================== 设备状态 ====================

  static async getStatus(address?: number): Promise<MfcStatus | MfcStatus[]> {
    if (address !== undefined) {
      return this.request(`/status?address=${address}`);
    }
    return this.request('/status');
  }

  static async getDeviceStatus(address: number): Promise<MfcStatus> {
    const status = await this.getStatus(address);
    if (Array.isArray(status)) throw new Error('Expected single status');
    return status;
  }

  // ==================== 流量控制 ====================

  static async setSetpoint(request: MfcSetpointRequest): Promise<void> {
    return this.request('/setpoint', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  static async setFlowRate(address: number, sccm: number): Promise<void> {
    return this.setSetpoint({ address, sccm });
  }

  // ==================== 历史数据 ====================

  static async getFlowHistory(
    address: number,
    params: HistoryQueryParams = {}
  ): Promise<MfcSample[]> {
    const qs = this.buildQueryString({ address, ...params });
    return this.request(`/logs/flow?${qs}`);
  }

  static async getMultipleDevicesFlowHistory(
    addresses: number[],
    params: HistoryQueryParams = {}
  ): Promise<{ [address: number]: MfcSample[] }> {
    const results: { [address: number]: MfcSample[] } = {};
    await Promise.all(
      addresses.map(async (address) => {
        try {
          results[address] = await this.getFlowHistory(address, params);
        } catch {
          results[address] = [];
        }
      })
    );
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

export default MfcApi;