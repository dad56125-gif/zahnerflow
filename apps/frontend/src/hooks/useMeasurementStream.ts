import { useEffect, useRef, useState } from 'react';
import { EnrichedStreamData, RawStreamData } from '../types/Interfaces';
import { workflowWebSocketService } from '../workflow/websocket.service';

// --- 🔥 1. 全局数据仓库 (核心修改) ---
// 用来永久存储每个节点对应的历史数据
// key: nodeIndex, value: 数据点数组
const GlobalMeasurementCache = new Map<number, RawStreamData[]>();

// 🔥 新增：记录上一次的运行ID，用来判断是否开启了新的一轮
let lastExecutionId: string | null = null;

// --- 全局监听器 ---
type DataHandler = (payload: EnrichedStreamData) => void;
const listeners = new Set<DataHandler>();
let isGlobalListenerSetup = false;

const setupGlobalListener = () => {
  if (isGlobalListenerSetup) return;

  workflowWebSocketService.connect();

  // 🔥 SSOT: 自己监听 nodesReset 事件，不再依赖 executionStateBridge 调用
  workflowWebSocketService.onNodesReset((event) => {
    console.log('[MeasurementStream] 收到 nodesReset 事件，清空缓存');
    GlobalMeasurementCache.clear();
    lastExecutionId = null;
  });

  workflowWebSocketService.onMeasurementData((payload) => {
    // 🔥 2. 无论有没有组件在看，先存入全局仓库！
    // 这样当你回头看 Node 1 时，数据都在这里等着你
    if (!GlobalMeasurementCache.has(payload.stepIndex)) {
      GlobalMeasurementCache.set(payload.stepIndex, []);
    }
    GlobalMeasurementCache.get(payload.stepIndex)?.push(payload.data);

    // 然后再分发给活跃的组件
    listeners.forEach((handler) => handler(payload));
  });

  isGlobalListenerSetup = true;
};

// 导出清空缓存的方法（给重置按钮用）
export const clearMeasurementCache = () => {
  GlobalMeasurementCache.clear();
  lastExecutionId = null;
};

interface UseMeasurementStreamProps {
  nodeIndex: number;
  activeExecutionId: string | null;
}

export const useMeasurementStream = ({ nodeIndex, activeExecutionId }: UseMeasurementStreamProps) => {
  // 本地缓冲区 (仅用于平滑动画)
  const dataBufferRef = useRef<RawStreamData[]>([]);
  const [tick, setTick] = useState(0);
  const isReceiving = useRef(false);

  // 🔥 SSOT: 移除隐式清空逻辑，完全依赖 executionStore 监听 nodesReset 事件调用 clearMeasurementCache()
  // 不再在渲染时判断 activeExecutionId 变化来清空缓存

  useEffect(() => {
    setupGlobalListener();

    const handleData: DataHandler = (payload) => {
      // 校验 executionId 和 stepIndex
      if (payload.executionId !== activeExecutionId) return;
      if (payload.stepIndex !== nodeIndex) {
        isReceiving.current = false;
        return;
      }

      isReceiving.current = true;
      // 存入本地 buffer 用于触发 UI 刷新
      dataBufferRef.current.push(payload.data);
    };

    listeners.add(handleData);
    return () => { listeners.delete(handleData); };
  }, [nodeIndex, activeExecutionId]);

  // 动画帧循环
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (dataBufferRef.current.length > 0) {
        setTick(t => t + 1);
      }
      frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, []);

  const consumeBuffer = () => {
    const chunk = [...dataBufferRef.current];
    dataBufferRef.current = [];
    return chunk;
  };

  // 🔥 3. 新增：提供获取完整历史数据的方法
  // 组件挂载时调用它，瞬间恢复之前的图像
  const getFullHistory = () => {
    return GlobalMeasurementCache.get(nodeIndex) || [];
  };

  return {
    consumeBuffer,
    getFullHistory, // 导出这个新方法
    isReceiving: isReceiving.current
  };
};