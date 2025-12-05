import { NodeType, NodeConfig, NodeData, NodeCategory, WorkstationType, ElectrochemicalNode } from './NodeInterfaces';
import { NODE_CONFIGS, NODE_CATEGORY_NAMES, ZAHNER_NODE_CONFIGS, NODE_GROUPS, ZAHNER_NODE_GROUPS } from './NodeConfiguration';

// --- 1. 存储相关的常量与逻辑 ---
const STORAGE_KEY_PREFIX = 'zahner_workflow_defaults_';

/**
 * [关键修复] 获取生效的默认参数
 * 逻辑：先获取静态配置 -> 再尝试读取 LocalStorage 中的用户自定义配置 -> 合并返回
 */
export function getEffectiveDefaultParameters(type: NodeType): Record<string, any> {
  // 1. 获取静态配置 (NodeConfiguration.ts)
  const config = getNodeConfig(type);
  const staticDefaults = config.defaultParameters || {};

  try {
    // 2. 获取用户保存的自定义默认值 (LocalStorage)
    const savedDefaultsJson = localStorage.getItem(`${STORAGE_KEY_PREFIX}${type}`);
    if (savedDefaultsJson) {
      const savedDefaults = JSON.parse(savedDefaultsJson);
      // 3. 合并：用户配置覆盖静态配置
      return { ...staticDefaults, ...savedDefaults };
    }
  } catch (e) {
    console.warn(`[NodeUtilities] 读取自定义默认参数失败 (${type})`, e);
  }

  return staticDefaults;
}

/**
 * 保存自定义默认参数到 LocalStorage
 * 用于 PropertyPanel 中点击"设为默认"按钮
 */
export function saveEffectiveDefaultParameters(type: NodeType, params: Record<string, any>) {
  try {
    // 过滤掉运行时参数，只保存配置参数
    const paramsToSave = { ...params };
    const runtimeKeys = [
      'current_temperature', 
      'calculated_duration', 
      'current_flow_rate',
      'device_address', 
      'gas_type', 
      'max_flow_sccm', 
      'stabilization_time'
    ];
    runtimeKeys.forEach(k => delete paramsToSave[k]);

    localStorage.setItem(`${STORAGE_KEY_PREFIX}${type}`, JSON.stringify(paramsToSave));
    console.log(`[NodeUtilities] 已保存 ${type} 的默认参数到 LocalStorage`);
  } catch (e) {
    console.error(`[NodeUtilities] 保存自定义默认参数失败 (${type})`, e);
  }
}

// --- 2. 配置获取逻辑 ---

// 获取节点配置
export function getNodeConfig(type: NodeType): NodeConfig {
  const config = NODE_CONFIGS[type];
  if (!config) {
    console.warn(`[getNodeConfig] 未知节点类型: ${type}，使用默认配置`);
    return NODE_CONFIGS['wait_delay']; 
  }
  return config;
}

// 获取分类名称
export function getNodeCategoryName(category: NodeCategory): string {
  return NODE_CATEGORY_NAMES[category];
}

// --- 3. [关键] 节点创建逻辑 ---

/**
 * 创建默认节点数据
 * 必须使用 getEffectiveDefaultParameters 而不是直接读取 config
 */
export function createDefaultNodeData(type: NodeType): NodeData {
  const config = getNodeConfig(type);
  
  // ✅ 核心修复：此处调用上面的函数获取包含用户偏好的参数
  const parameters = getEffectiveDefaultParameters(type);

  return {
    name: config.name,
    description: config.description,
    parameters: parameters, // 使用合并后的参数
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * 带工作站上下文的节点创建 (如果你的项目使用了这个函数)
 */
export function createDefaultNodeDataWithWorkstation(
  type: NodeType, 
  workstation: WorkstationType | null
): ElectrochemicalNode['data'] {
  const config = getNodeConfigByWorkstation(type, workstation || 'zahner-zennium');
  
  // ✅ 核心修复：此处同样调用获取生效参数的函数
  const parameters = getEffectiveDefaultParameters(type);

  return {
    name: config.name,
    description: config.description,
    parameters: parameters, // 使用合并后的参数
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// --- 4. 辅助逻辑 ---

// 根据工作站获取配置
export function getNodeConfigByWorkstation(type: string, workstation: WorkstationType): NodeConfig {
  if (workstation === 'zahner-zennium') {
    return ZAHNER_NODE_CONFIGS[type as NodeType] || NODE_CONFIGS[type as NodeType];
  }
  return NODE_CONFIGS[type as NodeType];
}

// 根据工作站获取分组
export function getNodeGroupsByWorkstation(workstation: WorkstationType): Record<NodeCategory, string[]> {
  if (workstation === 'zahner-zennium') {
    return ZAHNER_NODE_GROUPS;
  }
  return NODE_GROUPS;
}

// 验证连接
export function validateNodeConnection(sourceType: NodeType, targetType: NodeType): boolean {
  const sourceConfig = getNodeConfig(sourceType);
  const targetConfig = getNodeConfig(targetType);
  
  return sourceConfig.output.dataType === 'flow' ||
         targetConfig.input.dataType === 'flow' ||
         sourceConfig.output.dataType === targetConfig.input.dataType;
}