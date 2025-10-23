/**
 * Furnace 相关Hooks的统一导出
 */

export { useFurnaceConnection } from './useFurnaceConnection';
export { useFurnaceStatus } from './useFurnaceStatus';
export { useFurnaceProgram } from './useFurnaceProgram';
export { useFurnacePresets } from './useFurnacePresets';
export { useFurnaceHistory } from './useFurnaceHistory';
export { useFurnaceLogs } from './useFurnaceLogs';
export { useFurnaceErrorHandler } from './useFurnaceErrorHandler';
export { useFurnacePolling } from './useFurnacePolling';
export {
  useFurnaceCache,
  useFurnaceDebounce,
  useFurnaceThrottle,
  useFurnaceVirtualScroll,
  useFurnaceBatchUpdate,
  useFurnaceMemoryMonitor,
  useFurnacePerformanceMonitor
} from './useFurnaceOptimization';

export type {
  ConnectionStateData,
  ConnectionControls,
} from './useFurnaceConnection';

export type {
  FurnaceStatusData,
  FurnaceStatusControls,
} from './useFurnaceStatus';

export type {
  SegmentOperationProgress,
  FurnaceProgramData,
  FurnaceProgramControls,
} from './useFurnaceProgram';

export type {
  FurnacePresetsData,
  FurnacePresetsControls,
} from './useFurnacePresets';

export type {
  FurnaceHistoryData,
  FurnaceHistoryControls,
} from './useFurnaceHistory';

export type {
  FurnaceLogsData,
  FurnaceLogsControls,
} from './useFurnaceLogs';

export type {
  ErrorHandlerData,
  ErrorHandlerControls,
} from './useFurnaceErrorHandler';