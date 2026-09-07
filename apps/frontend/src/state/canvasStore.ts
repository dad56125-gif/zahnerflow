import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { WorkflowNode, NodeType } from '@zahnerflow/types';
import { createWorkflowNode } from '../utils/nodeUtilities';
import type { NodeParameters } from '../types/NodeConfiguration';
import { selectCanvasEditable, useExecutionStore } from './executionStateBridge';

interface CanvasState {
  nodes: WorkflowNode[];
  selectedNodeId: string | null;
  canvasSize: { width: number; height: number };
  validationError: string | null;
  setCanvasSize: (width: number, height: number) => void;
  addNode: (type: NodeType, index?: number) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeConfig: (nodeId: string, config: NodeParameters) => void;
  replaceNodeConfig: (nodeId: string, config: NodeParameters) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  hydrateExecutionNodes: (nodes: WorkflowNode[]) => void;
  clearCanvas: () => void;
  reorderNode: (fromIndex: number, toIndex: number) => void;
}

function validate(nodes: WorkflowNode[]): string | null {
  return nodes.filter(node => node.type === 'startup').length > 1 ? '只能有一个启动程序' : null;
}

export const useCanvasStore = create<CanvasState>()(devtools((set, get) => {
  const editable = () => selectCanvasEditable(useExecutionStore.getState());
  const applyNodes = (nodes: WorkflowNode[]) => set(state => ({
    nodes, validationError: validate(nodes),
    selectedNodeId: nodes.some(node => node.id === state.selectedNodeId) ? state.selectedNodeId : null,
  }));
  return {
    nodes: [], selectedNodeId: null, canvasSize: { width: 800, height: 600 }, validationError: null,
    setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),
    selectNode: selectedNodeId => set({ selectedNodeId }),
    addNode: (type, index) => {
      if (!editable()) return;
      const nodes = [...get().nodes];
      nodes.splice(index === undefined ? nodes.length : Math.max(0, Math.min(nodes.length, index)), 0, createWorkflowNode(type));
      applyNodes(nodes);
    },
    deleteNode: nodeId => { if (editable()) applyNodes(get().nodes.filter(node => node.id !== nodeId)); },
    updateNodeConfig: (nodeId, config) => {
      if (editable()) applyNodes(get().nodes.map(node => node.id === nodeId ? { ...node, config: { ...node.config, ...config } } : node));
    },
    replaceNodeConfig: (nodeId, config) => {
      if (editable()) applyNodes(get().nodes.map(node => node.id === nodeId ? { ...node, config: { ...config } } : node));
    },
    setNodes: nodes => { if (editable()) applyNodes(nodes); },
    // 仅用于 App 消费完整后端快照，不是用户编辑入口。
    hydrateExecutionNodes: applyNodes,
    clearCanvas: () => { if (editable()) applyNodes([]); },
    reorderNode: (fromIndex, toIndex) => {
      if (!editable() || fromIndex === toIndex) return;
      const nodes = [...get().nodes];
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || fromIndex >= nodes.length || toIndex < 0 || toIndex >= nodes.length) return;
      const [node] = nodes.splice(fromIndex, 1);
      nodes.splice(toIndex, 0, node);
      applyNodes(nodes);
    },
  };
}));
