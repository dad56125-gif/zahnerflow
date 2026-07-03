import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { temporal } from 'zundo';
import type { WorkflowNode, NodeType } from '@zahnerflow/types';
import { createWorkflowNode } from '../utils/nodeUtilities';

interface CanvasState {
// 核心数据：单一真理源
nodes: WorkflowNode[];
selectedNodeId: string | null;
canvasSize: { width: number; height: number };
validationError: string | null;

// Actions
setCanvasSize: (width: number, height: number) => void;
addNode: (type: NodeType, index?: number) => void;
deleteNode: (nodeId: string) => void;
selectNode: (nodeId: string | null) => void;
updateNodeConfig: (nodeId: string, config: Record<string, any>) => void;
replaceNodeConfig: (nodeId: string, config: Record<string, any>) => void;
setNodes: (nodes: WorkflowNode[]) => void;
clearCanvas: () => void;

// ✅ 修复 1: 补全 reorderNode 方法定义
reorderNode: (fromIndex: number, toIndex: number) => void;

// 兼容性接口
recalculateNodePositions: () => void;
}

export const useCanvasStore = create<CanvasState>()(temporal(devtools((set, get) => {

const validate = (nodes: WorkflowNode[]): string | null => {
const startup = nodes.filter(n => n.type === 'startup');
if (startup.length > 1) return "只能有一个启动程序";
return null; // 简化验证逻辑
};

return {
nodes: [],
selectedNodeId: null,
canvasSize: { width: 800, height: 600 },
validationError: null,

setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),

addNode: (type, index) => {
const { nodes } = get() as CanvasState;

// 1. 创建纯数据节点 (无坐标，无样式)
const newNode = createWorkflowNode(type);

const targetIndex = (index !== undefined && index >= 0) ? index : nodes.length;
const newNodes = [...nodes];
newNodes.splice(targetIndex, 0, newNode);

set({ nodes: newNodes, validationError: validate(newNodes) });
},

deleteNode: (nodeId) => {
set(state => {
const newNodes = state.nodes.filter(n => n.id !== nodeId);
return {
nodes: newNodes,
selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
validationError: validate(newNodes)
};
});
},

selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

// 核心：直接更新 config，不涉及视图属性
updateNodeConfig: (nodeId, config) => {
set(state => ({
nodes: state.nodes.map(n =>
n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n
)
}));
},

replaceNodeConfig: (nodeId, config) => {
set(state => ({
nodes: state.nodes.map(n =>
n.id === nodeId ? { ...n, config: { ...config } } : n
)
}));
},

setNodes: (nodes) => set({ nodes, validationError: validate(nodes) }),

clearCanvas: () => set({ nodes: [], selectedNodeId: null, validationError: null }),

// ✅ 修复 2: 实现 reorderNode
reorderNode: (fromIndex, toIndex) => {
set(state => {
const newNodes = [...state.nodes];
// 简单的数组移动逻辑
const [movedNode] = newNodes.splice(fromIndex, 1);
newNodes.splice(toIndex, 0, movedNode);
return { nodes: newNodes };
});
},

recalculateNodePositions: () => {
// 布局由 useUnifiedLayout 实时接管，Store 不再管理坐标
}
};
}), {
// 只对 nodes 做快照，忽略 selectedNodeId/canvasSize 等 UI 状态
partialize: (state) => ({ nodes: state.nodes }),
// 限制历史栈深度，避免内存膨胀
limit: 50,
// 只有 nodes 引用变化时才入栈
equality: (pastState, currentState) => pastState.nodes === currentState.nodes,
}));
