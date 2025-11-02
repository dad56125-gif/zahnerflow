/**
 * 循环上下文管理器
 *
 * 负责管理循环的执行状态、数据传递和控制逻辑
 * 提供循环生命周期的完整管理功能
 */

import { ElectrochemicalNode } from '../../nodes/types';
import { LoopInfo } from './LoopDetector';

// 循环执行状态
export type LoopExecutionState =
  | 'idle'        // 空闲状态
  | 'running'     // 运行中
  | 'paused'      // 暂停
  | 'completed'   // 已完成
  | 'error'       // 错误状态
  | 'cancelled';  // 已取消

// 循环数据接口
export interface LoopData {
  iteration: number;
  timestamp: number;
  nodeId: string;
  dataType: string;
  data: any;
  metadata?: Record<string, any>;
}

// 循环执行上下文
export interface LoopExecutionContext {
  loopId: string;
  state: LoopExecutionState;
  currentIteration: number;
  totalIterations: number;
  startTime: number;
  endTime?: number;
  elapsedTime: number;
  accumulatedData: LoopData[];
  currentNodeId?: string;
  error?: string;
  progress: number; // 0-100
  // Nodes inside this loop in execution order
  nodeIds?: string[];
}

// 循环事件接口
export interface LoopEvent {
  type: 'iteration_start' | 'iteration_end' | 'node_start' | 'node_end' | 'error' | 'completed';
  loopId: string;
  iteration?: number;
  nodeId?: string;
  timestamp: number;
  data?: any;
  error?: string;
}

// 循环配置接口
export interface LoopExecutionConfig {
  enableDataAccumulation: boolean;
  maxDataPoints: number;
  enableRealTimeUpdates: boolean;
  updateInterval: number;
  enableErrorRecovery: boolean;
  maxRetries: number;
}

/**
 * 循环上下文管理器类
 */
export class LoopContextManager {
  private static readonly DEFAULT_CONFIG: LoopExecutionConfig = {
    enableDataAccumulation: true,
    maxDataPoints: 10000,
    enableRealTimeUpdates: true,
    updateInterval: 100,
    enableErrorRecovery: true,
    maxRetries: 3
  };

  private static loopContexts: Map<string, LoopExecutionContext> = new Map();
  private static eventListeners: Map<string, Array<(event: LoopEvent) => void>> = new Map();
  private static updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 初始化循环上下文
   */
  public static initializeLoop(
    loopInfo: LoopInfo,
    config: Partial<LoopExecutionConfig> = {}
  ): LoopExecutionContext {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    const context: LoopExecutionContext = {
      loopId: loopInfo.id,
      state: 'idle',
      currentIteration: 0,
      totalIterations: (loopInfo as any).iteration_count ?? (loopInfo as any).iterationCount ?? 0,
      startTime: Date.now(),
      elapsedTime: 0,
      accumulatedData: [],
      progress: 0,
      nodeIds: (loopInfo as any).node_ids ?? (loopInfo as any).nodeIds ?? []
    };

    this.loopContexts.set(loopInfo.id, context);

    // 设置实时更新
    if (finalConfig.enableRealTimeUpdates) {
      this.setupRealTimeUpdates(loopInfo.id, finalConfig.updateInterval);
    }

    this.emitEvent({
      type: 'iteration_start',
      loopId: loopInfo.id,
      timestamp: Date.now()
    });

    return context;
  }

  /**
   * 开始循环执行
   */
  public static async startLoop(
    loopId: string,
    nodes: ElectrochemicalNode[],
    onNodeExecute?: (nodeId: string, iteration: number) => Promise<void>
  ): Promise<void> {
    const context = this.loopContexts.get(loopId);
    if (!context) {
      throw new Error(`循环 ${loopId} 未初始化`);
    }

    context.state = 'running';
    context.startTime = Date.now();

    this.emitEvent({
      type: 'iteration_start',
      loopId,
      iteration: 1,
      timestamp: Date.now()
    });

    try {
      for (let iteration = 1; iteration <= context.totalIterations; iteration++) {
        // 检查是否被暂停或取消
        if (context.state === 'paused') {
          await this.waitForResume(loopId);
        }

        if (context.state === 'cancelled' || context.state === 'error') {
          break;
        }

        context.currentIteration = iteration;
        context.progress = (iteration / context.totalIterations) * 100;

        // 执行循环中的所有节点
        for (const nodeId of this.getLoopNodeIds(loopId)) {
          if (context.state === 'cancelled' || context.state === 'error') {
            break;
          }

          context.currentNodeId = nodeId;

          this.emitEvent({
            type: 'node_start',
            loopId,
            iteration,
            nodeId,
            timestamp: Date.now()
          });

          if (onNodeExecute) {
            await onNodeExecute(nodeId, iteration);
          }

          this.emitEvent({
            type: 'node_end',
            loopId,
            iteration,
            nodeId,
            timestamp: Date.now()
          });
        }

        // 更新运行时间
        context.elapsedTime = Date.now() - context.startTime;

        this.emitEvent({
          type: 'iteration_end',
          loopId,
          iteration,
          timestamp: Date.now()
        });
      }

      // 循环完成
      if (context.state === 'running') {
        context.state = 'completed';
        context.endTime = Date.now();
        context.progress = 100;

        this.emitEvent({
          type: 'completed',
          loopId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      context.state = 'error';
      context.error = error instanceof Error ? error.message : '未知错误';

      this.emitEvent({
        type: 'error',
        loopId,
        timestamp: Date.now(),
        error: context.error
      });

      throw error;
    } finally {
      this.cleanupLoop(loopId);
    }
  }

  /**
   * 暂停循环
   */
  public static pauseLoop(loopId: string): void {
    const context = this.loopContexts.get(loopId);
    if (context && context.state === 'running') {
      context.state = 'paused';
    }
  }

  /**
   * 恢复循环
   */
  public static resumeLoop(loopId: string): void {
    const context = this.loopContexts.get(loopId);
    if (context && context.state === 'paused') {
      context.state = 'running';
    }
  }

  /**
   * 取消循环
   */
  public static cancelLoop(loopId: string): void {
    const context = this.loopContexts.get(loopId);
    if (context) {
      context.state = 'cancelled';
      context.endTime = Date.now();
    }
  }

  /**
   * 重置循环
   */
  public static resetLoop(loopId: string): void {
    const context = this.loopContexts.get(loopId);
    if (context) {
      context.state = 'idle';
      context.currentIteration = 0;
      context.elapsedTime = 0;
      context.progress = 0;
      context.accumulatedData = [];
      context.error = undefined;
      context.currentNodeId = undefined;
    }
  }

  /**
   * 添加循环数据
   */
  public static addLoopData(
    loopId: string,
    data: Omit<LoopData, 'timestamp'>
  ): void {
    const context = this.loopContexts.get(loopId);
    if (!context) {
      return;
    }

    const loopData: LoopData = {
      ...data,
      timestamp: Date.now()
    };

    context.accumulatedData.push(loopData);

    // 限制数据点数量
    const maxDataPoints = this.DEFAULT_CONFIG.maxDataPoints;
    if (context.accumulatedData.length > maxDataPoints) {
      context.accumulatedData = context.accumulatedData.slice(-maxDataPoints);
    }
  }

  /**
   * 获取循环上下文
   */
  public static getLoopContext(loopId: string): LoopExecutionContext | undefined {
    return this.loopContexts.get(loopId);
  }

  /**
   * 获取所有循环上下文
   */
  public static getAllLoopContexts(): Map<string, LoopExecutionContext> {
    return new Map(this.loopContexts);
  }

  /**
   * 获取循环数据
   */
  public static getLoopData(
    loopId: string,
    filter?: {
      iteration?: number;
      nodeId?: string;
      dataType?: string;
      startTime?: number;
      endTime?: number;
    }
  ): LoopData[] {
    const context = this.loopContexts.get(loopId);
    if (!context) {
      return [];
    }

    let data = [...context.accumulatedData];

    if (filter) {
      if (filter.iteration !== undefined) {
        data = data.filter(d => d.iteration === filter.iteration);
      }
      if (filter.nodeId) {
        data = data.filter(d => d.nodeId === filter.nodeId);
      }
      if (filter.dataType) {
        data = data.filter(d => d.dataType === filter.dataType);
      }
      if (filter.startTime !== undefined) {
        data = data.filter(d => d.timestamp >= filter.startTime!);
      }
      if (filter.endTime !== undefined) {
        data = data.filter(d => d.timestamp <= filter.endTime!);
      }
    }

    return data;
  }

  /**
   * 导出循环数据
   */
  public static exportLoopData(
    loopId: string,
    format: 'json' | 'csv' = 'json'
  ): string {
    const data = this.getLoopData(loopId);

    if (format === 'csv') {
      return this.convertToCSV(data);
    } else {
      return JSON.stringify(data, null, 2);
    }
  }

  /**
   * 获取循环统计信息
   */
  public static getLoopStatistics(loopId: string): {
    totalIterations: number;
    completedIterations: number;
    progress: number;
    elapsedTime: number;
    dataPointsCount: number;
    averageIterationTime: number;
    estimatedTimeRemaining: number;
  } | null {
    const context = this.loopContexts.get(loopId);
    if (!context) {
      return null;
    }

    const averageIterationTime = context.currentIteration > 0
      ? context.elapsedTime / context.currentIteration
      : 0;

    const remainingIterations = context.totalIterations - context.currentIteration;
    const estimatedTimeRemaining = context.state === 'running'
      ? remainingIterations * averageIterationTime
      : 0;

    return {
      totalIterations: context.totalIterations,
      completedIterations: context.currentIteration,
      progress: context.progress,
      elapsedTime: context.elapsedTime,
      dataPointsCount: context.accumulatedData.length,
      averageIterationTime,
      estimatedTimeRemaining
    };
  }

  /**
   * 添加事件监听器
   */
  public static addEventListener(
    loopId: string,
    eventTypes: LoopEvent['type'][],
    listener: (event: LoopEvent) => void
  ): void {
    const key = `${loopId}:${[...eventTypes].sort().join(',')}`;
    const listeners = this.eventListeners.get(key) || [];
    listeners.push(listener);
    this.eventListeners.set(key, listeners);
  }

  /**
   * 移除事件监听器
   */
  public static removeEventListener(
    loopId: string,
    eventTypes: LoopEvent['type'][],
    listener: (event: LoopEvent) => void
  ): void {
    const key = `${loopId}:${[...eventTypes].sort().join(',')}`;
    const listeners = this.eventListeners.get(key) || [];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(key, listeners);
    }
  }

  /**
   * 清理循环
   */
  public static cleanupLoop(loopId: string): void {
    // 清理定时器
    const interval = this.updateIntervals.get(loopId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(loopId);
    }

    // 清理事件监听器
    const keysToDelete: string[] = [];
    for (const key of this.eventListeners.keys()) {
      if (key.startsWith(`${loopId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.eventListeners.delete(key));
  }

  /**
   * 清理所有循环
   */
  public static cleanupAllLoops(): void {
    for (const loopId of this.loopContexts.keys()) {
      this.cleanupLoop(loopId);
    }
    this.loopContexts.clear();
  }

  /**
   * 获取循环节点ID列表（新）
   */
  private static getLoopNodeIds(loopId: string): string[] {
    const ctx = this.loopContexts.get(loopId);
    return ctx?.nodeIds ?? [];
  }

  // 私有方法

  /**
   * 发送事件
   */
  private static emitEvent(event: LoopEvent): void {
    // 查找匹配的监听器
    for (const [key, listeners] of this.eventListeners) {
      const [loopId, eventTypes] = key.split(':');
      if (loopId === event.loopId && eventTypes.split(',').includes(event.type)) {
        listeners.forEach(listener => {
          try {
            listener(event);
          } catch (error) {
            console.error('循环事件监听器错误:', error);
          }
        });
      }
    }
  }

  /**
   * 设置实时更新
   */
  private static setupRealTimeUpdates(loopId: string, interval: number): void {
    const timer = setInterval(() => {
      const context = this.loopContexts.get(loopId);
      if (context && context.state === 'running') {
        context.elapsedTime = Date.now() - context.startTime;

        this.emitEvent({
          type: 'iteration_start',
          loopId,
          timestamp: Date.now()
        });
      }
    }, interval);

    this.updateIntervals.set(loopId, timer);
  }

  /**
   * 等待恢复
   */
  private static async waitForResume(loopId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const context = this.loopContexts.get(loopId);
        if (!context || context.state !== 'paused') {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * 获取循环节点ID列表
   */
  private static getLoopNodeIdsLegacy(loopId: string): string[] {
    // 这里应该从循环检测器或全局状态获取节点ID
    // 暂时返回空数组，实际实现时需要注入依赖
    return [];
  }

  /**
   * 转换为CSV格式
   */
  private static convertToCSV(data: LoopData[]): string {
    if (data.length === 0) {
      return '';
    }

    const headers = ['iteration', 'timestamp', 'nodeId', 'dataType', 'data'];
    const rows = data.map(item => [
      item.iteration,
      item.timestamp,
      item.nodeId,
      item.dataType,
      JSON.stringify(item.data)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

export default LoopContextManager;
