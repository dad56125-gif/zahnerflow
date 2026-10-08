import React, { useEffect, useState } from 'react';
import { TemperatureChart } from './FurnaceTemperatureChart';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import { calculateDisplayedRuntimeSeconds } from '../../modules/furnace/runtimeDisplay';
import { SpacedCjkText } from '../common/SpacedCjkText';
import { FurnaceErrorBanner } from './FurnaceErrorBanner';
import {
  FURNACE_PROGRAM_SEGMENT_COUNT,
  isFurnaceTransientSegment,
} from '../../modules/furnace/temperatureLimits';

interface StatusPanelProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ furnaceState, furnaceControls }) => {
  const monitoringError = furnaceState.errors.monitoring;

  return (
    <div className="monitoring__tab">
      {/* 错误显示 */}
      {monitoringError && (
        <FurnaceErrorBanner
          error={monitoringError}
          onClear={() => furnaceControls.clear_error('monitoring')}
        />
      )}

      <FurnaceDashboardPanel furnaceState={furnaceState} />

      {/* 温度曲线图 */}
      <div className="chart__container chart__container--dashboard">
        <div className="chart__content">
          <TemperatureChart
            data={furnaceState.history_data}
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
            furnaceState.runtime_state?.executionStatus === 'running'
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
            furnaceState.runtime_state?.executionStatus !== 'running'
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
            ['stopped', 'completed'].includes(furnaceState.runtime_state?.executionStatus || '')
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
                const succeeded = await furnaceControls.set_segment(segment);
                if (!succeeded) return;
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
            ['stopped', 'completed'].includes(furnaceState.runtime_state?.executionStatus || '')
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

export const FurnaceDashboardPanel: React.FC<FurnaceDashboardPanelProps> = ({ furnaceState }) => {
  const [displayNow, setDisplayNow] = useState(() => Date.now());
  const status = furnaceState.device_status;
  const isCommunicationError = furnaceState.connection_status === 'error'
    && (furnaceState.runtime_state?.connectionStatus === 'communication_error'
      || furnaceState.runtime_state?.lastError?.code === 'DEVICE_COMMUNICATION_ERROR');
  const isConnectionError = furnaceState.connection_status === 'error' && !isCommunicationError;
  const segmentTime = Number(status?.segmentTime ?? 0);
  const segmentTimeSet = Number(status?.segmentTimeSet ?? 0);
  const segmentProgress = segmentTimeSet > 0 ? (segmentTime / segmentTimeSet) * 100 : 0;
  const segment = Number(status?.segment);
  const segmentLabel = Number.isFinite(segment)
    ? isFurnaceTransientSegment(segment)
      ? `点变温 (${segment})`
      : `${segment}/${FURNACE_PROGRAM_SEGMENT_COUNT}`
    : `--/${FURNACE_PROGRAM_SEGMENT_COUNT}`;
  const runElapsedMinutes = calculateDisplayedRuntimeSeconds(furnaceState.runtime_state, displayNow) / 60;
  const formatTemperature = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const formatPercent = (value?: number) => (value !== undefined ? value.toFixed(1) : '--.-');
  const formatMinutes = (value: number) => (value > 0 ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} min` : '-- min');
  const statusLabel = isCommunicationError ? '通信中断' : isConnectionError ? '连接错误' : (status?.status || 'disconnected').toUpperCase();
  const statusTone = isCommunicationError || isConnectionError
    ? 'danger'
    : status?.status === 'running'
    ? 'success'
    : status?.status === 'paused'
      ? 'warning'
      : 'muted';

  useEffect(() => {
    if (furnaceState.runtime_state?.executionStatus !== 'running') return undefined;
    const timer = window.setInterval(() => setDisplayNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [furnaceState.runtime_state?.executionStatus, furnaceState.runtime_state?.currentRunStartedAt]);

  return (
    <section className="device-dashboard device-dashboard--compact device-dashboard--furnace-strip">
      <div className="device-dashboard__furnace-layout">
        <div className="device-dashboard__pv-card">
          <span className="device-dashboard__tile-label">
            PV{isCommunicationError ? '（最后读数）' : ''}
          </span>
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
        <div
          className={`device-dashboard__status-badge device-dashboard__status-badge--${statusTone}`}
          style={isCommunicationError || isConnectionError ? { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' } : undefined}
        >
          <span className="device-dashboard__status-dot" />
          <span>{statusLabel}</span>
        </div>
      </div>
    </section>
  );
};
