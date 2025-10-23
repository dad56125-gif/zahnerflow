/**
 * Furnace API 封装
 *
 * 封装所有与加热炉设备相关的API调用，包括状态获取、控制、
 * 程序段管理、预设管理和历史数据查询
 */

import {
  FurnaceStatus,
  ProgramSegment,
  FurnacePresetMeta,
  FurnacePreset,
  CreatePresetRequest,
  ApplyPresetResult,
  FurnaceSample,
  HistoryQueryParams,
  ApiResponse,
  DeviceError,
  RateLimitResponse,
  FurnaceConnectRequest,
  CommLog,
} from '../../types/devices';

// API 基础URL
const API_BASE = '/api/devices/furnace';

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

    // 处理 429 限流响应
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const error: RateLimitResponse = await response.json();
      throw {
        code: 'RATE_LIMIT',
        message: error.message || 'Rate limited',
        status: 429,
        retry_after: retryAfter ? parseInt(retryAfter) : error.retry_after || 5,
      } as DeviceError;
    }

    // 处理其他 HTTP 错误
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
    if (error instanceof Error && !(error as DeviceError).code) {
      throw {
        code: 'NETWORK_ERROR',
        message: error.message,
        status: 0,
      } as DeviceError;
    }

    throw error;
  }
}

/**
 * Furnace API 类
 */
export class FurnaceApi {
  /**
   * 获取设备状态
   */
  static async getStatus(): Promise<FurnaceStatus> {
    return apiRequest<FurnaceStatus>('/status');
  }

  /**
   * 设置设定温度
   */
  static async setTemperature(sv: number): Promise<void> {
    if (typeof sv !== 'number' || sv < 0 || sv > 1200) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Temperature must be between 0 and 1200°C',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<void>('/sv', {
      method: 'POST',
      body: JSON.stringify({ sv }),
    });
  }

  /**
   * 切换程序段
   */
  static async setSegment(segment: number): Promise<void> {
    if (typeof segment !== 'number' || segment < 1 || segment > 30) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Segment must be between 1 and 30',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<void>('/segment/set', {
      method: 'POST',
      body: JSON.stringify({ segment }),
    });
  }

  /**
   * 获取程序段
   */
  static async getProgramSegments(): Promise<ProgramSegment[]> {
    return apiRequest<ProgramSegment[]>('/program/segments');
  }

  /**
   * 批量写入程序段
   */
  static async writeProgramSegments(segments: ProgramSegment[]): Promise<void> {
    if (!Array.isArray(segments) || segments.length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Segments must be a non-empty array',
        status: 400,
      } as DeviceError;
    }

    // 验证每个程序段
    for (const segment of segments) {
      if (typeof segment.id !== 'number' || segment.id < 1 || segment.id > 30) {
        throw {
          code: 'INVALID_PARAMETER',
          message: `Invalid segment ID: ${segment.id}. Must be between 1 and 30`,
          status: 400,
        } as DeviceError;
      }

      if (typeof segment.temperature !== 'number' || segment.temperature < 0 || segment.temperature > 1200) {
        throw {
          code: 'INVALID_PARAMETER',
          message: `Invalid temperature for segment ${segment.id}: ${segment.temperature}°C. Must be between 0 and 1200°C`,
          status: 400,
        } as DeviceError;
      }

      if (typeof segment.time !== 'number' || segment.time < 0) {
        throw {
          code: 'INVALID_PARAMETER',
          message: `Invalid time for segment ${segment.id}: ${segment.time}s. Must be positive`,
          status: 400,
        } as DeviceError;
      }
    }

    return apiRequest<void>('/program/segments', {
      method: 'POST',
      body: JSON.stringify(segments),
    });
  }

  // ==================== 预设管理 ====================

  /**
   * 获取预设列表
   */
  static async getPresets(): Promise<FurnacePresetMeta[]> {
    return apiRequest<FurnacePresetMeta[]>('/presets');
  }

  /**
   * 创建新预设
   */
  static async createPreset(preset: CreatePresetRequest): Promise<FurnacePreset> {
    if (!preset.name || preset.name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset name is required',
        status: 400,
      } as DeviceError;
    }

    if (!preset.segments || !Array.isArray(preset.segments) || preset.segments.length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset must contain at least one segment',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<FurnacePreset>('/presets', {
      method: 'POST',
      body: JSON.stringify(preset),
    });
  }

  /**
   * 获取指定预设详情
   */
  static async getPreset(name: string): Promise<FurnacePreset> {
    if (!name || name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset name is required',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<FurnacePreset>(`/presets/${encodeURIComponent(name)}`);
  }

  /**
   * 更新预设程序段
   */
  static async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    if (!name || name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset name is required',
        status: 400,
      } as DeviceError;
    }

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset must contain at least one segment',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<FurnacePreset>(`/presets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ segments }),
    });
  }

  /**
   * 删除预设
   */
  static async deletePreset(name: string): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset name is required',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<void>(`/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  /**
   * 克隆预设
   */
  static async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    if (!name || name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Source preset name is required',
        status: 400,
      } as DeviceError;
    }

    if (!newName || newName.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'New preset name is required',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<FurnacePreset>(`/presets/${encodeURIComponent(name)}/clone`, {
      method: 'POST',
      body: JSON.stringify({ newName: newName.trim() }),
    });
  }

  /**
   * 应用预设
   */
  static async applyPreset(name: string): Promise<ApplyPresetResult> {
    if (!name || name.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Preset name is required',
        status: 400,
      } as DeviceError;
    }

    return apiRequest<ApplyPresetResult>(`/presets/${encodeURIComponent(name)}/apply`, {
      method: 'POST',
    });
  }

  // ==================== 历史数据查询 ====================

  /**
   * 获取温度历史数据
   */
  static async getTemperatureHistory(params: HistoryQueryParams = {}): Promise<FurnaceSample[]> {
    const searchParams = new URLSearchParams();

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
    const rawData = await apiRequest<any[]>(`/logs/temperature${query ? `?${query}` : ''}`);

    // 数据格式转换：后端格式 -> 前端类型
    return rawData.map(item => ({
      timestamp: item.ts,        // ts -> timestamp
      temperature: item.pv,      // pv -> temperature
      sv: item.sv,               // sv 保持不变
      mv: item.mv,               // mv 保持不变
    }));
  }

  // ==================== 设备控制 ====================

  /**
   * 获取可用端口列表
   */
  static async getPorts(): Promise<string[]> {
    return apiRequest<string[]>('/ports');
  }

  /**
   * 连接设备
   */
  static async connect(request: FurnaceConnectRequest): Promise<void> {
    if (!request.port || request.port.trim().length === 0) {
      throw {
        code: 'INVALID_PARAMETER',
        message: 'Port is required for connection',
        status: 400,
      } as DeviceError;
    }

    const connectRequest = {
      port: request.port.trim(),
      baudrate: request.baudrate ?? 9600,
      address: request.address ?? 1,
      stopbits: request.stopbits ?? 2,
      timeout: request.timeout ?? 1.0,
    };

    return apiRequest<void>('/connect', {
      method: 'POST',
      body: JSON.stringify(connectRequest),
    });
  }

  /**
   * 断开设备连接
   */
  static async disconnect(): Promise<void> {
    return apiRequest<void>('/disconnect', { method: 'POST' });
  }

  /**
   * 开始运行程序
   */
  static async run(): Promise<void> {
    return apiRequest<void>('/run', { method: 'POST' });
  }

  /**
   * 暂停程序
   */
  static async pause(): Promise<void> {
    return apiRequest<void>('/pause', { method: 'POST' });
  }

  /**
   * 停止程序
   */
  static async stop(): Promise<void> {
    return apiRequest<void>('/stop', { method: 'POST' });
  }

  // ==================== 工具方法 ====================

  /**
   * 检查设备连接状态
   */
  static async checkConnection(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch (error) {
      const deviceError = error as DeviceError;
      return deviceError.code !== 'NETWORK_ERROR';
    }
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
   * 获取通信日志
   */
  static async getCommLog(): Promise<{ logs: CommLog[], total: number }> {
    return apiRequest<{ logs: CommLog[], total: number }>('/comm-log');
  }

  /**
   * 验证程序段数据
   */
  static validateSegments(segments: any[]): segments is ProgramSegment[] {
    if (!Array.isArray(segments)) return false;

    return segments.every(segment =>
      typeof segment === 'object' &&
      segment !== null &&
      typeof segment.id === 'number' &&
      segment.id >= 1 &&
      segment.id <= 30 &&
      typeof segment.temperature === 'number' &&
      segment.temperature >= 0 &&
      segment.temperature <= 1200 &&
      typeof segment.time === 'number' &&
      segment.time >= 0
    );
  }
}

export default FurnaceApi;