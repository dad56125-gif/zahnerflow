/**
 * echarts 共享样式常量
 * 提取自 NodeChart.tsx 和 ChartModal.tsx 中的重复样式
 */

// Tooltip 样式
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(20, 20, 26, 0.9)',
  borderColor: 'rgba(255, 255, 255, 0.15)',
  textStyle: { color: '#fff', fontSize: 12 },
};

// 网格布局
export const CHART_GRID = {
  top: 45,
  bottom: 5,
  left: 45,
  right: 55,
  containLabel: true,
};

// 坐标轴样式
export const CHART_AXIS_STYLE = {
  splitLine: { show: true, lineStyle: { type: 'dashed' as const, color: 'rgba(255, 255, 255, 0.04)' } },
  axisLabel: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 14 },
  axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.25)', width: 3 } },
};

// 颜色常量
export const CHART_COLORS = {
  voltage: '#40a9ff',
  current: '#fa8c16',
  eis: '#52c41a',
};

// 精度格式化
export const formatPrecision = (value: number) => {
  if (value === 0) return '0';
  if (Math.abs(value) < 0.001 || Math.abs(value) > 1000) {
    return value.toExponential(1);
  }
  return value.toFixed(2);
};
