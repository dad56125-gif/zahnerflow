import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, DataZoomComponent, MarkPointComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import type { ReportCurveSeries, ReportMeasurementCurve } from '@zahnerflow/types';
import { getNodeDisplayName } from '../../types/NodeConfiguration';
import { formatIterationPath, toIterationPath } from '../../utils/iterationPath';

echarts.use([LineChart, ScatterChart, GridComponent, LegendComponent, DataZoomComponent, MarkPointComponent, GraphicComponent, CanvasRenderer, SVGRenderer]);

export interface ReportChartImage {
  key: string;
  title: string;
  group: string;
  pointCount: number;
  image?: string;
  option?: echarts.EChartsCoreOption;
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
  ocv: boolean;
  mode?: string;
  entries: CurveEntry[];
}

// These are explicit labels saved with the workflow, not temperatures inferred from the data.
function temperatureGroup(label: string) {
  const match = /^(发电|电解)\s+(-?\d+(?:\.\d+)?)\s*°C(（模拟条件）)?$/.exec(label);
  return match ? { mode: match[1], temperature: Number(match[2]), simulation: Boolean(match[3]) } : null;
}

export function buildReportCharts(curves: ReportMeasurementCurve[], nodes: Array<Record<string, unknown>>, electrodeAreaCm2?: number | null): ReportChartImage[] {
  const area = typeof electrodeAreaCm2 === 'number' && Number.isFinite(electrodeAreaCm2) && electrodeAreaCm2 > 0 ? electrodeAreaCm2 : null;
  const currentUnit = area ? 'A/cm²' : 'A';
  const powerUnit = area ? 'W/cm²' : 'W';
  const impedanceUnit = area ? 'Ω·cm²' : 'Ω';
  const currentTitle = area ? '电流密度' : '电流';
  const powerTitle = area ? '功率密度' : '功率';
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
    for (const raw of curve.series) {
      const series = area ? { ...raw,
        points: raw.points.map(([x, y]) => raw.equalScale ? [x * area, y * area] : [x, raw.yLabel.includes('(A)') ? y / area : y]),
        yLabel: raw.yLabel.replace('电流 (A)', '电流密度 (A/cm²)'),
      } : raw;
      const kind = curve.nodeType === 'ocp_measurement' ? 'OCV' : series.name;
      const key = JSON.stringify([group, condition ? curve.nodeType : curve.nodeId, series.name, series.xLabel, series.yLabel]);
      const comparison = comparisons.get(key) || { group, title: `${group} · ${kind}`, ocv: curve.nodeType === 'ocp_measurement', mode: condition?.mode, entries: [] };
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
    const grid = first.equalScale
      ? { left: '27.777778%', right: '27.777778%', top: '20.833333%', bottom: '12.5%' }
      : { left: '12.222222%', right: '4.444444%', top: '20.833333%', bottom: '12.5%' };
    const axisBounds: { min?: number; max?: number }[] = [{}, {}];
    const plotted = comparison.entries.map((entry) => entry.series.points);
    let peak = { value: -Infinity, point: [0, 0], series: 0 };
    plotted.forEach((points, series) => points.forEach((point) => {
      if (point[1] > peak.value) peak = { value: point[1], point, series };
    }));
    const extrema = { power: { magnitude: -1, value: 0, point: [0, 0], series: -1 },
      current: { magnitude: -1, value: 0, point: [0, 0], series: -1 } };
    if (first.name === 'LSV') plotted.forEach((points, series) => points.forEach((point) => {
      const power = point[0] * point[1];
      if (Math.abs(power) > extrema.power.magnitude)
        extrema.power = { magnitude: Math.abs(power), value: power, point, series };
      if (Math.abs(point[1]) > extrema.current.magnitude)
        extrema.current = { magnitude: Math.abs(point[1]), value: point[1], point, series };
    }));
    if (comparison.ocv) axisBounds[1] = { min: 0, max: peak.value > 0 ? peak.value * 1.1 : 1 };
    if (first.equalScale) {
      let minX = 0, maxX = 0, maxY = 0;
      for (const points of plotted) for (const [x, y] of points) {
        if (y < 0) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      const span = Math.max(maxX - minX, maxY, 1e-9) * 1.1;
      axisBounds[0] = { min: minX, max: minX + span };
      axisBounds[1] = { min: 0, max: span };
    }
    const option: echarts.EChartsCoreOption = {
        animation: false, backgroundColor: '#ffffff', grid,
        textStyle: { fontFamily: 'sans-serif' },
        tooltip: { show: false },
        dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }],
        legend: { top: 12, left: 24, right: 24, selectedMode: true, textStyle: { fontSize: 11 } },
        xAxis: { type: 'value', name: first.equalScale ? `Re (${impedanceUnit})` : first.xLabel, nameLocation: 'middle', nameGap: 36, scale: true,
          ...axisBounds[0], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
        yAxis: { type: 'value', name: first.equalScale ? `-Im (${impedanceUnit})` : first.yLabel, nameLocation: 'middle', nameGap: 60, scale: true,
          ...axisBounds[1], axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } },
        series: comparison.entries.map((entry, index) => ({
          name: entry.label, type: first.equalScale ? 'scatter' : 'line', data: plotted[index], clip: true,
          markPoint: comparison.ocv && peak.series === index ? {
            symbol: 'circle', symbolSize: 7,
            label: { show: true, position: 'top', formatter: `最大 OCV ${Number(peak.value.toPrecision(5))} V` },
            data: [{ coord: peak.point, value: peak.value }],
          } : first.name === 'LSV' ? {
            symbol: 'circle', symbolSize: 7,
            data: Object.entries(extrema).filter(([, peak]) => peak.series === index).map(([kind, peak]) => ({
              coord: peak.point, value: peak.value,
              label: { show: true, position: kind === 'power' ? 'right' : 'bottom',
                formatter: `${kind === 'power' ? '最大功率点' : '最大电流点'}\n${Number(peak.value.toPrecision(5))} ${kind === 'power' ? 'W' : 'A'}\n${Number(peak.point[0].toPrecision(5))} V`,
              },
            })),
          } : undefined,
          smooth: false, showSymbol: false, symbol: ['circle', 'triangle', 'rect', 'diamond'][entry.repeat % 4], symbolSize: 4,
          lineStyle: { width: 1.5, type: ['solid', 'dashed', 'dotted'][entry.repeat % 3] },
          itemStyle: { color: colors[Math.max(0, temperatures.indexOf(entry.temperature ?? NaN)) % colors.length] },
        })),
      };
      if (first.name === 'LSV') {
        const fuelCell = comparison.mode === '发电';
        const electrolysis = comparison.mode === '电解';
        const currentForDisplay = (current: number) => fuelCell ? Math.abs(current) : electrolysis ? -Math.abs(current) : current;
        const powerForDisplay = (power: number) => fuelCell ? Math.abs(power) : power;

        option.grid = { left: '12.222222%', right: '12.222222%', top: '25%', bottom: '12.5%' };
        option.xAxis = { type: 'value', name: `${currentTitle} (${currentUnit})`, nameLocation: 'middle', nameGap: 36,
          scale: true, ...(fuelCell ? { min: 0 } : electrolysis ? { max: 0 } : {}),
          axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() } };
        option.yAxis = (electrolysis ? ['电压 (V)'] : ['电压 (V)', `${powerTitle} (${powerUnit})`]).map((name, index) => ({ type: 'value', name,
          position: index === 0 ? 'left' : 'right', nameLocation: 'middle', nameGap: 48, scale: true,
          splitLine: { show: index === 0 },
          axisLabel: { formatter: (value: number) => Number(value.toPrecision(4)).toString() },
        }));
        option.dataZoom = [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }];
        option.series = comparison.entries.flatMap((entry, index) => (electrolysis ? [0] : [0, 1]).map((axis) => {
          const extreme = axis === 0 ? extrema.current : extrema.power;
          return { name: entry.label, type: 'line', yAxisIndex: axis,
            data: entry.series.points.map(([voltage, current]) => [currentForDisplay(current), axis === 0 ? voltage : powerForDisplay(voltage * current)]),
            smooth: false, showSymbol: false, clip: true,
            lineStyle: { width: 1.5, type: axis === 0 ? 'solid' : 'dashed' },
            symbol: ['circle', 'triangle', 'rect', 'diamond'][entry.repeat % 4],
            itemStyle: { color: colors[Math.max(0, temperatures.indexOf(entry.temperature ?? NaN)) % colors.length] },
            markPoint: { symbol: 'circle', symbolSize: 7, data: extreme.series === index ? [{
              coord: [currentForDisplay(extreme.point[1]), axis === 0 ? extreme.point[0] : powerForDisplay(extreme.value)],
              label: { show: true, position: axis === 0 ? 'insideTopRight' : 'insideBottomRight',
                formatter: `${axis === 0 ? `最大${currentTitle}点` : `最大${powerTitle}点`}\n${Number((axis === 0 ? currentForDisplay(extreme.value) : powerForDisplay(extreme.value)).toPrecision(5))} ${axis === 0 ? currentUnit : powerUnit}` },
            }] : [] },
          };
        }));
        option.graphic = [{ type: 'text', left: 'center', top: '19%',
          style: { text: electrolysis ? `电解：电压—${currentTitle}` : `实线：电压（左轴）    虚线：${powerTitle}（右轴）`, fill: '#374151', fontSize: 11 } }];
      }
      return { key, title: comparison.title, group: comparison.group,
        pointCount: comparison.entries.reduce((count, entry) => count + entry.series.points.length, 0),
        option };
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

export function reportChartImages(charts: ReportChartImage[], container?: HTMLElement): ReportChartImage[] {
  const elements = container ? Array.from(container.querySelectorAll<HTMLElement>('[data-report-chart]')) : [];
  return charts.map((chart) => {
    if (!chart.option) return chart;
    const element = elements.find((item) => item.dataset.reportChart === chart.key);
    const live = element && echarts.getInstanceByDom(element);
    if (container && !live) throw new Error('图表尚未加载完成，请稍后导出');
    const renderer = echarts.init(null, undefined, { renderer: 'svg', ssr: true,
      width: live?.getWidth() || 720, height: live?.getHeight() || 480 });
    try {
      renderer.setOption(live ? live.getOption() : chart.option);
      const axis = { nameTextStyle: { color: '#374151' }, axisLabel: { color: '#374151' },
        axisLine: { lineStyle: { color: '#374151' } }, splitLine: { lineStyle: { color: '#e5e7eb' } } };
      renderer.setOption({ backgroundColor: '#ffffff', textStyle: { color: '#374151' },
        legend: { textStyle: { color: '#374151' } }, xAxis: axis, yAxis: (Array.isArray(chart.option.yAxis) ? chart.option.yAxis : [chart.option.yAxis]).map(() => axis),
        ...(chart.option.graphic ? { graphic: { elements: [{ style: { fill: '#374151' } }] } } : {}),
        series: ((chart.option.series || []) as Array<unknown>).map(() => ({ markPoint: { label: { color: '#374151' } } })),
      });
      return { ...chart, image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderer.renderToSVGString())}` };
    } finally { renderer.dispose(); }
  });
}
