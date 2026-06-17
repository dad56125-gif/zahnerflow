/**
 * IVT 图表 echarts option 构建
 * 提取自 NodeChart.tsx 中的 getIvtChartOption 函数
 */

import { CHART_TOOLTIP_STYLE, CHART_GRID, CHART_COLORS, formatPrecision } from './styleTokens';

interface IvtChartOptionParams {
  nodeType?: string;
  nodeConfig: any;
}

/**
 * 构建 IVT 图表的 echarts option
 */
export function buildIvtOption({ nodeType, nodeConfig }: IvtChartOptionParams) {
  // 逻辑：判断哪些变量是控制量，需要使用 step 连线和 markLine
  const isCA = nodeType === 'chronoamperometry' || nodeType?.includes('potentiostatic');
  const isCP = nodeType === 'chronopotentiometry' || nodeType?.includes('galvanostatic');

  // 获取设定值用于 markLine
  const vSetpoint = nodeConfig.parameters?.polarization_voltage ?? nodeConfig.parameters?.potential;
  const iSetpoint = nodeConfig.parameters?.polarization_current ?? nodeConfig.parameters?.current;

  return {
    tooltip: {
      trigger: 'axis',
      ...CHART_TOOLTIP_STYLE,
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
    grid: CHART_GRID,
    xAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 14 },
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.25)', width: 3 } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'V',
        position: 'left',
        scale: true,
        axisLine: { show: true, lineStyle: { color: CHART_COLORS.voltage, width: 3 } },
        axisLabel: { color: CHART_COLORS.voltage, fontSize: 14, formatter: formatPrecision, margin: 4 },
        nameTextStyle: { color: CHART_COLORS.voltage, fontWeight: 'bold', fontSize: 16 },
        splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(255, 255, 255, 0.04)' } }
      },
      {
        type: 'value',
        name: 'A',
        position: 'right',
        scale: true,
        axisLine: { show: true, lineStyle: { color: CHART_COLORS.current, width: 3 } },
        axisLabel: { color: CHART_COLORS.current, fontSize: 14, formatter: formatPrecision, margin: 4 },
        nameTextStyle: { color: CHART_COLORS.current, fontWeight: 'bold', fontSize: 16 },
        splitLine: { show: false }
      }
    ],
    series: []  // 初始化为空，由 updateChartWithIterations 完全控制
  };
}
