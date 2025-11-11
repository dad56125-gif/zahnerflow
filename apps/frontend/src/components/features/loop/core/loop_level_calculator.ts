/**
 * 循环层级计算器
 *
 * 负责计算工作流中循环的嵌套层级
 * 基于连接图和工作流节点顺序进行计算
 */

import { LoopInfo } from './loop_detector';
import { ElectrochemicalNode } from '../../../../types/nodes';

export interface LoopConnection {
  source_id: string;
  target_id: string;
}

export interface LoopLevel extends LoopInfo {
  level: number;
}

export class LoopLevelCalculator {
  // 最大嵌套层级限制
  static readonly MAX_NESTING_LEVEL = 5;

  // 错误类型枚举
  static readonly ErrorType = {
    NESTING_TOO_DEEP: 'NESTING_TOO_DEEP',
    INVALID_NESTING: 'INVALID_NESTING'
  } as const;

  /**
   * 计算所有循环的层级
   * 终极KISS算法：遍历工作流节点，数未闭合的循环数
   */
  static calculate_all_levels(
    loops: LoopInfo[],
    nodes: ElectrochemicalNode[],
    connections: LoopConnection[]
  ): LoopLevel[] {
    // 创建loop查找表
    const loop_by_start = new Map(loops.map(l => [l.start_node_id, l]));
    const loop_by_end = new Map(loops.map(l => [l.end_node_id, l]));

    const result = new Map<string, number>();
    const active_stack = [];

    console.log('[LoopLevelCalculator] 终极KISS算法开始遍历...');

    // 遍历工作流节点
    nodes.forEach(node => {
      if (node.type === 'loop_start') {
        const loop = loop_by_start.get(node.id);
        if (loop) {
          const level = active_stack.length;
          result.set(loop.id, level);
          active_stack.push(loop);
          console.log(`  节点 ${node.id.slice(-8)}: start, level=${level}, stack=[${active_stack.map(l => l.id.slice(-8)).join(',')}]`);
        }
      } else if (node.type === 'loop_end') {
        const loop = loop_by_end.get(node.id);
        if (loop) {
          active_stack.pop();
          console.log(`  节点 ${node.id.slice(-8)}: end, stack=[${active_stack.map(l => l.id.slice(-8)).join(',')}]`);
        }
      }
    });

    // 转换为返回值格式
    return loops.map(loop => {
      const level = result.get(loop.id) ?? 0;
      console.log(`[LoopLevelCalculator] ${loop.id.slice(-8)} -> level=${level}`);
      return { ...loop, level };
    });
  }

  /**
   * 验证所有层级的合法性
   * 与calculate_all_levels保持一致：检查层级连续性
   */
  private static validate_levels(loops: LoopLevel[]): boolean {
    console.log('[validate_levels] 终极KISS验证开始...');

    // 收集所有层级
    const levels = new Set(loops.map(l => l.level));
    const max_level = Math.max(...levels, 0);

    // 检查是否有跳跃（如直接从0到2）
    for (let level = 1; level <= max_level; level++) {
      if (!levels.has(level)) {
        console.error(`[validate_levels] 验证失败: 缺少level ${level}，最大层级${max_level}`);
        return false;
      }
    }

    console.log('[validate_levels] 所有验证通过');
    return true;
  }
}
