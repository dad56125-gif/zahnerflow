// --- START OF FILE apps/frontend/src/components/property/RightPanel.tsx ---

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNode, NodeType, WorkflowEtaEstimate } from '@zahnerflow/types';
import { useCanvasStore } from '../../state/canvasStore'; // 修正 store 路径
import type { MfcState } from '../../modules/mfc/useMfc';
import { DataViewer } from '../DataViewer';
import { useUser } from '../shared/userContextState';
// 确保 useSystemState 来自正确的执行 Store
import { deriveExecutionUiState, useSystemState } from '../../state/executionStateBridge';

// 导入工具函数
import {
  getEffectiveDefaultParameters,
  getSavedDefaultParameters,
  saveDefaultParameters,
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
import { resolveDropdownPosition, type DropdownPosition } from '../shared/dropdownPosition';
import { UiIconSvg } from '../shared/UiIconSvg';
import { formatCountdown, formatDuration } from '../../utils/timeFormat';
import {
  nextScheduledStart,
  scheduledStartConfigFromDate,
  scheduledStartDateFromConfig,
} from '../../utils/scheduledStart';

// 静态配置（用于获取节点显示名称）
import {
  getNodeChartKind,
  NODE_CONFIGS,
  getNodeDescription,
  type NodeParameters,
  type NodeParameterValue,
} from '../../types/NodeConfiguration';

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

interface ParameterDropdownState {
  activeId: string | null;
  hidingId: string | null;
  positions: Record<string, DropdownPosition>;
}

const DROPDOWN_EXIT_DURATION_MS = 260;

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
  const group: unknown = node?.group;
  if (!group || typeof group !== 'object' || Array.isArray(group)) {
    return null;
  }
  const value = group as Record<string, unknown>;
  if (value.source !== 'workflow_block' || typeof value.workflowId !== 'string' || typeof value.id !== 'string') {
    return null;
  }
  return {
    id: value.id,
    source: 'workflow_block',
    workflowId: value.workflowId,
    workflowName: typeof value.workflowName === 'string' ? value.workflowName : undefined,
    workflowShortId: typeof value.workflowShortId === 'string' ? value.workflowShortId : undefined,
    nodeCount: typeof value.nodeCount === 'number' ? value.nodeCount : undefined,
  };
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface RightPanelProps {
  mfcState: MfcState;
}

export const RightPanel = React.forwardRef<HTMLDivElement, RightPanelProps>(
  ({ mfcState }, ref) => {
    // 1. 从 Store 获取选中节点
    // 使用 selectedNodeId 从 nodes 数组中查找，确保数据是最新的
    const { nodes, selectedNodeId, updateNodeConfig, setNodes, selectNode } = useCanvasStore();
    const node = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
    const workflowBlockNodeId = node?.type === 'workflow_block' ? node.id : null;
    const workflowBlockId = node?.type === 'workflow_block'
      ? String(node.config?.workflowId || '').trim()
      : '';
    const selectedNodeIdForEffects = node?.id ?? null;
    const selectedNodeType = node?.type ?? null;
    const batteryHealthEnabled = Boolean(node?.config?.check_battery_health);
    const measurementDuration = node?.config?.measurementDuration;
    const samplingInterval = node?.config?.samplingInterval;
    const { currentUser } = useUser();

    // 2. 获取实时系统状态
    const systemState = useSystemState();
    const executionUi = useMemo(() => deriveExecutionUiState(systemState), [systemState]);
    const [nodeRemainingSeconds, setNodeRemainingSeconds] = useState<number | null>(null);
    const [nodeElapsedSeconds, setNodeElapsedSeconds] = useState(0);
    const [plannedEstimate, setPlannedEstimate] = useState<WorkflowEtaEstimate | null>(null);
    const [plannedStartTime, setPlannedStartTime] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'basic' | 'parameters' | 'chart'>('basic');
    const [workflowOptions, setWorkflowOptions] = useState<WorkflowSummaryOption[]>([]);
    const [workflowBlockDefinition, setWorkflowBlockDefinition] = useState<WorkflowDefinitionPayload | null>(null);
    const [workflowBlockLoading, setWorkflowBlockLoading] = useState(false);
    const [workflowBlockMessage, setWorkflowBlockMessage] = useState<string | null>(null);
    const [, setDefaultsVersion] = useState(0);

    // 3. 判断图表支持
    const supportsChart = useMemo(() => {
      return Boolean(node && getNodeChartKind(node.type));
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
      if (!workflowBlockNodeId) {
        setWorkflowBlockDefinition(null);
        setWorkflowBlockMessage(null);
        return;
      }

      if (!workflowBlockId) {
        setWorkflowBlockDefinition(null);
        return;
      }

      let cancelled = false;
      setWorkflowBlockLoading(true);
      runtimeClient.workflows
        .definition<WorkflowDefinitionPayload>(workflowBlockId)
        .then((definition) => {
          if (cancelled) return;
          setWorkflowBlockDefinition(definition);
          const hasNestedWorkflowBlock = (definition.nodes || []).some((child) => child.type === 'workflow_block');
          const latestNode = useCanvasStore.getState().nodes.find((candidate) => candidate.id === workflowBlockNodeId);
          if (!latestNode || latestNode.config?.hasNestedWorkflowBlock === hasNestedWorkflowBlock) return;
          updateNodeConfig(workflowBlockNodeId, {
              ...(latestNode.config || {}),
              hasNestedWorkflowBlock,
              nodeCount: definition.nodeCount ?? definition.nodes?.length ?? latestNode.config?.nodeCount ?? 0,
              workflowName: definition.name || latestNode.config?.workflowName || workflowBlockId,
              workflowShortId: definition.shortId || latestNode.config?.workflowShortId || '',
          });
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
    }, [updateNodeConfig, workflowBlockId, workflowBlockNodeId]);

    // ✅ [OCV健康检测] 强制同步参数 (防止状态更新延迟或旧数据残留)
    useEffect(() => {
      if (selectedNodeIdForEffects && selectedNodeType === 'ocp_measurement' && batteryHealthEnabled) {
        if (measurementDuration !== 30 || samplingInterval !== 1) {
          updateNodeConfig(selectedNodeIdForEffects, {
            measurementDuration: 30,
            samplingInterval: 1
          });
        }
      }
    }, [
      batteryHealthEnabled,
      measurementDuration,
      samplingInterval,
      selectedNodeIdForEffects,
      selectedNodeType,
      updateNodeConfig,
    ]);

    // Dropdown 状态管理
    const [dropdownState, setDropdownState] = useState<ParameterDropdownState>({
      activeId: null,
      hidingId: null,
      positions: {}
    });
    const closeDropdownTimerRef = useRef<number | null>(null);
    const dropdownAnchorsRef = useRef<Record<string, HTMLElement | null>>({});

    const clearDropdownCloseTimer = useCallback(() => {
      if (closeDropdownTimerRef.current === null) return;
      window.clearTimeout(closeDropdownTimerRef.current);
      closeDropdownTimerRef.current = null;
    }, []);

    const handleCloseDropdown = useCallback((id: string) => {
      clearDropdownCloseTimer();
      setDropdownState(prev => {
        if (prev.activeId !== id && prev.hidingId !== id) return prev;
        return { ...prev, hidingId: id };
      });
      closeDropdownTimerRef.current = window.setTimeout(() => {
        setDropdownState(prev => {
          if (prev.hidingId !== id) return prev;
          const positions = { ...prev.positions };
          delete positions[id];
          return {
            activeId: prev.activeId === id ? null : prev.activeId,
            hidingId: null,
            positions
          };
        });
        dropdownAnchorsRef.current[id] = null;
        closeDropdownTimerRef.current = null;
      }, DROPDOWN_EXIT_DURATION_MS);
    }, [clearDropdownCloseTimer]);

    const handleOpenDropdown = useCallback((id: string, event: React.MouseEvent) => {
      if (dropdownState.activeId === id && dropdownState.hidingId !== id) {
        handleCloseDropdown(id);
        return;
      }

      clearDropdownCloseTimer();
      const triggerElement = event.currentTarget as HTMLElement;
      dropdownAnchorsRef.current[id] = triggerElement;
      const rect = event.currentTarget.getBoundingClientRect();
      const position = resolveDropdownPosition(rect, { id });
      setDropdownState(prev => ({
        ...prev,
        activeId: id,
        hidingId: null,
        positions: {
          ...prev.positions,
          [id]: position
        }
      }));
    }, [clearDropdownCloseTimer, dropdownState.activeId, dropdownState.hidingId, handleCloseDropdown]);

    useEffect(() => {
      clearDropdownCloseTimer();
      dropdownAnchorsRef.current = {};
      setDropdownState({ activeId: null, hidingId: null, positions: {} });
    }, [node?.id, activeTab, clearDropdownCloseTimer]);

    useEffect(() => clearDropdownCloseTimer, [clearDropdownCloseTimer]);

    useEffect(() => {
      if (executionUi.phase !== 'idle' || nodes.length === 0) {
        setPlannedEstimate(null);
        setPlannedStartTime(null);
        return;
      }

      let cancelled = false;
      const start = new Date().toISOString();
      const timer = window.setTimeout(async () => {
        try {
          const estimate = await runtimeClient.executions.estimate<WorkflowEtaEstimate>({ nodes });
          if (!cancelled) {
            setPlannedEstimate(estimate);
            setPlannedStartTime(start);
          }
        } catch {
          if (!cancelled) {
            setPlannedEstimate(null);
            setPlannedStartTime(start);
          }
        }
      }, 350);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }, [executionUi.phase, nodes]);

    useEffect(() => {
      const currentStep = systemState?.currentStep;
      const eta = systemState?.eta;
      const timingNodeId = node?.id ?? null;
      const nodeIndex = timingNodeId ? nodes.findIndex(canvasNode => canvasNode.id === timingNodeId) : -1;
      const isCurrentNode = Boolean(
        timingNodeId && currentStep && (
          currentStep.nodeId
            ? currentStep.nodeId === timingNodeId
            : (nodeIndex >= 0 && currentStep.index === nodeIndex)
        )
      );
      const currentTiming = systemState?.nodeTimings?.find(
        timing => timing.unrolledIndex !== null && timing.unrolledIndex === currentStep?.unrolledIndex
      );
      const estimatedSeconds = currentTiming?.estimatedSeconds
        ?? eta?.currentStepEstimatedSeconds
        ?? currentStep?.estimatedSeconds;
      const timingStartedAt = currentTiming?.startedAt;

      if (!isCurrentNode || estimatedSeconds === null || estimatedSeconds === undefined) {
        setNodeRemainingSeconds(null);
        setNodeElapsedSeconds(0);
        return;
      }

      const updatedAtMs = new Date(
        timingStartedAt || eta?.updatedAt || systemState?.timestamp || new Date().toISOString()
      ).getTime();
      const updateDisplay = () => {
        const shouldTick = executionUi.isRunning || executionUi.isCancelling;
        const elapsedSeconds = shouldTick
          ? Math.max(0, (Date.now() - updatedAtMs) / 1000)
          : (eta?.currentStepElapsedSeconds ?? 0);
        setNodeElapsedSeconds(elapsedSeconds);
        setNodeRemainingSeconds(Math.max(0, Number(estimatedSeconds) - elapsedSeconds));
      };

      updateDisplay();
      if (!executionUi.isRunning && !executionUi.isCancelling) return;
      const timer = window.setInterval(updateDisplay, 1000);
      return () => window.clearInterval(timer);
    }, [
      executionUi.isCancelling,
      executionUi.isRunning,
      nodes,
      node?.id,
      systemState?.currentStep,
      systemState?.eta,
      systemState?.nodeTimings,
      systemState?.timestamp,
    ]);

    const dropdownContext = useMemo(() => ({
      isOpen: (id: string) => dropdownState.activeId === id,
      isHiding: (id: string) => dropdownState.hidingId === id,
      getPosition: (id: string) => dropdownState.positions[id] || null,
      getTriggerElement: (id: string) => dropdownAnchorsRef.current[id] || null,
      open: handleOpenDropdown,
      close: handleCloseDropdown
    }), [
      dropdownState.activeId,
      dropdownState.hidingId,
      dropdownState.positions,
      handleOpenDropdown,
      handleCloseDropdown
    ]);

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
    const currentStep = systemState?.currentStep;
    const nodeIndex = nodes.findIndex(canvasNode => canvasNode.id === node.id);
    const isCurrentNode = Boolean(
      currentStep && (
        currentStep.nodeId
          ? currentStep.nodeId === node.id
          : (nodeIndex >= 0 && currentStep.index === nodeIndex)
      )
    );
    const selectedNodeTiming = [...(systemState?.nodeTimings || [])]
      .reverse()
      .find(timing => timing.nodeId === node.id || (!timing.nodeId && timing.index === nodeIndex));
    const runningNodeTiming = currentStep?.unrolledIndex !== undefined
      ? systemState?.nodeTimings?.find(timing => timing.unrolledIndex === currentStep.unrolledIndex)
      : undefined;
    const activeNodeTiming = runningNodeTiming || (selectedNodeTiming?.status === 'running' ? selectedNodeTiming : undefined);
    const isNodeRunning = Boolean(activeNodeTiming && activeNodeTiming.status === 'running') || (isCurrentNode && executionUi.isActive);
    const isNodeTerminal = Boolean(selectedNodeTiming && selectedNodeTiming.status !== 'running');
    const plannedNodeStep = (plannedEstimate?.steps || []).find(step => step.nodeId === node.id)
      || (plannedEstimate?.steps || []).find(step => step.index === nodeIndex);
    const plannedNodeStartOffset = plannedNodeStep
      ? (plannedEstimate?.steps || [])
        .filter(step => step.unrolledIndex < plannedNodeStep.unrolledIndex)
        .reduce((total, step) => total + Number(step.estimatedSeconds || 0), 0)
      : 0;
    const plannedNodeStartTime = plannedStartTime && plannedNodeStep
      ? new Date(new Date(plannedStartTime).getTime() + plannedNodeStartOffset * 1000)
      : plannedStartTime;

    const renderNodeExecutionCountdown = () => {
      if (!isNodeRunning || !isCurrentNode) return null;
      return (
        <div className="property-group">
          <label className="property-label">当前节点剩余时间</label>
          <div className="property-value-static">
            {nodeRemainingSeconds === null
              ? '预计时长不可用'
              : executionUi.isPaused
                ? `已暂停 · ${formatCountdown(nodeRemainingSeconds)}`
                : executionUi.isCancelling
                  ? `停止中 · ${formatCountdown(nodeRemainingSeconds)}`
                  : formatCountdown(nodeRemainingSeconds)}
          </div>
        </div>
      );
    };

    const renderExecutionTime = () => {
      if (isNodeRunning) {
        const startedAt = activeNodeTiming?.startedAt || (isCurrentNode ? systemState?.timestamp : null);
        const estimatedSeconds = activeNodeTiming?.estimatedSeconds
          ?? currentStep?.estimatedSeconds
          ?? null;
        const estimatedFinishTime = startedAt && estimatedSeconds !== null
          ? new Date(new Date(startedAt).getTime() + Number(estimatedSeconds) * 1000)
          : null;
        return (
          <>
            <div className="property-group">
              <label className="property-label">开始时间</label>
              <div className="property-value-static">{formatDateTime(startedAt)}</div>
            </div>
            <div className="property-group">
              <label className="property-label">运行时间</label>
              <div className="property-value-static">{formatDuration(nodeElapsedSeconds)}</div>
            </div>
            <div className="property-group">
              <label className="property-label">预计完成时间</label>
              <div className="property-value-static">{formatDateTime(estimatedFinishTime)}</div>
            </div>
            {renderNodeExecutionCountdown()}
          </>
        );
      }

      if (isNodeTerminal) {
        return (
          <>
            <div className="property-group">
              <label className="property-label">结束时间</label>
              <div className="property-value-static">{formatDateTime(selectedNodeTiming?.endedAt)}</div>
            </div>
            <div className="property-group">
              <label className="property-label">总耗时</label>
              <div className="property-value-static">
                {formatDuration(Number(selectedNodeTiming?.actualSeconds || 0))}
              </div>
            </div>
          </>
        );
      }

      return (
        <>
          <div className="property-group">
            <label className="property-label">预计开始时间</label>
            <div className="property-value-static">{formatDateTime(plannedNodeStartTime)}</div>
          </div>
          <div className="property-group">
            <label className="property-label">预计总时间</label>
            <div className="property-value-static">
              {plannedNodeStep?.estimatedSeconds !== undefined
                ? formatDuration(plannedNodeStep.estimatedSeconds)
                : '预估不可用'}
            </div>
          </div>
        </>
      );
    };

    // 参数更新逻辑：直接操作 config 对象
    const handleParamChange = (key: string, value: NodeParameterValue | undefined) => {
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
        key === 'eisScanDirection'
      ) {
        const newConfig: NodeParameters = { ...currentConfig, eisScanDirection: value };
        newConfig.eisStartFrequency = value === 'START_TO_MAX'
          ? Number(newConfig.eisLowerFrequency)
          : Number(newConfig.eisUpperFrequency);
        updateNodeConfig(node.id, newConfig);
      } else if (
        (node.type === 'eis_potentiostatic' || node.type === 'eis_galvanostatic') &&
        ['eisUpperFrequency', 'eisLowerFrequency'].includes(key)
      ) {
        // 单程扫描方向决定起始端点：向最高频扫时从低频限制开始，反之从高频限制开始。
        const newValue = Number(value);
        const newConfig: NodeParameters = { ...currentConfig, [key]: newValue };

        if (key === 'eisUpperFrequency') {
          newConfig.eisLowerFrequency = Math.min(Number(newConfig.eisLowerFrequency), newValue);
        } else {
          newConfig.eisUpperFrequency = Math.max(Number(newConfig.eisUpperFrequency), newValue);
        }
        const direction = newConfig.eisScanDirection || 'START_TO_MAX';
        newConfig.eisScanDirection = direction;
        newConfig.eisStartFrequency = direction === 'START_TO_MAX'
          ? Number(newConfig.eisLowerFrequency)
          : Number(newConfig.eisUpperFrequency);
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

    const currentMatchesSavedDefaults = (
      visibleParams: [string, NodeParameterValue | undefined][],
      savedDefaults: NodeParameters | null,
    ) => {
      if (!savedDefaults) return false;

      const current = node.config || {};
      return visibleParams.every(([key, fallbackDefault]) => {
        const currentValue = current[key] ?? fallbackDefault;
        const savedValue = key in savedDefaults ? savedDefaults[key] : fallbackDefault;
        return valuesEqual(currentValue, savedValue);
      });
    };

    const saveVisibleDefaults = (visibleParams: [string, NodeParameterValue | undefined][]) => {
      const current = node.config || {};
      const nextDefaults = Object.fromEntries(
        visibleParams.map(([key, fallbackDefault]) => [key, current[key] ?? fallbackDefault])
      );
      saveDefaultParameters(node.type as NodeType, nextDefaults, currentUser);
      setDefaultsVersion(version => version + 1);
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

    const renderBasicProperties = () => (
      <div className="properties-section">
        <h3 className="section-title">基本属性</h3>
        <div className="property-group">
          <label className="property-label">类型</label>
          <div className="property-value-static">{nodeName}</div>
        </div>
        <div className="property-group node-description">
          <label className="property-label">节点说明</label>
          <p className="node-description__text">
            {getNodeDescription(node.type, node.config)}
          </p>
        </div>
        <div className="properties-section">
          <h3 className="section-title">时间</h3>
          {renderExecutionTime()}
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

    const renderParameterField = (key: string, defaultValue: NodeParameterValue | undefined) => {
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
      const savedDefaults = getSavedDefaultParameters(node.type as NodeType, currentUser);
      const hiddenParams = getHiddenParameters(node.type as NodeType);
      const visibleParams = Object.entries(effectiveDefaults).filter(([k]) => !hiddenParams.includes(k));
      const matchesSavedDefaults = currentMatchesSavedDefaults(visibleParams, savedDefaults);

      if (node.type === 'scheduled_start') {
        const currentConfig = node.config || {};
        const scheduledTime = scheduledStartDateFromConfig(currentConfig);
        const resetScheduledStart = () => {
          updateNodeConfig(node.id, {
            ...(node.config || {}),
            ...scheduledStartConfigFromDate(nextScheduledStart()),
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
                    ...scheduledStartConfigFromDate(time),
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
            <div className="empty-icon"><UiIconSvg name="settings" /></div>
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
                onClick={() => saveVisibleDefaults(visibleParams)}
                disabled={matchesSavedDefaults}
                className={`btn btn--xs ${matchesSavedDefaults ? 'btn--success' : 'btn--secondary'} property-defaults-btn`}
                title={matchesSavedDefaults ? "当前可见参数已是节点默认值" : "将当前可见参数设定为后续新增节点的默认值"}
              >
                <span className="btn-text">
                  {matchesSavedDefaults ? '已是节点默认值' : '设定为节点默认值'}
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
                <span className="btn-icon"><UiIconSvg name="list" /></span><span className="btn-text">基本</span>
              </button>
              <button
                className={`btn btn--sm glass ${activeTab === 'parameters' ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => setActiveTab('parameters')}
              >
                <span className="btn-icon"><UiIconSvg name="settings" /></span><span className="btn-text">参数</span>
              </button>

              {supportsChart && (
                <button
                  className={`btn btn--sm glass ${activeTab === 'chart' ? 'btn--primary' : 'btn--secondary'}`}
                  onClick={() => setActiveTab('chart')}
                >
                  <span className="btn-icon"><UiIconSvg name="data" /></span><span className="btn-text">数据</span>
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
              />
            )}
          </div>
        </div>
      </div>
    );
  }
);
