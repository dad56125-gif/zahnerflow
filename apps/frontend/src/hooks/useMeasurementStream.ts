import { useCallback, useEffect, useRef, useState } from 'react';
import { WORKFLOW_MEASUREMENT, WORKFLOW_NODES_RESET } from '../eventContracts';
import type { EnrichedStreamData, RawStreamData } from '@zahnerflow/types';
import { runtimeSocket } from '../runtimeClient';
import { compareIterationKeys, iterationPathKey } from '../utils/iterationPath';

type MeasurementIterations = Map<string, RawStreamData[]>;
type MeasurementNodes = Map<number, MeasurementIterations>;

// 测量历史按 execution -> 原节点索引 -> 迭代路径分桶，避免不同执行或嵌套循环混桶。
const globalMeasurementCache = new Map<string, MeasurementNodes>();

function clearMeasurementCache() {
  globalMeasurementCache.clear();
}

function prepareExecutionCache(executionId: string): MeasurementNodes {
  let nodes = globalMeasurementCache.get(executionId);
  if (!nodes) {
    nodes = new Map();
    globalMeasurementCache.set(executionId, nodes);
  }
  return nodes;
}

function getNodeIterations(executionId: string | null, nodeIndex: number): MeasurementIterations {
  if (!executionId) return new Map();
  return globalMeasurementCache.get(executionId)?.get(nodeIndex) ?? new Map();
}

type DataHandler = (payload: EnrichedStreamData) => void;
const listeners = new Set<DataHandler>();
let isGlobalListenerSetup = false;

const setupGlobalListener = () => {
  if (isGlobalListenerSetup) return;

  runtimeSocket.connectSocket();
  runtimeSocket.on(WORKFLOW_NODES_RESET, clearMeasurementCache);
  runtimeSocket.on<EnrichedStreamData>(WORKFLOW_MEASUREMENT, (payload) => {
    if (!payload.executionId) return;

    const nodes = prepareExecutionCache(payload.executionId);
    let iterations = nodes.get(payload.stepIndex);
    if (!iterations) {
      iterations = new Map();
      nodes.set(payload.stepIndex, iterations);
    }

    const key = iterationPathKey(payload.iterationPath ?? []);
    const points = iterations.get(key) ?? [];
    points.push(payload.data);
    iterations.set(key, points);

    listeners.forEach((handler) => handler(payload));
  });

  isGlobalListenerSetup = true;
};

setupGlobalListener();

interface UseMeasurementStreamProps {
  nodeIndex: number;
  activeExecutionId: string | null;
}

export interface BufferedMeasurementPoint {
  iterationKey: string;
  data: RawStreamData;
}

export const useMeasurementStream = ({ nodeIndex, activeExecutionId }: UseMeasurementStreamProps) => {
  const dataBufferRef = useRef<BufferedMeasurementPoint[]>([]);
  const [, setTick] = useState(0);
  const isReceiving = useRef(false);
  const frameIdRef = useRef<number>(0);

  const flushLoop = useRef(() => {
    if (dataBufferRef.current.length > 0) {
      setTick(tick => tick + 1);
    }
    frameIdRef.current = 0;
  });

  useEffect(() => {
    setupGlobalListener();

    const handleData: DataHandler = (payload) => {
      if (payload.executionId !== activeExecutionId || payload.stepIndex !== nodeIndex) {
        isReceiving.current = false;
        return;
      }

      isReceiving.current = true;
      dataBufferRef.current.push({
        iterationKey: iterationPathKey(payload.iterationPath ?? []),
        data: payload.data,
      });

      if (frameIdRef.current === 0) {
        frameIdRef.current = requestAnimationFrame(flushLoop.current);
      }
    };

    listeners.add(handleData);
    return () => {
      listeners.delete(handleData);
      dataBufferRef.current = [];
      if (frameIdRef.current !== 0) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = 0;
      }
    };
  }, [nodeIndex, activeExecutionId]);

  const consumeIterationBuffer = useCallback((): BufferedMeasurementPoint[] => {
    const chunk = dataBufferRef.current;
    dataBufferRef.current = [];
    return chunk;
  }, []);

  const consumeBuffer = useCallback((): RawStreamData[] => {
    return consumeIterationBuffer().map(point => point.data);
  }, [consumeIterationBuffer]);

  const getIterationsForNode = useCallback((): Map<string, RawStreamData[]> => {
    // 缓存快照已经包含此前收到的点，同步丢弃本地增量可避免恢复时重复追加。
    dataBufferRef.current = [];
    return new Map(getNodeIterations(activeExecutionId, nodeIndex));
  }, [activeExecutionId, nodeIndex]);

  const getFullHistory = useCallback((): RawStreamData[] => {
    dataBufferRef.current = [];
    return Array.from(getNodeIterations(activeExecutionId, nodeIndex).entries())
      .sort(([left], [right]) => compareIterationKeys(left, right))
      .flatMap(([, points]) => points);
  }, [activeExecutionId, nodeIndex]);

  return {
    consumeBuffer,
    consumeIterationBuffer,
    getFullHistory,
    getIterationsForNode,
    isReceiving: isReceiving.current,
  };
};
