/**
 * 循环元数据管理器
 *
 * 统一管理循环的层级、变量分配和元数据
 * 合并了原有的 LoopVariableManager 和 LoopContextManagerExt
 */

import { LoopLevel } from './loop_level_calculator';

export interface LoopMetadata {
  loop_id: string;
  level: number;
  variable_name: string;
  start_node_id: string;
  end_node_id: string;
  assigned_at: number;
}

export class LoopMetadataManager {
  // 预设的5个变量名（传统数学/编程习惯）
  private static readonly VARIABLE_POOL = ['i', 'j', 'k', 'l', 'm'];

  // 循环ID → 元数据
  private static metadata = new Map<string, LoopMetadata>();

  // 已使用的变量映射（循环ID → 变量名）
  private static used_variables = new Map<string, string>();

  // 层级 → 变量名 缓存
  private static level_to_var = new Map<number, string>();

  /**
   * 批量初始化循环元数据
   */
  static initialize_from_levels(levels: LoopLevel[]): {
    metadata: Map<string, LoopMetadata>;
    statistics: {
      total_loops: number;
      max_level: number;
      level_distribution: Record<number, number>;
    };
  } {
    console.log(`[LoopMetadataManager] 从 ${levels.length} 个循环层级初始化`);

    // 清理旧数据
    this.metadata.clear();
    this.used_variables.clear();
    this.level_to_var.clear();

    // 为每个循环分配变量并存储元数据
    levels.forEach(level => {
      const var_name = this.get_variable_for_level(level.id, level.level);

      this.metadata.set(level.id, {
        loop_id: level.id,
        level: level.level,
        variable_name: var_name,
        start_node_id: level.start_node_id,
        end_node_id: level.end_node_id,
        assigned_at: Date.now()
      });

      this.used_variables.set(level.id, var_name);
      this.level_to_var.set(level.level, var_name);

      console.log(
        `[LoopMetadataManager] 循环 ${level.id.slice(-8)} -> ` +
        `层级 ${level.level}, 变量 ${var_name}`
      );
    });

    const stats = this.get_statistics();
    console.log('[LoopMetadataManager] 初始化完成', stats);

    return {
      metadata: this.metadata,
      statistics: stats
    };
  }

  /**
   * 根据层级获取变量名
   */
  private static get_variable_for_level(loop_id: string, level: number): string {
    if (level >= this.VARIABLE_POOL.length) {
      return `var_${level}`;
    }
    return this.VARIABLE_POOL[level];
  }

  /**
   * 获取循环的层级
   */
  static get_loop_level(loop_id: string): number {
    const meta = this.metadata.get(loop_id);
    return meta ? meta.level : -1;
  }

  /**
   * 获取循环的变量名
   */
  static get_loop_variable(loop_id: string): string | null {
    const meta = this.metadata.get(loop_id);
    return meta ? meta.variable_name : null;
  }

  /**
   * 获取循环的元数据
   */
  static get_loop_metadata(loop_id: string): LoopMetadata | null {
    return this.metadata.get(loop_id) || null;
  }

  /**
   * 获取所有循环的元数据
   */
  static get_all_loops_metadata(): LoopMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * 清理指定循环的元数据
   */
  static cleanup_loop(loop_id: string): void {
    this.metadata.delete(loop_id);
    this.used_variables.delete(loop_id);
    console.log(`[LoopMetadataManager] 清理循环元数据: ${loop_id}`);
  }

  /**
   * 清理所有循环
   */
  static cleanup_all(): void {
    this.metadata.clear();
    this.used_variables.clear();
    this.level_to_var.clear();
    console.log('[LoopMetadataManager] 清理所有循环元数据');
  }

  /**
   * 获取统计信息
   */
  static get_statistics(): {
    total_loops: number;
    max_level: number;
    level_distribution: Record<number, number>;
    variable_distribution: Record<string, number>;
  } {
    const metadata_list = this.get_all_loops_metadata();

    const level_distribution: Record<number, number> = {};
    const variable_distribution: Record<string, number> = {};

    metadata_list.forEach(meta => {
      level_distribution[meta.level] = (level_distribution[meta.level] || 0) + 1;
      variable_distribution[meta.variable_name] =
        (variable_distribution[meta.variable_name] || 0) + 1;
    });

    return {
      total_loops: metadata_list.length,
      max_level: Math.max(...metadata_list.map(meta => meta.level), -1),
      level_distribution,
      variable_distribution
    };
  }

  /**
   * 导出为元数据对象
   */
  static export_metadata(): {
    metadata: LoopMetadata[];
    statistics: ReturnType<typeof this.get_statistics>;
    variable_assignments: Record<string, string>;
  } {
    return {
      metadata: this.get_all_loops_metadata(),
      statistics: this.get_statistics(),
      variable_assignments: this.get_used_variables()
    };
  }

  /**
   * 获取所有已使用的变量
   */
  static get_used_variables(): Record<string, string> {
    return Object.fromEntries(this.used_variables);
  }

  /**
   * 获取变量池
   */
  static get_variable_pool(): string[] {
    return [...this.VARIABLE_POOL];
  }

  /**
   * 获取最大嵌套层级
   */
  static get_max_nesting_level(): number {
    return Math.max(...this.get_all_loops_metadata().map(meta => meta.level), -1);
  }
}
