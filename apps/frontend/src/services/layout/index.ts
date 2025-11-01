/**
 * 统一布局计算服务模块
 *
 * 提供Canvas节点布局和连接线计算的完整解决方案
 * 统一替换分散在各组件中的重复布局算法
 */

// 类型定义
export * from './types';

// 核心服务类
export { LayoutService, layout_service } from './LayoutService';
export { ConnectionBindingService, connection_binding_service } from './ConnectionBindingService';

// 便捷组合函数
export {
  LayoutService as UnifiedLayoutService
} from './LayoutService';
export {
  ConnectionBindingService as ConnectionService
} from './ConnectionBindingService';

// 默认实例
export { layout_service as default_layout_service } from './LayoutService';
export { connection_binding_service as default_connection_service } from './ConnectionBindingService';