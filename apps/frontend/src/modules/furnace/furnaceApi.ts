/**
 * Furnace API 封装
 * 
 * 继承自 BaseDeviceApi，添加炉温控制器特定的端点
 */

import { BaseDeviceApi, HistoryQueryParams } from '../common';
import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  CreatePresetRequest,
  ApplyPresetResult,
  FurnaceSampleWithTimestamp,
  FurnaceConnectRequest,
  FurnaceOperationResponse,
} from './furnaceTypes';

export class FurnaceApi extends BaseDeviceApi {
  protected static API_BASE = '/api/devices/furnace';

  // ==================== 设备连接 ====================

  static async connect(request: FurnaceConnectRequest): Promise<void> {
    return this.request('/connect', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ==================== 状态与控制 ====================

  static async getStatus(): Promise<FurnaceStatus> {
    return this.request('/status');
  }

  static async setSegment(segment: number): Promise<FurnaceOperationResponse> {
    return this.request('/segment/set', {
      method: 'POST',
      body: JSON.stringify({ segment }),
    });
  }

  static async run(): Promise<void> {
    return this.request('/run', { method: 'POST' });
  }

  static async pause(): Promise<void> {
    return this.request('/pause', { method: 'POST' });
  }

  static async stop(): Promise<void> {
    return this.request('/stop', { method: 'POST' });
  }

  // ==================== 程序段管理 ====================

  static async getSegments(): Promise<ProgramSegment[]> {
    return this.request('/program/segments');
  }

  static async setSegments(segments: ProgramSegment[]): Promise<void> {
    return this.request('/program/segments', {
      method: 'POST',
      body: JSON.stringify({ segments }),
    });
  }

  // ==================== 预设管理 ====================

  static async getPresets(): Promise<FurnacePresetMeta[]> {
    return this.request('/presets');
  }

  static async createPreset(preset: CreatePresetRequest): Promise<FurnacePreset> {
    return this.request('/presets', {
      method: 'POST',
      body: JSON.stringify(preset),
    });
  }

  static async getPreset(name: string): Promise<FurnacePreset> {
    return this.request(`/presets/${encodeURIComponent(name)}`);
  }

  static async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    return this.request(`/presets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ segments }),
    });
  }

  static async deletePreset(name: string): Promise<void> {
    return this.request(`/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  static async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    return this.request(`/presets/${encodeURIComponent(name)}/clone`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    });
  }

  static async applyPreset(name: string): Promise<ApplyPresetResult> {
    return this.request(`/presets/${encodeURIComponent(name)}/apply`, {
      method: 'POST',
    });
  }

  // ==================== 历史数据 ====================

  static async getTemperatureHistory(params: HistoryQueryParams = {}): Promise<FurnaceSampleWithTimestamp[]> {
    const qs = this.buildQueryString(params as Record<string, unknown>);
    const raw = await this.request<{ ts: string; pv: number; sv?: number; mv?: number }[]>(
      `/logs/temperature?${qs}`
    );
    return raw.map((item) => ({
      timestamp: item.ts,
      temperature: item.pv,
      sv: item.sv,
      mv: item.mv,
    }));
  }

  static async queryFurnaceSamples(params: {
    from?: string;
    to?: string;
    limit?: number;
    downsample?: number;
  } = {}): Promise<Array<{
    timestamp: string;
    pv: number;
    sv: number;
    mv: number;
    status_code: number;
  }>> {
    const qs = this.buildQueryString(params);
    return this.request(`/samples?${qs}`);
  }

  static async getFurnaceEvents(params: {
    from?: string;
    to?: string;
  } = {}): Promise<Array<{
    timestamp: string;
    status_code: number;
    segment: number;
    segment_time_set: number;
  }>> {
    const qs = this.buildQueryString(params);
    return this.request(`/events?${qs}`);
  }

  // ==================== 工具方法 ====================

  static getDefaultHistoryParams(): { limit: number } {
    return { limit: 1000 };
  }
}