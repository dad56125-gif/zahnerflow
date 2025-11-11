/**
 * 循环系统模块导出
 */

// 核心逻辑导出
export { LoopDetector } from './core/LoopDetector';
export { LoopContextManager } from './core/LoopContextManager';
export { LoopMetadataManager } from './core/loop_metadata_manager';
export { LoopSystemController } from './core/loop_system_controller';
export { LoopLevelCalculator } from './core/loop_level_calculator';
export { FingerprintCache, ChangeHandler } from './core/fingerprint_cache';

// 可视化组件导出
export { LoopBoundary } from './visualization/LoopBoundary';
export { LoopControlPanel } from './visualization/LoopControlPanel';

// 类型导出
export type { LoopInfo, LoopDetectionResult, LoopConfig } from './core/LoopDetector';
export type {
  LoopExecutionState,
  LoopData,
  LoopExecutionContext,
  LoopEvent,
  LoopExecutionConfig
} from './core/LoopContextManager';
export type { LoopBoundaryProps } from './visualization/LoopBoundary';
export type { LoopControlPanelProps } from './visualization/LoopControlPanel';
export type { LoopLevel } from './core/loop_level_calculator';
export type { LoopSystemConfig, WorkflowData } from './core/loop_system_controller';
export type {
  LoopConnection,
  WorkflowChange,
  WorkflowChangeType
} from './core/fingerprint_cache';