// --- START OF FILE apps/frontend/src/components/property/RightPanel.tsx ---

import React, { useState, useEffect, useMemo } from 'react';
import type { WorkstationType, WorkflowNode, NodeType } from '@zahnerflow/types';
import { useCanvasStore } from '../../state/canvasStore'; // 修正 store 路径
import type { MfcState } from '../../modules/mfc/useMfc';
import { DataViewer } from '../DataViewer';
// 确保 useSystemState 来自正确的执行 Store
import { useSystemState } from '../../state/executionStateBridge'; // 直接从源文件导入

// 导入工具函数
import {
  getEffectiveDefaultParameters
} from '../../utils/nodeUtilities';

import {
  getParameterLabel,
  getHiddenParameters
} from './propertyConfig';
import {
  StandardInput,
  EnumInput,
  TemperatureInput,
  GasFlowInput
} from './PropertyInputs';
import { ScheduleTimePicker } from '../ScheduleRunner';
import { runtimeClient } from '../../runtimeClient';

// 静态配置（用于获取节点显示名称）
import { NODE_CONFIGS } from '../../types/NodeConfiguration';

// 定义哪些节点类型支持图表显示
const MEASUREMENT_NODE_TYPES: NodeType[] = [
  'eis_potentiostatic',
  'eis_galvanostatic',
  'ocp_measurement',
  'chronoamperometry',
  'chronopotentiometry',
  'voltage_ramp',
  'current_ramp'
];

interface WorkflowSummaryOption {
  id: string;
  shortId?: string;
  name?: string;
  nodeCount?: number;
}

interface WorkflowDefinitionPayload {
  id: string;
  shortId?: string;
  name?: string;
  nodes?: WorkflowNode[];
  nodeCount?: number;
}

const IGNORED_WORKFLOW_BLOCK_NODE_TYPES = new Set(['startup', 'shutdown']);

interface WorkflowBlockGroup {
  id: string;
  source: 'workflow_block';
  workflowId: string;
  workflowName?: string;
  workflowShortId?: string;
  nodeCount?: number;
}

function makeCanvasNodeId(sourceId: unknown, index: number): string {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return `expanded_${String(sourceId || index + 1)}_${suffix}`;
}

function makeWorkflowBlockGroup(definition: WorkflowDefinitionPayload): WorkflowBlockGroup {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: `group_${definition.id}_${suffix}`,
    source: 'workflow_block',
    workflowId: definition.id,
    workflowName: definition.name || definition.id,
    workflowShortId: definition.shortId || '',
    nodeCount: definition.nodeCount ?? definition.nodes?.length ?? 0,
  };
}

function workflowNodesForCanvas(nodes: WorkflowNode[], group?: WorkflowBlockGroup) {
  return nodes
    .filter((sourceNode) => !IGNORED_WORKFLOW_BLOCK_NODE_TYPES.has(sourceNode.type))
    .map((sourceNode, index) => ({
    id: makeCanvasNodeId(sourceNode.id, index),
    type: String(sourceNode.type ?? 'wait_delay') as NodeType,
    config: { ...((sourceNode.config || {}) as Record<string, unknown>) },
    ...(group && { group }),
  }));
}

function getWorkflowBlockGroup(node: WorkflowNode | undefined): WorkflowBlockGroup | null {
  const group = (node as any)?.group;
  if (!group || group.source !== 'workflow_block' || !group.workflowId || !group.id) {
    return null;
  }
  return group as WorkflowBlockGroup;
}

interface RightPanelProps {
  selectedWorkstation: WorkstationType | null;
  mfcState: MfcState;
}

export const RightPanel = React.forwardRef<HTMLDivElement, RightPanelProps>(
  ({ selectedWorkstation, mfcState }, ref) => {
    // 1. 从 Store 获取选中节点
    // 使用 selectedNodeId 从 nodes 数组中查找，确保数据是最新的
    const { nodes, selectedNodeId, updateNodeConfig, replaceNodeConfig, setNodes, selectNode } = useCanvasStore();
    const node = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

    // 2. 获取实时系统状态
    const systemState = useSystemState();
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'chart'>('basic');
    const [workflowOptions, setWorkflowOptions] = useState<WorkflowSummaryOption[]>([]);
    const [workflowBlockDefinition, setWorkflowBlockDefinition] = useState<WorkflowDefinitionPayload | null>(null);
    const [workflowBlockLoading, setWorkflowBlockLoading] = useState(false);
    const [workflowBlockMessage, setWorkflowBlockMessage] = useState<string | null>(null);

    // 3. 判断图表支持
    const supportsChart = useMemo(() => {
      return node && MEASUREMENT_NODE_TYPES.includes(node.type as NodeType);
    }, [node]);

    // 自动切回 basic tab
    useEffect(() => {
      if (!supportsChart && activeTab === 'chart') {
        setActiveTab('basic');
      }
    }, [supportsChart, activeTab]);

    useEffect(() => {
      if (node?.type !== 'workflow_block') return;
      let cancelled = false;
      runtimeClient.workflows
        .summaries<{ items: WorkflowSummaryOption[] }>()
        .then((response) => {
          if (!cancelled) setWorkflowOptions(response.items || []);
        })
        .catch(() => {
          if (!cancelled) setWorkflowBlockMessage('工作流列表加载失败');
        });
      return () => {
        cancelled = true;
      };
    }, [node?.type]);

    useEffect(() => {
      if (node?.type !== 'workflow_block') {
        setWorkflowBlockDefinition(null);
        setWorkflowBlockMessage(null);
        return;
      }

      const workflowId = String(node.config?.workflowId || '').trim();
      if (!workflowId) {
        setWorkflowBlockDefinition(null);
        return;
      }

      let cancelled = false;
      setWorkflowBlockLoading(true);
      runtimeClient.workflows
        .definition<WorkflowDefinitionPayload>(workflowId)
        .then((definition) => {
          if (cancelled) return;
          setWorkflowBlockDefinition(definition);
          const hasNestedWorkflowBlock = (definition.nodes || []).some((child) => child.type === 'workflow_block');
          if (node.config?.hasNestedWorkflowBlock !== hasNestedWorkflowBlock) {
            updateNodeConfig(node.id, {
              ...(node.config || {}),
              hasNestedWorkflowBlock,
              nodeCount: definition.nodeCount ?? definition.nodes?.length ?? node.config?.nodeCount ?? 0,
              workflowName: definition.name || node.config?.workflowName || workflowId,
              workflowShortId: definition.shortId || node.config?.workflowShortId || '',
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWorkflowBlockDefinition(null);
            setWorkflowBlockMessage('工作流定义加载失败');
          }
        })
        .finally(() => {
          if (!cancelled) setWorkflowBlockLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [node?.id, node?.type, node?.config?.workflowId, updateNodeConfig]);

    // ✅ [OCV健康检测] 强制同步参数 (防止状态更新延迟或旧数据残留)
    useEffect(() => {
      if (node && node.type === 'ocp_measurement' && node.config?.check_battery_health) {
        if (node.config.measurementDuration !== 30 || node.config.samplingInterval !== 1) {
          updateNodeConfig(node.id, {
            ...node.config,
            measurementDuration: 30,
            samplingInterval: 1
          });
        }
      }
    }, [node?.id, node?.type, node?.config?.check_battery_health, updateNodeConfig]);

    // Dropdown 状态管理
    const [dropdownState, setDropdownState] = useState<{
      activeId: string | null;
      hidingId: string | null;
      positions: Record<string, any>;
    }>({
      activeId: null,
      hidingId: null,
      positions: {}
    });

    const handleOpenDropdown = (id: string, event: React.MouseEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setDropdownState(prev => ({
        ...prev,
        activeId: id,
        positions: {
          ...prev.positions,
          [id]: { top: rect.bottom + 4, left: rect.left, width: rect.width, id }
        }
      }));
    };

    const handleCloseDropdown = (id: string) => {
      setDropdownState(prev => ({ ...prev, hidingId: id }));
      setTimeout(() => {
        setDropdownState(prev => ({ ...prev, activeId: null, hidingId: null }));
      }, 250);
    };

    const dropdownContext = {
      isOpen: !!dropdownState.activeId,
      isHiding: !!dropdownState.hidingId,
      position: dropdownState.activeId ? dropdownState.positions[dropdownState.activeId] : null,
      open: handleOpenDropdown,
      close: handleCloseDropdown
    };

    if (!node) {
      return (
        <div className="right-panel glass" ref={ref}>
          <div className="right-panel__header">
            <h3 className="bar-header-title">
              <span className="right-panel-text">属性</span>
            </h3>
          </div>
          <div className="empty-state">
            <div className="empty-text">未选择节点</div>
            <div className="empty-subtitle">请在画布中选择一个节点以查看其属性</div>
          </div>
        </div>
      );
    }

    // 获取静态配置名称
    const nodeName = NODE_CONFIGS[node.type]?.name || node.type;

    // 参数更新逻辑：直接操作 config 对象
    const handleParamChange = (key: string, value: any) => {
      const currentConfig = node.config || {};

      if (key === 'deviceSelection' && node.type === 'change_gas_flow') {
        const [address, gasType] = (value as string).split(':');
        const device = mfcState.availableDevices.find(d => d.address === Number(address) && d.gasType === gasType);
        updateNodeConfig(node.id, {
          ...currentConfig,
          deviceSelection: value,
          deviceAddress: Number(address),
          gasType: gasType,
          maxFlowSccm: device?.maxFlowSccm || 200
        });
      } else if (key === 'check_battery_health' && node.type === 'ocp_measurement') {
        // ✅ OCV 模式切换逻辑：开启时固定参数，关闭时恢复默认
        const isHealth = value === true || value === 'true';
        updateNodeConfig(node.id, {
          ...currentConfig,
          check_battery_health: isHealth,
          measurementDuration: isHealth ? 30 : 60,
          samplingInterval: 1
        });
      } else if (
        (node.type === 'eis_potentiostatic' || node.type === 'eis_galvanostatic') &&
        ['eisStartFrequency', 'eisUpperFrequency', 'eisLowerFrequency'].includes(key)
      ) {
        // 频率连锁机制：确保 高频限制 >= 起始频率 >= 低频限制
        const newValue = Number(value);
        let newConfig = { ...currentConfig, [key]: newValue };

        if (key === 'eisStartFrequency') {
          // 修改起始：若超过上限，拉高上限；若低于下限，拉低下限
          if (newValue > (newConfig.eisUpperFrequency || 0)) {
            newConfig.eisUpperFrequency = newValue;
          }
          if (newValue < (newConfig.eisLowerFrequency || 0)) {
            newConfig.eisLowerFrequency = newValue;
          }
        } else if (key === 'eisUpperFrequency') {
          // 修改上限：若低于起始，同步降低起始；由于起始可能低于下限，需再次级联
          if (newValue < (newConfig.eisStartFrequency || 0)) {
            newConfig.eisStartFrequency = newValue;
            if (newValue < (newConfig.eisLowerFrequency || 0)) {
              newConfig.eisLowerFrequency = newValue;
            }
          }
        } else if (key === 'eisLowerFrequency') {
          // 修改下限：若超过起始，同步提高起始；由于起始可能超过上限，需再次级联
          if (newValue > (newConfig.eisStartFrequency || 0)) {
            newConfig.eisStartFrequency = newValue;
            if (newValue > (newConfig.eisUpperFrequency || 0)) {
              newConfig.eisUpperFrequency = newValue;
            }
          }
        }
        updateNodeConfig(node.id, newConfig);
      } else {
        updateNodeConfig(node.id, { ...currentConfig, [key]: value });
      }
    };

    const normalizeComparableValue = (value: unknown): unknown => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
      }
      if (Array.isArray(value)) {
        return value.map(normalizeComparableValue);
      }
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entryValue]) => [key, normalizeComparableValue(entryValue)])
        );
      }
      return value;
    };

    const valuesEqual = (left: unknown, right: unknown): boolean => {
      return JSON.stringify(normalizeComparableValue(left)) === JSON.stringify(normalizeComparableValue(right));
    };

    const currentMatchesDefaults = (visibleParams: [string, any][]) => {
      const current = node.config || {};
      return visibleParams.every(([key, defaultValue]) => valuesEqual(current[key] ?? defaultValue, defaultValue));
    };

    const restoreDefaults = () => {
      replaceNodeConfig(node.id, getEffectiveDefaultParameters(node.type as NodeType));
    };

    const collapseCurrentWorkflowGroup = () => {
      const group = getWorkflowBlockGroup(node);
      if (!group) return;
      const selectedIndex = nodes.findIndex((canvasNode) => canvasNode.id === node.id);
      if (selectedIndex < 0) return;

      let startIndex = selectedIndex;
      while (startIndex > 0 && getWorkflowBlockGroup(nodes[startIndex - 1])?.id === group.id) {
        startIndex -= 1;
      }

      let endIndex = selectedIndex;
      while (endIndex < nodes.length - 1 && getWorkflowBlockGroup(nodes[endIndex + 1])?.id === group.id) {
        endIndex += 1;
      }

      const blockNode: WorkflowNode = {
        id: makeCanvasNodeId(group.workflowId, startIndex),
        type: 'workflow_block',
        config: {
          workflowId: group.workflowId,
          workflowName: group.workflowName || group.workflowId,
          workflowShortId: group.workflowShortId || '',
          nodeCount: group.nodeCount || endIndex - startIndex + 1,
          hasNestedWorkflowBlock: false,
        },
      };

      setNodes([
        ...nodes.slice(0, startIndex),
        blockNode,
        ...nodes.slice(endIndex + 1),
      ]);
      selectNode(blockNode.id);
    };

    const hasBackendSupport = () => {
      // 简单判断，所有测量节点和设备控制节点通常都有后端支持
      return true;
    };

    const renderBasicProperties = () => (
      <div className="properties-section">
        <h3 className="section-title">基本属性</h3>
        <div className="property-group">
          <label className="property-label">类型</label>
          <div className="property-value-static">{nodeName}</div>
        </div>
        {getWorkflowBlockGroup(node) && (
          <div className="workflow-block-preview">
            <div className="property-group">
              <label className="property-label">分组</label>
              <div className="property-value-static">
                {getWorkflowBlockGroup(node)?.workflowName || getWorkflowBlockGroup(node)?.workflowId}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--xs btn--secondary"
              onClick={collapseCurrentWorkflowGroup}
              title="把当前连续分组收缩回工作流块"
            >
              <span className="btn-icon">↔</span>
              <span className="btn-text">收缩为工作流块</span>
            </button>
          </div>
        )}
      </div>
    );

    const renderParameterField = (key: string, defaultValue: any) => {
      const currentValue = (node.config || {})[key];
      const isDisabled = (node.config || {}).check_battery_health && (key === 'measurementDuration' || key === 'samplingInterval');

      const props = {
        paramKey: key,
        value: currentValue,
        defaultValue,
        onChange: handleParamChange,
        dropdownState: dropdownContext,
        disabled: isDisabled
      };

      if (node.type === 'change_temperature') return <TemperatureInput {...props} />;
      if (node.type === 'change_gas_flow') return <GasFlowInput {...props} availableDevices={mfcState.devices} />;

      // 枚举判断逻辑
      const isEnum = [
        'eisScanDirection', 'eisScanStrategy', 'startVoltageReference',
        'endVoltageReference', 'scanDirection', 'scanStrategy',
        'potentiostatMode', 'fileNaming'
      ].includes(key);

      if (isEnum || typeof defaultValue === 'boolean') {
        return <EnumInput {...props} />;
      }
      if (typeof defaultValue === 'number') return <StandardInput {...props} type="number" />;
      return <StandardInput {...props} />;
    };

    const renderParameters = () => {
      const effectiveDefaults = getEffectiveDefaultParameters(node.type as NodeType);
      const hiddenParams = getHiddenParameters(node.type as NodeType);
      const visibleParams = Object.entries(effectiveDefaults).filter(([k]) => !hiddenParams.includes(k));
      const isAtDefault = currentMatchesDefaults(visibleParams);

      if (node.type === 'scheduled_start') {
        const currentConfig = node.config || {};
        const scheduledTime = new Date();
        if (currentConfig.nextDay) {
          scheduledTime.setDate(scheduledTime.getDate() + 1);
        }
        scheduledTime.setHours(Number(currentConfig.hour ?? 0), Number(currentConfig.minute ?? 0), 0, 0);
        const resetScheduledStart = () => {
          const next = new Date();
          next.setMinutes(next.getMinutes() + 5);
          let hour = next.getHours();
          let minute = Math.ceil(next.getMinutes() / 5) * 5;
          let nextDay = false;
          if (minute >= 60) {
            minute = 0;
            hour = (hour + 1) % 24;
            nextDay = hour === 0;
          }
          updateNodeConfig(node.id, {
            ...(node.config || {}),
            hour,
            minute,
            nextDay
          });
        };

        return (
          <div className="properties-section">
            <div className="flex items-center justify-between gap-sm">
              <h3 className="section-title">参数</h3>
              <button
                onClick={resetScheduledStart}
                className="btn btn--xs btn--secondary"
                title="恢复到当前时间后 5 分钟"
              >
                <span className="btn-icon">↺</span>
                <span className="btn-text">恢复默认</span>
              </button>
            </div>
            <div className="schedule-runner">
              <ScheduleTimePicker
                initialTime={scheduledTime}
                confirmText="设置"
                onConfirm={(time) => {
                  updateNodeConfig(node.id, {
                    ...(node.config || {}),
                    hour: time.getHours(),
                    minute: time.getMinutes(),
                    nextDay: time.toDateString() !== new Date().toDateString()
                  });
                }}
              />
            </div>
          </div>
        );
      }

      if (node.type === 'workflow_block') {
        const currentWorkflowId = String(node.config?.workflowId || '');
        const nestedBlocked = Boolean(node.config?.hasNestedWorkflowBlock);
        const expandWorkflowBlockInPlace = () => {
          if (!workflowBlockDefinition?.nodes?.length) return;
          const blockIndex = nodes.findIndex((canvasNode) => canvasNode.id === node.id);
          if (blockIndex < 0) return;
          const expandedNodes = workflowNodesForCanvas(
            workflowBlockDefinition.nodes,
            makeWorkflowBlockGroup(workflowBlockDefinition)
          );
          if (expandedNodes.length === 0) {
            setWorkflowBlockMessage('子工作流没有可展开的执行节点');
            return;
          }
          setNodes([
            ...nodes.slice(0, blockIndex),
            ...expandedNodes,
            ...nodes.slice(blockIndex + 1),
          ]);
          selectNode(null);
        };

        return (
          <div className="properties-section">
            <h3 className="section-title">参数</h3>
            <div className="property-group">
              <label className="property-label">子工作流</label>
              <div className="property-value">
                <select
                  className="select"
                  value={currentWorkflowId}
                  onChange={(event) => {
                    const selected = workflowOptions.find((workflow) => workflow.id === event.target.value);
                    updateNodeConfig(node.id, {
                      ...(node.config || {}),
                      workflowId: selected?.id || '',
                      workflowName: selected?.name || '',
                      workflowShortId: selected?.shortId || '',
                      nodeCount: selected?.nodeCount || 0,
                      hasNestedWorkflowBlock: false,
                    });
                    setWorkflowBlockMessage(null);
                  }}
                >
                  <option value="">选择工作流</option>
                  {workflowOptions.map((workflow) => (
                    <option key={workflow.id} value={workflow.id}>
                      {workflow.shortId ? `${workflow.shortId} · ` : ''}{workflow.name || workflow.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {workflowBlockLoading ? (
              <div className="empty-state">
                <div className="empty-text">正在加载工作流</div>
              </div>
            ) : workflowBlockDefinition ? (
              <div className="workflow-block-preview">
                <div className="property-group">
                  <label className="property-label">摘要</label>
                  <div className="property-value-static">
                    {workflowBlockDefinition.shortId || workflowBlockDefinition.id} · {workflowBlockDefinition.nodeCount ?? workflowBlockDefinition.nodes?.length ?? 0} 个节点
                  </div>
                </div>
                {nestedBlocked && (
                  <div className="property-warning">
                    子工作流包含工作流块，v1 暂不支持嵌套运行。
                  </div>
                )}
                <div className="workflow-block-preview__nodes">
                  {(workflowBlockDefinition.nodes || []).slice(0, 8).map((child, index) => (
                    <div key={`${child.id}-${index}`} className="workflow-block-preview__node">
                      <span>{index + 1}</span>
                      <strong>{NODE_CONFIGS[child.type as NodeType]?.name || child.type}</strong>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--xs btn--secondary"
                  onClick={expandWorkflowBlockInPlace}
                  disabled={nestedBlocked}
                  title={nestedBlocked ? '子工作流包含工作流块，v1 暂不支持展开' : '用子工作流节点替换当前工作流块'}
                >
                  <span className="btn-icon">↔</span>
                  <span className="btn-text">展开到当前位置</span>
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-text">{workflowBlockMessage || '请选择一个已归档工作流'}</div>
              </div>
            )}
          </div>
        );
      }

      if (!effectiveDefaults || Object.keys(effectiveDefaults).length === 0) {
        return (
          <div className="empty-state">
            <div className="empty-icon">⚙️</div>
            <div className="empty-text">该节点类型暂无参数配置</div>
          </div>
        );
      }

      return (
        <div className="properties-section">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-sm">
              <h3 className="section-title">参数</h3>
            </div>
            <div className="flex items-center justify-end gap-sm">
              <button
                onClick={restoreDefaults}
                disabled={isAtDefault}
                className="btn btn--xs btn--secondary"
                title={isAtDefault ? "当前参数已是默认值" : "恢复当前节点的默认参数"}
              >
                <span className="btn-icon">↺</span>
                <span className="btn-text">
                  恢复默认
                </span>
              </button>
            </div>
          </div>
          {visibleParams.map(([key, defVal]) => (
            <div key={key} className="property-group">
              <label className="property-label">{getParameterLabel(key, node.type)}</label>
              <div className="property-value">
                {renderParameterField(key, defVal)}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="right-panel glass" ref={ref}>
        <div className="right-panel__header">
          <h3 className="bar-header-title">
            <span className="right-panel-text">属性</span>
            <span className="right-panel-subtitle">{nodeName}</span>
          </h3>
        </div>
        <div className="right-panel__content">
          <div className="property-content">
            <div className="property__tabs">
              <button
                className={`btn btn--sm glass ${activeTab === 'basic' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setActiveTab('basic')}
              >
                <span className="btn-icon">📋</span><span className="btn-text">基本</span>
              </button>
              <button
                className={`btn btn--sm glass ${activeTab === 'parameters' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setActiveTab('parameters')}
              >
                <span className="btn-icon">⚙️</span><span className="btn-text">参数</span>
              </button>

              {supportsChart && (
                <button
                  className={`btn btn--sm glass ${activeTab === 'chart' ? 'btn--primary' : 'btn--secondary'}`}
                  onClick={() => setActiveTab('chart')}
                >
                  <span className="btn-icon">📊</span><span className="btn-text">数据</span>
                </button>
              )}
            </div>

            {activeTab === 'basic' && renderBasicProperties()}
            {activeTab === 'parameters' && renderParameters()}

            {activeTab === 'chart' && supportsChart && node && (
              <DataViewer
                isVisible={true}
                selectedNode={{
                  id: node.id,
                  type: node.type,
                  name: nodeName,
                  data: { results: node.config, updatedAt: new Date().toISOString() },
                  status: systemState?.currentStep?.nodeId === node.id ? 'running' : 'ready'
                }}
                showChart={false}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);
