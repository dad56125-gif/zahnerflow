import { useCallback, useEffect, useRef, useState } from 'react';
import { WORKFLOW_MEASUREMENT, WORKFLOW_NODES_RESET } from '../eventContracts';
import type { EnrichedStreamData, RawStreamData } from '@zahnerflow/types';
import { runtimeSocket } from '../runtimeClient';

// --- 🔥 1. 全局数据仓库 (核心修改) ---
// 用来永久存储每个节点对应的历史数据
// key: "stepIndex:iterationKey", value: 数据点数组
// 例如: "3:0,1" 表示节点3、外层迭代0、内层迭代1
const GlobalMeasurementCache = new Map<string, RawStreamData[]>();

// 🔥 新增：记录上一次的运行ID，用来判断是否开启了新的一轮
let lastExecutionId: string | null = null;

// 🔥 新增：辅助函数 - 生成迭代 Key
function getIterationKey(iterationPath: Array<number | Record<string, any>>): string {
return iterationPath.length > 0
? iterationPath.map(item => typeof item === 'number' ? item : `${item.loopStartIndex ?? item.loopNodeId}:${item.iteration}`).join(',')
: '0';
}

// 🔥 新增：辅助函数 - 生成缓存 Key
function getCacheKey(stepIndex: number, iterationKey: string): string {
return `${stepIndex}:${iterationKey}`;
}

// --- 全局监听器 ---
type DataHandler = (payload: EnrichedStreamData) => void;
const listeners = new Set<DataHandler>();
let isGlobalListenerSetup = false;

const setupGlobalListener = () => {
if (isGlobalListenerSetup) return;

runtimeSocket.connectSocket();

// 🔥 SSOT: 自己监听 nodesReset 事件，不再依赖 executionStateBridge 调用
runtimeSocket.on(WORKFLOW_NODES_RESET, () => {
GlobalMeasurementCache.clear();
lastExecutionId = null;
});

runtimeSocket.on<EnrichedStreamData & { iterationPath?: Array<number | Record<string, any>> }>(WORKFLOW_MEASUREMENT, (payload) => {
// 🔥 2. 检测运行ID变化，如果是新的一轮运行，清空所有缓存
// 这样当重新 Run 时，图表不会把旧点和新点连起来
if (payload.executionId && payload.executionId !== lastExecutionId) {
GlobalMeasurementCache.clear();
lastExecutionId = payload.executionId;
}

// 🔥 3. 使用 iterationPath 生成缓存 Key
const iterationKey = getIterationKey(payload.iterationPath || []);
const cacheKey = getCacheKey(payload.stepIndex, iterationKey);

// 存入全局仓库（按迭代分组）
if (!GlobalMeasurementCache.has(cacheKey)) {
GlobalMeasurementCache.set(cacheKey, []);
}
GlobalMeasurementCache.get(cacheKey)?.push(payload.data);

// 然后再分发给活跃的组件
listeners.forEach((handler) => handler(payload));
});

isGlobalListenerSetup = true;
};

// 🔥 关键修复：模块加载时立即初始化全局监听器
// 这样即使 MeasurementDashboard 未打开，数据也会被缓存
setupGlobalListener();

interface UseMeasurementStreamProps {
nodeIndex: number;
activeExecutionId: string | null;
}

export const useMeasurementStream = ({ nodeIndex, activeExecutionId }: UseMeasurementStreamProps) => {
// 本地缓冲区 (仅用于平滑动画)
const dataBufferRef = useRef<RawStreamData[]>([]);
const [tick, setTick] = useState(0);
const isReceiving = useRef(false);
const frameIdRef = useRef<number>(0);

// RAF 回调：有数据时刷新 UI，无数据时停止循环
const flushLoop = useRef(() => {
if (dataBufferRef.current.length > 0) {
setTick(t => t + 1);
}
// 停止循环，等待下一次数据到达时重新调度
frameIdRef.current = 0;
});

// 🔥 SSOT: 移除隐式清空逻辑，完全依赖本模块监听 nodesReset 事件清空缓存。
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

// 数据到达时调度一次 RAF，避免空转
if (frameIdRef.current === 0) {
frameIdRef.current = requestAnimationFrame(flushLoop.current);
}
};

listeners.add(handleData);
return () => {
listeners.delete(handleData);
if (frameIdRef.current !== 0) {
cancelAnimationFrame(frameIdRef.current);
frameIdRef.current = 0;
}
};
}, [nodeIndex, activeExecutionId]);

const consumeBuffer = useCallback(() => {
const chunk = [...dataBufferRef.current];
dataBufferRef.current = [];
return chunk;
}, []);

// 🔥 4. 新增：提供获取完整历史数据的方法（支持迭代）
// 组件挂载时调用它，瞬间恢复之前的图像
const getFullHistory = useCallback(() => {
// 返回该节点所有迭代的数据（向后兼容：如果没有迭代，返回迭代0的数据）
const cacheKey = getCacheKey(nodeIndex, '0');
return GlobalMeasurementCache.get(cacheKey) || [];
}, [nodeIndex]);

// 🔥 5. 新增：获取节点的所有迭代数据
const getIterationsForNode = useCallback((): Map<string, RawStreamData[]> => {
const result = new Map<string, RawStreamData[]>();
// 遍历所有缓存，找出属于该节点的迭代
for (const [key, data] of GlobalMeasurementCache.entries()) {
const [indexStr, iterKey] = key.split(':');
if (parseInt(indexStr) === nodeIndex) {
result.set(iterKey, data);
}
}
return result;
}, [nodeIndex]);

return {
consumeBuffer,
getFullHistory, // 导出这个方法（向后兼容）
getIterationsForNode, // 🔥 导出新方法：获取所有迭代
isReceiving: isReceiving.current
};
};
