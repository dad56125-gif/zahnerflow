import { useEffect, useRef, useState } from 'react';
import { EnrichedStreamData, RawStreamData } from '../types/Interfaces';
import { workflowWebSocketService } from '../workflow/websocket.service';

// --- 全局广播系统 ---
// 1. 定义回调类型
type DataHandler = (payload: EnrichedStreamData) => void;

// 2. 使用 Set 存储所有挂载组件的监听函数 (Fan-out 模式)
const listeners = new Set<DataHandler>();
let isGlobalListenerSetup = false;

// 3. 建立唯一的 WebSocket 连接
const setupGlobalListener = () => {
  if (isGlobalListenerSetup) return;

  workflowWebSocketService.connect();

  workflowWebSocketService.onMeasurementData((payload) => {
    // 收到数据后，群发给所有注册的组件
    listeners.forEach((handler) => handler(payload));
  });

  isGlobalListenerSetup = true;
};

interface UseMeasurementStreamProps {
  nodeIndex: number;
  activeExecutionId: string | null;
}

export const useMeasurementStream = ({ nodeIndex, activeExecutionId }: UseMeasurementStreamProps) => {
  const dataBufferRef = useRef<RawStreamData[]>([]);
  const [tick, setTick] = useState(0); // 用于触发重绘
  const isReceiving = useRef(false);

  useEffect(() => {
    // 确保 WebSocket 已连接
    setupGlobalListener();

    // 定义当前组件的“过滤器”逻辑
    const handleData: DataHandler = (payload) => {
      // 1. 必须是当前的运行 ID
      if (payload.executionId !== activeExecutionId) return;

      // 2. 核心逻辑：只有 stepIndex 等于我的 nodeIndex 才接收！
      // - 如果我是 Node 0，现在 payload.stepIndex 是 0 -> 接收 (更新)
      // - 如果我是 Node 0，现在 payload.stepIndex 变成了 1 -> 忽略 (固化/冻结)
      if (payload.stepIndex !== nodeIndex) {
        isReceiving.current = false;
        return; 
      }

      // 3. 匹配成功，存入缓冲
      isReceiving.current = true;
      dataBufferRef.current.push(payload.data);
    };

    // 注册监听
    listeners.add(handleData);

    // 卸载时取消监听
    return () => {
      listeners.delete(handleData);
    };
  }, [nodeIndex, activeExecutionId]);

  // 动画帧循环：只有当 buffer 里有数据时才触发 React 更新
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      // 只有 buffer 有数据才 setTick，这保证了当数据流向下一个节点后，
      // 当前节点因为收不到数据，buffer 为空，不再 setTick，也就不再重绘 -> 达到“固化”效果
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

  return {
    consumeBuffer,
    isReceiving: isReceiving.current
  };
};