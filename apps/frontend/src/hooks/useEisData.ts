/**
 * 监听 EIS 测量完成事件，并按 execution、原节点索引和迭代路径保存完整结果。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EnrichedEisData, IterationPathEntry } from '@zahnerflow/types';
import { WORKFLOW_EIS, WORKFLOW_NODES_RESET } from '../eventContracts';
import { runtimeSocket } from '../runtimeClient';
import { iterationPathKey } from '../utils/iterationPath';

export interface EisDataPoint {
  frequency: number;
  zReal: number;
  zImag: number;
}

export interface EisData {
  points: EisDataPoint[];
  chartPoints: [number, number, number][];
  pointCount: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  csvPath?: string;
}

type EisIterations = Map<string, EisData>;
type EisNodes = Map<number, EisIterations>;
const globalEisCache = new Map<string, EisNodes>();

function clearEisCache() {
  globalEisCache.clear();
}

function prepareExecutionCache(executionId: string): EisNodes {
  let nodes = globalEisCache.get(executionId);
  if (!nodes) {
    nodes = new Map();
    globalEisCache.set(executionId, nodes);
  }
  return nodes;
}

function getNodeIterations(executionId: string | null, nodeIndex: number): EisIterations {
  if (!executionId) return new Map();
  return globalEisCache.get(executionId)?.get(nodeIndex) ?? new Map();
}

let isEisListenerSetup = false;
type EisHandler = (
  executionId: string,
  nodeIndex: number,
  iterationPath: IterationPathEntry[],
  data: EisData,
) => void;
const eisListeners = new Set<EisHandler>();

const setupEisListener = () => {
  if (isEisListenerSetup) return;

  runtimeSocket.connectSocket();
  runtimeSocket.on<EnrichedEisData>(WORKFLOW_EIS, (payload) => {
    if (!payload.executionId || payload.nodeIndex === undefined || !payload.data) return;

    const { frequency, z_real, z_imag, point_count, csv_path } = payload.data;
    const iterationPath = payload.iterationPath ?? [];
    const pointTotal = Math.min(frequency.length, z_real.length, z_imag.length);
    const points: EisDataPoint[] = [];
    const chartPoints: [number, number, number][] = [];
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let index = 0; index < pointTotal; index += 1) {
      const x = z_real[index];
      const y = -z_imag[index];
      points.push({ frequency: frequency[index], zReal: x, zImag: z_imag[index] });
      chartPoints.push([x, y, frequency[index]]);
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    const eisData: EisData = {
      points,
      chartPoints,
      pointCount: point_count,
      xMin: Number.isFinite(xMin) ? xMin : 0,
      xMax: Number.isFinite(xMax) ? xMax : 1,
      yMin: Number.isFinite(yMin) ? yMin : 0,
      yMax: Number.isFinite(yMax) ? yMax : 1,
      csvPath: csv_path ?? undefined,
    };

    const nodes = prepareExecutionCache(payload.executionId);
    let iterations = nodes.get(payload.nodeIndex);
    if (!iterations) {
      iterations = new Map();
      nodes.set(payload.nodeIndex, iterations);
    }
    iterations.set(iterationPathKey(iterationPath), eisData);

    eisListeners.forEach(handler => handler(payload.executionId, payload.nodeIndex, iterationPath, eisData));
  });

  runtimeSocket.on(WORKFLOW_NODES_RESET, clearEisCache);
  isEisListenerSetup = true;
};

setupEisListener();

interface UseEisDataProps {
  nodeIndex: number;
  activeExecutionId: string | null;
  nodeIndices?: number[];
}

export const useEisData = ({ nodeIndex, activeExecutionId, nodeIndices }: UseEisDataProps) => {
  const [revision, setRevision] = useState(0);
  const trackedKey = nodeIndices && nodeIndices.length > 0 ? nodeIndices.join(',') : `${nodeIndex}`;
  const trackedIndices = useMemo(
    () => trackedKey.split(',').map(Number),
    [trackedKey],
  );
  const trackedSet = useMemo(() => new Set(trackedIndices), [trackedIndices]);

  useEffect(() => {
    setupEisListener();

    const handler: EisHandler = (executionId, index) => {
      if (executionId === activeExecutionId && trackedSet.has(index)) {
        setRevision(value => value + 1);
      }
    };

    eisListeners.add(handler);
    return () => { eisListeners.delete(handler); };
  }, [activeExecutionId, trackedSet]);

  const nodeIterations = useMemo(() => {
    void revision;
    return new Map(getNodeIterations(activeExecutionId, nodeIndex));
  }, [activeExecutionId, nodeIndex, revision]);

  const nodesIterations = useMemo(() => {
    void revision;
    const result = new Map<number, Map<string, EisData>>();
    for (const index of trackedIndices) {
      result.set(index, new Map(getNodeIterations(activeExecutionId, index)));
    }
    return result;
  }, [activeExecutionId, revision, trackedIndices]);

  const getEisIterationsForNode = useCallback(() => nodeIterations, [nodeIterations]);
  const getEisIterationsForNodes = useCallback(() => nodesIterations, [nodesIterations]);

  return {
    eisData: nodeIterations.values().next().value ?? null,
    getEisIterationsForNode,
    getEisIterationsForNodes,
  };
};
