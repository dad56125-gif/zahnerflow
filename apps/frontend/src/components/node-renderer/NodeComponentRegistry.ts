/**
 * 节点组件注册器
 *
 * 负责管理所有节点类型的组件映射，支持动态加载和注册节点组件
 */

import React from 'react';
import { NodeType } from '../../nodes/types';

// 导入所有节点组件
import { ChronoamperometryNode } from '../../nodes/chronoamperometry.node';
import { ChronopotentiometryNode } from '../../nodes/chronopotentiometry.node';
import { CurrentRampNode } from '../../nodes/current-ramp.node';
import { EISGalvanostaticNode } from '../../nodes/eis-galvanostatic.node';
import { EISPotentiostaticNode } from '../../nodes/eis-potentiostatic.node';
import { LSVMeasurementNode } from '../../nodes/lsv-measurement.node';
import { OCPMeasurementNode } from '../../nodes/ocp-measurement.node';
import { VoltageRampNode } from '../../nodes/voltage-ramp.node';
import { WaitDelayNode } from '../../nodes/wait-delay.node';
import { LoopStartNodeComponent } from '../../nodes/loop-start.node';
import { LoopEndNodeComponent } from '../../nodes/loop-end.node';

// 节点组件接口
export interface NodeComponentProps {
  node: any;
  onUpdate: (node: any) => void;
}

// 节点组件类型定义
export type NodeComponentType = React.ComponentType<NodeComponentProps>;

// 节点组件注册表
const NODE_COMPONENTS: Record<NodeType, NodeComponentType> = {
  // 基础测量节点
  'chronoamperometry': ChronoamperometryNode,
  'chronopotentiometry': ChronopotentiometryNode,
  'eis_galvanostatic': EISGalvanostaticNode,
  'eis_potentiostatic': EISPotentiostaticNode,
  'ocp_measurement': OCPMeasurementNode,
  'voltage_ramp': VoltageRampNode,
  'current_ramp': CurrentRampNode,
  'lsv_measurement': LSVMeasurementNode,

  // 流程控制节点
  'loop_start': LoopStartNodeComponent,
  'loop_end': LoopEndNodeComponent,
  'wait_delay': WaitDelayNode,

  // 设备控制节点（如果有的话）
  'startup': ChronoamperometryNode, // 临时映射，后续需要实现
  'shutdown': ChronoamperometryNode, // 临时映射，后续需要实现
};

/**
 * 节点组件注册器类
 */
export class NodeComponentRegistry {
  private static instance: NodeComponentRegistry;
  private components: Map<NodeType, NodeComponentType> = new Map();

  private constructor() {
    this.initializeComponents();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): NodeComponentRegistry {
    if (!NodeComponentRegistry.instance) {
      NodeComponentRegistry.instance = new NodeComponentRegistry();
    }
    return NodeComponentRegistry.instance;
  }

  /**
   * 初始化所有预定义的节点组件
   */
  private initializeComponents(): void {
    Object.entries(NODE_COMPONENTS).forEach(([nodeType, component]) => {
      this.components.set(nodeType as NodeType, component);
    });
  }

  /**
   * 注册节点组件
   */
  public registerComponent(nodeType: NodeType, component: NodeComponentType): void {
    this.components.set(nodeType, component);
  }

  /**
   * 获取节点组件
   */
  public getComponent(nodeType: NodeType): NodeComponentType | null {
    return this.components.get(nodeType) || null;
  }

  /**
   * 检查节点类型是否有对应的组件
   */
  public hasComponent(nodeType: NodeType): boolean {
    return this.components.has(nodeType);
  }

  /**
   * 获取所有已注册的节点类型
   */
  public getRegisteredTypes(): NodeType[] {
    return Array.from(this.components.keys());
  }

  /**
   * 注销节点组件
   */
  public unregisterComponent(nodeType: NodeType): boolean {
    return this.components.delete(nodeType);
  }

  /**
   * 获取组件统计信息
   */
  public getStats(): { total: number; types: NodeType[] } {
    return {
      total: this.components.size,
      types: this.getRegisteredTypes()
    };
  }
}

/**
 * 获取节点组件的便捷函数
 */
export const getNodeComponent = (nodeType: NodeType): NodeComponentType | null => {
  return NodeComponentRegistry.getInstance().getComponent(nodeType);
};

/**
 * 检查节点是否有组件的便捷函数
 */
export const hasNodeComponent = (nodeType: NodeType): boolean => {
  return NodeComponentRegistry.getInstance().hasComponent(nodeType);
};

// 导出默认注册表以保持向后兼容
export { NODE_COMPONENTS };