/**
 * 统一布局计算服务
 *
 * 提供Canvas节点布局的统一算法，替代分散在各组件中的重复布局逻辑
 * 确保拖拽、渲染、连接线计算使用相同的算法，彻底解决连接线错乱问题
 */

import {
  ElectrochemicalNode,
  Position,
  Size,
  DynamicLayoutResult,
  LayoutCalculationOptions,
  NodePosition,
  LayoutConfig,
  DEFAULT_LAYOUT_CONFIG,
  ILayoutService,
  LayoutChangeEvent,
  LayoutEventListener
} from './types';

export class LayoutService implements ILayoutService {
  private config: LayoutConfig;
  private event_listeners: Set<LayoutEventListener> = new Set();

  constructor(config: Partial<LayoutConfig> = {}) {
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...config };
  }

  /**
   * 动态计算节点布局配置
   * 替代Canvas.tsx和ConnectionLines.tsx中的重复算法
   */
  calculateDynamicLayout(options: LayoutCalculationOptions): DynamicLayoutResult {
    const { canvas_width, nodes } = options;
    const available_width = canvas_width - (this.config.canvas_padding * 2);

    // 计算在最小间距下能容纳的最大节点数
    const max_nodes_per_row = Math.max(1, Math.floor(
      available_width / (this.config.node_default_width + this.config.node_min_spacing)
    ));

    // 根据当前节点总数决定每行实际节点数
    const total_nodes = nodes.length;
    const actual_nodes_per_row = Math.min(max_nodes_per_row, total_nodes);

    let spacing = 0;
    let start_x = this.config.canvas_padding;

    if (actual_nodes_per_row === 1) {
      // 单个节点在可用范围内完全居中
      const first_node = nodes[0];
      const first_node_width = this.getNodeWidth(first_node);
      start_x = this.config.canvas_padding + (available_width - first_node_width) / 2;
      spacing = 0;
    } else {
      // 每行真正的两端对齐
      let total_nodes_width = 0;
      for (let i = 0; i < actual_nodes_per_row && i < nodes.length; i++) {
        const node = nodes[i];
        total_nodes_width += this.getNodeWidth(node);
      }

      const total_spacing_width = available_width - total_nodes_width;
      spacing = total_spacing_width / (actual_nodes_per_row - 1);
      start_x = this.config.canvas_padding;
    }

    const total_rows = Math.ceil(total_nodes / actual_nodes_per_row);

    return {
      nodes_per_row: actual_nodes_per_row,
      spacing: spacing,
      start_x: start_x,
      connection_length: spacing,
      total_rows: total_rows
    };
  }

  /**
   * 计算单个节点位置
   * 统一的节点位置算法，支持Z字形布局
   */
  calculateNodePosition(index: number, options: LayoutCalculationOptions): Position {
    const { canvas_width, nodes, enable_zigzag = true, center_single_node = true } = options;
    const layout = this.calculateDynamicLayout(options);
    const available_width = canvas_width - (this.config.canvas_padding * 2);

    const row = Math.floor(index / layout.nodes_per_row);
    const col = index % layout.nodes_per_row;

    // 获取当前行的节点
    const row_start_index = row * layout.nodes_per_row;
    const row_end_index = Math.min(row_start_index + layout.nodes_per_row, nodes.length);
    const nodes_in_this_row = nodes.slice(row_start_index, row_end_index);

    let x: number;
    let spacing: number;
    let start_x: number;

    if (nodes_in_this_row.length === 1 && row === 0 && center_single_node) {
      // 第一行的单个节点在可用范围内完全居中
      const node_width = this.getNodeWidth(nodes_in_this_row[0]);
      start_x = this.config.canvas_padding + (available_width - node_width) / 2;
      spacing = 0;
      x = start_x;
    } else {
      // 每行独立计算间距，实现真正的两端对齐
      let total_nodes_width = 0;
      for (const node of nodes_in_this_row) {
        total_nodes_width += this.getNodeWidth(node);
      }

      const total_spacing_width = available_width - total_nodes_width;
      spacing = total_spacing_width / Math.max(1, nodes_in_this_row.length - 1);
      start_x = this.config.canvas_padding;

      // 计算当前节点的X位置，考虑Z字形排列
      if (enable_zigzag && row % 2 === 1) {
        // 奇数行：从右到左（反向顺序）
        x = start_x;
        for (let i = 0; i < nodes_in_this_row.length - 1 - col; i++) {
          const node_width = this.getNodeWidth(nodes_in_this_row[i]);
          x += node_width + spacing;
        }
      } else {
        // 偶数行：从左到右（正常顺序）
        x = start_x;
        for (let i = 0; i < col; i++) {
          const node_width = this.getNodeWidth(nodes_in_this_row[i]);
          x += node_width + spacing;
        }
      }
    }

    const y = 100 + row * this.config.canvas_row_height;
    return { x, y };
  }

  /**
   * 根据拖拽位置计算节点应该插入的索引
   * 替代canvasStore.ts中的固定算法
   */
  calculateNodeIndexFromPosition(position: Position, options: LayoutCalculationOptions): number {
    const { canvas_width, nodes, enable_zigzag = true } = options;
    const layout = this.calculateDynamicLayout(options);

    // 计算行号
    const row = Math.round((position.y - 100) / this.config.canvas_row_height);

    if (row < 0) return 0;
    if (row >= layout.total_rows) return nodes.length;

    // 计算列号
    const available_width = canvas_width - (this.config.canvas_padding * 2);

    // 获取当前行的节点信息
    const row_start_index = row * layout.nodes_per_row;
    const row_end_index = Math.min(row_start_index + layout.nodes_per_row, nodes.length);
    const nodes_in_this_row = nodes.slice(row_start_index, row_end_index);

    if (nodes_in_this_row.length === 0) {
      return row_start_index;
    }

    // 计算当前行的实际间距
    let total_nodes_width = 0;
    for (const node of nodes_in_this_row) {
      total_nodes_width += this.getNodeWidth(node);
    }
    const actual_spacing = total_nodes_width > 0
      ? (available_width - total_nodes_width) / Math.max(1, nodes_in_this_row.length - 1)
      : 0;

    // 计算列位置
    let current_x = this.config.canvas_padding;
    let col = 0;

    if (enable_zigzag && row % 2 === 1) {
      // 奇数行：从右到左
      for (let i = nodes_in_this_row.length - 1; i >= 0; i--) {
        const node_width = this.getNodeWidth(nodes_in_this_row[i]);
        const node_end_x = current_x + node_width;

        if (position.x >= node_end_x) {
          col = nodes_in_this_row.length - 1 - i;
          break;
        }

        if (i > 0) {
          current_x += node_width + actual_spacing;
        }
      }
    } else {
      // 偶数行：从左到右
      for (let i = 0; i < nodes_in_this_row.length; i++) {
        const node_width = this.getNodeWidth(nodes_in_this_row[i]);
        const node_end_x = current_x + node_width;

        if (position.x <= node_end_x + (actual_spacing / 2)) {
          col = i;
          break;
        }

        current_x = node_end_x + actual_spacing;
        col = i + 1;
      }
    }

    const target_index = row_start_index + Math.min(col, nodes_in_this_row.length);
    return Math.max(0, Math.min(nodes.length, target_index));
  }

  /**
   * 批量计算所有节点位置
   */
  calculateAllNodePositions(options: LayoutCalculationOptions): NodePosition[] {
    const { nodes } = options;

    return nodes.map((node, index) => {
      const position = this.calculateNodePosition(index, options);
      const layout = this.calculateDynamicLayout(options);

      return {
        id: node.id,
        name: node.name,
        position: position,
        size: this.getNodeSize(node),
        index: index,
        row: Math.floor(index / layout.nodes_per_row),
        col: index % layout.nodes_per_row
      };
    });
  }

  /**
   * 重新计算所有节点位置
   * 用于节点添加、删除、画布大小改变等场景
   */
  recalculateAllPositions(nodes: ElectrochemicalNode[], canvas_width: number): ElectrochemicalNode[] {
    const options: LayoutCalculationOptions = {
      canvas_width,
      nodes,
      enable_zigzag: true,
      center_single_node: true
    };

    return nodes.map((node, index) => {
      const new_position = this.calculateNodePosition(index, options);
      return {
        ...node,
        position: new_position
      };
    });
  }

  /**
   * 获取节点宽度
   */
  private getNodeWidth(node?: ElectrochemicalNode): number {
    if (!node) return this.config.node_default_width;
    return node.style?.width || this.config.node_default_width;
  }

  /**
   * 获取节点高度
   */
  private getNodeHeight(node?: ElectrochemicalNode): number {
    if (!node) return this.config.node_default_height;
    return node.style?.height || this.config.node_default_height;
  }

  /**
   * 获取节点尺寸
   */
  getNodeSize(node: ElectrochemicalNode): Size {
    return {
      width: this.getNodeWidth(node),
      height: this.getNodeHeight(node)
    };
  }

  /**
   * 添加布局变更事件监听器
   */
  addEventListener(listener: LayoutEventListener): void {
    this.event_listeners.add(listener);
  }

  /**
   * 移除布局变更事件监听器
   */
  removeEventListener(listener: LayoutEventListener): void {
    this.event_listeners.delete(listener);
  }

  /**
   * 觸发布局变更事件
   */
  private emitLayoutChangeEvent(event: LayoutChangeEvent): void {
    this.event_listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Layout event listener error:', error);
      }
    });
  }

  /**
   * 更新布局配置
   */
  updateConfig(new_config: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...new_config };
    this.emitLayoutChangeEvent({
      type: 'canvas_resized',
      payload: { canvas_size: { width: 0, height: 0 } } // 实际尺寸由调用方提供
    });
  }

  /**
   * 获取当前配置
   */
  getConfig(): LayoutConfig {
    return { ...this.config };
  }
}

// 导出单例实例
export const layout_service = new LayoutService();