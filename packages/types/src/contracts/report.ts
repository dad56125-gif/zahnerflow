/** 自动生成，来源 apps/shared/contracts/report.py；勿手动修改。 */

import type { FilePathConfig } from './settings.js';

export interface ReportStep {
  id: number | null;
  executionId: string;
  originalIndex: number | null;
  unrolledIndex: number;
  nodeId: string | null;
  nodeType: string | null;
  status: string;
  params: Record<string, any>;
  actualSeconds: number | null;
  estimatedSeconds: number | null;
  etaSource: string | null;
  iterationPath: any[];
  blockPath: any[];
  result: Record<string, any>;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ReportArtifact {
  executionId: string;
  nodeId: string | null;
  fileType: string | null;
  filePath: string;
  createdAt: string | null;
  source: string;
  dataPoints: number | null;
  metadata: Record<string, any>;
}

export interface ReportWarning {
  executionId: string;
  warningType: string | null;
  message: string;
  createdAt: string | null;
  metadata: Record<string, any>;
}

export interface ReportExecutionMetadata {
  executionId: string;
  workflowId: string;
  workflowName: string;
  ownerName: string;
  projectName: string;
  individualName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface ReportEnvironment {
  furnaceSamples: any[];
  mfcSamples: any[];
}

export interface ExecutionReport {
  reportVersion: string;
  executionMetadata: ReportExecutionMetadata;
  workflowSnapshot: Record<string, any>;
  pathConfig: FilePathConfig;
  unrolledSteps: ReportStep[];
  artifacts: ReportArtifact[];
  environmentSnapshot: ReportEnvironment;
  warningFlags: ReportWarning[];
  summaryMetrics: Record<string, any>;
  generatedAt: string;
}
