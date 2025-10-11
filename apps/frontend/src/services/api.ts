import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  message?: string;
  timestamp: string;
}

// 分页响应类型
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

// 创建API实例
const api: AxiosInstance = axios.create({
  baseURL: process.env.API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 添加认证token
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 添加请求ID用于追踪
    config.headers = config.headers || {};
    config.headers['X-Request-ID'] = generateRequestId();
    
      
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // 调试信息
    console.log({
      status: response.status,
      data: response.data,
    });

    return response;
  },
  (error) => {
    // 调试信息
    console.log({
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    
    // 处理特定错误
    if (error.response?.status === 401) {
      // 未授权，清除token并跳转到登录页
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// 生成请求ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 导出API实例
export default api;

// 通用API方法
export const apiHelpers = {
  // 通用GET请求
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.get<ApiResponse<T>>(url, config);
    if (response.data.success) {
      return response.data.data as T;
    }
    throw new Error(response.data.error?.message || '请求失败');
  },

  // 通用POST请求
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.post<ApiResponse<T>>(url, data, config);
    if (response.data.success) {
      return response.data.data as T;
    }
    throw new Error(response.data.error?.message || '请求失败');
  },

  // 通用PUT请求
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.put<ApiResponse<T>>(url, data, config);
    if (response.data.success) {
      return response.data.data as T;
    }
    throw new Error(response.data.error?.message || '请求失败');
  },

  // 通用DELETE请求
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.delete<ApiResponse<T>>(url, config);
    if (response.data.success) {
      return response.data.data as T;
    }
    throw new Error(response.data.error?.message || '请求失败');
  },

  // 分页GET请求
  async getPaginated<T = any>(url: string, config?: AxiosRequestConfig): Promise<PaginatedResponse<T>> {
    const response = await api.get<ApiResponse<PaginatedResponse<T>>>(url, config);
    if (response.data.success) {
      return response.data.data as PaginatedResponse<T>;
    }
    throw new Error(response.data.error?.message || '请求失败');
  },
};