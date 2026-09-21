import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { ReportMeasurementCurve } from '@zahnerflow/types';
import { getNodeDisplayName } from '../../types/NodeConfiguration';
import { formatIterationPath, toIterationPath } from '../../utils/iterationPath';

echarts.use([LineChart, ScatterChart, GridComponent, SVGRenderer]);

export interface ReportChartImage {
  key: string;
  title: string;
  group: string;
  pointCount: number;
  image?: string;
  error?: string;
}

export function buildReportCharts(curves: ReportMeasurementCurve[], nodes: Array<Record<string, unknown>>): ReportChartImage[] {
  return curves.flatMap<ReportChartImage>((curve) => {
    const sourceNode = nodes.find((node) => node.id === curve.nodeId);
    const sourceGroup = sourceNode?.group as { label?: string } | undefined;
    const group = sourceGroup?.label || '测量结果';
    const iteration = formatIterationPath(toIterationPath(curve.iterationPath), '');
    const title = `${sourceGroup?.label ? `${group} · ` : ''}#${curve.unrolledIndex + 1} ${getNodeDisplayName(curve.nodeType)}${iteration ? ` · ${iteration}` : ''}`;
    if (curve.error) return [{ key: String(curve.unrolledIndex), title, group, pointCount: 0, error: curve.error }];
    return curve.series.map((series, index) => {
      const width = 720, height = 420;
      const grid = series.equalScale
        ? { left: 200, right: 200, top: 36, bottom: 64 }
        : { left: 88, right: 32, top: 36, bottom: 64 };
      const axisBounds: { min?: number; max?: number }[] = [{}, {}];
      if (series.equalScale && series.points.length) {
        const mins = [Infinity, Infinity], maxs = [-Infinity, -Infinity];
        for (const point of series.points) for (let axis = 0; axis < 2; axis++) {
          mins[axis] = Math.min(mins[axis], point[axis]);
          maxs[axis] = Math.max(maxs[axis], point[axis]);
        }
        const span = Math.max(maxs[0] - mins[0], maxs[1] - mins[1], 1e-9) * 1.12;
        for (let axis = 0; axis < 2; axis++) {
          const middle = (mins[axis] + maxs[axis]) / 2;
          axisBounds[axis] = { min: middle - span / 2, max: middle + span / 2 };
        }
      }
      const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width, height });
      try {
        chart.setOption({
          animation: false,
          backgroundColor: '#ffffff',
          grid,
          textStyle: { fontFamily: 'sans-serif' },
          xAxis: { type: 'value', name: series.xLabel, nameLocation: 'middle', nameGap: 36, scale: true,
            ...axisBounds[0], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
          yAxis: { type: 'value', name: series.yLabel, nameLocation: 'middle', nameGap: 60, scale: true,
            ...axisBounds[1], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
          series: [{ type: series.equalScale ? 'scatter' : 'line', data: series.points,
            smooth: false, showSymbol: series.points.length < 500, symbolSize: 3,
            lineStyle: { width: 1.5 }, itemStyle: { color: '#2563eb' } }],
        });
        return { key: `${curve.unrolledIndex}-${index}`, title: `${title} · ${series.name}`,
          group, pointCount: series.points.length,
          image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.renderToSVGString())}` };
      } finally { chart.dispose(); }
    });
  });
}

export function groupReportCharts(charts: ReportChartImage[]): Array<{ title: string; charts: ReportChartImage[] }> {
  const groups = new Map<string, ReportChartImage[]>();
  for (const chart of charts) {
    const items = groups.get(chart.group) || [];
    items.push(chart);
    groups.set(chart.group, items);
  }
  return Array.from(groups, ([title, items]) => ({ title, charts: items }));
}
