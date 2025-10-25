import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import { PaginatedResponse } from '@zahnerflow/types';

// Vite环境变量类型声明
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // 其他环境变量可以在这里添加
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

// 创建API实例
const getApiBaseUrl = () => {
  // 尝试多种方式获取API基础URL，避免import.meta的使用
  if (typeof window !== 'undefined' && (window as any).__ENV__?.VITE_API_BASE_URL) {
    return (window as any).__ENV__.VITE_API_BASE_URL;
  }
  if (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) {
    return process.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && (window as any).VITE_API_BASE_URL) {
    return (window as any).VITE_API_BASE_URL;
  }
  return '/api';
};

const api: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
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
      config.headers = config.headers || new AxiosHeaders();
      if (config.headers.set) {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else {
        (config.headers as any)['Authorization'] = `Bearer ${token}`;
      }
    }

    // 添加请求ID用于追踪
    config.headers = config.headers || new AxiosHeaders();
    if (config.headers.set) {
      config.headers.set('X-Request-ID', generateRequestId());
    } else {
      (config.headers as any)['X-Request-ID'] = generateRequestId();
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
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
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// 导出API实例
export default api;

// 通用API方法
export const apiHelpers = {
  // 通用GET请求
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.get<T>(url, config);
    return response.data;
  },

  // 通用POST请求
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.post<T>(url, data, config);
    return response.data;
  },

  // 通用PUT请求
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.put<T>(url, data, config);
    return response.data;
  },

  // 通用DELETE请求
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.delete<T>(url, config);
    return response.data;
  },

  // 分页GET请求
  async getPaginated<T = any>(url: string, config?: AxiosRequestConfig): Promise<PaginatedResponse<T>> {
    const response = await api.get<PaginatedResponse<T>>(url, config);
    return response.data;
  },
};