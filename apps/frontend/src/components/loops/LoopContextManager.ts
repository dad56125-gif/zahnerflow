/**
 * 循环上下文管理器
 *
 * 负责管理循环的状态信息和数据展示
 * 专注于循环检测、状态监控和数据管理，不包含执行控制功能
 */

import { ElectrochemicalNode, LoopStartNode, LoopEndNode, LoopContext as PairLoopContext, LoopPair } from '../../nodes/types';
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
  node_id: string;
  data_type: string;
  data: any;
  metadata?: Record<string, any>;
}

// 循环执行上下文
export interface LoopExecutionContext {
  loop_id: string;
  state: LoopExecutionState;
  current_iteration: number;
  total_iterations: number;
  start_time: number;
  end_time?: number;
  elapsed_time: number;
  accumulated_data: LoopData[];
  current_node_id?: string;
  error?: string;
  progress: number; // 0-100
  // Nodes inside this loop in execution order
  node_ids?: string[];
}

// 循环事件接口
export interface LoopEvent {
  type: 'iteration_start' | 'iteration_end' | 'node_start' | 'node_end' | 'error' | 'completed';
  loop_id: string;
  iteration?: number;
  node_id?: string;
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

  // Pair/stack and suffix utilities (merged from services/LoopContextManager)
  private static pairLoopStack: PairLoopContext[] = [];
  private static executionNodeNames: Map<string, string> = new Map();
  private static loopPairs: Map<string, LoopPair> = new Map();

  /**
   * 初始化循环上下文
   */
  public static initializeLoop(
    loopInfo: LoopInfo,
    config: Partial<LoopExecutionConfig> = {}
  ): LoopExecutionContext {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    const context: LoopExecutionContext = {
      loop_id: loopInfo.id,
      state: 'idle',
      current_iteration: 0,
      total_iterations: (loopInfo as any).iteration_count ?? 0,
      start_time: Date.now(),
      elapsed_time: 0,
      accumulated_data: [],
      progress: 0,
      node_ids: (loopInfo as any).node_ids ?? []
    };

    this.loopContexts.set(loopInfo.id, context);

    // 设置实时更新
    if (finalConfig.enableRealTimeUpdates) {
      this.setupRealTimeUpdates(loopInfo.id, finalConfig.updateInterval);
    }

    this.emitEvent({
      type: 'iteration_start',
      loop_id: loopInfo.id,
      timestamp: Date.now()
    });

    return context;
  }

  // 移除了执行相关的方法：startLoop, pauseLoop, resumeLoop, cancelLoop
  // 循环系统现在只提供状态管理和信息展示功能

  /**
   * 重置循环
   */
  public static resetExecutionLoop(loopId: string): void {
    const context = this.loopContexts.get(loopId);
    if (context) {
      context.state = 'idle';
      context.current_iteration = 0;
      context.elapsed_time = 0;
      context.progress = 0;
      context.accumulated_data = [];
      context.error = undefined;
      context.current_node_id = undefined;
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

    context.accumulated_data.push(loopData);

    // 限制数据点数量
    const maxDataPoints = this.DEFAULT_CONFIG.maxDataPoints;
    if (context.accumulated_data.length > maxDataPoints) {
      context.accumulated_data = context.accumulated_data.slice(-maxDataPoints);
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

    let data = [...context.accumulated_data];

    if (filter) {
      if (filter.iteration !== undefined) {
        data = data.filter(d => d.iteration === filter.iteration);
      }
      if (filter.nodeId) {
        data = data.filter(d => d.node_id === filter.nodeId);
      }
      if (filter.dataType) {
        data = data.filter(d => d.data_type === filter.dataType);
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

    const averageIterationTime = context.current_iteration > 0
      ? context.elapsed_time / context.current_iteration
      : 0;

    const remainingIterations = context.total_iterations - context.current_iteration;
    const estimatedTimeRemaining = context.state === 'running'
      ? remainingIterations * averageIterationTime
      : 0;

    return {
      totalIterations: context.total_iterations,
      completedIterations: context.current_iteration,
      progress: context.progress,
      elapsedTime: context.elapsed_time,
      dataPointsCount: context.accumulated_data.length,
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

  // ----------------------
  // Pair/Stack API (snake_case data)
  // ----------------------

  public static enterLoop(startNode: LoopStartNode, endNode: LoopEndNode, level: number): void {
    const loop_id = startNode.data.parameters.loop_id;
    const iterations = startNode.data.parameters.loop_count;
    const variable_name = startNode.data.parameters.loop_variable;
    const start_value = startNode.data.parameters.start_value;

    const context: PairLoopContext = {
      loop_id,
      start_node: startNode,
      end_node: endNode,
      level,
      iterations,
      current_iteration: 0,
      variable_name,
      variable_value: start_value
    };

    this.pairLoopStack.push(context);

    this.loopPairs.set(loop_id, {
      start_node_id: startNode.id,
      end_node_id: endNode.id,
      loop_id,
      level
    });
  }

  public static exitLoop(): PairLoopContext | null {
    const context = this.pairLoopStack.pop();
    if (context) {
      this.clearExecutionNodeNames(context.loop_id);
    }
    return context || null;
  }

  public static getCurrentLoop(): PairLoopContext | null {
    return this.pairLoopStack.length > 0 ? this.pairLoopStack[this.pairLoopStack.length - 1] : null;
  }

  public static getAllLoops(): PairLoopContext[] {
    return [...this.pairLoopStack];
  }

  public static getLoopLevel(loop_id: string): number {
    const pair = this.loopPairs.get(loop_id);
    return pair ? pair.level : -1;
  }

  public static isInLoop(): boolean {
    return this.pairLoopStack.length > 0;
  }

  public static getLoopDepth(): number {
    return this.pairLoopStack.length;
  }

  public static advanceLoop(): boolean {
    const current = this.getCurrentLoop();
    if (!current) return false;
    current.current_iteration++;
    current.variable_value += current.start_node.data.parameters.step;
    if (current.current_iteration >= current.iterations) {
      this.exitLoop();
      return false;
    }
    return true;
  }

  // 移除了resetLoop方法，只保留状态管理功能

  public static getVariableValue(variable_name: string): number | null {
    for (let i = this.pairLoopStack.length - 1; i >= 0; i--) {
      const context = this.pairLoopStack[i];
      if (context.variable_name === variable_name) {
        return context.variable_value;
      }
    }
    return null;
  }

  public static generateExecutionNodeName(original_node_id: string, node_name: string): string {
    const current = this.getCurrentLoop();
    if (!current) return node_name;
    const cacheKey = `${current.loop_id}_${original_node_id}_${current.current_iteration}`;
    const cached = this.executionNodeNames.get(cacheKey);
    if (cached) return cached;
    const outer = this.pairLoopStack.slice(0, -1).map(ctx => ctx.current_iteration + 1);
    const curr = current.current_iteration + 1;
    const suffix = [...outer, curr].map(n => n.toString().padStart(2, '0')).join('_');
    const newName = `${node_name}_${suffix}`;
    this.executionNodeNames.set(cacheKey, newName);
    return newName;
  }

  private static clearExecutionNodeNames(loop_id: string): void {
    const keys: string[] = [];
    for (const [key] of this.executionNodeNames) {
      if (key.startsWith(`${loop_id}_`)) keys.push(key);
    }
    keys.forEach(k => this.executionNodeNames.delete(k));
  }

  public static getLoopPair(loop_id: string): LoopPair | null {
    return this.loopPairs.get(loop_id) || null;
  }

  public static getAllLoopPairs(): LoopPair[] {
    return Array.from(this.loopPairs.values());
  }

  public static validateLoopPair(startNode: LoopStartNode, endNode: LoopEndNode): boolean {
    return startNode.data.parameters.loop_id === endNode.data.parameters.loop_id;
  }

  public static validateLoopNesting(): boolean {
    const pairs = this.getAllLoopPairs().slice().sort((a, b) => a.level - b.level);
    for (let i = 0; i < pairs.length - 1; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const outer = pairs[i];
        const inner = pairs[j];
        if (inner.level <= outer.level) return false;
      }
    }
    return true;
  }

  public static clearPairs(): void {
    this.pairLoopStack = [];
    this.executionNodeNames.clear();
    this.loopPairs.clear();
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
   * 获取循环节点ID列表
   */
  private static getLoopNodeIds(loopId: string): string[] {
    const ctx = this.loopContexts.get(loopId);
    return (ctx as any)?.node_ids ?? [];
  }

  // 私有方法

  /**
   * 发送事件
   */
  private static emitEvent(event: LoopEvent): void {
    // 查找匹配的监听器
    for (const [key, listeners] of this.eventListeners) {
      const [loopId, eventTypes] = key.split(':');
      if (loopId === event.loop_id && eventTypes.split(',').includes(event.type)) {
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
        context.elapsed_time = Date.now() - context.start_time;

        this.emitEvent({
          type: 'iteration_start',
          loop_id: loopId,
          timestamp: Date.now()
        });
      }
    }, interval);

    this.updateIntervals.set(loopId, timer);
  }

  /**
   * 等待恢复
   */
  // 移除了waitForResume方法，因为不再需要暂停/恢复功能

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
      item.node_id,
      item.data_type,
      JSON.stringify(item.data)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

export default LoopContextManager;

// Convenience instance for components expecting an instance API
// 代理对象已删除 - 直接使用 LoopContextManager 静态方法
// 原因：代理模式只是简单转发，没有增加价值，反而增加复杂性
// 推荐直接使用：LoopContextManager.getLoopPair(), LoopContextManager.getCurrentLoop() 等
