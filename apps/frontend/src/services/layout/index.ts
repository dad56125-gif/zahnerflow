/**
 * 统一布局计算服务模块
 *
 * 提供Canvas节点布局和连接线计算的完整解决方案
 * 统一替换分散在各组件中的重复布局算法
 */

// 类型定义（排除冲突的类型，只导出实际存在的）
export type { ElectrochemicalNode } from './types';
export type { Position } from './types';
export type { Size } from './types';
export type { Rectangle } from './types';

// 核心配置和服务
export type {
  LayoutConfig,
  LayoutMode,
  ZoomLevelRange,
  StartOffset,
  ResponsiveParams,
  DynamicCalculationResult,
  ComputedEdge,
  LayoutResult
} from './LayoutConfig';

export {
  DEFAULT_LAYOUT_CONFIG,
  calculateDynamicColumns,
  getActualColumns,
  isValidZoomLevel
} from './LayoutConfig';

export { ConnectionBindingService, connection_binding_service } from './ConnectionBindingService';

// 便捷组合函数
export {
  ConnectionBindingService as ConnectionService
} from './ConnectionBindingService';

// 默认实例
export { connection_binding_service as default_connection_service } from './ConnectionBindingService';