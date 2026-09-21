import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { ReportChartImage } from './reportCharts';

export function ReportMeasurementChart({ chart }: { chart: ReportChartImage }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current || !chart.option) return;
    const instance = echarts.init(element.current, undefined, { renderer: 'canvas' });
    instance.setOption(chart.option);
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.dispose(); };
  }, [chart]);
  return <div ref={element} className="report__interactive-chart" data-report-chart={chart.key} aria-label={chart.title} />;
}
