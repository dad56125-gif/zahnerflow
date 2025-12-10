// State Management Module - 统一状态管理导出
// 遵循 SSOT (Single Source of Truth) 原则

// Canvas 状态
export { useCanvasStore } from './canvasStore';

// 执行状态桥 (WebSocket 事件监听 + 后端状态同步)
export {
    useExecutionStore,
    useIsRunning,
    useNodeStatus,
    useExecutionError,
    useSystemState
} from './executionStateBridge';

// 当前工作流状态
export { useWorkflowStore } from './currentWorkflowStore';

// 应用全局状态
export { useAppStore } from './appStore';
