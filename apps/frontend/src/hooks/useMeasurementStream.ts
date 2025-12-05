import { useEffect, useRef, useState } from 'react';
import { EnrichedStreamData, ExecutionSnapshot, RawStreamData } from '../types/module-interfaces';
import { workflowWebSocketService } from '../workflow/websocket.service';

interface UseMeasurementStreamProps {
  nodeIndex: number; // 当前组件在工作流中的索引 (0, 1, 2...)
  activeExecutionId: string | null; // 从全局 Store 获取的当前运行 ID
}

export const useMeasurementStream = ({ nodeIndex, activeExecutionId }: UseMeasurementStreamProps) => {
  // 数据缓冲区 (不触发重渲染)
  const dataBufferRef = useRef<RawStreamData[]>([]);
  // 用于强制更新 UI 的 Trigger
  const [tick, setTick] = useState(0);

  // 状态标记
  const isReceiving = useRef(false);

  useEffect(() => {
    // 确保服务已连接
    workflowWebSocketService.connect();

    // 核心监听逻辑
    const handleData = (payload: EnrichedStreamData) => {
      console.log(`[useMeasurementStream] Received: executionId=${payload.executionId}, stepIndex=${payload.stepIndex}, nodeId=${payload.nodeId}, activeExecutionId=${activeExecutionId}, nodeIndex=${nodeIndex}`);

      // 1. 批次校验：防止显示上一次运行的残影
      if (payload.executionId !== activeExecutionId) {
        console.warn(`[useMeasurementStream] Filtered: executionId mismatch (${payload.executionId} !== ${activeExecutionId})`);
        return;
      }

      // 2. 步骤校验：这一步是核心！
      // 只有当流数据的 stepIndex 等于我这个组件的 nodeIndex 时，我才处理
      if (payload.stepIndex !== nodeIndex) {
        console.warn(`[useMeasurementStream] Filtered: stepIndex mismatch (${payload.stepIndex} !== ${nodeIndex})`);
        isReceiving.current = false;
        return;
      }

      console.log(`[useMeasurementStream] Accepted: stepIndex=${payload.stepIndex}, data points=${dataBufferRef.current.length + 1}`);
      isReceiving.current = true;

      // 3. 推入缓冲
      dataBufferRef.current.push(payload.data);

      // 注意：这里不调用 setTick，避免高频重绘
    };

    workflowWebSocketService.onMeasurementData(handleData);

    // 注意：由于 workflowWebSocketService 使用数组存储回调，
    // 这里需要清理回调以避免内存泄漏
    return () => {
      // 由于服务没有提供 off 方法，我们需要保存回调索引
      // 或者修改服务以支持清理
      // 暂时保留，后续可以优化
    };
  }, [nodeIndex, activeExecutionId]);

  // 动画帧循环：负责从 buffer 中取数据并通知 UI 更新
  // 这将 100Hz 的 WebSocket 频率降采样到 60Hz (屏幕刷新率)
  useEffect(() => {
    let frameId: number;

    const loop = () => {
      if (dataBufferRef.current.length > 0) {
        // 触发一次重渲染，让组件有机会去读取 dataBufferRef
        setTick(t => t + 1);
      }
      frameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(frameId);
  }, []);

  /**
   * 消费数据的函数。组件在渲染时调用此函数获取最新数据并清空缓冲。
   * 这样就把 "Push" 模型转换为了组件主动的 "Pull" 模型。
   */
  const consumeBuffer = () => {
    const chunk = [...dataBufferRef.current];
    dataBufferRef.current = []; // 清空缓冲
    return chunk;
  };

  return {
    consumeBuffer,
    isReceiving: isReceiving.current
  };
};