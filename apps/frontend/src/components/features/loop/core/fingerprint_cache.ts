/**
 * 指纹缓存管理器
 *
 * 通过计算循环结构的指纹，避免不必要的重算
 * 仅在循环结构真正变化时重新计算层级
 */

import { LoopInfo } from './LoopDetector';
import { LoopLevel } from './loop_level_calculator';

export interface LoopConnection {
  source_id: string;
  target_id: string;
}

export interface WorkflowData {
  loops: LoopInfo[];
  nodes: Array<{ id: string; type: string }>;
  connections: LoopConnection[];
}

export enum WorkflowChangeType {
  // 不需要重算
  PARAMETER_CHANGED = 'PARAMETER_CHANGED',
  NODE_RENAMED = 'NODE_RENAMED',

  // 可能需要重算（需判断）
  NODE_MOVED = 'NODE_MOVED',
  CONNECTION_CHANGED = 'CONNECTION_CHANGED',

  // 必须重算
  NODE_ADDED = 'NODE_ADDED',
  NODE_DELETED = 'NODE_DELETED',
  LOOP_CREATED = 'LOOP_CREATED',
  LOOP_DELETED = 'LOOP_DELETED'
}

export interface WorkflowChange {
  type: WorkflowChangeType;
  node_id?: string;
  loop_id?: string;
  connection?: LoopConnection;
  workflow: WorkflowData;
  is_loop_node?: boolean;
}

export class FingerprintCache {
  // 缓存的指纹
  private static cached_fingerprint: string = '';

  // 缓存的计算结果
  private static cached_levels: LoopLevel[] = [];

  // 缓存的工作流数据（调试用）
  private static cached_workflow_data: {
    loop_count: number;
    node_count: number;
    connection_count: number;
  } | null = null;

  /**
   * 计算循环结构的指纹
   * 基于循环相关的连接和节点顺序
   */
  static compute_fingerprint(
    loops: LoopInfo[],
    connections: LoopConnection[]
  ): string {
    // 1. 提取所有与循环相关的连接
    const loop_connection_ids = new Set<string>();
    loops.forEach(loop => {
      loop_connection_ids.add(loop.start_node_id);
      loop_connection_ids.add(loop.end_node_id);
    });

    const relevant_connections = connections
      .filter(conn =>
        loop_connection_ids.has(conn.source_id) ||
        loop_connection_ids.has(conn.target_id)
      )
      .map(conn => `${conn.source_id}->${conn.target_id}`)
      .sort();

    // 2. 提取循环的顺序（按start_node_id排序）
    const loop_order = loops
      .map(loop => `${loop.id}:${loop.start_node_id}:${loop.end_node_id}`)
      .sort();

    // 3. 组合成指纹
    const fingerprint = `${relevant_connections.join('|')}::${loop_order.join(',')}`;

    return fingerprint;
  }

  /**
   * 智能更新
   * 仅当结构变化时重新计算
   */
  static smart_update(
    workflow: WorkflowData,
    change: WorkflowChange,
    recalculate_fn: (data: WorkflowData) => LoopLevel[]
  ): LoopLevel[] {
    // 1. 根据变更类型快速判断
    if (this.can_skip_recalculation(change)) {
      console.log('[FingerprintCache] 变更无需重算，使用缓存');
      return this.cached_levels;
    }

    // 2. 计算新的指纹
    const new_fingerprint = this.compute_fingerprint(
      workflow.loops,
      workflow.connections
    );

    // 3. 指纹相同 → 使用缓存
    if (this.cached_fingerprint === new_fingerprint) {
      console.log('[FingerprintCache] 指纹未变化，使用缓存');
      return this.cached_levels;
    }

    // 4. 指纹不同 → 重新计算
    console.log('[FingerprintCache] 结构变化，重新计算层级');
    this.cached_levels = recalculate_fn(workflow);
    this.cached_fingerprint = new_fingerprint;
    this.update_cached_workflow_data(workflow);

    return this.cached_levels;
  }

  /**
   * 判断是否可以跳过重算
   */
  private static can_skip_recalculation(change: WorkflowChange): boolean {
    // 这些变更类型肯定不需要重算
    const skip_types = [
      WorkflowChangeType.PARAMETER_CHANGED,
      WorkflowChangeType.NODE_RENAMED
    ];

    if (skip_types.includes(change.type)) {
      return true;
    }

    // NODE_MOVED：只有移动循环节点才需要重算
    if (change.type === WorkflowChangeType.NODE_MOVED) {
      return !change.is_loop_node;
    }

    // CONNECTION_CHANGED：只有循环相关连接才需要重算
    if (change.type === WorkflowChangeType.CONNECTION_CHANGED) {
      const { connection, workflow } = change;
      if (!connection) return false;

      return !workflow.loops.some(loop =>
        loop.start_node_id === connection.source_id ||
        loop.start_node_id === connection.target_id ||
        loop.end_node_id === connection.source_id ||
        loop.end_node_id === connection.target_id
      );
    }

    return false;
  }

  /**
   * 强制重新计算（绕过缓存）
   */
  static force_recalculation(
    workflow: WorkflowData,
    recalculate_fn: (data: WorkflowData) => LoopLevel[]
  ): LoopLevel[] {
    console.log('[FingerprintCache] 强制重新计算');
    this.cached_levels = recalculate_fn(workflow);
    this.cached_fingerprint = this.compute_fingerprint(
      workflow.loops,
      workflow.connections
    );
    this.update_cached_workflow_data(workflow);
    return this.cached_levels;
  }

  /**
   * 获取缓存状态（调试用）
   */
  static get_cache_status(): {
    has_cache: boolean;
    cached_levels_count: number;
    cached_fingerprint: string;
    workflow_data: typeof this.cached_workflow_data;
  } {
    return {
      has_cache: this.cached_fingerprint !== '',
      cached_levels_count: this.cached_levels.length,
      cached_fingerprint: this.cached_fingerprint,
      workflow_data: this.cached_workflow_data
    };
  }

  /**
   * 清除缓存
   */
  static clear_cache(): void {
    console.log('[FingerprintCache] 清除缓存');
    this.cached_fingerprint = '';
    this.cached_levels = [];
    this.cached_workflow_data = null;
  }

  /**
   * 更新缓存的工作流数据（调试用）
   */
  private static update_cached_workflow_data(workflow: WorkflowData): void {
    this.cached_workflow_data = {
      loop_count: workflow.loops.length,
      node_count: workflow.nodes.length,
      connection_count: workflow.connections.length
    };
  }

  /**
   * 验证指纹与当前工作流是否匹配
   */
  static verify_fingerprint(workflow: WorkflowData): {
    is_valid: boolean;
    current_fingerprint: string;
    cached_fingerprint: string;
  } {
    const current_fingerprint = this.compute_fingerprint(
      workflow.loops,
      workflow.connections
    );

    return {
      is_valid: current_fingerprint === this.cached_fingerprint,
      current_fingerprint,
      cached_fingerprint: this.cached_fingerprint
    };
  }
}

/**
 * 变更处理器
 * 用于处理不同类型的变更
 */
export class ChangeHandler {
  /**
   * 处理节点删除
   */
  static handle_node_deletion(
    node_id: string,
    workflow: WorkflowData,
    is_loop_node: boolean
  ): WorkflowChange {
    return {
      type: is_loop_node
        ? WorkflowChangeType.NODE_DELETED
        : WorkflowChangeType.PARAMETER_CHANGED,
      node_id,
      workflow,
      is_loop_node
    };
  }

  /**
   * 处理连接变更
   */
  static handle_connection_change(
    connection: LoopConnection,
    workflow: WorkflowData
  ): WorkflowChange {
    return {
      type: WorkflowChangeType.CONNECTION_CHANGED,
      connection,
      workflow
    };
  }

  /**
   * 处理节点移动
   */
  static handle_node_movement(
    node_id: string,
    workflow: WorkflowData,
    is_loop_node: boolean
  ): WorkflowChange {
    return {
      type: WorkflowChangeType.NODE_MOVED,
      node_id,
      workflow,
      is_loop_node
    };
  }

  /**
   * 处理参数变更
   */
  static handle_parameter_change(workflow: WorkflowData): WorkflowChange {
    return {
      type: WorkflowChangeType.PARAMETER_CHANGED,
      workflow
    };
  }
}
