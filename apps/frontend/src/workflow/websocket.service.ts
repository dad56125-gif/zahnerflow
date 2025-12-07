// src/services/websocket.service.ts
import { io, Socket } from 'socket.io-client';
import {
  ExecutionSnapshot,
  NodeStatusUpdate,
  NodesResetEvent,
  NotificationMessage
} from '../types/Interfaces'; // ✅ 统一引用
import { getWsUrl } from '../config/env.config';

export class WorkflowWebSocketService {
  private socket: Socket | null = null;
  private callbacks = {
    connected: [] as (() => void)[],
    disconnected: [] as (() => void)[],
    systemStateSnapshot: [] as ((s: ExecutionSnapshot) => void)[], // ✅ 类型清晰
    nodeStatusUpdate: [] as ((u: NodeStatusUpdate) => void)[],
    notification: [] as ((n: NotificationMessage) => void)[],
    nodesReset: [] as ((e: NodesResetEvent) => void)[],
    measurementData: [] as ((d: any) => void)[],
  };

  constructor(private serverUrl: string = getWsUrl()) {}

  connect() {
    if (this.socket) return;
    this.socket = io(this.serverUrl, { transports: ['websocket'], timeout: 5000 });
    this.setupHandlers();
  }

  private setupHandlers() {
    if (!this.socket) return;
    
    // 基础连接
    this.socket.on('connect', () => this.trigger('connected'));
    this.socket.on('disconnect', () => this.trigger('disconnected'));

    // 业务事件
    this.socket.on('systemStateSnapshot', (d) => this.trigger('systemStateSnapshot', d));
    this.socket.on('nodeStatusUpdate', (d) => this.trigger('nodeStatusUpdate', d));
    this.socket.on('nodesReset', (d) => this.trigger('nodesReset', d));
    this.socket.on('measurementData', (d) => this.trigger('measurementData', d));
    
    // 通知特殊处理 (打印日志 + 触发回调)
    this.socket.on('notification', (n) => {
      console.log(`[Notify] ${n.title}: ${n.message}`);
      this.trigger('notification', n);
    });
  }

  // 通用触发器 (减少重复代码)
  private trigger(event: keyof typeof this.callbacks, data?: any) {
    (this.callbacks[event] as Function[]).forEach(cb => cb(data));
  }

  // 暴露出的监听方法
  onSystemStateSnapshot(cb: (s: ExecutionSnapshot) => void) { this.callbacks.systemStateSnapshot.push(cb); }
  onNodeStatusUpdate(cb: (u: NodeStatusUpdate) => void) { this.callbacks.nodeStatusUpdate.push(cb); }
  onNodesReset(cb: (e: NodesResetEvent) => void) { this.callbacks.nodesReset.push(cb); }
  onNotification(cb: (n: NotificationMessage) => void) { this.callbacks.notification.push(cb); }
  onMeasurementData(cb: (d: any) => void) { this.callbacks.measurementData.push(cb); }
  
  // 动作
  joinWorkflow(wid: string) { this.socket?.emit('joinWorkflow', { workflowId: wid }); }
  leaveWorkflow(wid: string) { this.socket?.emit('leaveWorkflow', { workflowId: wid }); }
}

export const workflowWebSocketService = new WorkflowWebSocketService();