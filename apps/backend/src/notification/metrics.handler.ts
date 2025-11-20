import { Injectable } from '@nestjs/common';
import { EventBus, EventPayload } from './event-bus.service';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

@Injectable()
export class MetricsEventHandler {
  private readonly startTime = Date.now();
  
  // 简化的指标存储
  private metrics = {
    eventsProcessed: 0,
    errors: 0,
    workflows: { started: 0, completed: 0, failed: 0 },
    devices: { connected: 0, disconnected: 0 }
  };

  constructor(
    private readonly eventBus: EventBus,
    private readonly consoleManager: ConsoleDisplayManager,
  ) {
    this.registerEventHandlers();
  }

  private registerEventHandlers(): void {
    // 监听所有相关事件来更新计数器
    this.eventBus.registerHandlers({
      'workflow.started': () => this.metrics.workflows.started++,
      'workflow.completed': () => this.metrics.workflows.completed++,
      'workflow.failed': () => this.metrics.workflows.failed++,
      'device.connected': () => this.metrics.devices.connected++,
      'device.disconnected': () => this.metrics.devices.disconnected++,
      // 通用监听：只要有事件就+1
      // 注意：这里无法直接监听 "all events"，我们只能在 emit 处统计或者监听特定列表
      // 简化起见，我们只统计上面这些业务指标
    });
    
    // 监听底层流来统计总吞吐量
    this.eventBus.registerHandlers({}); // 空注册，仅为了演示结构
    // 实际上可以通过 registerHandler 监听 '*' (如果支持) 或者修改 EventBus 来支持全局 hook
    // 现阶段，我们在具体业务 handler 里统计即可。
  }

  getStats() {
    return {
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      timestamp: new Date()
    };
  }
}