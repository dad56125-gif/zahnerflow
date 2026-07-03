import React from 'react';
import { TemperatureChart } from './FurnaceTemperatureChart';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import {
  DeviceDashboardPanel,
} from '../device-dashboard/DeviceDashboard';

interface StatusPanelProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ furnaceState, furnaceControls }) => {
  return (
    <div className="monitoring__tab">
      {/* 错误显示 */}
      {furnaceState.error && (
        <div className="error-banner">
          <span className="error__message">
            错误: {furnaceState.error?.message || '未知错误'}
          </span>
          <button
            className="btn btn--sm btn--secondary"
            onClick={furnaceControls.clear_error}
          >
            关闭
          </button>
        </div>
      )}

      {/* 温度曲线图 */}
      <div className="chart__container">
        <div className="chart__header chart__header--compact">
          <h5 className="chart__title">温度曲线</h5>
          <div className="chart__legend chart__legend--inline">
            <span className="chart__legend-item chart__legend-item--pv">PV</span>
            <span className="chart__legend-item chart__legend-item--sv">SV</span>
            <span className="chart__legend-item chart__legend-item--mv">MV</span>
          </div>
          <button
            className="btn btn--icon btn--xs btn--ghost"
            onClick={() => furnaceControls.load_history_data()}
            disabled={furnaceState.loading}
            title="刷新数据"
          >
            ↻
          </button>
        </div>
        <div className="chart__content">
          <TemperatureChart
            data={furnaceState.history_data as any}
            is_loading={furnaceState.loading}
          />
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="control-panel">
        <button
          className="btn btn--md btn--success"
          onClick={furnaceControls.run}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.device_status?.status === 'running'
          }
        >
          运行
        </button>

        <button
          className="btn btn--md btn--warning"
          onClick={furnaceControls.pause}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.device_status?.status === 'paused' ||
            furnaceState.device_status?.status === 'stopped'
          }
        >
          保温
        </button>

        <button
          className="btn btn--md btn--danger"
          onClick={furnaceControls.stop}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.device_status?.status === 'stopped'
          }
        >
          停止
        </button>

        <button
          className="btn btn--md btn--secondary"
          onClick={async () => {
            const input = document.getElementById('monitoringSegmentInput') as HTMLInputElement;
            const segment = parseInt(input.value);
            if (segment >= 1 && segment <= 27) {
              try {
                await furnaceControls.set_segment(segment);
              } catch (error) {
                alert(`设置程序段失败: ${error instanceof Error ? error.message : '未知错误'}`);
              }
            } else {
              alert('程序段号必须在1-27之间（避免与温度节点地址冲突）');
            }
          }}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.device_status?.status === 'stopped'
          }
        >
          更改程序段
        </button>
        <input
          type="number"
          min="1"
          max="27"
          placeholder="1-27"
          className="input monitoring-segment-input"
          id="monitoringSegmentInput"
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading
          }
        />
      </div>
    </div>
  );
};

interface FurnaceDashboardPanelProps {
  furnaceState: FurnaceState;
}

type DashboardCurvePoint = {
  timestamp: string;
  temperature: number;
  sv?: number;
  mv?: number;
};

const buildCurvePath = (
  samples: DashboardCurvePoint[],
  key: 'temperature' | 'sv' | 'mv',
  width: number,
  height: number,
) => {
  const points = samples
    .map((sample, index) => ({
      index,
      value: key === 'temperature' ? sample.temperature : sample[key],
    }))
    .filter((point): point is { index: number; value: number } => Number.isFinite(point.value));

  if (points.length === 0) return '';
  if (points.length === 1) {
    const y = height / 2;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const values = points.map(point => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const maxIndex = Math.max(1, samples.length - 1);

  return points
    .map((point, pathIndex) => {
      const x = (point.index / maxIndex) * width;
      const y = height - ((point.value - minValue) / range) * height;
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

const latestFiniteValue = (samples: DashboardCurvePoint[], key: 'temperature' | 'sv' | 'mv') => {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const value = key === 'temperature' ? samples[index].temperature : samples[index][key];
    if (Number.isFinite(value)) return value;
  }
  return undefined;
};

interface FurnaceCurveTileProps {
  samples: DashboardCurvePoint[];
}

const FurnaceCurveTile: React.FC<FurnaceCurveTileProps> = ({ samples }) => {
  const recentSamples = samples.slice(-120);
  const pvPath = buildCurvePath(recentSamples, 'temperature', 100, 42);
  const svPath = buildCurvePath(recentSamples, 'sv', 100, 42);
  const mvPath = buildCurvePath(recentSamples, 'mv', 100, 42);
  const latestPv = latestFiniteValue(recentSamples, 'temperature');
  const latestSv = latestFiniteValue(recentSamples, 'sv');
  const latestMv = latestFiniteValue(recentSamples, 'mv');

  return (
    <div className="device-dashboard__curve-tile device-dashboard__curve-tile--main">
      <div className="device-dashboard__curve-head">
        <div>
          <span className="device-dashboard__curve-title">运行曲线</span>
          <span className="device-dashboard__curve-subtitle">最近 {recentSamples.length} 点</span>
        </div>
        <div className="device-dashboard__curve-readout">
          <span className="device-dashboard__curve-value device-dashboard__curve-value--pv">
            PV {latestPv !== undefined ? latestPv.toFixed(1) : '--'}
          </span>
          <span className="device-dashboard__curve-value device-dashboard__curve-value--sv">
            SV {latestSv !== undefined ? latestSv.toFixed(1) : '--'}
          </span>
          <span className="device-dashboard__curve-value device-dashboard__curve-value--mv">
            MV {latestMv !== undefined ? latestMv.toFixed(1) : '--'}
          </span>
        </div>
      </div>
      <svg className="device-dashboard__curve-svg" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
        <path className="device-dashboard__curve-grid" d="M 0 10.5 H 100 M 0 21 H 100 M 0 31.5 H 100" />
        {pvPath && <path className="device-dashboard__curve-line device-dashboard__curve-line--pv" d={pvPath} />}
        {svPath && <path className="device-dashboard__curve-line device-dashboard__curve-line--sv" d={svPath} />}
        {mvPath && <path className="device-dashboard__curve-line device-dashboard__curve-line--mv" d={mvPath} />}
      </svg>
    </div>
  );
};

export const FurnaceDashboardPanel: React.FC<FurnaceDashboardPanelProps> = ({ furnaceState }) => {
  const status = furnaceState.device_status;
  const segmentTime = Number(status?.segmentTime ?? 0);
  const segmentTimeSet = Number(status?.segmentTimeSet ?? 0);
  const segmentProgress = segmentTimeSet > 0 ? (segmentTime / segmentTimeSet) * 100 : 0;
  const formatTemperature = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const formatPercent = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const samples = furnaceState.history_data as DashboardCurvePoint[];
  const deltaTemperature = status?.pv !== undefined && status?.sv !== undefined
    ? status.pv - status.sv
    : undefined;
  const statusLabel = (status?.status || 'disconnected').toUpperCase();
  const statusTone = status?.status === 'running'
    ? 'success'
    : status?.status === 'paused'
      ? 'warning'
      : 'muted';

  return (
    <div className="monitoring__tab">
      <DeviceDashboardPanel
        title="炉温仪表盘"
        eyebrow="Furnace"
        subtitle={`最后采样 ${status?.ts ? new Date(status.ts).toLocaleTimeString() : '--:--:--'}`}
      >
        <div className="device-dashboard__furnace-layout">
          <div className="device-dashboard__pv-card">
            <span className="device-dashboard__tile-label">PV 主卡</span>
            <span className="device-dashboard__pv-value">{formatTemperature(status?.pv)}<span>℃</span></span>
            <span className="device-dashboard__tile-meta">
              ΔT {deltaTemperature !== undefined ? deltaTemperature.toFixed(1) : '--'} ℃
            </span>
          </div>
          <FurnaceCurveTile samples={samples} />
          <div className="device-dashboard__mini-card device-dashboard__mini-card--sv">
            <span className="device-dashboard__tile-label">SV</span>
            <span className="device-dashboard__mini-value">{formatTemperature(status?.sv)}</span>
            <span className="device-dashboard__tile-meta">℃</span>
          </div>
          <div className="device-dashboard__mini-card device-dashboard__mini-card--mv">
            <span className="device-dashboard__tile-label">MV</span>
            <span className="device-dashboard__mini-value">{formatPercent(status?.mv)}</span>
            <span className="device-dashboard__tile-meta">%</span>
          </div>
          <div className="device-dashboard__runtime-card">
            <div>
              <span className="device-dashboard__tile-label">运行时长</span>
              <span className="device-dashboard__runtime-value">{status ? segmentTime : '--'} min</span>
            </div>
            <div className="device-dashboard__runtime-track">
              <progress value={Math.max(0, Math.min(100, segmentProgress))} max={100} />
              <span>{segmentTimeSet > 0 ? `设定 ${segmentTimeSet} min` : '无设定时长'}</span>
            </div>
          </div>
          <div className="device-dashboard__mini-card device-dashboard__mini-card--phase">
            <span className="device-dashboard__tile-label">阶段</span>
            <span className="device-dashboard__mini-value">{status?.segment ?? '--'}</span>
          </div>
          <div className={`device-dashboard__status-badge device-dashboard__status-badge--${statusTone}`}>
            <span className="device-dashboard__status-dot" />
            <span>{statusLabel}</span>
          </div>
        </div>
      </DeviceDashboardPanel>
    </div>
  );
};
