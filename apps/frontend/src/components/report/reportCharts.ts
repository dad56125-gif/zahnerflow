import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { ReportCurveSeries, ReportMeasurementCurve } from '@zahnerflow/types';
import { getNodeDisplayName } from '../../types/NodeConfiguration';
import { formatIterationPath, toIterationPath } from '../../utils/iterationPath';

echarts.use([LineChart, ScatterChart, GridComponent, LegendComponent, SVGRenderer]);

export interface ReportChartImage {
  key: string;
  title: string;
  group: string;
  pointCount: number;
  image?: string;
  error?: string;
}

interface CurveEntry {
  series: ReportCurveSeries;
  label: string;
  temperature: number | null;
  repeat: number;
}
interface Comparison {
  title: string;
  group: string;
  entries: CurveEntry[];
}

// These are explicit labels saved with the workflow, not temperatures inferred from the data.
function temperatureGroup(label: string) {
  const match = /^(发电|电解)\s+(-?\d+(?:\.\d+)?)\s*°C(（模拟条件）)?$/.exec(label);
  return match ? { mode: match[1], temperature: Number(match[2]), simulation: Boolean(match[3]) } : null;
}

export function buildReportCharts(curves: ReportMeasurementCurve[], nodes: Array<Record<string, unknown>>): ReportChartImage[] {
  const comparisons = new Map<string, Comparison>();
  const errors: ReportChartImage[] = [];
  for (const curve of curves) {
    const node = nodes.find((item) => item.id === curve.nodeId);
    const source = node?.group as { label?: string } | undefined;
    const condition = temperatureGroup(source?.label || '');
    const group = condition ? `${condition.mode}模式${condition.simulation ? '（模拟条件）' : ''}` : source?.label || '测量结果';
    const iterations = toIterationPath(curve.iterationPath);
    const iteration = formatIterationPath(iterations, '');
    const repeat = Math.max(0, (iterations.at(-1)?.iteration || 1) - 1);
    const step = `#${curve.unrolledIndex + 1} ${getNodeDisplayName(curve.nodeType)}`;
    if (curve.error) {
      errors.push({ key: `error-${curve.unrolledIndex}`, title: `${source?.label || group} · ${step}`, group,
        pointCount: 0, error: curve.error });
      continue;
    }
    for (const series of curve.series) {
      const kind = curve.nodeType === 'ocp_measurement' ? 'OCV' : series.name;
      const key = JSON.stringify([group, condition ? curve.nodeType : curve.nodeId, series.name, series.xLabel, series.yLabel]);
      const comparison = comparisons.get(key) || { group, title: `${group} · ${kind}`, entries: [] };
      comparison.entries.push({ series, temperature: condition?.temperature ?? null, repeat,
        label: `${condition ? `${condition.temperature}°C` : step}${iteration ? ` · ${iteration}` : ''} · #${curve.unrolledIndex + 1}` });
      comparisons.set(key, comparison);
    }
  }
  const temperatures = [...new Set([...comparisons.values()].flatMap((c) => c.entries.flatMap((e) => e.temperature == null ? [] : [e.temperature])))].sort((a, b) => b - a);
  // Plot colors are distinct from UI status colors and stay stable across both modes.
  const colors = ['#2563eb', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2'];
  const images = Array.from(comparisons, ([key, comparison]): ReportChartImage => {
    const first = comparison.entries[0].series;
    const width = 720, height = 480;
    const grid = first.equalScale
      ? { left: 200, right: 200, top: 100, bottom: 60 }
      : { left: 88, right: 32, top: 100, bottom: 60 };
    const axisBounds: { min?: number; max?: number }[] = [{}, {}];
    if (first.equalScale) {
      const mins = [Infinity, Infinity], maxs = [-Infinity, -Infinity];
      for (const entry of comparison.entries) for (const point of entry.series.points) for (let axis = 0; axis < 2; axis++) {
        mins[axis] = Math.min(mins[axis], point[axis]);
        maxs[axis] = Math.max(maxs[axis], point[axis]);
      }
      if (Number.isFinite(mins[0])) {
        const span = Math.max(maxs[0] - mins[0], maxs[1] - mins[1], 1e-9) * 1.12;
        for (let axis = 0; axis < 2; axis++) {
          const middle = (mins[axis] + maxs[axis]) / 2;
          axisBounds[axis] = { min: middle - span / 2, max: middle + span / 2 };
        }
      }
    }
    const chart = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width, height });
    try {
      chart.setOption({
        animation: false, backgroundColor: '#ffffff', grid,
        textStyle: { fontFamily: 'sans-serif' },
        legend: { top: 12, left: 24, right: 24, selectedMode: false, textStyle: { fontSize: 11 } },
        xAxis: { type: 'value', name: first.xLabel, nameLocation: 'middle', nameGap: 36, scale: true,
          ...axisBounds[0], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
        yAxis: { type: 'value', name: first.yLabel, nameLocation: 'middle', nameGap: 60, scale: true,
          ...axisBounds[1], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
        series: comparison.entries.map((entry) => ({
          name: entry.label, type: first.equalScale ? 'scatter' : 'line', data: entry.series.points,
          smooth: false, showSymbol: false, symbol: ['circle', 'triangle', 'rect', 'diamond'][entry.repeat % 4], symbolSize: 4,
          lineStyle: { width: 1.5, type: ['solid', 'dashed', 'dotted'][entry.repeat % 3] },
          itemStyle: { color: colors[Math.max(0, temperatures.indexOf(entry.temperature ?? NaN)) % colors.length] },
        })),
      });
      return { key, title: comparison.title, group: comparison.group,
        pointCount: comparison.entries.reduce((count, entry) => count + entry.series.points.length, 0),
        image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.renderToSVGString())}` };
    } finally { chart.dispose(); }
  });
  return [...images, ...errors];
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
