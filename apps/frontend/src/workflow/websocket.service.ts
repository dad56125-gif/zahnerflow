import { io, Socket } from 'socket.io-client';

// 添加一个全局变量来确保通知ID的唯一性
let notificationCounter = 0;

// --- 【新增】全量快照接口 (需与后端 ExecutionSnapshot 保持一致) ---
export interface ExecutionSnapshot {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  workflowId: string | null;
  executionId: string | null;
  currentStep: {
    nodeId: string | null;
    nodeType: string | null;
    index: number;
    total: number;
  } | null;
  startTime: string | null; // JSON 传输后 Date 变为 string
  duration: number;
  error: string | null;
  timestamp: string;
}

export interface NodeStatusUpdate {
  workflowId: string;
  nodeId: string;
  status: 'ready' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'pending';
  data?: any;
  timestamp: Date;
}

export interface ExecutionUpdate {
  workflowId: string;
  executionId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  timestamp: Date;
}

export interface NodeCompleted {
  workflowId: string;
  nodeId: string;
  result: {
    status: string;
    message: string;
  };
  timestamp: Date;
}

export interface WebSocketError {
  workflowId: string;
  error: string;
  timestamp: Date;
}

export interface ConsoleLog {
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  data?: any;
  timestamp: Date;
}

// --- 【新增】节点重置事件接口 ---
export interface NodesResetEvent {
  targetStatus: 'ready' | string;
  timestamp: Date;
  message: string;
}

export class WorkflowWebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;

  // 回调函数集合
  private callbacks = {
    connected: [] as (() => void)[],
    disconnected: [] as (() => void)[],
    // --- 【新增】全量快照回调 ---
    systemStateSnapshot: [] as ((snapshot: ExecutionSnapshot) => void)[],

    nodeStatusUpdate: [] as ((update: NodeStatusUpdate) => void)[],
    executionUpdate: [] as ((update: ExecutionUpdate) => void)[],
    nodeCompleted: [] as ((completed: NodeCompleted) => void)[],
    error: [] as ((error: WebSocketError) => void)[],
    consoleLog: [] as ((log: ConsoleLog) => void)[],
    notification: [] as ((notification: any) => void)[],
    // --- 【新增】节点重置回调 ---
    nodesReset: [] as ((resetEvent: NodesResetEvent) => void)[],
  };

  constructor(private serverUrl: string = window.location.origin) {}

  // 连接WebSocket
  connect(): void {
    if (this.socket) return;

    console.log(`Connecting to WebSocket server: ${this.serverUrl}`);

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      retries: 3,
    });

    this.setupEventHandlers();
  }

  // 设置事件处理器
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.callbacks.connected.forEach(callback => callback());
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.callbacks.disconnected.forEach(callback => callback());
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnected = false;
      this.attemptReconnect();
    });

    // --- 【新增】监听全量状态快照 ---
    // 这是单一真理源的核心数据通道
    this.socket.on('systemStateSnapshot', (snapshot: ExecutionSnapshot) => {
      this.callbacks.systemStateSnapshot.forEach(callback => callback(snapshot));
    });

    // 节点状态更新 (保留用于局部UI刷新，如节点变色)
    this.socket.on('nodeStatusUpdate', (update: NodeStatusUpdate) => {
      this.callbacks.nodeStatusUpdate.forEach(callback => callback(update));
    });

    // 执行状态更新 (保留用于兼容旧逻辑，建议逐步废弃)
    this.socket.on('executionUpdate', (update: ExecutionUpdate) => {
      this.callbacks.executionUpdate.forEach(callback => callback(update));
    });

    this.socket.on('nodeCompleted', (completed: NodeCompleted) => {
      this.callbacks.nodeCompleted.forEach(callback => callback(completed));
    });

    this.socket.on('error', (error: WebSocketError) => {
      console.error('WebSocket error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });

    this.socket.on('consoleLog', (log: ConsoleLog) => {
      this.callbacks.consoleLog.forEach(callback => callback(log));
    });

    this.socket.on('notification', (notification: any) => {
      this.sendToNotificationPanel(notification);
      this.sendToConsole(notification);
      if (!notification.id) {
        notification.id = `backend_notification_${Date.now()}_${++notificationCounter}`;
      }
      this.callbacks.notification.forEach(callback => callback(notification));
    });

    // --- 【新增】监听节点重置事件 ---
    this.socket.on('nodesReset', (resetEvent: NodesResetEvent) => {
      this.callbacks.nodesReset.forEach(callback => callback(resetEvent));
    });
  }

  // 尝试重新连接
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // 基础操作方法
  joinWorkflow(workflowId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('joinWorkflow', { workflowId });
  }

  leaveWorkflow(workflowId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('leaveWorkflow', { workflowId });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  get connected(): boolean { return this.isConnected; }
  getSocket(): Socket | null { return this.socket; }

  // --- 【新增】注册节点重置回调 ---
  onNodesReset(callback: (resetEvent: NodesResetEvent) => void): void {
    this.callbacks.nodesReset.push(callback);
  }

  // 所有缺失的回调注册方法
  onConnected(callback: () => void): void { this.callbacks.connected.push(callback); }
  onDisconnected(callback: () => void): void { this.callbacks.disconnected.push(callback); }
  onSystemStateSnapshot(callback: (snapshot: ExecutionSnapshot) => void): void { this.callbacks.systemStateSnapshot.push(callback); }
  onNodeStatusUpdate(callback: (update: NodeStatusUpdate) => void): void { this.callbacks.nodeStatusUpdate.push(callback); }
  onExecutionUpdate(callback: (update: ExecutionUpdate) => void): void { this.callbacks.executionUpdate.push(callback); }
  onNodeCompleted(callback: (completed: NodeCompleted) => void): void { this.callbacks.nodeCompleted.push(callback); }
  onError(callback: (error: WebSocketError) => void): void { this.callbacks.error.push(callback); }
  onConsoleLog(callback: (log: ConsoleLog) => void): void { this.callbacks.consoleLog.push(callback); }
  onNotification(callback: (notification: any) => void): void { this.callbacks.notification.push(callback); }

  removeCallback(callback: (...args: any[]) => void): void {
    Object.keys(this.callbacks).forEach((key) => {
      const index = (this.callbacks as any)[key].indexOf(callback);
      if (index > -1) {
        (this.callbacks as any)[key].splice(index, 1);
      }
    });
  }

  // 辅助方法
  private sendToNotificationPanel(notification: any): void {
    const panelNotification = { ...notification, layerTrace: `${notification.layerTrace}[s]` };
    window.dispatchEvent(new CustomEvent('notification', { detail: panelNotification }));
  }

  private sendToConsole(notification: any): void {
    const consoleNotification = { ...notification, layerTrace: `${notification.layerTrace}[S]` };
    const logMessage = `[${consoleNotification.type.toUpperCase()}] [${consoleNotification.source}:${consoleNotification.layerTrace}] ${consoleNotification.title}: ${consoleNotification.message}`;
    switch (consoleNotification.type) {
      case 'info': console.info(logMessage); break;
      case 'success': console.log(logMessage); break;
      case 'warning': console.warn(logMessage); break;
      case 'error': console.error(logMessage); break;
      default: console.log(logMessage);
    }
  }
}

export const workflowWebSocketService = new WorkflowWebSocketService();