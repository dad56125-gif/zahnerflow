/**
 * EIS Nyquist 图表 echarts option 构建
 * 提取自 NodeChart.tsx 中的 getEisChartOption 函数
 */

import { CHART_TOOLTIP_STYLE, CHART_GRID, CHART_COLORS, formatPrecision } from './styleTokens';

/**
 * 构建 EIS Nyquist 图表的 echarts option
 */
export function buildEisOption() {
  return {
    tooltip: {
      trigger: 'item',
      ...CHART_TOOLTIP_STYLE,
      formatter: (params: any) => {
        if (!params.data) return '';
        const [zReal, zImag, freq] = params.data;
        return `f: ${freq.toExponential(2)} Hz<br/>Re: ${zReal.toExponential(3)} Ω<br/>-Im: ${(-zImag).toExponential(3)} Ω`;
      }
    },
    animation: false,
    grid: CHART_GRID,
    xAxis: {
      type: 'value',
      name: "Re (Ω)",
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontWeight: 'bold',
        fontSize: 16,
        verticalAlign: 'bottom',
        padding: [0, 0, 12, -36]
      },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(255, 255, 255, 0.04)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 14, formatter: formatPrecision },
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.7)', width: 3 } }
    },
    yAxis: {
      type: 'value',
      name: "-Im (Ω)",
      min: 0,
      nameLocation: 'end',
      nameGap: 15,
      nameTextStyle: { color: 'rgba(255, 255, 255, 0.9)', fontWeight: 'bold', fontSize: 16 },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(255, 255, 255, 0.04)' } },
      axisLabel: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 14, formatter: formatPrecision },
      axisLine: { show: true, lineStyle: { color: 'rgba(255, 255, 255, 0.7)', width: 3 } }
    },
    series: [{
      name: 'Nyquist',
      type: 'scatter',
      symbolSize: 6,
      itemStyle: { color: CHART_COLORS.eis },
      data: []
    }]
  };
}
