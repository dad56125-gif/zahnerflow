/**
 * 设备模块共用类型定义
 * 
 * 统一定义所有设备模块共享的类型，避免重复定义
 */

// ==================== 基础设备类型 ====================

/** 设备连接状态 */
export type DeviceConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/** 设备错误类型 */
export interface DeviceError {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    retry_after?: number;
}

/** 设备操作状态 */
export type DeviceOperationStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'running'
    | 'paused'
    | 'stopped'
    | 'error';

// ==================== 基础配置类型 ====================

/** 通用设备配置 */
export interface BaseDeviceConfig {
    name: string;
    address: number;
    port?: string;
    timeout?: number;
    polling_interval?: number;
}

/** 通用连接请求参数 */
export interface BaseConnectRequest {
    port: string;
    baudrate?: number;
    timeout?: number;
}

// ==================== 查询与历史类型 ====================

/** API查询参数类型 */
export interface HistoryQueryParams {
    from?: string;     // ISO 时间字符串
    to?: string;       // ISO 时间字符串
    limit?: number;    // 返回记录数限制
    offset?: number;   // 偏移量
    downsample?: number; // 降采样间隔
}

/** 图表数据点 */
export interface ChartDataPoint {
    timestamp: string;
    value: number;
    label?: string;
}

/** 通用图表数据 */
export interface BaseChartData {
    data: ChartDataPoint[];
    timeRange?: {
        start: string;
        end: string;
    };
}

// ==================== 通用响应类型 ====================

/** 通用API响应 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

// ==================== 日志与通知类型 ====================

/** 日志条目类型 */
export type LogEntryType = 'success' | 'info' | 'warning' | 'error';

/** 日志条目 */
export interface LogEntry {
    id: string;
    timestamp: string;
    type: LogEntryType;
    message: string;
}

/** 通知消息 */
export interface NotificationMessage {
    id: string;
    type: LogEntryType;
    title: string;
    message: string;
    duration?: number;
    timestamp?: string;
}

// ==================== WebSocket 事件类型 ====================

/** WebSocket 回调类型 */
export type WsCallback<T = unknown> = (data: T) => void;

/** WebSocket 事件映射基类 */
export interface BaseWsCallbacks {
    connected: (() => void)[];
    disconnected: (() => void)[];
    error: ((error: unknown) => void)[];
}

// ==================== 设备状态基类 ====================

/** 设备状态基础接口 */
export interface BaseDeviceState {
    connection_status: DeviceConnectionStatus;
    loading: boolean;
    error: DeviceError | null;
    logs: LogEntry[];
}

/** 设备控制基础接口 */
export interface BaseDeviceControls {
    connect: (...args: unknown[]) => Promise<void>;
    disconnect: () => Promise<void>;
    reset: () => void;
    clearError: () => void;
}
