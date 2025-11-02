// 导出节点类型和配置
export * from './types';

// 注意：独立的节点组件已被移除，改用统一渲染
// 所有节点现在都使用 DefaultNodeRenderer 和基于配置的显示
// 这简化了代码库并使其更易于维护

// 向后兼容的遗留导出（已弃用）
export const NODE_COMPONENTS = {};
export const NODE_REGISTRY = {};
export const AVAILABLE_NODE_TYPES: string[] = [];

// 已弃用的函数 - 会警告但不会破坏现有代码
export async function getNodeComponent(type: string) {
  console.warn('getNodeComponent 已弃用。所有节点现在都使用 DefaultNodeRenderer。');
  return null;
}

export function isValidNodeType(type: string): boolean {
  // 如需要，委托给 types.ts 验证
  return true; // 所有节点类型现在都有效，因为它们使用统一渲染
}