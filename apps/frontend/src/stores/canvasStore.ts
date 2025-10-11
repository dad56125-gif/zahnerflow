import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { 
  ElectrochemicalNode, 
  NodeType, 
  WorkstationType, 
  createDefaultNodeDataWithWorkstation, 
  getNodeConfigByWorkstation 
} from '../nodes/types';

// Re-defining Connection and Position as they are local to App.tsx
interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

interface Position {
  x: number;
  y: number;
}

// --- Layout Logic (moved from App.tsx) ---
const NODE_SPACING = 200; // 节点间距
const NODE_START_X = 50; // 起始X坐标
const CANVAS_ROW_HEIGHT = 150; // 行间距

const calculateNodePosition = (index: number, canvasWidth: number): Position => {
  const nodesPerRow = Math.max(1, Math.floor((canvasWidth - 100) / NODE_SPACING));
  const row = Math.floor(index / nodesPerRow);
  const col = index % nodesPerRow;
  
  // S形布局：偶数行从左到右，奇数行从右到左
  const x = NODE_START_X + (row % 2 === 0 ? col : nodesPerRow - 1 - col) * NODE_SPACING;
  const y = 100 + row * CANVAS_ROW_HEIGHT; // 100px顶部留白
  
  return { x, y };
};

const calculateNodeIndex = (position: Position, canvasWidth: number, nodeCount: number): number => {
    const row = Math.round((position.y - 100) / CANVAS_ROW_HEIGHT);
    const nodesPerRow = Math.max(1, Math.floor((canvasWidth - 100) / NODE_SPACING));
    
    if (row < 0) return 0;
    
    const col = Math.round((position.x - NODE_START_X) / NODE_SPACING);
    
    let actualCol = col;
    if (row % 2 === 1) {
      actualCol = nodesPerRow - 1 - col;
    }
    
    const index = row * nodesPerRow + actualCol;
    return Math.max(0, Math.min(nodeCount, index)); // Allow inserting at the end
};

// --- Store Definition ---

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
}

export const useCanvasStore = create<CanvasState>()(devtools((set, get) => {

  const validateNodes = (nodes: ElectrochemicalNode[]): string | null => {
    const startupNodes = nodes.filter(n => n.type === 'startup');
    if (startupNodes.length > 1) {
      return "工作流中最多只能有一个启动程序节点";
    }

    const shutdownNodes = nodes.filter(n => n.type === 'shutdown');
    if (shutdownNodes.length > 1) {
      return "工作流中最多只能有一个停止程序节点";
    }

    const startupIndex = nodes.findIndex(n => n.type === 'startup');
    if (startupIndex > 0) {
      return "启动程序节点必须是第一个节点";
    }

    const shutdownIndex = nodes.findIndex(n => n.type === 'shutdown');
    if (startupIndex !== -1 && shutdownIndex !== -1 && shutdownIndex < startupIndex) {
      return "停止程序节点必须在启动程序节点之后";
    }

    return null; // No error
  };

  return {
    nodes: [],
    connections: [],
    selectedNode: null,
    canvasSize: { width: 800, height: 600 },
    validationError: null,

    setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),

    addNode: (type, selectedWorkstation, index) => {
      const { nodes, canvasSize } = get();
      const config = getNodeConfigByWorkstation(type, selectedWorkstation);
      if (!config) return;

      const targetIndex = (index !== undefined && index >= 0 && index <= nodes.length) ? index : nodes.length;

      const newNode: ElectrochemicalNode = {
        id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type as NodeType,
        name: config.name,
        category: config.category,
        position: { x: 0, y: 0 }, // Position will be calculated below
        data: createDefaultNodeDataWithWorkstation(type, selectedWorkstation),
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

      const repositionedNodes = newNodes.map((node, i) => ({
        ...node,
        position: calculateNodePosition(i, canvasSize.width)
      }));

      set({ nodes: repositionedNodes, validationError: validateNodes(repositionedNodes) });
    },

    deleteNode: (nodeId) => {
      const { canvasSize } = get();
      set(state => {
        const newNodes = state.nodes.filter(node => node.id !== nodeId);
        const repositionedNodes = newNodes.map((node, i) => ({
          ...node,
          position: calculateNodePosition(i, canvasSize.width)
        }));
        return {
          nodes: repositionedNodes,
          connections: state.connections.filter(conn => conn.sourceId !== nodeId && conn.targetId !== nodeId),
          selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode,
          validationError: validateNodes(repositionedNodes)
        };
      });
    },

    moveNode: (nodeId, newPosition) => {
      const { nodes, canvasSize } = get();
      const nodeIndex = nodes.findIndex(node => node.id === nodeId);
      if (nodeIndex === -1) return;

      const targetIndex = calculateNodeIndex(newPosition, canvasSize.width, nodes.length);
      if (targetIndex === nodeIndex) return;

      const newNodes = [...nodes];
      const [movedNode] = newNodes.splice(nodeIndex, 1);
      newNodes.splice(targetIndex, 0, movedNode);

      const repositionedNodes = newNodes.map((node, i) => ({
        ...node,
        position: calculateNodePosition(i, canvasSize.width)
      }));

      set({ nodes: repositionedNodes, validationError: validateNodes(repositionedNodes) });
    },

    selectNode: (node) => set({ selectedNode: node }),

    updateNode: (updatedNode) => set(state => ({
      nodes: state.nodes.map(node => 
        node.id === updatedNode.id ? updatedNode : node
      ),
      selectedNode: state.selectedNode?.id === updatedNode.id ? updatedNode : state.selectedNode
    })),

    setNodes: (nodes) => set({ nodes: nodes, validationError: validateNodes(nodes) }),
    setConnections: (connections) => set({ connections }),

    clearCanvas: () => set({ nodes: [], connections: [], selectedNode: null, validationError: null }),

    recalculateNodePositions: () => {
      const { nodes, canvasSize } = get();
      const repositionedNodes = nodes.map((node, i) => ({
        ...node,
        position: calculateNodePosition(i, canvasSize.width)
      }));
      set({ nodes: repositionedNodes });
    },

    calculateNodeIndex: (position, canvasWidth, nodeCount) => {
      return calculateNodeIndex(position, canvasWidth, nodeCount);
    }

  }
}));