/**
 * 工作流系统模块导出
 */

// 核心组件导出
export { WorkflowManager } from './WorkflowManager';
export { WorkflowExporter } from './WorkflowExporter';
export { WorkflowImporter } from './WorkflowImporter';
export { WorkflowManagerUI } from './WorkflowManagerUI';

// 从循环模块导出
export { LoopDetector, type LoopInfo, type LoopDetectionResult, type LoopConfig } from '../loop/core/LoopDetector';

// 类型导出
export type {
  WorkflowData,
  WorkflowMetadata,
  WorkflowSettings,
  WorkflowExportOptions,
  WorkflowImportOptions,
  WorkflowValidationResult
} from './WorkflowManager';
export type { WorkflowExporterProps } from './WorkflowExporter';
export type { WorkflowImporterProps } from './WorkflowImporter';
export type { WorkflowManagerUIProps } from './WorkflowManagerUI';

