import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
GridComponent,
MarkLineComponent,
TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useMeasurementStream } from '../../hooks/useMeasurementStream';
import { useEisData } from '../../hooks/useEisData';
import type { ExecutionSnapshot } from '@zahnerflow/types';
import { EisLegendScheme, getEisLegendVisual, getIterationColor } from '../../utils/colorUtils';
import { useAppStore } from '../../state/appStore';
import { UiIconSvg } from '../shared/UiIconSvg';

echarts.use([
LineChart,
ScatterChart,
GridComponent,
MarkLineComponent,
TooltipComponent,
CanvasRenderer
]);

interface MeasurementChartProps {
nodeIndex: number;
nodeConfig: any;
systemState: ExecutionSnapshot | null;
nodeType?: string;  // 新增：节点类型
height?: string | number; // 新增：容器高度
overlayNodes?: Array<{ nodeIndex: number; label: string }>;
eisLegendScheme?: EisLegendScheme;
}

// EIS 节点类型
const EIS_NODE_TYPES = ['eis_potentiostatic', 'eis_galvanostatic'];

// DOM Token 读取 CSS 变量辅助函数
const getCssVariable = (varName: string, defaultValue: string = '') => {
if (typeof window === 'undefined') return defaultValue;
return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || defaultValue;
};

const formatPrecision = (value: number) => {
if (value === 0) return '0';
if (Math.abs(value) < 0.001 || Math.abs(value) > 1000) {
return value.toExponential(1);
}
return value.toFixed(2);
};

const calcEisAxisRange = (dataMin: number, dataMax: number, clampMinToZero = false) => {
if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
return clampMinToZero ? { min: 0, max: 1 } : {};
}
const dataRange = dataMax - dataMin;
const reference = Math.max(Math.abs(dataMin), Math.abs(dataMax), 1);
const padding = Math.max(dataRange * 0.08, reference * 0.01);

return {
min: clampMinToZero ? 0 : dataMin - padding,
max: dataMax + padding
};
};

const calcAxisRange = (dataMin: number, dataMax: number) => {
if (dataMin === Infinity) return { min: 0, max: 1 };

let dataRange = dataMax - dataMin;
const midPoint = (dataMax + dataMin) / 2;

// 1. 噪声保护：如果波动极小（小于均值的 0.1%），强制设定一个最小观测范围
const minDataRange = Math.abs(midPoint) * 0.001 || 0.01;
if (dataRange < minDataRange) {
dataRange = minDataRange;
}

// 2. 初步计算总坐标轴量程：默认让数据波动仅占据 10%
let totalAxisRange = dataRange / 0.1;
let axisMax = midPoint + totalAxisRange * 0.35;
let axisMin = midPoint - totalAxisRange * 0.65;

// 3. 零点锚定逻辑：如果数据是单向的，且 10% 缩放会导致越过 0，则吸附到 0
if (dataMin >= 0 && axisMin < 0) {
axisMin = 0;
axisMax = midPoint / 0.65;
} else if (dataMax <= 0 && axisMax > 0) {
axisMax = 0;
axisMin = midPoint / 0.35;
}

return { min: axisMin, max: axisMax };
};

const MeasurementChartComponent: React.FC<MeasurementChartProps> = ({
nodeIndex,
nodeConfig,
systemState,
nodeType,
height,
overlayNodes,
eisLegendScheme = 'palette'
}) => {
const chartRef = useRef<HTMLDivElement>(null);
const chartInstance = useRef<echarts.ECharts | null>(null);
const theme = useAppStore(state => state.theme);

// 判断是否为 EIS 节点
const isEisNode = nodeType ? EIS_NODE_TYPES.includes(nodeType) : false;

// 🔥 修改：historyRef 现在存储的是按迭代分组的数据
// Key: iterationKey (e.g., "0", "0,1"), Value: { voltage, current }
const historyRef = useRef<Map<string, {
voltage: [number, number][];
current: [number, number][];
}>>(new Map());

// 🔥 新增：跟踪上一次的迭代数量，用于判断是否需要强制更新颜色
const lastIterationCountRef = useRef<number>(0);

// 🔥 新增：增量坐标轴范围计算 (O(M) 复杂度优化)
const rangeRef = useRef({
vMin: 0, vMax: 0,
iMin: 0, iMax: 0,
initialized: false
});

const [hasData, setHasData] = useState(false);
const activeExecutionId = systemState?.executionId || null;

const currentStepIndex = systemState?.currentStep?.index ?? -1;
const isPending = currentStepIndex < nodeIndex;
const isRunning = currentStepIndex === nodeIndex && systemState?.status === 'running';

// IVT 流式数据 Hook
const { consumeBuffer, getIterationsForNode } = useMeasurementStream({
nodeIndex,
activeExecutionId
});

// EIS 数据 Hook
const eisNodeIndices = overlayNodes && overlayNodes.length > 0
? overlayNodes.map(node => node.nodeIndex)
: [nodeIndex];
const overlayKey = `${overlayNodes?.map(node => `${node.nodeIndex}:${node.label}`).join('|') || `${nodeIndex}`}:${eisLegendScheme}`;
const { getEisIterationsForNodes } = useEisData({ nodeIndex, nodeIndices: eisNodeIndices });

// 初始化图表
useEffect(() => {
if (!chartRef.current) return;

if (!chartInstance.current) {
chartInstance.current = echarts.init(chartRef.current);
}

// 根据节点类型选择图表配置
const option = isEisNode ? getEisChartOption() : getIvtChartOption();
chartInstance.current.setOption(option, true);

// ✅ 使用 ResizeObserver 监听容器尺寸变化
const resizeObserver = new ResizeObserver(() => {
chartInstance.current?.resize();
});
resizeObserver.observe(chartRef.current);

// 延迟 resize 确保尺寸正确
const timer = setTimeout(() => chartInstance.current?.resize(), 100);

return () => {
resizeObserver.disconnect();
clearTimeout(timer);
chartInstance.current?.dispose();
chartInstance.current = null;
};
}, [isEisNode, nodeType]);

// 监听主题变化，刷新图表样式
useEffect(() => {
if (!chartInstance.current) return;
const frameId = requestAnimationFrame(() => {
const option = isEisNode ? getEisChartOption() : getIvtChartOption();
chartInstance.current?.setOption(option, true);
if (!isEisNode) {
updateChartWithIterations();
}
});
return () => cancelAnimationFrame(frameId);
}, [theme, isEisNode]);

// 🔥 修复：IVT 历史数据恢复（支持迭代）
useEffect(() => {
if (isEisNode) return;  // EIS 使用单独的恢复逻辑

// 延迟执行，确保图表已初始化
const timer = setTimeout(() => {
const iterations = getIterationsForNode();

if (iterations.size > 0 && chartInstance.current) {
setHasData(true);

// 清空旧数据
historyRef.current.clear();
rangeRef.current = { vMin: Infinity, vMax: -Infinity, iMin: Infinity, iMax: -Infinity, initialized: false };

// 为每个迭代准备数据并增量更新 range
for (const [iterKey, data] of iterations.entries()) {
const vData = data.map(p => [p.t, p.v] as [number, number]);
const iData = data.map(p => [p.t, p.i] as [number, number]);
historyRef.current.set(iterKey, { voltage: vData, current: iData });

for (const p of data) {
if (!rangeRef.current.initialized) {
rangeRef.current = { vMin: p.v, vMax: p.v, iMin: p.i, iMax: p.i, initialized: true };
} else {
if (p.v < rangeRef.current.vMin) rangeRef.current.vMin = p.v;
if (p.v > rangeRef.current.vMax) rangeRef.current.vMax = p.v;
if (p.i < rangeRef.current.iMin) rangeRef.current.iMin = p.i;
if (p.i > rangeRef.current.iMax) rangeRef.current.iMax = p.i;
}
}
}

updateChartWithIterations();
}
}, 50);

return () => clearTimeout(timer);
}, [nodeIndex, isEisNode]);

// 🔥 新增：更新图表以支持多个迭代系列
const updateChartWithIterations = () => {
if (!chartInstance.current) return;

const isCA = nodeType === 'chronoamperometry' || nodeType?.includes('potentiostatic');
const isCP = nodeType === 'chronopotentiometry' || nodeType?.includes('galvanostatic');

// 基础色相：蓝色约 210°，橙色约 30°
const VOLTAGE_HUE = 210;
const CURRENT_HUE = 30;

const r = rangeRef.current;
const vRange = calcAxisRange(r.vMin, r.vMax);
const iRange = calcAxisRange(r.iMin, r.iMax);

const iterations = Array.from(historyRef.current.keys()).sort((a, b) => {
// 单层迭代：直接比较数字
const aNum = parseInt(a.split(',')[0]);
const bNum = parseInt(b.split(',')[0]);
return aNum - bNum;
});
const totalIterations = iterations.length;

// 🔥 关键：检测迭代数量是否变化，决定是否需要强制更新颜色
const needForceUpdate = totalIterations !== lastIterationCountRef.current;
lastIterationCountRef.current = totalIterations;

const voltageSeries: any[] = [];
const currentSeries: any[] = [];

// 获取设定值用于 markLine
const vSetpoint = nodeConfig.parameters?.polarizationVoltage ?? nodeConfig.parameters?.potential;
const iSetpoint = nodeConfig.parameters?.polarizationCurrent ?? nodeConfig.parameters?.current;

// --- 逻辑：区分处理不变量和变量 ---

// 1. 处理电压 (V)
if (isCA) {
// 如果是 CA，电压是不变量：只选最新的一个系列作为代表，固定颜色虚线
const latestIterKey = iterations[iterations.length - 1];
const data = historyRef.current.get(latestIterKey);
if (data) {
voltageSeries.push({
name: 'Voltage (Target)',
type: 'line',
yAxisIndex: 0,
showSymbol: false,
itemStyle: { color: '#40a9ff' },
lineStyle: { type: 'dashed', width: 1 },
step: 'end',
data: data.voltage,
markLine: vSetpoint !== undefined ? {
symbol: 'none',
label: { position: 'start', formatter: `${vSetpoint}V`, color: '#40a9ff', fontSize: 10 },
lineStyle: { type: 'dotted', color: 'rgba(64, 169, 255, 0.4)', width: 1 },
data: [{ yAxis: vSetpoint }]
} : undefined,
});
}
} else {
// 否则，电压是变量：按迭代着色
iterations.forEach((iterKey, index) => {
const data = historyRef.current.get(iterKey)!;
voltageSeries.push({
name: totalIterations > 1 ? `V-Iter${index + 1}` : 'Voltage',
type: 'line', yAxisIndex: 0, showSymbol: false,
itemStyle: { color: getIterationColor(VOLTAGE_HUE, index, totalIterations) },
data: data.voltage
});
});
}

// 2. 处理电流 (I)
if (isCP) {
// 如果是 CP，电流是不变量：只选最新的一个系列作为代表，固定颜色虚线
const latestIterKey = iterations[iterations.length - 1];
const data = historyRef.current.get(latestIterKey);
if (data) {
currentSeries.push({
name: 'Current (Target)',
type: 'line',
yAxisIndex: 1,
showSymbol: false,
itemStyle: { color: '#fa8c16' },
lineStyle: { type: 'dashed', width: 1 },
step: 'end',
data: data.current,
markLine: iSetpoint !== undefined ? {
symbol: 'none',
label: { position: 'end', formatter: `${iSetpoint}A`, color: '#fa8c16', fontSize: 10 },
lineStyle: { type: 'dotted', color: 'rgba(250, 140, 22, 0.4)', width: 1 },
data: [{ yAxis: iSetpoint }]
} : undefined,
});
}
} else {
// 否则，电流是变量：按迭代着色
iterations.forEach((iterKey, index) => {
const data = historyRef.current.get(iterKey)!;
currentSeries.push({
name: totalIterations > 1 ? `I-Iter${index + 1}` : 'Current',
type: 'line', yAxisIndex: 1, showSymbol: false,
itemStyle: { color: getIterationColor(CURRENT_HUE, index, totalIterations) },
data: data.current
});
});
}

// --- 执行更新 ---
// 🔥 关键：当迭代数量变化时，使用 replaceMerge 强制更新所有 series 的颜色
if (needForceUpdate) {
chartInstance.current.setOption(
{
yAxis: [
{ min: vRange.min, max: vRange.max },
{ min: iRange.min, max: iRange.max }
],
series: [...voltageSeries, ...currentSeries]
},
{ replaceMerge: ['series'] }
);
} else {
// 迭代数量未变，只更新数据
chartInstance.current.setOption({
yAxis: [
{ min: vRange.min, max: vRange.max },
{ min: iRange.min, max: iRange.max }
],
series: [...voltageSeries, ...currentSeries]
});
}
};

// IVT 图表配置
const getIvtChartOption = () => {
return {
tooltip: {
trigger: 'axis',
backgroundColor: getCssVariable('--glass-bg-active', 'rgba(20, 20, 26, 0.9)'),
borderColor: getCssVariable('--glass-border-hover', 'rgba(255, 255, 255, 0.15)'),
textStyle: { color: getCssVariable('--text-primary', '#fff'), fontSize: 12 },
formatter: (params: any[]) => {
if (!params.length) return '';
const t = params[0].value[0];
let html = `T: ${parseFloat(t).toFixed(2)}s<br/>`;
params.forEach(p => {
const unit = p.seriesName === 'Voltage' ? 'V' : 'A';
html += `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:8px;height:8px;background-color:${p.color};"></span>`;
html += `${p.seriesName}: ${formatPrecision(p.value[1])}${unit}<br/>`;
});
return html;
}
},
animation: false,
grid: { top: 45, bottom: 5, left: 45, right: 55, containLabel: true },
xAxis: {
type: 'value',
splitLine: { show: false },
axisLabel: { color: getCssVariable('--text-secondary', 'rgba(255, 255, 255, 0.5)'), fontSize: 14 },
axisLine: { lineStyle: { color: getCssVariable('--glass-border-hover', 'rgba(255, 255, 255, 0.25)'), width: 3 } }
},
yAxis: [
{
type: 'value',
name: 'V',
position: 'left',
scale: true,
axisLine: { show: true, lineStyle: { color: '#40a9ff', width: 3 } },
axisLabel: { color: '#40a9ff', fontSize: 14, formatter: formatPrecision, margin: 4 },
nameTextStyle: { color: '#40a9ff', fontWeight: 'bold', fontSize: 16 },
splitLine: { show: true, lineStyle: { type: 'dashed', color: getCssVariable('--glass-border-muted', 'rgba(255, 255, 255, 0.04)') } }
},
{
type: 'value',
name: 'A',
position: 'right',
scale: true,
axisLine: { show: true, lineStyle: { color: '#fa8c16', width: 3 } },
axisLabel: { color: '#fa8c16', fontSize: 14, formatter: formatPrecision, margin: 4 },
nameTextStyle: { color: '#fa8c16', fontWeight: 'bold', fontSize: 16 },
splitLine: { show: false }
}
],
series: []  // 🔥 初始化为空，由 updateChartWithIterations 完全控制
};
};

// EIS Nyquist 图表配置
const getEisChartOption = () => ({
tooltip: {
trigger: 'item',
backgroundColor: getCssVariable('--glass-bg-active', 'rgba(20, 20, 26, 0.9)'),
borderColor: getCssVariable('--glass-border-hover', 'rgba(255, 255, 255, 0.15)'),
textStyle: { color: getCssVariable('--text-primary', '#fff'), fontSize: 12 },
formatter: (params: any) => {
if (!params.data) return '';
const [zReal, zImag, freq] = params.data;
return `f: ${freq.toExponential(2)} Hz<br/>Re: ${zReal.toExponential(3)} Ω<br/>-Im: ${(-zImag).toExponential(3)} Ω`;
}
},
animation: false,
grid: { top: 45, bottom: 5, left: 45, right: 55, containLabel: true },
xAxis: {
type: 'value',
name: "Re (Ω)",
nameLocation: 'end',
nameGap: 10,
nameTextStyle: {
color: getCssVariable('--text-primary', 'rgba(255, 255, 255, 0.9)'),
fontWeight: 'bold',
fontSize: 16,
verticalAlign: 'bottom',
padding: [0, 0, 12, -36]
},
splitLine: { show: true, lineStyle: { type: 'dashed', color: getCssVariable('--glass-border-muted', 'rgba(255, 255, 255, 0.04)') } },
axisLabel: { color: getCssVariable('--text-primary', 'rgba(255, 255, 255, 0.9)'), fontSize: 14, formatter: formatPrecision },
axisLine: { lineStyle: { color: getCssVariable('--glass-border-hover', 'rgba(255, 255, 255, 0.7)'), width: 3 } }
},
yAxis: {
type: 'value',
name: "-Im (Ω)",
min: 0,
nameLocation: 'end',
nameGap: 15,
nameTextStyle: { color: getCssVariable('--text-primary', 'rgba(255, 255, 255, 0.9)'), fontWeight: 'bold', fontSize: 16 },
splitLine: { show: true, lineStyle: { type: 'dashed', color: getCssVariable('--glass-border-muted', 'rgba(255, 255, 255, 0.04)') } },
axisLabel: { color: getCssVariable('--text-primary', 'rgba(255, 255, 255, 0.9)'), fontSize: 14, formatter: formatPrecision },
axisLine: { show: true, lineStyle: { color: getCssVariable('--glass-border-hover', 'rgba(255, 255, 255, 0.7)'), width: 3 } }
},
series: [{
name: 'Nyquist',
type: 'scatter',
symbolSize: 6,
itemStyle: { color: '#52c41a' },
data: []
}]
});

// 🔥 修改：IVT 数据流式更新（支持迭代）
useEffect(() => {
if (isEisNode) return;  // EIS 节点不使用流式更新

const chunk = consumeBuffer();
if (chunk.length === 0) return;
if (!hasData) setHasData(true);

// 🔥 关键：从 systemState 获取当前迭代路径
const currentIterPath = systemState?.currentStep?.iterationPath || [];
const iterKey = currentIterPath.length > 0
? currentIterPath.map(item => typeof item === 'number' ? item : `${item.loopStartIndex ?? item.loopNodeId}:${item.iteration}`).join(',')
: '0';

const newV = chunk.map(p => [p.t, p.v] as [number, number]);
const newI = chunk.map(p => [p.t, p.i] as [number, number]);

// 获取或创建该迭代的数据
if (!historyRef.current.has(iterKey)) {
historyRef.current.set(iterKey, { voltage: [], current: [] });
}
const iterData = historyRef.current.get(iterKey)!;
iterData.voltage.push(...newV);
iterData.current.push(...newI);

// 增量更新 range（避免每次扫描全部历史）
for (const p of chunk) {
if (!rangeRef.current.initialized) {
rangeRef.current = { vMin: p.v, vMax: p.v, iMin: p.i, iMax: p.i, initialized: true };
} else {
if (p.v < rangeRef.current.vMin) rangeRef.current.vMin = p.v;
if (p.v > rangeRef.current.vMax) rangeRef.current.vMax = p.v;
if (p.i < rangeRef.current.iMin) rangeRef.current.iMin = p.i;
if (p.i > rangeRef.current.iMax) rangeRef.current.iMax = p.i;
}
}

// 更新图表
updateChartWithIterations();
}, [consumeBuffer, hasData, isEisNode, systemState]);

// EIS 数据渲染
useEffect(() => {
if (!isEisNode || !chartInstance.current) return;

const iterationsByNode = getEisIterationsForNodes();
const hasIterations = Array.from(iterationsByNode.values()).some(iterations => iterations.size > 0);
if (!hasIterations) return;

setHasData(true);

const activeOverlayNodes = overlayNodes && overlayNodes.length > 0
? overlayNodes
: [{ nodeIndex, label: nodeConfig.name || 'Nyquist' }];
const totalSeries = activeOverlayNodes.reduce((count, node) => {
return count + (iterationsByNode.get(node.nodeIndex)?.size || 0);
}, 0);
let seriesIndex = 0;

let xMin = Infinity;
let xMax = -Infinity;
let yMin = Infinity;
let yMax = -Infinity;

const series = activeOverlayNodes.flatMap(node => {
const iterations = iterationsByNode.get(node.nodeIndex) || new Map();
const sortedIterKeys = Array.from(iterations.keys()).sort((a, b) => {
const aNum = parseInt(a.split(',')[0]);
const bNum = parseInt(b.split(',')[0]);
return aNum - bNum;
});

return sortedIterKeys.map((iterKey) => {
const data = iterations.get(iterKey)!;
if (data.xMin < xMin) xMin = data.xMin;
if (data.xMax > xMax) xMax = data.xMax;
if (data.yMin < yMin) yMin = data.yMin;
if (data.yMax > yMax) yMax = data.yMax;
const iterationSuffix = sortedIterKeys.length > 1 ? `-${iterKey}` : '';
const visual = getEisLegendVisual(seriesIndex, totalSeries || activeOverlayNodes.length || 1, eisLegendScheme);
seriesIndex += 1;

return {
name: `${node.label}${iterationSuffix}`,
type: 'scatter',
symbol: visual.symbol,
symbolSize: visual.symbol === 'roundRect' ? 8 : 7,
itemStyle: { color: visual.color },
data: data.chartPoints
};
});
});

chartInstance.current.setOption({
xAxis: calcEisAxisRange(xMin, xMax),
yAxis: calcEisAxisRange(yMin, yMax, true),
series
}, { replaceMerge: ['series'] });
}, [getEisIterationsForNodes, isEisNode, overlayKey, nodeConfig.name, nodeIndex, eisLegendScheme]);

// 🔥 修改：IVT 清理逻辑（新运行时重置）
useEffect(() => {
if (isEisNode) return;  // EIS 不需要此逻辑
if (!activeExecutionId) return;  // 运行结束时保留图表

historyRef.current.clear();
rangeRef.current = { vMin: Infinity, vMax: -Infinity, iMin: Infinity, iMax: -Infinity, initialized: false };
setHasData(false);
chartInstance.current?.setOption({ series: [] });
}, [activeExecutionId, isEisNode]);

const getStatusTag = () => {
if (isPending) return <span style={{ color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><UiIconSvg name="timer" />等待</span>;
if (isRunning) return <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>▶ 测量中</span>;
if (currentStepIndex > nodeIndex) return <span style={{ color: 'var(--color-indigo-light)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><UiIconSvg name="check" />完成</span>;
return null;
};

const getChartTypeLabel = () => {
if (isEisNode) return 'Nyquist';
// 高级节点显示特定标签
if (nodeType === 'galvanostatic_step_ramp' || nodeType === 'galvanostatic_switching') {
return 'Chrono I-V-T';
}
if (nodeType === 'potentiostatic_step_ramp' || nodeType === 'potentiostatic_switching') {
return 'Chrono I-V-T';
}
return 'I-V-T';
};

// 判断是否为高级节点
const isAdvancedNode = [
'galvanostatic_switching',
'potentiostatic_switching',
'galvanostatic_step_ramp',
'potentiostatic_step_ramp'
].includes(nodeType || '');

return (
<div
className={height ? "" : "glass"}
style={{
border: height ? 'none' : '1px solid var(--glass-border)',
borderRadius: height ? 0 : 8,
padding: height ? '4px 0' : '10px 8px',
marginBottom: height ? 0 : (isAdvancedNode ? 0 : 12),
background: height ? 'transparent' : 'var(--glass-bg)',
color: 'var(--text-primary)',
position: 'relative',
height: height || (isAdvancedNode ? '100%' : 'auto'),
display: 'flex',
flexDirection: 'column',
overflow: 'hidden'
}}
>
{!height && (
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px', flexShrink: 0 }}>
<strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
步骤{nodeIndex + 1}: {nodeConfig.name}
<span style={{ marginLeft: 8, fontSize: '11px', color: isEisNode ? 'var(--color-success)' : 'var(--color-indigo-light)', fontWeight: 'normal' }}>
[{getChartTypeLabel()}]
</span>
</strong>
<div style={{ fontSize: 12 }}>{getStatusTag()}</div>
</div>
)}

<div
ref={chartRef}
style={{
// ✅ 简化：使用 flex: 1 自动填充剩余空间
flex: 1,
width: '100%',
minHeight: height ? 0 : (isAdvancedNode ? 0 : 220),
opacity: (isPending && !hasData) ? 0.5 : 1
}}
/>

{!hasData && isPending && (
<div style={{
textAlign: 'center',
color: 'var(--text-muted)',
position: 'absolute',
top: '55%',
left: '50%',
transform: 'translate(-50%, -50%)',
pointerEvents: 'none',
fontSize: '12px'
}}>
{isEisNode ? '等待 EIS 数据...' : '等待数据...'}
</div>
)}
</div>
);
};

export const MeasurementChart = React.memo(MeasurementChartComponent);
