import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ElectrochemicalNode,
  NodeType,
  WorkstationType,
  createDefaultNodeDataWithWorkstation,
  getNodeConfigByWorkstation
} from '../types/nodes';
import { Position } from '../services/layout';
import { useWorkflowStore } from '../services/stores/index';

// Re-defining Connection as they are local to App.tsx
interface Connection {
  id: string;
  source_id: string;
  target_id: string;
}

interface CanvasState {
  nodes: ElectrochemicalNode[];
  connections: Connection[];
  selectedNode: ElectrochemicalNode | null;
  canvasSize: { width: number; height: number };
  validationError: string | null;

  // Actions
  setCanvasSize: (width: number, height: number) => void;
  addNode: (type: NodeType, selectedWorkstation: WorkstationType, index?: number) => void;
  deleteNode: (nodeId: string) => void;
  moveNode: (nodeId: string, newPosition: Position) => void;
  selectNode: (node: ElectrochemicalNode | null) => void;
  updateNode: (updatedNode: ElectrochemicalNode) => void;
  setNodes: (nodes: ElectrochemicalNode[]) => void;
  setConnections: (connections: Connection[]) => void;
  clearCanvas: () => void;
  recalculateNodePositions: () => void;
  calculateNodeIndex: (position: Position, canvasWidth: number, nodeCount: number) => number;
  batchUpdateNodes: (nodeUpdates: Array<{ id: string; changes: Partial<ElectrochemicalNode> }>) => void;
}

export const useCanvasStore = create<CanvasState>()(devtools((set, get) => {

  const validateNodes = (nodes: ElectrochemicalNode[]): string | null => {
    const startupNodes = nodes.filter(n => n.type === 'startup');
    if (startupNodes.length > 1) return "工作流中最多只能有一个启动程序节点";

    const shutdownNodes = nodes.filter(n => n.type === 'shutdown');
    if (shutdownNodes.length > 1) return "工作流中最多只能有一个停止程序节点";

    const startupIndex = nodes.findIndex(n => n.type === 'startup');
    if (startupIndex > 0) return "启动程序节点必须是第一个节点";

    const shutdownIndex = nodes.findIndex(n => n.type === 'shutdown');
    if (startupIndex !== -1 && shutdownIndex !== -1 && shutdownIndex < startupIndex) {
      return "停止程序节点必须在启动程序节点之后";
    }

    return null;
  };

  return {
    nodes: [],
    connections: [],
    selectedNode: null,
    canvasSize: { width: 800, height: 600 },
    validationError: null,

    setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),

    addNode: (type, selectedWorkstation, index) => {
      const { nodes, canvasSize, connections } = get();
      const config = getNodeConfigByWorkstation(type, selectedWorkstation);
      if (!config) return;

      const targetIndex = (index !== undefined && index >= 0 && index <= nodes.length) ? index : nodes.length;
      const nodeData = createDefaultNodeDataWithWorkstation(type, selectedWorkstation);

      const newNode: ElectrochemicalNode = {
        id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        type: type as NodeType,
        name: config.name,
        category: config.category,
        position: { x: 0, y: 0 },
        data: nodeData,
        status: 'ready',
        input: config.input,
        output: config.output,
        style: config.style
      };

      const newNodes = [
          ...nodes.slice(0, targetIndex),
          newNode,
          ...nodes.slice(targetIndex)
      ];

      set({
        nodes: newNodes,
        connections: connections,
        validationError: validateNodes(newNodes)
      });
    },

    deleteNode: (nodeId) => {
      set(state => {
        const newNodes = state.nodes.filter(node => node.id !== nodeId);
        return {
          nodes: newNodes,
          connections: state.connections.filter(conn => conn.source_id !== nodeId && conn.target_id !== nodeId),
          selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode,
          validationError: validateNodes(newNodes)
        };
      });
    },

    moveNode: (nodeId, newPosition) => {
      return; // 布局由 useUnifiedLayout 自动处理
    },

    selectNode: (node) => set({ selectedNode: node }),

    updateNode: (updatedNode) => {
      const { nodes } = get();
      const existingNode = nodes.find(n => n.id === updatedNode.id);

      if (existingNode && JSON.stringify(existingNode) === JSON.stringify(updatedNode)) {
        return;
      }

      set(state => ({
        nodes: state.nodes.map(node =>
          node.id === updatedNode.id ? updatedNode : node
        ),
        selectedNode: state.selectedNode?.id === updatedNode.id ? updatedNode : state.selectedNode
      }));
    },

    setNodes: (nodes) => {
      // 简洁的更新，不再有冗长的日志
      set({ nodes: nodes, validationError: validateNodes(nodes) });
    },

    setConnections: (connections) => {
      set({ connections });
    },

    batchUpdateNodes: (nodeUpdates) => {
      const { nodes } = get();
      let hasChanges = false;

      const newNodes = nodes.map(node => {
        const update = nodeUpdates.find(u => u.id === node.id);
        if (update) {
          const updatedNode = { ...node, ...update.changes };
          if (JSON.stringify(node) !== JSON.stringify(updatedNode)) {
            hasChanges = true;
            return updatedNode;
          }
        }
        return node;
      });

      if (hasChanges) {
        set({ nodes: newNodes });
      }
    },

    clearCanvas: () => {
      const { setCurrentWorkflow } = useWorkflowStore.getState();
      setCurrentWorkflow(null);
      set({ nodes: [], connections: [], selectedNode: null, validationError: null });
    },

    recalculateNodePositions: () => {
      // 已弃用，布局由 useUnifiedLayout 处理
    },

    calculateNodeIndex: (position, canvasWidth, nodeCount) => {
      const nodeWidth = 200;
      const spacing = 40;
      const columns = Math.max(1, Math.floor(canvasWidth / (nodeWidth + spacing)));

      const estimatedCol = Math.floor(position.x / (nodeWidth + spacing));
      const estimatedRow = Math.floor(position.y / 100);
      const estimatedIndex = Math.min(estimatedRow * columns + estimatedCol, nodeCount - 1);

      return Math.max(0, estimatedIndex);
    }
  };
}));