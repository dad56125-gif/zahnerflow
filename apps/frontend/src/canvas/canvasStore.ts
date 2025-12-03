import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ElectrochemicalNode,
  NodeType,
  WorkstationType,
  createDefaultNodeDataWithWorkstation,
  getNodeConfigByWorkstation
} from '../types/nodes';
import {
  Position
} from '../services/layout';
import { useWorkflowParameterStore } from '../services/stores/workflowParameterStore';
import { useWorkflowStore } from '../services/stores/index';

// Re-defining Connection as they are local to App.tsx
interface Connection {
  id: string;
  source_id: string;
  target_id: string;
}

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
  batchUpdateNodes: (nodeUpdates: Array<{ id: string; changes: Partial<ElectrochemicalNode> }>) => void;
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
      const { nodes, canvasSize, connections } = get();
      const config = getNodeConfigByWorkstation(type, selectedWorkstation);
      if (!config) return;

      // 临时工作流逻辑：添加第一个节点时创建临时工作流
      if (nodes.length === 0) {
        const { setCurrentWorkflow } = useWorkflowStore.getState();
        const tempWorkflow: any = {
          id: `temp-workflow-${Date.now()}`,
          name: '临时工作流'
        };
        setCurrentWorkflow(tempWorkflow);
        console.log('[Canvas Store] 创建临时工作流:', tempWorkflow.id);
      }

      const targetIndex = (index !== undefined && index >= 0 && index <= nodes.length) ? index : nodes.length;

      // 智能配对：如果是 loop_end 节点，查找未配对的 loop_start
      // 基于遍历顺序自动配对，不再需要复制loop_id
      let nodeData = createDefaultNodeDataWithWorkstation(type, selectedWorkstation);
      console.log(`[Canvas Store] 创建 ${type} 节点（基于遍历顺序自动配对）`);

      // 合并工作流级别默认参数
      const workflowDefaults = useWorkflowParameterStore.getState().getWorkflowDefaultParameters(type);
      if (workflowDefaults) {
        nodeData = {
          ...nodeData,
          parameters: {
            ...nodeData.parameters,
            ...workflowDefaults
          }
        };
        console.log(`[Canvas Store] 应用工作流默认参数到 ${type} 节点:`, Object.keys(workflowDefaults));
      }

      const newNode: ElectrochemicalNode = {
        id: `temp_node_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, // 临时ID，后端会重新生成
        type: type as NodeType,
        name: config.name,
        category: config.category,
        position: { x: 0, y: 0 }, // Position will be calculated below
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

      // 注意：布局计算现在由useUnifiedLayout在Canvas组件中处理
      // 这里只需要更新节点数组，布局会自动重新计算
      // 连接线也由useUnifiedLayout预计算，不需要在这里手动创建
      set({
        nodes: newNodes,
        connections: connections, // 保持原有连接，新连接由useUnifiedLayout自动生成
        validationError: validateNodes(newNodes)
      });
    },

    deleteNode: (nodeId) => {
      set(state => {
        const newNodes = state.nodes.filter(node => node.id !== nodeId);
        // 注意：布局计算现在由useUnifiedLayout在Canvas组件中处理
        // 这里只需要更新节点数组，布局会自动重新计算
        return {
          nodes: newNodes,
          connections: state.connections.filter(conn => conn.source_id !== nodeId && conn.target_id !== nodeId),
          selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode,
          validationError: validateNodes(newNodes)
        };
      });
    },

    moveNode: (nodeId, newPosition) => {
      const { nodes } = get();
      const nodeIndex = nodes.findIndex(node => node.id === nodeId);
      if (nodeIndex === -1) return;

      // 注意：布局计算现在由useUnifiedLayout在Canvas组件中处理
      // 这个函数现在主要用于节点的重新排序，而不是位置计算
      // 暂时禁用手动移动，由布局系统控制位置
      // 未来可以扩展支持拖拽重排序
      return;
    },

    selectNode: (node) => set({ selectedNode: node }),

    updateNode: (updatedNode) => {
      const { nodes } = get();
      const existingNode = nodes.find(n => n.id === updatedNode.id);

      // 🎯 深度比较，只在真正变化时更新
      if (existingNode && JSON.stringify(existingNode) === JSON.stringify(updatedNode)) {
        return; // 没有实际变化，跳过更新
      }

      set(state => ({
        nodes: state.nodes.map(node =>
          node.id === updatedNode.id ? updatedNode : node
        ),
        selectedNode: state.selectedNode?.id === updatedNode.id ? updatedNode : state.selectedNode
      }));
    },

    setNodes: (nodes) => {
      // 更新节点
      set({ nodes: nodes, validationError: validateNodes(nodes) });
    },

    setConnections: (connections) => {
      // 更新连接
      set({ connections });
    },

    // 🎯 批量更新方法，减少状态变化次数
    batchUpdateNodes: (nodeUpdates: Array<{ id: string; changes: Partial<ElectrochemicalNode> }>) => {
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
      // 清除临时工作流状态
      const { setCurrentWorkflow } = useWorkflowStore.getState();
      setCurrentWorkflow(null);
      set({ nodes: [], connections: [], selectedNode: null, validationError: null });
    },

    recalculateNodePositions: () => {
      // 注意：布局计算现在由useUnifiedLayout在Canvas组件中处理
      // 这个函数已弃用，因为布局现在是响应式的
      console.log('[Canvas Store] recalculateNodePositions is now handled by useUnifiedLayout');
    },

    calculateNodeIndex: (position, canvasWidth, nodeCount) => {
      // 注意：这个函数现在主要由Canvas组件中的拖放处理使用
      // 简化实现，基于画布尺寸和节点数量的估算
      const nodeWidth = 200; // 默认节点宽度
      const spacing = 40;   // 默认间距
      const columns = Math.max(1, Math.floor(canvasWidth / (nodeWidth + spacing)));

      const estimatedCol = Math.floor(position.x / (nodeWidth + spacing));
      const estimatedRow = Math.floor(position.y / 100); // 假设行高为100
      const estimatedIndex = Math.min(estimatedRow * columns + estimatedCol, nodeCount - 1);

      return Math.max(0, estimatedIndex);
    }
  };
}));