/**
 * ZahnerFlow API Helper
 *
 * 提供与后端API通信的工具函数
 * 兼容原有的workflowService接口
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class ApiHelpers {
  private baseURL: string;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
  }

  /**
   * GET 请求
   */
  async get<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * POST 请求
   */
  async post<T = any>(url: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * PUT 请求
   */
  async put<T = any>(url: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(url: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${url}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 分页GET请求
   */
  async getPaginated<T = any>(url: string): Promise<PaginatedResponse<T>> {
    const response = await fetch(`${this.baseURL}${url}`);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}

export const apiHelpers = new ApiHelpers();

// ==========================================
// Zahner 设备模式切换 API
// ==========================================

export interface DeviceModeInfo {
  mode: 'real' | 'simulator';
  endpoint: string;
}

export const zahnerDeviceApi = {
  /** 获取当前设备模式 */
  getDeviceMode: (): Promise<DeviceModeInfo> =>
    apiHelpers.get('/devices/zahner-zennium/device-mode'),

  /** 切换设备模式 (real=真实设备, simulator=模拟器) */
  setDeviceMode: (mode: 'real' | 'simulator'): Promise<{ success: boolean; mode: string }> =>
    apiHelpers.post('/devices/zahner-zennium/device-mode', { mode }),

  /** 连接设备 (同时适用于真实设备和模拟器) */
  connect: (): Promise<{ message: string }> =>
    apiHelpers.post('/devices/zahner-zennium/connect'),

  /** 断开设备 */
  disconnect: (): Promise<{ message: string }> =>
    apiHelpers.post('/devices/zahner-zennium/disconnect'),

  /** 获取设备状态 */
  getStatus: (): Promise<any> =>
    apiHelpers.get('/devices/zahner-zennium/status'),
};

export default apiHelpers;