import { FurnaceStatus, ProgramSegment, FurnacePresetMeta, FurnacePreset, CreatePresetRequest, ApplyPresetResult, FurnaceSample, HistoryQueryParams, FurnaceConnectRequest, FurnaceOperationResponse } from './furnaceTypes';
import { DeviceError } from '../../types/devices';

const API_BASE = '/api/devices/furnace';
// ... apiRequest helper ...
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // ... (standard implementation) ...
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: {'Content-Type': 'application/json'}, ...options });
    if(!res.ok) throw await res.json();
    return res.status === 204 ? null as T : res.json();
}

export class FurnaceApi {
  static async getStatus(): Promise<FurnaceStatus> { return apiRequest('/status'); }
  static async setSegment(segment: number): Promise<FurnaceOperationResponse> { return apiRequest('/segment/set', { method: 'POST', body: JSON.stringify({ segment }) }); }

  static async getSegments(): Promise<ProgramSegment[]> { return apiRequest('/program/segments'); }
  static async setSegments(segments: ProgramSegment[]): Promise<void> { return apiRequest('/program/segments', { method: 'POST', body: JSON.stringify({ segments }) }); }

  static async getPresets(): Promise<FurnacePresetMeta[]> { return apiRequest('/presets'); }
  static async createPreset(p: CreatePresetRequest): Promise<FurnacePreset> { return apiRequest('/presets', { method: 'POST', body: JSON.stringify(p) }); }
  static async getPreset(n: string): Promise<FurnacePreset> { return apiRequest(`/presets/${encodeURIComponent(n)}`); }
  static async updatePreset(n: string, s: ProgramSegment[]): Promise<FurnacePreset> { return apiRequest(`/presets/${encodeURIComponent(n)}`, { method: 'PUT', body: JSON.stringify({ segments: s }) }); }
  static async deletePreset(n: string): Promise<void> { return apiRequest(`/presets/${encodeURIComponent(n)}`, { method: 'DELETE' }); }
  static async clonePreset(n: string, newN: string): Promise<FurnacePreset> { return apiRequest(`/presets/${encodeURIComponent(n)}/clone`, { method: 'POST', body: JSON.stringify({ newName: newN }) }); }
  static async applyPreset(n: string): Promise<ApplyPresetResult> { return apiRequest(`/presets/${encodeURIComponent(n)}/apply`, { method: 'POST' }); }
  
  static async getTemperatureHistory(params: any = {}): Promise<FurnaceSample[]> {
      const qs = new URLSearchParams(params).toString();
      const raw = await apiRequest<any[]>(`/logs/temperature?${qs}`);
      return raw.map(i => ({ timestamp: i.ts, temperature: i.pv, sv: i.sv, mv: i.mv }));
  }

  // ========== 新架构查询接口（支持status_code） ==========

  /**
   * 查询采样数据（支持时间范围和降采样）
   * 用于RecordingTab实时表格
   */
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
    const qs = new URLSearchParams();
    if (params.from) qs.append('from', params.from);
    if (params.to) qs.append('to', params.to);
    if (params.limit) qs.append('limit', params.limit.toString());
    if (params.downsample) qs.append('downsample', params.downsample.toString());

    return apiRequest(`/samples?${qs.toString()}`);
  }

  /**
   * 查询事件数据（用于状态补全）
   */
  static async getFurnaceEvents(params: {
    from?: string;
    to?: string;
  } = {}): Promise<Array<{
    timestamp: string;
    status_code: number;
    segment: number;
    segment_time_set: number;
  }>> {
    const qs = new URLSearchParams();
    if (params.from) qs.append('from', params.from);
    if (params.to) qs.append('to', params.to);

    return apiRequest(`/events?${qs.toString()}`);
  }

  static async getPorts(): Promise<string[]> { return apiRequest('/ports'); }
  static async connect(r: FurnaceConnectRequest): Promise<void> { return apiRequest('/connect', { method: 'POST', body: JSON.stringify(r) }); }
  static async disconnect(): Promise<void> { return apiRequest('/disconnect', { method: 'POST' }); }
  static async run(): Promise<void> { return apiRequest('/run', { method: 'POST' }); }
  static async pause(): Promise<void> { return apiRequest('/pause', { method: 'POST' }); }
  static async stop(): Promise<void> { return apiRequest('/stop', { method: 'POST' }); }
  static getDefaultHistoryParams() { return { limit: 1000 }; }
}