import { io, Socket } from 'socket.io-client';

// 添加一个全局变量来确保通知ID的唯一性
let notificationCounter = 0;


export interface NodeStatusUpdate {
  workflowId: string;
  nodeId: string;
  status: 'ready' | 'running' | 'completed' | 'error' | 'warning';
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
    nodeStatusUpdate: [] as ((update: NodeStatusUpdate) => void)[],
    executionUpdate: [] as ((update: ExecutionUpdate) => void)[],
    nodeCompleted: [] as ((completed: NodeCompleted) => void)[],
    error: [] as ((error: WebSocketError) => void)[],
    consoleLog: [] as ((log: ConsoleLog) => void)[],
    notification: [] as ((notification: any) => void)[],
  };

  constructor(private serverUrl: string = window.location.origin) {}

  // 连接WebSocket
  connect(): void {
    // 如果socket实例已存在，让socket.io自己处理连接状态
    if (this.socket) {
      return;
    }

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

    // 连接事件
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.callbacks.connected.forEach(callback => callback());
    });

    // 断开连接事件
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;

      this.callbacks.disconnected.forEach(callback => callback());

      // 尝试重新连接
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    // 连接错误事件
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnected = false;

      this.attemptReconnect();
    });

    // 节点状态更新事件 - 业务逻辑通知由后端推送，前端直接处理回调
    this.socket.on('nodeStatusUpdate', (update: NodeStatusUpdate) => {
      this.callbacks.nodeStatusUpdate.forEach(callback => callback(update));
    });

    // 执行状态更新事件 - 业务逻辑通知由后端推送，前端直接处理回调
    this.socket.on('executionUpdate', (update: ExecutionUpdate) => {
      this.callbacks.executionUpdate.forEach(callback => callback(update));
    });

    // 节点完成事件 - 业务逻辑通知由后端推送，前端直接处理回调
    this.socket.on('nodeCompleted', (completed: NodeCompleted) => {
      this.callbacks.nodeCompleted.forEach(callback => callback(completed));
    });

    // 错误事件
    this.socket.on('error', (error: WebSocketError) => {
      console.error('WebSocket error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });

    // Console日志事件 - 后端推送的调试信息，前端直接处理回调
    this.socket.on('consoleLog', (log: ConsoleLog) => {
      this.callbacks.consoleLog.forEach(callback => callback(log));
    });

    // 通知事件
    this.socket.on('notification', (notification: any) => {
      // 分别发送到两个发送层，发送层自己追加标识
      this.sendToNotificationPanel(notification);
      this.sendToConsole(notification);
      
      // 确保接收到的通知也有唯一ID
      if (!notification.id) {
        notification.id = `backend_notification_${Date.now()}_${++notificationCounter}`;
      }
      this.callbacks.notification.forEach(callback => callback(notification));
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

  // 加入工作流房间
  joinWorkflow(workflowId: string): void {
    if (!this.socket?.connected) {
      console.error('Cannot join workflow: WebSocket not connected');
      return;
    }

    console.log(`Joining workflow: ${workflowId}`);
    this.socket.emit('joinWorkflow', { workflowId });
  }

  // 离开工作流房间
  leaveWorkflow(workflowId: string): void {
    if (!this.socket?.connected) {
      console.error('Cannot leave workflow: WebSocket not connected');
      return;
    }

    console.log(`Leaving workflow: ${workflowId}`);
    this.socket.emit('leaveWorkflow', { workflowId });
  }

  // 断开连接
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // 注册回调函数
  onConnected(callback: () => void): void {
    this.callbacks.connected.push(callback);
  }

  onDisconnected(callback: () => void): void {
    this.callbacks.disconnected.push(callback);
  }

  onNodeStatusUpdate(callback: (update: NodeStatusUpdate) => void): void {
    this.callbacks.nodeStatusUpdate.push(callback);
  }

  onExecutionUpdate(callback: (update: ExecutionUpdate) => void): void {
    this.callbacks.executionUpdate.push(callback);
  }

  onNodeCompleted(callback: (completed: NodeCompleted) => void): void {
    this.callbacks.nodeCompleted.push(callback);
  }

  onError(callback: (error: WebSocketError) => void): void {
    this.callbacks.error.push(callback);
  }

  onConsoleLog(callback: (log: ConsoleLog) => void): void {
    this.callbacks.consoleLog.push(callback);
  }

  onNotification(callback: (notification: any) => void): void {
    this.callbacks.notification.push(callback);
  }

  // 移除回调函数
  removeCallback(callback: (...args: any[]) => void): void {
    Object.keys(this.callbacks).forEach((key) => {
      const index = (this.callbacks as any)[key].indexOf(callback);
      if (index > -1) {
        (this.callbacks as any)[key].splice(index, 1);
      }
    });
  }

  // 获取连接状态
  get connected(): boolean {
    return this.isConnected;
  }

  // 获取Socket实例
  getSocket(): Socket | null {
    return this.socket;
  }

  // 发送层 - 通知面板 [s]
  private sendToNotificationPanel(notification: any): void {
    // 追加通知面板发送层标识
    const panelNotification = {
      ...notification,
      layerTrace: `${notification.layerTrace}[s]`
    };

    // 将通知分发给通知面板组件
    window.dispatchEvent(new CustomEvent('notification', { 
      detail: panelNotification 
    }));
  }

  // 发送层 - 控制台输出 [S]
  private sendToConsole(notification: any): void {
    // 追加控制台发送层标识
    const consoleNotification = {
      ...notification,
      layerTrace: `${notification.layerTrace}[S]`
    };

    const logMessage = `[${consoleNotification.type.toUpperCase()}] [${consoleNotification.source}:${consoleNotification.layerTrace}] ${consoleNotification.title}: ${consoleNotification.message}`;
    
    switch (consoleNotification.type) {
      case 'info':
        console.info(logMessage);
        break;
      case 'success':
        console.log(logMessage);
        break;
      case 'warning':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }

}

// 创建单例实例
export const workflowWebSocketService = new WorkflowWebSocketService();