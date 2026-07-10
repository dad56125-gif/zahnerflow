import type { UiIconName } from '../shared/uiIcons';
import { NODE_CONFIGS } from '../../types/NodeConfiguration';

/**
 * 实验报告模块的规范化数据模型。
 *
 * 报告链只消费这一份中间结构，不再向下透传后端原始形状。
 */

export interface ReportData {
  projectName: string;
  individualName: string;
  workflowName: string;
  user: string;
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'running' | 'pending';
  error?: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  generatedAt: string;
  warnings: number;
  artifacts: number;
  warningDetails: ReportWarningInfo[];
  artifactDetails: ReportArtifactInfo[];
  nodes: ReportNodeInfo[];
}

export interface ReportNodeInfo {
  index: number;
  originalIndex: number;
  iterationLabel: string;
  blockLabel?: string;
  type: string;
  label: string;
  keyParams: string;
  status: 'success' | 'failed' | 'cancelled' | 'skipped' | 'pending' | 'running';
  durationSeconds?: number;
  estimatedSeconds?: number;
  etaSource?: string;
  outputFile?: string;
  csvPath?: string;
  outputDir?: string;
  dataPoints?: number;
  error?: string;
  resultSummary?: string;
  indentLevel: number;
}

export interface ReportArtifactInfo {
  nodeId?: string;
  fileType?: string;
  filePath: string;
  createdAt?: string;
  dataPoints?: number;
}

export interface ReportWarningInfo {
  type?: string;
  message: string;
  createdAt?: string;
}

export const NODE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(NODE_CONFIGS).map(([type, config]) => [type, config.name]),
);

export const STATUS_ICON_NAMES: Record<string, UiIconName> = {
  completed: 'check',
  success: 'check',
  failed: 'error',
  cancelled: 'warning',
  skipped: 'skip',
  pending: 'timer',
  running: 'refresh',
};

// ─── 实验记录 modal 类型 ──────────────────────────────

/** 工作流摘要（左侧列表项） */
export interface WorkflowSummary {
  id: string;
  shortId: string;
  name: string;
  nodeCount: number;
  loopCount: number;
  isFavorite: boolean;
  basedOnWorkflowId?: string;
  executionCount: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  hasFailedRecords: boolean;
  latestExecution: RunSummary | null;
  createdAt: string;
  updatedAt: string;
}

/** 单次执行摘要（展开后子项） */
export interface RunSummary {
  id: string;
  status: 'completed' | 'failed' | 'cancelled' | 'running' | 'pending';
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  error?: string | null;
  warningCount: number;
  artifactCount: number;
}

/** 工作流定义详情（右侧面板） */
export interface WorkflowDefinition {
  id: string;
  shortId: string;
  name: string;
  nodes: Array<Record<string, unknown>>;
  nodeCount: number;
  loopCount: number;
  isFavorite: boolean;
  basedOnWorkflowId?: string;
  executionCount: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  latestExecution: RunSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMapNode {
  id: string;
  shortId: string;
  name: string;
  nodeCount: number;
  loopCount: number;
  isFavorite: boolean;
  basedOnWorkflowId?: string;
  executionCount: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  latestExecution: RunSummary | null;
  capabilities: {
    hasEis?: boolean;
    hasOcp?: boolean;
    hasTemperature?: boolean;
    hasGasControl?: boolean;
    hasWait?: boolean;
    hasLoop?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMapEdgeReason {
  type: string;
  label: string;
  score: number;
}

export interface WorkflowMapEdge {
  source: string;
  target: string;
  score: number;
  reasons: WorkflowMapEdgeReason[];
}

export interface WorkflowMapPayload {
  nodes: WorkflowMapNode[];
  edges: WorkflowMapEdge[];
  total: number;
}
