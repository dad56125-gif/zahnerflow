import React from 'react';
import { TemperatureChart } from './FurnaceTemperatureChart';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import { SpacedCjkText } from '../common/SpacedCjkText';
import {
  FURNACE_PROGRAM_SEGMENT_COUNT,
  isFurnaceTransientSegment,
} from '../../modules/furnace/temperatureLimits';

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
            <SpacedCjkText text="错误" />: {furnaceState.error?.message || <SpacedCjkText text="未知错误" />}
          </span>
          <button
            className="btn btn--sm btn--secondary"
            onClick={furnaceControls.clear_error}
          >
            <SpacedCjkText text="关闭" />
          </button>
        </div>
      )}

      <FurnaceDashboardPanel furnaceState={furnaceState} />

      {/* 温度曲线图 */}
      <div className="chart__container chart__container--dashboard">
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
          <SpacedCjkText text="运行" />
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
          <SpacedCjkText text="保温" />
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
          <SpacedCjkText text="停止" />
        </button>

        <button
          className="btn btn--md btn--secondary"
          onClick={async () => {
            const input = document.getElementById('monitoringSegmentInput') as HTMLInputElement;
            const segment = parseInt(input.value);
            if (segment >= 1 && segment <= FURNACE_PROGRAM_SEGMENT_COUNT) {
              try {
                await furnaceControls.set_segment(segment);
              } catch (error) {
                alert(`设置程序段失败: ${error instanceof Error ? error.message : '未知错误'}`);
              }
            } else {
              alert(`程序段号必须在1-${FURNACE_PROGRAM_SEGMENT_COUNT}之间（后三段保留给点变温节点）`);
            }
          }}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.device_status?.status === 'stopped'
          }
        >
          <SpacedCjkText text="更改程序段" />
        </button>
        <input
          type="number"
          min="1"
          max={FURNACE_PROGRAM_SEGMENT_COUNT}
          placeholder={`1-${FURNACE_PROGRAM_SEGMENT_COUNT}`}
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

const calculateRunElapsedMinutes = (historyData: FurnaceState['history_data']) => {
  let runEndIndex = -1;
  for (let index = historyData.length - 1; index >= 0; index -= 1) {
    if (historyData[index].status === 'running') {
      runEndIndex = index;
      break;
    }
  }
  if (runEndIndex < 0) return 0;

  let runStart = historyData[runEndIndex];
  for (let index = runEndIndex; index >= 0; index -= 1) {
    const sample = historyData[index];
    if (sample.status !== 'running') break;
    runStart = sample;
  }

  const startTime = new Date(runStart.timestamp).getTime();
  const endTime = new Date(historyData[runEndIndex].timestamp).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return 0;
  return (endTime - startTime) / 60000;
};

export const FurnaceDashboardPanel: React.FC<FurnaceDashboardPanelProps> = ({ furnaceState }) => {
  const status = furnaceState.device_status;
  const segmentTime = Number(status?.segmentTime ?? 0);
  const segmentTimeSet = Number(status?.segmentTimeSet ?? 0);
  const segmentProgress = segmentTimeSet > 0 ? (segmentTime / segmentTimeSet) * 100 : 0;
  const segment = Number(status?.segment);
  const segmentLabel = Number.isFinite(segment)
    ? isFurnaceTransientSegment(segment)
      ? `点变温 (${segment})`
      : `${segment}/${FURNACE_PROGRAM_SEGMENT_COUNT}`
    : `--/${FURNACE_PROGRAM_SEGMENT_COUNT}`;
  const runElapsedMinutes = calculateRunElapsedMinutes(furnaceState.history_data);
  const formatTemperature = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const formatPercent = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const formatMinutes = (value: number) => (value > 0 ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} min` : '-- min');
  const statusLabel = (status?.status || 'disconnected').toUpperCase();
  const statusTone = status?.status === 'running'
    ? 'success'
    : status?.status === 'paused'
      ? 'warning'
      : 'muted';

  return (
    <section className="device-dashboard device-dashboard--compact device-dashboard--furnace-strip">
      <div className="device-dashboard__furnace-layout">
        <div className="device-dashboard__pv-card">
          <span className="device-dashboard__tile-label">PV</span>
          <span className="device-dashboard__pv-value">{formatTemperature(status?.pv)}<span>℃</span></span>
        </div>
        <div className="device-dashboard__pill-stack" aria-label="设定值和输出值">
          <div className="device-dashboard__pill-meter device-dashboard__pill-meter--sv">
            <span className="device-dashboard__tile-label">SV</span>
            <span className="device-dashboard__pill-value">{formatTemperature(status?.sv)} ℃</span>
          </div>
          <div className="device-dashboard__pill-meter device-dashboard__pill-meter--mv">
            <span className="device-dashboard__tile-label">MV</span>
            <span className="device-dashboard__pill-value">{formatPercent(status?.mv)} %</span>
          </div>
        </div>
        <div className="device-dashboard__segment-card">
          <span className="device-dashboard__tile-label"><SpacedCjkText text="当前程序段" /></span>
          <span className="device-dashboard__segment-value">{segmentLabel}</span>
        </div>
        <div className="device-dashboard__total-card">
          <span className="device-dashboard__tile-label"><SpacedCjkText text="总时间" /></span>
          <span className="device-dashboard__total-value">{formatMinutes(runElapsedMinutes)}</span>
        </div>
        <div className="device-dashboard__runtime-card">
          <span className="device-dashboard__tile-label"><SpacedCjkText text="段内时间" /></span>
          <span className="device-dashboard__runtime-value">
            {status ? `${segmentTime} min / ${segmentTimeSet} min` : '-- min / -- min'}
          </span>
          <div className="device-dashboard__runtime-track">
            <progress value={Math.max(0, Math.min(100, segmentProgress))} max={100} />
          </div>
        </div>
        <div className={`device-dashboard__status-badge device-dashboard__status-badge--${statusTone}`}>
          <span className="device-dashboard__status-dot" />
          <span>{statusLabel}</span>
        </div>
      </div>
    </section>
  );
};
