// --- START OF FILE apps/frontend/src/utils/NodeUtilities.ts ---

import { NodeType, NodeConfig, NodeCategory, WorkflowNode, WorkstationType } from './Interfaces';
import { NODE_CONFIGS, NODE_CATEGORY_NAMES, ZAHNER_NODE_CONFIGS, NODE_GROUPS, ZAHNER_NODE_GROUPS } from './NodeConfiguration';

// --- 1. 存储相关的常量与逻辑 ---
const STORAGE_KEY_PREFIX = 'zahner_workflow_defaults_';

/**
 * 获取生效的默认参数
 * 逻辑：静态配置 -> 合并 LocalStorage 用户偏好
 */
export function getEffectiveDefaultParameters(type: NodeType): Record<string, any> {
  const config = getNodeConfig(type);
  const staticDefaults = config.defaultParameters || {};

  try {
    const savedDefaultsJson = localStorage.getItem(`${STORAGE_KEY_PREFIX}${type}`);
    if (savedDefaultsJson) {
      const savedDefaults = JSON.parse(savedDefaultsJson);
      return { ...staticDefaults, ...savedDefaults };
    }
  } catch (e) {
    console.warn(`[NodeUtilities] 读取自定义默认参数失败 (${type})`, e);
  }

  return staticDefaults;
}

/**
 * 保存自定义默认参数到 LocalStorage
 */
export function saveEffectiveDefaultParameters(type: NodeType, params: Record<string, any>) {
  try {
    const paramsToSave = { ...params };
    const runtimeKeys = [
      'current_temperature', 'calculated_duration', 'current_flow_rate',
      'device_address', 'gas_type', 'max_flow_sccm', 'stabilization_time'
    ];
    runtimeKeys.forEach(k => delete paramsToSave[k]);

    localStorage.setItem(`${STORAGE_KEY_PREFIX}${type}`, JSON.stringify(paramsToSave));
    console.log(`[NodeUtilities] 已保存 ${type} 的默认参数到 LocalStorage`);
  } catch (e) {
    console.error(`[NodeUtilities] 保存自定义默认参数失败 (${type})`, e);
  }
}

// --- 2. 配置获取逻辑 ---

// 通用配置获取
export function getNodeConfig(type: NodeType): NodeConfig {
  const config = NODE_CONFIGS[type];
  if (!config) {
    console.warn(`[getNodeConfig] 未知节点类型: ${type}，使用默认配置`);
    return NODE_CONFIGS['wait_delay']; 
  }
  return config;
}

// [UI兼容] 根据工作站获取配置 (目前指向同一组配置)
export function getNodeConfigByWorkstation(type: string, workstation: WorkstationType): NodeConfig {
  if (workstation === 'zahner-zennium') {
    return ZAHNER_NODE_CONFIGS[type as NodeType] || NODE_CONFIGS[type as NodeType];
  }
  return NODE_CONFIGS[type as NodeType];
}

// [UI兼容] 根据工作站获取分组列表 (侧边栏使用)
export function getNodeGroupsByWorkstation(workstation: WorkstationType): Record<NodeCategory, string[]> {
  if (workstation === 'zahner-zennium') {
    return ZAHNER_NODE_GROUPS;
  }
  return NODE_GROUPS;
}

export function getNodeCategoryName(category: NodeCategory): string {
  return NODE_CATEGORY_NAMES[category];
}

// --- 3. 节点创建逻辑 (重构核心) ---

/**
 * 创建新的工作流节点 (WorkflowNode)
 * 作用：生成唯一ID，加载合并后的默认参数，返回标准结构
 */
export function createWorkflowNode(type: NodeType): WorkflowNode {
  // 生成简易 UUID
  const id = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const config = getEffectiveDefaultParameters(type);

  return {
    id,
    type,
    config
  };
}

/**
 * [UI兼容] 兼容旧接口的创建函数
 * 即使 UI 传入了 workstation，我们也调用标准的 createWorkflowNode
 */
export function createDefaultNodeDataWithWorkstation(
  type: NodeType, 
  workstation: WorkstationType | null
): WorkflowNode {
  return createWorkflowNode(type);
}