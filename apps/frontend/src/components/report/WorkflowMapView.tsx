import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { ECElementEvent } from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useAppStore } from '../../state/appStore';
import { formatDateTime } from './reportDataBuilder';
import type { WorkflowMapEdge, WorkflowMapNode, WorkflowMapPayload } from './types';

echarts.use([GraphChart, LegendComponent, TooltipComponent, CanvasRenderer]);

interface WorkflowMapViewProps {
  data: WorkflowMapPayload | null;
  selectedWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
}

const CATEGORY_NAMES = ['EIS', '温控', '气体', '循环', '其它'];

function getCssVariable(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

function displayWorkflowName(name: string | null | undefined, shortId: string): string {
  const value = (name || '').trim();
  if (!value || /^工作流\s+\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$/.test(value)) {
    return shortId;
  }
  return value;
}

function categoryForNode(node: WorkflowMapNode): string {
  if (node.capabilities.hasEis) return 'EIS';
  if (node.capabilities.hasTemperature) return '温控';
  if (node.capabilities.hasGasControl) return '气体';
  if (node.capabilities.hasLoop) return '循环';
  return '其它';
}

function latestStatusText(node: WorkflowMapNode): string {
  const status = node.latestExecution?.status;
  if (status === 'completed') return '最近成功';
  if (status === 'failed') return '最近失败';
  if (status === 'cancelled') return '最近取消';
  if (status === 'running') return '执行中';
  return '暂无执行';
}

function edgeLabel(edge: WorkflowMapEdge): string {
  return edge.reasons?.[0]?.label || '结构相似';
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function recencyScore(node: WorkflowMapNode, now: number): number {
  const latestRunTime = parseTime(node.latestExecution?.startedAt);
  if (latestRunTime === null) return 0;
  const days = Math.max(0, (now - latestRunTime) / 86_400_000);
  return Math.exp(-days / 45);
}

function nodeVisualWeight(node: WorkflowMapNode, maxExecutionCount: number, childCount: number, now: number): number {
  const usage = maxExecutionCount > 0
    ? Math.log1p(node.executionCount) / Math.log1p(maxExecutionCount)
    : 0;
  const recency = recencyScore(node, now);
  const lineageHub = childCount > 0 ? clamp(Math.log1p(childCount) / Math.log1p(8), 0, 1) : 0;
  const favorite = node.isFavorite ? 1 : 0;
  const complexity = clamp(node.nodeCount / 30, 0, 1);
  const derivedUnusedPenalty = node.basedOnWorkflowId && node.executionCount === 0 ? -0.14 : 0;

  return clamp(
    usage * 0.44 + recency * 0.24 + lineageHub * 0.24 + favorite * 0.05 + complexity * 0.03 + derivedUnusedPenalty,
    0,
    1,
  );
}

function symbolSizeFromWeight(weight: number): number {
  return Math.round(14 + weight * 64);
}

function visualTier(weight: number): string {
  if (weight >= 0.72) return '恒星';
  if (weight >= 0.22) return '行星';
  return '卫星';
}

interface GraphEventParams {
  data?: {
    workflow?: WorkflowMapNode;
    visualWeight?: number;
    derivedChildCount?: number;
    edge?: WorkflowMapEdge;
  };
}

export const WorkflowMapView: React.FC<WorkflowMapViewProps> = ({
  data,
  selectedWorkflowId,
  onSelectWorkflow,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const theme = useAppStore((state) => state.theme);

  const graphData = useMemo(() => {
    // 主题切换时重新读取节点边框 CSS token。
    void theme;
    const nodes = data?.nodes || [];
    const edges = data?.edges || [];
    const now = Date.now();
    const maxExecutionCount = nodes.reduce((max, node) => Math.max(max, node.executionCount || 0), 0);
    const derivedChildCountById = nodes.reduce<Record<string, number>>((acc, node) => {
      if (node.basedOnWorkflowId) {
        acc[node.basedOnWorkflowId] = (acc[node.basedOnWorkflowId] || 0) + 1;
      }
      return acc;
    }, {});
    return {
      nodes: nodes.map((node) => {
        const weight = nodeVisualWeight(node, maxExecutionCount, derivedChildCountById[node.id] || 0, now);
        return {
          id: node.id,
          name: displayWorkflowName(node.name, node.shortId),
          value: weight,
          category: CATEGORY_NAMES.indexOf(categoryForNode(node)),
          symbolSize: symbolSizeFromWeight(weight),
          itemStyle: {
            borderWidth: node.id === selectedWorkflowId ? 4 : weight >= 0.72 ? 2 : 1,
            borderColor: node.id === selectedWorkflowId
              ? getCssVariable('--color-primary', '#3b82f6')
              : getCssVariable('--glass-border', 'rgba(255, 255, 255, 0.16)'),
          },
          label: {
            show: weight >= 0.28 || node.id === selectedWorkflowId,
            formatter: node.shortId,
          },
          workflow: node,
          visualWeight: weight,
          derivedChildCount: derivedChildCountById[node.id] || 0,
        };
      }),
      links: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        value: edge.score,
        lineStyle: {
          width: Math.max(1, edge.score * 5),
          opacity: Math.max(0.28, edge.score),
        },
        edge,
      })),
    };
  }, [data, selectedWorkflowId, theme]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const textColor = getCssVariable('--text-primary', '#e5e7eb');
    const secondaryText = getCssVariable('--text-secondary', '#9ca3af');
    const panelBg = getCssVariable('--glass-bg', 'rgba(15, 23, 42, 0.88)');
    const borderColor = getCssVariable('--glass-border', 'rgba(255, 255, 255, 0.16)');
    const primary = getCssVariable('--color-primary', '#3b82f6');
    const success = getCssVariable('--color-success', '#10b981');
    const warning = getCssVariable('--color-warning', '#f59e0b');
    const accent = getCssVariable('--color-info', '#06b6d4');

    chartInstance.current.setOption({
      backgroundColor: 'transparent',
      color: [primary, warning, accent, success, secondaryText],
      legend: {
        top: 0,
        left: 0,
        data: CATEGORY_NAMES,
        textStyle: { color: secondaryText },
        itemWidth: 10,
        itemHeight: 10,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: panelBg,
        borderColor,
        textStyle: { color: textColor },
        formatter: (params: GraphEventParams) => {
          if (params.data?.workflow) {
            const node = params.data.workflow as WorkflowMapNode;
            const weight = Number(params.data.visualWeight || 0);
            const childCount = Number(params.data.derivedChildCount || 0);
            return [
              `<strong>${displayWorkflowName(node.name, node.shortId)}</strong>`,
              `${node.shortId} · ${visualTier(weight)} · ${node.executionCount} 次执行`,
              `${node.nodeCount} 节点${childCount > 0 ? ` · ${childCount} 个派生变体` : ''}`,
              latestStatusText(node),
              node.latestExecution ? `最近: ${formatDateTime(node.latestExecution.startedAt)}` : '',
            ].filter(Boolean).join('<br/>');
          }
          if (params.data?.edge) {
            const edge = params.data.edge as WorkflowMapEdge;
            const reasons = edge.reasons?.map((reason) => reason.label).join(' / ');
            return [`相似度 ${(edge.score * 100).toFixed(0)}%`, reasons || edgeLabel(edge)].join('<br/>');
          }
          return '';
        },
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          data: graphData.nodes,
          links: graphData.links,
          categories: CATEGORY_NAMES.map((name) => ({ name })),
          force: {
            repulsion: 220,
            gravity: 0.08,
            edgeLength: [72, 180],
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 5 },
          },
          label: {
            color: textColor,
            fontSize: 11,
            fontWeight: 600,
          },
          edgeLabel: {
            show: false,
            color: secondaryText,
            formatter: (params: GraphEventParams) => (
              params.data?.edge ? edgeLabel(params.data.edge) : ''
            ),
          },
          lineStyle: {
            color: getCssVariable('--text-tertiary', 'rgba(148, 163, 184, 0.62)'),
            curveness: 0.18,
          },
        },
      ],
    }, true);

    const clickHandler = (params: ECElementEvent) => {
      const eventData = params.data && typeof params.data === 'object' && !Array.isArray(params.data)
        ? params.data as Record<string, unknown>
        : null;
      const workflow = eventData?.workflow && typeof eventData.workflow === 'object'
        ? eventData.workflow as Record<string, unknown>
        : null;
      const workflowId = typeof workflow?.id === 'string' ? workflow.id : null;
      if (workflowId) onSelectWorkflow(workflowId);
    };
    chartInstance.current.off('click');
    chartInstance.current.on('click', clickHandler);

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);
    const timer = window.setTimeout(() => chartInstance.current?.resize(), 120);

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(timer);
      chartInstance.current?.off('click', clickHandler);
    };
  }, [graphData, onSelectWorkflow, theme]);

  useEffect(() => () => {
    chartInstance.current?.dispose();
    chartInstance.current = null;
  }, []);

  if (!data || data.nodes.length === 0) {
    return <div className="report-modal__feedback">暂无可绘制的工作流地图</div>;
  }

  return (
    <div className="report__map">
      <div ref={chartRef} className="report__map-canvas" />
    </div>
  );
};
