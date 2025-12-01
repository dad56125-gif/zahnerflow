// 🎯 【核武器】强制DOM重新挂载 - 彻底杀死动画！
// 当重置时，给每个节点的data里塞一个"随机数"或者"时间戳"
// React 会检测到 key 变化，立即销毁旧组件并重新挂载新组件
// 这会强制浏览器丢弃旧的渲染层，所有动画瞬间归零

// 现有状态监听器的修复
if (typeof window !== 'undefined') {
  // 动态导入以避免循环依赖
  import('../websocket.service').then(({ workflowWebSocketService }) => {
    // 1. 监听全量状态快照 -> 更新 Execution Store ✅ 已存在
    workflowWebSocketService.onSystemStateSnapshot((snapshot: any) => {
      import('./executionStore').then(({ useExecutionStore }) => {
        useExecutionStore.getState().updateServerState(snapshot);
      });
    });

    // 2. 监听通知 -> 更新 App Store ✅ 已存在
    workflowWebSocketService.onNotification((data: any) => {
      // 通知处理延迟到实际需要时实现
      console.log('[Store] 收到通知:', data);
    });

    // 🔧 【核心修复】监听节点重置事件 -> 同步更新 Canvas Store
    workflowWebSocketService.onNodesReset((resetEvent: any) => {
      console.log('🔄 [WebSocket] 收到重置指令:', resetEvent);

      // 动态导入以避免循环依赖
      import('./canvasStore').then(({ useCanvasStore }) => {
        // 获取 Canvas Store 的状态和方法
        const canvasStore = useCanvasStore.getState();
        const { nodes, setNodes, connections, setConnections } = canvasStore;

        // 🥥 生成本次重置的唯一ID (核武器激活标记)
        const resetSessionId = Date.now();

        // 批量重置所有节点状态
        const updatedNodes: any[] = nodes.map((node: any) => ({
          ...node,
          // A. 重置视觉状态
          status: (resetEvent.targetStatus || 'ready') as any,

          // B. 清理执行残留数据 (关键！避免重置后点击节点还能看到上一次的报错/结果)
          data: {
            ...node.data,
            execution_time: undefined, // 清除耗时
            result: undefined,         // 清除结果
            error: undefined,          // 清除错误信息
            progress: 0               // 如果有进度条，归零
          },

          // 🎯 核武器：强制React重新挂载的标记！
          _force_reset_key: resetSessionId
        }));

        // (可选) 如果连接线也有动画状态(如变红/变绿)，这里也一并重置
        const updatedConnections = connections.map((connection: any) => ({
          ...connection,
          animated: false,   // 停止流动动画
          // Connection接口没有style属性，这里不做修改
        }));

        // 原子化更新 Store，触发 React 重新渲染
        setNodes(updatedNodes);
        setConnections(updatedConnections);

        console.log(`✅ 系统重置完成: ${updatedNodes.length} 个节点已复位。核武器已激活！`);
      });
    });
  });
}

// ============================================================================
// 导出其他store
export { useCanvasStore } from './canvasStore';
export { useWorkflowParameterStore } from './workflowParameterStore';
export { useWorkflowStore } from './workflowStore';
export { useExecutionStore, useIsRunning, useExecutionError } from './executionStore';