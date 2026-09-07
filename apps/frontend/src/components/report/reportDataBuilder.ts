import {
  type ReportArtifactInfo,
  type ReportData,
  type ReportNodeInfo,
  type ReportWarningInfo,
} from './types';
import { getNodeDisplayName, summarizeNodeParameters } from '../../types/NodeConfiguration';
import { formatIterationPath, toIterationPath } from '../../utils/iterationPath';

import type { ExecutionReport, ReportStep, ReportArtifact, ReportWarning } from '@zahnerflow/types';

const REPORT_FALLBACK_TIME = '1970-01-01T00:00:00.000Z';

function toIsoString(value?: string | null): string {
  if (!value) {
    return REPORT_FALLBACK_TIME;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return REPORT_FALLBACK_TIME;
  }

  return date.toISOString();
}

function getNodeLabel(type: string): string {
  return getNodeDisplayName(type);
}

function formatValue(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function toNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeStatus(status: string): ReportNodeInfo['status'] {
  if (status === 'completed') return 'success';
  if (status === 'success' || status === 'failed' || status === 'cancelled' || status === 'skipped' || status === 'running') {
    return status;
  }
  return 'pending';
}

function getNodeParams(node: Record<string, unknown> | undefined): unknown {
  return node?.config ?? {};
}

function getResultRecord(step: ReportStep): Record<string, unknown> {
  const result = step.result;
  return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {};
}

function summarizeResult(result: Record<string, unknown>): string {
  const parts: string[] = [];
  const dataPoints = result.dataPoints;
  if (dataPoints != null) {
    parts.push(`数据点: ${formatValue(dataPoints)}`);
  }

  const keys = ['finalTemperature', 'targetTemperature', 'actualFlow', 'targetFlowRate'];
  for (const key of keys) {
    if (result[key] != null) {
      parts.push(`${key}: ${formatValue(result[key])}`);
    }
  }

  return parts.length > 0 ? parts.join(' | ') : '';
}

function formatBlockLabel(raw: unknown): string | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const labels = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const entry = item as Record<string, unknown>;
      return String(entry.blockWorkflowName || entry.blockWorkflowId || '').trim();
    })
    .filter(Boolean);
  return labels.length > 0 ? labels.join(' / ') : undefined;
}

function getDurationSeconds(step: ReportStep): number | undefined {
  const actualSeconds = toNumber(step.actualSeconds);
  if (actualSeconds !== undefined) {
    return Math.round(actualSeconds);
  }

  const startedAt = step.startedAt;
  const endedAt = step.endedAt;

  if (typeof startedAt === 'string' && typeof endedAt === 'string') {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      return Math.round(ms / 1000);
    }
  }

  return undefined;
}

function toReportNodeFromStep(step: ReportStep, node: Record<string, unknown> | undefined): ReportNodeInfo {
  const result = getResultRecord(step);
  const type = String(step.nodeType ?? node?.type ?? 'unknown');
  const originalIndex = Number(step.originalIndex ?? node?.index ?? 0);
  const unrolledIndex = Number(step.unrolledIndex ?? originalIndex);
  const rawParams = step.params ?? getNodeParams(node);
  const status = normalizeStatus(String(step.status ?? 'pending'));
  const outputFile = result.outputFile as string | undefined;
  const csvPath = result.csvPath as string | undefined;
  const outputDir = result.outputDir as string | undefined;
  const dataPoints = toNumber(result.dataPoints);
  const stepError = step.error;
  const resultError = result.error;
  const indentLevel = Number(node?.indentLevel ?? node?.depth ?? 0);

  return {
    index: Number.isFinite(unrolledIndex) ? unrolledIndex + 1 : originalIndex + 1,
    originalIndex: Number.isFinite(originalIndex) ? originalIndex + 1 : 1,
    iterationLabel: formatIterationPath(toIterationPath(step.iterationPath)),
    blockLabel: formatBlockLabel(step.blockPath),
    type,
    label: getNodeLabel(type),
    keyParams: summarizeNodeParameters(type, rawParams),
    status,
    durationSeconds: getDurationSeconds(step),
    estimatedSeconds: toNumber(step.estimatedSeconds),
    etaSource: step.etaSource as string | undefined,
    outputFile,
    csvPath,
    outputDir,
    dataPoints,
    error: String(stepError ?? resultError ?? ''),
    resultSummary: summarizeResult(result),
    indentLevel: Number.isFinite(indentLevel) ? indentLevel : 0,
  };
}

function toReportNodeFromWorkflowNode(node: Record<string, unknown>, index: number): ReportNodeInfo {
  const type = String(node.type ?? 'unknown');
  const indentLevel = Number(node.indentLevel ?? node.depth ?? 0);
  return {
    index: index + 1,
    originalIndex: index + 1,
    iterationLabel: '-',
    type,
    label: getNodeLabel(type),
    keyParams: summarizeNodeParameters(type, getNodeParams(node)),
    status: 'pending',
    indentLevel: Number.isFinite(indentLevel) ? indentLevel : 0,
  };
}

function getOriginalStepIndex(step: ReportStep): number | undefined {
  const value = toNumber(step.originalIndex);
  return value !== undefined && value >= 0 ? value : undefined;
}

function getStepSortIndex(step: ReportStep): number {
  return toNumber(step.unrolledIndex) ?? 0;
}

function buildReportNodes(
  workflowNodes: Array<Record<string, unknown>>,
  steps: ReportStep[],
): ReportNodeInfo[] {
  if (steps.length === 0) {
    return workflowNodes.map(toReportNodeFromWorkflowNode);
  }

  const stepsByOriginalIndex = new Map<number, ReportStep[]>();
  const orphanSteps: ReportStep[] = [];

  for (const step of steps) {
    const originalIndex = getOriginalStepIndex(step);
    if (originalIndex === undefined || originalIndex >= workflowNodes.length) {
      orphanSteps.push(step);
      continue;
    }

    const existing = stepsByOriginalIndex.get(originalIndex) ?? [];
    existing.push(step);
    stepsByOriginalIndex.set(originalIndex, existing);
  }

  const nodes: ReportNodeInfo[] = [];
  workflowNodes.forEach((workflowNode, index) => {
    const matchedSteps = (stepsByOriginalIndex.get(index) ?? [])
      .sort((a, b) => getStepSortIndex(a) - getStepSortIndex(b));

    if (matchedSteps.length === 0) {
      nodes.push(toReportNodeFromWorkflowNode(workflowNode, index));
      return;
    }

    matchedSteps.forEach((step) => {
      nodes.push(toReportNodeFromStep(step, workflowNode));
    });
  });

  orphanSteps
    .sort((a, b) => getStepSortIndex(a) - getStepSortIndex(b))
    .forEach((step) => {
      const originalIndex = getOriginalStepIndex(step);
      nodes.push(toReportNodeFromStep(step, originalIndex !== undefined ? workflowNodes[originalIndex] : undefined));
    });

  return nodes.map((node, index) => ({ ...node, index: index + 1 }));
}

function normalizeArtifact(raw: ReportArtifact): ReportArtifactInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw;
  const filePath = record.filePath;
  if (!filePath) {
    return null;
  }

  return {
    nodeId: record.nodeId as string | undefined,
    fileType: record.fileType as string | undefined,
    filePath: String(filePath),
    createdAt: record.createdAt as string | undefined,
    dataPoints: toNumber(record.dataPoints),
  };
}

function artifactFromNode(node: ReportNodeInfo): ReportArtifactInfo | null {
  const filePath = node.csvPath || node.outputFile;
  if (!filePath) {
    return null;
  }

  return {
    fileType: node.csvPath ? 'csv' : 'output',
    filePath,
    dataPoints: node.dataPoints,
  };
}

function buildArtifacts(payloadArtifacts: ReportArtifact[] | undefined, nodes: ReportNodeInfo[]): ReportArtifactInfo[] {
  const seen = new Set<string>();
  const artifacts: ReportArtifactInfo[] = [];
  const candidates = [
    ...(payloadArtifacts ?? []).map(normalizeArtifact),
    ...nodes.map(artifactFromNode),
  ];

  for (const artifact of candidates) {
    if (!artifact || seen.has(artifact.filePath)) {
      continue;
    }
    seen.add(artifact.filePath);
    artifacts.push(artifact);
  }

  return artifacts;
}

function buildWarnings(rawWarnings: ReportWarning[] | undefined): ReportWarningInfo[] {
  return (rawWarnings ?? []).map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { message: String(raw ?? '') };
    }
    const record = raw;
    return {
      type: record.warningType as string | undefined,
      message: String(record.message ?? ''),
      createdAt: record.createdAt as string | undefined,
    };
  }).filter((warning) => warning.message);
}

export function buildReportData(payload: ExecutionReport): ReportData {
  const meta = payload.executionMetadata;
  const workflowNodes: Array<Record<string, unknown>> = payload.workflowSnapshot.nodes ?? [];
  const steps = payload.unrolledSteps;
  const pathConfig = payload.pathConfig;
  const generatedAt = toIsoString(payload.generatedAt ?? new Date().toISOString());
  const startTime = toIsoString(meta.startedAt);
  const endTime = toIsoString(meta.endedAt ?? meta.startedAt ?? generatedAt);
  const durationSeconds = Math.max(0, Math.round(Number(meta.durationMs ?? 0) / 1000));

  const nodes = buildReportNodes(workflowNodes, steps);
  const artifactDetails = buildArtifacts(payload.artifacts, nodes);
  const warningDetails = buildWarnings(payload.warningFlags);

  return {
    projectName: String(
      meta.projectName ??
      pathConfig.projectName ??
      ''
    ),
    individualName: String(
      meta.individualName ??
      pathConfig.individualName ??
      ''
    ),
    workflowName: String(meta.workflowName ?? meta.workflowId ?? ''),
    user: String(meta.ownerName ?? ''),
    executionId: String(meta.executionId),
    status: (meta.status as ReportData['status']) ?? 'pending',
    error: meta.error ? String(meta.error) : undefined,
    startTime,
    endTime,
    durationSeconds,
    generatedAt,
    warnings: warningDetails.length,
    artifacts: artifactDetails.length,
    warningDetails,
    artifactDetails,
    nodes,
  };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const parts = [
    hours > 0 ? `${hours}h` : '',
    minutes > 0 ? `${minutes}m` : '',
    remainingSeconds > 0 || (hours === 0 && minutes === 0) ? `${remainingSeconds}s` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}
