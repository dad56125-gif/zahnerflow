// --- START OF FILE index.ts ---

// 1. 导出 Stores (状态管理)
export { useWorkflowStore } from './workflowStore';
export { useExecutionStore, useIsRunning, useNodeStatus, useExecutionError } from './executionStore';
export { useAppStore } from './appStore';

// 2. 导出 Canvas Store (Re-export)
export { useCanvasStore } from '../canvas/canvasStore';

// 3. 导出 Services (业务逻辑)
export { workflowService, executionService, templateService } from './workflowService';
export { workflowWebSocketService } from './websocket.service';

// 4. 导出 Manager & UI (组件)
export { WorkflowManager } from './WorkflowManager';
export { WorkflowManagerUI } from './WorkflowManagerUI';
export { WorkflowIdDisplay } from './WorkflowIdDisplay';

// 5. 导出 Types (类型定义)
// 注意：如果 types 都在 @zahnerflow/types 中，这里可能不需要导出太多本地类型
export type { WorkflowManagerUIProps } from './WorkflowManagerUI';