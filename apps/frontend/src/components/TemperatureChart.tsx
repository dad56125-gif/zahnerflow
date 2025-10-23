import React, { useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ECharts, EChartsOption } from 'echarts';
import type { FurnaceSample } from '../types/devices';

interface TemperatureChartProps {
  data: FurnaceSample[];
  is_loading?: boolean;
  on_refresh?: () => void;
}

interface NormalizedSample {
  ts: number;
  pv: number | null;
  sv: number | null;
  mv: number | null;
}

type ReactEChartsInstance = React.RefObject<typeof ReactECharts>;

const chart_colors = ['#ef4444', '#3b82f6', '#10b981'];

const base_option: EChartsOption = {
  backgroundColor: 'transparent',
  color: chart_colors,
  animation: false,
  textStyle: { color: 'rgba(255, 255, 255, 0.9)' },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'cross', label: { backgroundColor: 'rgba(31, 41, 55, 0.9)' } },
    className: 'chart-tooltip',
  },
  legend: {
    data: ['PV(实际温度)', 'SV(设定温度)', 'MV(输出功率)'],
    top: 0,
    icon: 'circle',
    textStyle: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 12 },
  },
  grid: { top: 48, right: 18, bottom: 54, left: 48 },
  dataZoom: [
    { type: 'inside', throttle: 50 },
    { type: 'slider', height: 16, bottom: 18, handleSize: 12, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.05)', fillerColor: 'rgba(59, 130, 246, 0.25)', textStyle: { color: 'rgba(255, 255, 255, 0.6)' } },
  ],
  xAxis: {
    type: 'time',
    boundaryGap: [0, 0],
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.15)' } },
    axisLabel: {
      color: 'rgba(255, 255, 255, 0.7)',
      formatter: (value: number | string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(typeof value === 'number' ? value : Number(value)),
    },
    splitLine: { show: false },
  } as any,
  yAxis: {
    type: 'value',
    scale: true,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.08)' } },
    axisLabel: { color: 'rgba(255, 255, 255, 0.7)' },
  },
  series: [
    { name: 'PV(实际温度)', type: 'line', showSymbol: false, smooth: false, sampling: 'lttb', data: [], lineStyle: { width: 2 } } as any,
    { name: 'SV(设定温度)', type: 'line', showSymbol: false, smooth: false, sampling: 'lttb', data: [], lineStyle: { width: 2 } } as any,
    { name: 'MV(输出功率)', type: 'line', showSymbol: false, smooth: false, sampling: 'lttb', data: [], lineStyle: { width: 2 }, yAxisIndex: 0 } as any,
  ],
};

const normalize_samples = (samples: FurnaceSample[]): NormalizedSample[] => {
  return samples
    .map((sample) => {
      const parsed_ts = typeof sample.timestamp === 'number' ? sample.timestamp : Date.parse(sample.timestamp as any);
      const ts_value = Number.isFinite(parsed_ts) ? parsed_ts : Date.now();
      const pv_value = typeof sample.temperature === 'number' && Number.isFinite(sample.temperature) ? sample.temperature : null;
      const sv_value = typeof sample.sv === 'number' && Number.isFinite(sample.sv) ? sample.sv : null;
      const mv_value = typeof sample.mv === 'number' && Number.isFinite(sample.mv) ? sample.mv : null;
      return { ts: ts_value, pv: pv_value, sv: sv_value, mv: mv_value };
    })
    .filter((item) => Number.isFinite(item.ts))
    .sort((a, b) => a.ts - b.ts);
};

const format_value = (value: number | null, fraction_digits = 1): string => {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return value.toFixed(fraction_digits);
};

export const TemperatureChart: React.FC<TemperatureChartProps> = ({ data, is_loading = false, on_refresh, }) => {
  const chart_ref = useRef<any>(null);
  const previous_length_ref = useRef<number>(0);

  const nomalized_samples = useMemo(() => normalize_samples(data), [data]);

  useEffect(() => {
    const chart_instance: ECharts | undefined = (chart_ref.current as any)?.getEchartsInstance?.();
    if (!chart_instance) return;

    const total_length = nomalized_samples.length;
    const previous_length = previous_length_ref.current;

    const build_series_payload = (samples: NormalizedSample[]) => ({
      pv: samples.map((item) => [item.ts, item.pv]),
      sv: samples.map((item) => [item.ts, item.sv]),
      mv: samples.map((item) => [item.ts, item.mv]),
    });

    if (total_length === 0) {
      chart_instance.setOption({
        series: [
          { name: 'PV(实际温度)', data: [] },
          { name: 'SV(设定温度)', data: [] },
          { name: 'MV(输出功率)', data: [] },
        ],
      });
      previous_length_ref.current = 0;
      return;
    }

    if (previous_length === 0 || total_length <= previous_length) {
      const payload = build_series_payload(nomalized_samples);
      chart_instance.setOption({
        series: [
          { name: 'PV(实际温度)', data: payload.pv },
          { name: 'SV(设定温度)', data: payload.sv },
          { name: 'MV(输出功率)', data: payload.mv },
        ],
      });
      previous_length_ref.current = total_length;
      return;
    }

    const appended_samples = nomalized_samples.slice(previous_length);
    if (appended_samples.length === 0) {
      previous_length_ref.current = total_length;
      return;
    }

    const append_payload_raw = build_series_payload(appended_samples);
    const append_payload = {
      pv: append_payload_raw.pv.filter((d) => d[1] !== null),
      sv: append_payload_raw.sv.filter((d) => d[1] !== null),
      mv: append_payload_raw.mv.filter((d) => d[1] !== null),
    };

    const can_append = typeof (chart_instance as any).appendData === 'function';
    if (can_append) {
      try {
        chart_instance.appendData({ seriesIndex: 0, data: append_payload.pv });
        chart_instance.appendData({ seriesIndex: 1, data: append_payload.sv });
        chart_instance.appendData({ seriesIndex: 2, data: append_payload.mv });
      } catch (e) {
        const payload = build_series_payload(nomalized_samples);
        chart_instance.setOption({
          series: [
            { name: 'PV(实际温度)', data: payload.pv },
            { name: 'SV(设定温度)', data: payload.sv },
            { name: 'MV(输出功率)', data: payload.mv },
          ],
        });
      }
    } else {
      const payload = build_series_payload(nomalized_samples);
      chart_instance.setOption({
        series: [
          { name: 'PV(实际温度)', data: payload.pv },
          { name: 'SV(设定温度)', data: payload.sv },
          { name: 'MV(输出功率)', data: payload.mv },
        ],
      });
    }

    previous_length_ref.current = total_length;
  }, [nomalized_samples]);

  const latest_sample = nomalized_samples[nomalized_samples.length - 1];
  void on_refresh;

  return (
    <div className="temperature-chart">
      <div className="chart-main">
        <ReactECharts
          ref={chart_ref}
          option={base_option}
          style={{ width: '100%', height: '100%' }}
          lazyUpdate
        />

        {is_loading && (
          <div className="chart-loading">
            <div className="loading-spinner" />
            <span className="loading-text">数据加载中...</span>
          </div>
        )}

        {!is_loading && nomalized_samples.length === 0 && (
          <div className="chart-empty">
            <div className="loading-spinner" />
            <p>暂无温度历史数据</p>
          </div>
        )}
      </div>

      <div className="chart-stats">
        <span>数据点：{nomalized_samples.length}</span>
        {latest_sample && (
          <>
            <span>最新PV：{format_value(latest_sample.pv)}°C</span>
            {latest_sample.sv !== null && (
              <span>最新SV：{format_value(latest_sample.sv)}°C</span>
            )}
            {latest_sample.mv !== null && (
              <span>最新MV：{format_value(latest_sample.mv)}%</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TemperatureChart;
