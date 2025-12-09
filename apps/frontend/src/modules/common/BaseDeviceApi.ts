/**
 * API 封装抽象基类
 * 
 * 提供设备 API 调用的通用实现，包括：
 * - HTTP 请求封装
 * - 错误处理和转换
 * - 通用端点（ports, connect, disconnect, status）
 */

import { DeviceError } from './types';

/**
 * API 请求基础函数
 * 
 * @param baseUrl - API 基础 URL
 * @param endpoint - 端点路径
 * @param options - fetch 配置
 */
export async function apiRequest<T>(
    baseUrl: string,
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${baseUrl}${endpoint}`;

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
        throw error as DeviceError;
    }
}

/**
 * 设备 API 抽象基类
 * 
 * 提供通用静态方法供子类使用
 * 子类应定义自己的 API_BASE 并扩展设备特定端点
 */
export abstract class BaseDeviceApi {
    /** API 基础路径（子类必须定义） */
    protected static API_BASE: string;

    /**
     * 封装的请求方法
     */
    protected static async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        return apiRequest<T>(this.API_BASE, endpoint, options);
    }

    /**
     * 获取可用端口列表
     */
    static async getPorts(): Promise<string[]> {
        return this.request<string[]>('/ports');
    }

    /**
     * 断开设备连接
     */
    static async disconnect(): Promise<void> {
        return this.request<void>('/disconnect', { method: 'POST' });
    }

    /**
     * 构建 URL 查询参数
     */
    protected static buildQueryString(params: Record<string, unknown>): string {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                searchParams.set(key, String(value));
            }
        });
        return searchParams.toString();
    }
}
