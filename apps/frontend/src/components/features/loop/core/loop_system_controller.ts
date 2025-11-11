/**
 * 循环系统主控制器
 *
 * 整合所有循环相关组件，提供统一的API
 * 包括：层级计算、变量管理、缓存优化
 */

import { LoopLevelCalculator } from './loop_level_calculator';
import { LoopMetadataManager } from './loop_metadata_manager';
import { FingerprintCache, WorkflowChange, ChangeHandler } from './fingerprint_cache';
import { LoopInfo } from './LoopDetector';
import { ElectrochemicalNode } from '../../../../types/nodes';

export interface LoopConnection {
  source_id: string;
  target_id: string;
}

export interface WorkflowData {
  loops: LoopInfo[];
  nodes: ElectrochemicalNode[];
  connections: LoopConnection[];
}

export interface LoopSystemConfig {
  enable_cache: boolean;
  auto_assign_variables: boolean;
}

export class LoopSystemController {
  private static readonly DEFAULT_CONFIG: LoopSystemConfig = {
    enable_cache: true,
    auto_assign_variables: true
  };

  private static config = { ...this.DEFAULT_CONFIG };

  /**
   * 初始化循环系统
   */
  static initialize(workflow: WorkflowData, config: Partial<LoopSystemConfig> = {}): {
    success: boolean;
    levels?: LoopLevelCalculator.LoopLevel[];
    error?: string;
    statistics?: ReturnType<typeof LoopMetadataManager.get_statistics>;
  } {
    try {
      // 合并配置
      this.config = { ...this.DEFAULT_CONFIG, ...config };

      // 1. 计算所有循环的层级
      const levels = LoopLevelCalculator.calculate_all_levels(
        workflow.loops,
        workflow.nodes,
        workflow.connections
      );

      console.log(`[LoopSystem] 成功计算 ${levels.length} 个循环的层级`);

      // 2. 初始化循环元数据（包含变量分配）
      const { statistics } = LoopMetadataManager.initialize_from_levels(levels);
      console.log('[LoopSystem] 循环元数据初始化完成');

      // 3. 更新缓存指纹（如果启用）
      if (this.config.enable_cache) {
        FingerprintCache.force_recalculation(workflow, (data) =>
          LoopLevelCalculator.calculate_all_levels(
            data.loops,
            data.nodes,
            data.connections
          )
        );
        console.log('[LoopSystem] 更新缓存指纹');
      }

      console.log('[LoopSystem] 循环系统初始化成功', statistics);

      return {
        success: true,
        levels,
        statistics
      };

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      console.error('[LoopSystem] 初始化失败:', error_message);

      return {
        success: false,
        error: error_message
      };
    }
  }

  /**
   * 处理工作流变更
   */
  static handle_workflow_change(
    change: WorkflowChange,
    config: Partial<LoopSystemConfig> = {}
  ): {
    success: boolean;
    levels?: LoopLevelCalculator.LoopLevel[];
    error?: string;
    cache_hit?: boolean;
  } {
    try {
      const current_config = { ...this.config, ...config };

      // 是否要重新计算
      let should_recalculate = true;

      if (current_config.enable_cache) {
        // 使用指纹缓存智能判断
        const levels = FingerprintCache.smart_update(
          change.workflow,
          change,
          (data) => LoopLevelCalculator.calculate_all_levels(data.loops, data.nodes, data.connections)
        );

        // 判断是否是缓存命中
        should_recalculate = !(FingerprintCache.get_cache_status().has_cache);

        if (!should_recalculate) {
          return {
            success: true,
            levels: levels as any,
            cache_hit: true
          };
        }
      }

      // 重新计算
      if (should_recalculate) {
        const levels = LoopLevelCalculator.calculate_all_levels(
          change.workflow.loops,
          change.workflow.nodes,
          change.workflow.connections
        );

        // 重新初始化循环元数据
        LoopMetadataManager.initialize_from_levels(levels);

        console.log('[LoopSystem] 重新计算完成');

        return {
          success: true,
          levels: levels as any,
          cache_hit: false
        };
      }

      return {
        success: true,
        cache_hit: false
      };

    } catch (error) {
      const error_message = error instanceof Error ? error.message : String(error);
      console.error('[LoopSystem] 变更处理失败:', error_message);

      return {
        success: false,
        error: error_message
      };
    }
  }

  /**
   * 获取循环的层级
   */
  static get_loop_level(loop_id: string): number {
    return LoopMetadataManager.get_loop_level(loop_id);
  }

  /**
   * 获取循环的变量名
   */
  static get_loop_variable(loop_id: string): string | null {
    return LoopMetadataManager.get_loop_variable(loop_id);
  }

  /**
   * 获取循环的元数据
   */
  static get_loop_metadata(loop_id: string): ReturnType<typeof LoopMetadataManager.get_loop_metadata> {
    return LoopMetadataManager.get_loop_metadata(loop_id);
  }

  /**
   * 获取所有循环的元数据
   */
  static get_all_loop_metadata(): ReturnType<typeof LoopMetadataManager.get_all_loops_metadata> {
    return LoopMetadataManager.get_all_loops_metadata();
  }

  /**
   * 获取统计信息
   */
  static get_statistics(): ReturnType<typeof LoopMetadataManager.get_statistics> {
    return LoopMetadataManager.get_statistics();
  }

  /**
   * 获取缓存状态
   */
  static get_cache_status(): ReturnType<typeof FingerprintCache.get_cache_status> {
    return FingerprintCache.get_cache_status();
  }

  /**
   * 清理所有循环
   */
  static cleanup_all(): void {
    LoopMetadataManager.cleanup_all();
    FingerprintCache.clear_cache();
    console.log('[LoopSystem] 清理完成');
  }

  /**
   * 导出调试信息
   */
  static export_debug_info(): ReturnType<typeof LoopMetadataManager.export_metadata> {
    return LoopMetadataManager.export_metadata();
  }

  // 导出变更处理器，方便外部使用
  static readonly handlers = ChangeHandler;
}

declare module './loop_level_calculator' {
  export interface LoopLevel {}
}

namespace LoopLevelCalculator {
  export interface LoopLevel {}
}
