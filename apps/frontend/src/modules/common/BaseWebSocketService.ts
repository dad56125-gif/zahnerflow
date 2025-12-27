/**
 * WebSocket 服务抽象基类
 * 
 * 提供设备 WebSocket 连接管理的通用实现，包括：
 * - Socket.IO 连接管理
 * - 自动重连（指数退避）
 * - 回调注册与管理
 * - 订阅状态跟踪
 */

import { io, Socket } from 'socket.io-client';

/** WebSocket 服务配置 */
export interface WsServiceConfig {
    /** 设备名称（用于日志） */
    deviceName: string;
    /** 订阅事件名（如 'subscribeToFurnace'） */
    subscribeEvent: string;
    /** 取消订阅事件名 */
    unsubscribeEvent: string;
    /** 最大重连次数 */
    maxReconnectAttempts?: number;
    /** 初始重连延迟（毫秒） */
    reconnectDelay?: number;
}

/** 基础回调集合 */
export interface BaseCallbacks {
    connected: (() => void)[];
    disconnected: (() => void)[];
    error: ((error: unknown) => void)[];
}

/**
 * WebSocket 服务抽象基类
 * 
 * 子类需要：
 * 1. 在构造函数中调用 super(serverUrl, config)
 * 2. 扩展 callbacks 类型添加设备特定事件
 * 3. 覆盖 setupDeviceEventHandlers() 注册设备特定事件
 * 4. 创建单例导出
 */
export abstract class BaseWebSocketService<TCallbacks extends BaseCallbacks = BaseCallbacks> {
    protected socket: Socket | null = null;
    protected reconnectAttempts = 0;
    protected maxReconnectAttempts: number;
    protected reconnectDelay: number;
    protected isConnected = false;
    protected isSubscribed = false;
    protected config: WsServiceConfig;

    // 基础回调集合 - 子类应扩展此类型
    protected callbacks: TCallbacks;

    constructor(
        protected serverUrl: string = window.location.origin,
        config: WsServiceConfig
    ) {
        this.config = config;
        this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
        this.reconnectDelay = config.reconnectDelay ?? 1000;

        // 初始化基础回调 - 子类需要自己扩展
        this.callbacks = {
            connected: [],
            disconnected: [],
            error: [],
        } as TCallbacks;
    }

    /**
     * 连接 WebSocket 服务器
     */
    connect(): void {
        if (this.socket) {
            return;
        }

        console.log(`Connecting to ${this.config.deviceName} WebSocket server: ${this.serverUrl}`);

        this.socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            timeout: 5000,
            retries: 3,
        });

        this.setupBaseEventHandlers();
        this.setupDeviceEventHandlers();
    }

    /**
     * 设置基础事件处理器（连接、断开、错误）
     */
    private setupBaseEventHandlers(): void {
        if (!this.socket) return;

        // 连接成功
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log(`${this.config.deviceName} WebSocket connected`);
            this.callbacks.connected.forEach(cb => cb());
        });

        // 断开连接
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.isSubscribed = false;
            console.log(`${this.config.deviceName} WebSocket disconnected: ${reason}`);
            this.callbacks.disconnected.forEach(cb => cb());

            if (reason !== 'io client disconnect') {
                this.attemptReconnect();
            }
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            console.error(`${this.config.deviceName} WebSocket connection error:`, error);
            this.isConnected = false;
            this.callbacks.error.forEach(cb => cb(error));
            this.attemptReconnect();
        });

        // 通用错误
        this.socket.on('error', (error: unknown) => {
            console.error(`${this.config.deviceName} WebSocket error:`, error);
            this.callbacks.error.forEach(cb => cb(error));
        });
    }

    /**
     * 设置设备特定事件处理器
     * 子类必须实现此方法注册设备特定的 WebSocket 事件
     */
    protected abstract setupDeviceEventHandlers(): void;

    /**
     * 尝试重新连接
     */
    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`Max ${this.config.deviceName} WebSocket reconnection attempts reached`);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(
            `Attempting ${this.config.deviceName} WebSocket reconnection ` +
            `${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
        );

        setTimeout(() => {
            if (this.socket && !this.socket.connected) {
                this.connect();
            }
        }, delay);
    }

    /**
     * 订阅设备更新
     */
    subscribe(): void {
        if (!this.socket?.connected) {
            console.error(`Cannot subscribe to ${this.config.deviceName}: WebSocket not connected`);
            return;
        }

        console.log(`Subscribing to ${this.config.deviceName} updates`);
        this.socket.emit(this.config.subscribeEvent);
    }

    /**
     * 取消订阅设备更新
     */
    unsubscribe(): void {
        if (!this.socket?.connected) {
            console.error(`Cannot unsubscribe from ${this.config.deviceName}: WebSocket not connected`);
            return;
        }

        console.log(`Unsubscribing from ${this.config.deviceName} updates`);
        this.socket.emit(this.config.unsubscribeEvent);
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.isSubscribed = false;

            // 🔧 清理所有回调数组，防止回调累积导致内存泄漏
            Object.keys(this.callbacks).forEach(key => {
                (this.callbacks as unknown as Record<string, unknown[]>)[key] = [];
            });
        }
    }

    /**
     * 注册连接回调
     */
    onConnected(callback: () => void): void {
        this.callbacks.connected.push(callback);
    }

    /**
     * 注册断开连接回调
     */
    onDisconnected(callback: () => void): void {
        this.callbacks.disconnected.push(callback);
    }

    /**
     * 注册错误回调
     */
    onError(callback: (error: unknown) => void): void {
        this.callbacks.error.push(callback);
    }

    /**
     * 移除回调函数
     */
    removeCallback(callback: (...args: unknown[]) => void): void {
        Object.keys(this.callbacks).forEach((key) => {
            const arr = (this.callbacks as unknown as Record<string, unknown[]>)[key];
            const index = arr.indexOf(callback);
            if (index > -1) {
                arr.splice(index, 1);
            }
        });
    }

    /**
     * 标记订阅成功
     */
    protected markSubscribed(): void {
        this.isSubscribed = true;
    }

    /**
     * 标记取消订阅
     */
    protected markUnsubscribed(): void {
        this.isSubscribed = false;
    }

    /** 获取连接状态 */
    get connected(): boolean {
        return this.isConnected;
    }

    /** 获取订阅状态 */
    get subscribed(): boolean {
        return this.isSubscribed;
    }

    /** 获取 Socket 实例 */
    getSocket(): Socket | null {
        return this.socket;
    }
}
