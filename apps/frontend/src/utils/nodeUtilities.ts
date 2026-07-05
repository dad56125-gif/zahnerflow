// --- START OF FILE apps/frontend/src/utils/NodeUtilities.ts ---

import type { NodeType, NodeCategory, WorkflowNode, WorkstationType } from '@zahnerflow/types';
import type { NodeConfig } from '../types/NodeConfiguration';
import { NODE_CONFIGS, NODE_CATEGORY_NAMES, ZAHNER_NODE_CONFIGS, NODE_GROUPS, ZAHNER_NODE_GROUPS } from '../types/NodeConfiguration';

// --- 1. 存储相关的常量与逻辑 ---
const STORAGE_KEY_PREFIX = 'zahner_workflow_defaults_';
const sessionNodeDefaults = new Map<NodeType, Record<string, any>>();

function getCurrentUserForDefaults(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('currentUser') || '';
}

function getDefaultsStorageKey(type: NodeType, user: string): string {
  return `${STORAGE_KEY_PREFIX}${user}::${type}`;
}

function cloneDefaults<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getSavedDefaultParameters(type: NodeType, user?: string): Record<string, any> | null {
  const resolvedUser = user ?? getCurrentUserForDefaults();

  if (!resolvedUser) {
    const sessionDefaults = sessionNodeDefaults.get(type);
    return sessionDefaults ? cloneDefaults(sessionDefaults) : null;
  }

  try {
    const savedDefaultsJson = window.localStorage.getItem(getDefaultsStorageKey(type, resolvedUser));
    if (!savedDefaultsJson) return null;
    return JSON.parse(savedDefaultsJson);
  } catch (e) {
    console.warn(`[NodeUtilities] 读取节点默认参数失败 (${resolvedUser}/${type})`, e);
    return null;
  }
}

export function saveDefaultParameters(type: NodeType, params: Record<string, any>, user?: string): void {
  const resolvedUser = user ?? getCurrentUserForDefaults();
  const normalizedParams = cloneDefaults(params);

  if (!resolvedUser) {
    sessionNodeDefaults.set(type, normalizedParams);
    return;
  }

  try {
    window.localStorage.setItem(
      getDefaultsStorageKey(type, resolvedUser),
      JSON.stringify(normalizedParams)
    );
  } catch (e) {
    console.warn(`[NodeUtilities] 保存节点默认参数失败 (${resolvedUser}/${type})`, e);
  }
}

/**
 * 获取生效的默认参数
 * 逻辑：静态配置 -> 合并用户默认参数
 */
export function getEffectiveDefaultParameters(type: NodeType): Record<string, any> {
  const config = getNodeConfig(type);
  const staticDefaults = config.defaultParameters || {};
  const savedDefaults = getSavedDefaultParameters(type);
  return savedDefaults ? { ...staticDefaults, ...savedDefaults } : staticDefaults;
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

  let config = getEffectiveDefaultParameters(type);
  if (type === 'scheduled_start') {
    const next = new Date();
    next.setMinutes(next.getMinutes() + 5);
    config = {
      ...config,
      hour: next.getHours(),
      minute: Math.ceil(next.getMinutes() / 5) * 5,
      nextDay: false
    };
    if (config.minute >= 60) {
      config.hour = (config.hour + 1) % 24;
      config.minute = 0;
      config.nextDay = config.hour === 0;
    }
  }

  return {
    id,
    type,
    config
  };
}
