/**
* useEisData Hook
* 监听 EIS 测量完成事件，接收频率/实部/虚部数据
* 用于 Nyquist 图一次性绘制 + 持久保存
*/
import { useCallback, useEffect, useMemo, useState } from 'react';
import { workflowWebSocketService } from '../workflow/websocket.service';

// EIS 数据点结构
export interface EisDataPoint {
frequency: number;
zReal: number;
zImag: number;
}

// EIS 完整数据
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

// 全局 EIS 数据缓存（nodeIndex -> iterationKey -> data）
const GlobalEisCache = new Map<number, Map<string, EisData>>();

const getIterationKey = (iterationPath: number[]) => {
return iterationPath.length > 0 ? iterationPath.join(',') : '0';
};

// 全局监听器设置
let isEisListenerSetup = false;
type EisHandler = (nodeIndex: number, iterationPath: number[], data: EisData) => void;
const eisListeners = new Set<EisHandler>();

const setupEisListener = () => {
if (isEisListenerSetup) return;

// 确保 WebSocket 已连接
workflowWebSocketService.connect();

workflowWebSocketService.onEisDataReady((payload) => {
if (!payload.data || payload.nodeIndex === undefined) return;

const { frequency, z_real, z_imag, point_count, csv_path } = payload.data;
const iterationPath = payload.iterationPath || [];
console.log('[useEisData] Received EIS data:', {
nodeIndex: payload.nodeIndex,
iterationPath,
pointCount: point_count,
csvPath: csv_path
});

// 转换为数据点数组，同时预生成 ECharts 可直接使用的数据和范围元数据
const points: EisDataPoint[] = [];
const chartPoints: [number, number, number][] = [];
let xMin = Infinity;
let xMax = -Infinity;
let yMin = Infinity;
let yMax = -Infinity;
for (let i = 0; i < frequency.length; i++) {
const x = z_real[i];
const y = -z_imag[i];
points.push({
frequency: frequency[i],
zReal: x,
zImag: z_imag[i]
});
chartPoints.push([x, y, frequency[i]]);
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
csvPath: csv_path
};

// 存入全局缓存 (使用迭代路径作为 key)
const iterKey = getIterationKey(iterationPath);
if (!GlobalEisCache.has(payload.nodeIndex)) {
GlobalEisCache.set(payload.nodeIndex, new Map());
}
GlobalEisCache.get(payload.nodeIndex)!.set(iterKey, eisData);

// 通知所有监听者
eisListeners.forEach(handler => handler(payload.nodeIndex, iterationPath, eisData));
});

// 监听重置事件，清空缓存
workflowWebSocketService.onNodesReset(() => {
console.log('[useEisData] nodesReset, clearing EIS cache');
GlobalEisCache.clear();
});

isEisListenerSetup = true;
console.log('[useEisData] Global EIS listener initialized');
};

// 🔥 关键修复：模块加载时立即初始化全局监听器
// 这样即使 MeasurementDashboard 未打开，EIS 数据也会被缓存
setupEisListener();

// 导出清空方法
export const clearEisCache = () => {
GlobalEisCache.clear();
};

interface UseEisDataProps {
nodeIndex: number;
nodeIndices?: number[];
}

export const useEisData = ({ nodeIndex, nodeIndices }: UseEisDataProps) => {
const [tick, setTick] = useState(0); // 用于强制刷新
const trackedKey = nodeIndices && nodeIndices.length > 0 ? nodeIndices.join(',') : `${nodeIndex}`;
const trackedIndices = useMemo(() => {
return nodeIndices && nodeIndices.length > 0 ? nodeIndices : [nodeIndex];
}, [nodeIndex, trackedKey]);
const trackedSet = useMemo(() => new Set(trackedIndices), [trackedIndices]);

useEffect(() => {
setupEisListener();

const handler: EisHandler = (idx, iterPath, data) => {
if (trackedSet.has(idx)) {
// 收到新数据，触发重绘
setTick(t => t + 1);
}
};

eisListeners.add(handler);
return () => { eisListeners.delete(handler); };
}, [trackedSet]);

// 获取该节点的所有迭代数据
const nodeIterations = useMemo((): Map<string, EisData> => {
return GlobalEisCache.get(nodeIndex) || new Map<string, EisData>();
}, [nodeIndex, tick]);

const nodesIterations = useMemo((): Map<number, Map<string, EisData>> => {
const result = new Map<number, Map<string, EisData>>();
for (const idx of trackedIndices) {
result.set(idx, GlobalEisCache.get(idx) || new Map<string, EisData>());
}
return result;
}, [trackedIndices, tick]);

const getEisIterationsForNode = useCallback((): Map<string, EisData> => {
return nodeIterations;
}, [nodeIterations]);

const getEisIterationsForNodes = useCallback((): Map<number, Map<string, EisData>> => {
return nodesIterations;
}, [nodesIterations]);

return {
eisData: nodeIterations.get('0') || null, // 向后兼容
getEisIterationsForNode,
getEisIterationsForNodes
};
};
