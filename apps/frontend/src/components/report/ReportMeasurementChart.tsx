import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { useAppStore } from '../../state/appStore';
import type { ReportChartImage } from './reportCharts';

export function ReportMeasurementChart({ chart }: { chart: ReportChartImage }) {
  const theme = useAppStore((state) => state.theme);
  const live = useRef<echarts.ECharts | null>(null);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current || !chart.option) return;
    const instance = echarts.init(element.current, undefined, { renderer: 'canvas' });
    instance.setOption(chart.option);
    live.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.dispose(); live.current = null; };
  }, [chart]);
  useEffect(() => {
    const foreground = theme === 'dark' ? '#ffffff' : '#374151';
    const axis = { nameTextStyle: { color: foreground }, axisLabel: { color: foreground },
      axisLine: { lineStyle: { color: foreground } },
      splitLine: { lineStyle: { color: theme === 'dark' ? '#374151' : '#e5e7eb' } } };
    live.current?.setOption({ backgroundColor: theme === 'dark' ? '#111827' : '#ffffff',
      textStyle: { color: foreground }, legend: { textStyle: { color: foreground } },
      xAxis: axis, yAxis: (Array.isArray(chart.option?.yAxis) ? chart.option.yAxis : [chart.option?.yAxis]).map(() => axis),
      ...(chart.option?.graphic ? { graphic: { elements: [{ style: { fill: foreground } }] } } : {}),
      series: ((chart.option?.series || []) as Array<unknown>).map(() => ({ markPoint: { label: { color: foreground } } })),
    });
  }, [theme, chart]);
  return <div ref={element} className="report__interactive-chart" data-report-chart={chart.key} aria-label={chart.title} />;
}
