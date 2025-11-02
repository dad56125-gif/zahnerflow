import React from 'react';
import { TemperatureChart } from '../../TemperatureChart';
import type { FurnaceState, FurnaceControls } from '../../../services/hooks/useFurnace';

interface StatusPanelProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ furnaceState, furnaceControls }) => {
  return (
    <div className="monitoring-tab">
      {/* 错误显示 */}
      {furnaceState.error && (
        <div className="error-banner">
          <span className="error-message">
            错误: {furnaceState.error as string}
          </span>
          <button
            className="btn btn-sm btn-secondary"
            onClick={furnaceControls.clear_error}
          >
            关闭
          </button>
        </div>
      )}

      {/* 实时状态显示 */}
      <div className="status-display">
        {/* 第一行：PV/SV/MV */}
        <div className="status-row-temp">
          <div className="status-item">
            <label className="status-label">PV:</label>
            <span className="status-value pv-value">
              {furnaceState.device_status && furnaceState.device_status.pv !== undefined ? `${furnaceState.device_status.pv.toFixed(1)}°C` : '--.-°C'}
            </span>
          </div>
          <div className="status-item">
            <label className="status-label">SV:</label>
            <span className="status-value sv-value">
              {furnaceState.device_status && furnaceState.device_status.sv !== undefined ? `${furnaceState.device_status.sv.toFixed(1)}°C` : '--.-°C'}
            </span>
          </div>
          <div className="status-item">
            <label className="status-label">MV:</label>
            <span className="status-value mv-value">
              {furnaceState.device_status && furnaceState.device_status.mv !== undefined ? `${furnaceState.device_status.mv.toFixed(1)}%` : '--.-%'}
            </span>
          </div>
        </div>

        {/* 第二行：程序状态/程序段/时间 */}
        <div className="status-row-program">
          <div className="status-item">
            <label className="status-label">程序状态:</label>
            <span className={`status-value program-status ${furnaceState.operation_status}`}>
              {furnaceState.device_status ? furnaceState.device_status.status : '断开'}
            </span>
          </div>
          <div className="status-item">
            <label className="status-label">程序段:</label>
            <span className="status-value segment-value">
              {furnaceState.device_status ? furnaceState.device_status.segment : '--'}
            </span>
          </div>
          <div className="status-item">
            <label className="status-label">运行/设定时间:</label>
            <span className="status-value time-value">
              {furnaceState.device_status && furnaceState.device_status.segment_time !== undefined && furnaceState.device_status.segment_time_set !== undefined ?
                `${(furnaceState.device_status.segment_time / 60).toFixed(1)} / ${(furnaceState.device_status.segment_time_set / 60).toFixed(1)} 分钟`
                : '-- / -- 分钟'
              }
            </span>
          </div>
        </div>
      </div>

      {/* 温度曲线图 */}
      <div className="chart-container">
        <div className="chart-header">
          <h4>温度曲线</h4>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => furnaceControls.load_history_data()}
            disabled={furnaceState.loading}
          >
            刷新数据
          </button>
        </div>
        <div className="chart-content">
          <TemperatureChart
            data={furnaceState.history_data}
            is_loading={furnaceState.loading}
          />
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="control-panel">
        <button
          className="btn btn-success"
          onClick={furnaceControls.run}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.operation_status === 'running'
          }
        >
          运行
        </button>

        <button
          className="btn btn-warning"
          style={{ marginLeft: '8px' }}
          onClick={furnaceControls.pause}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.operation_status === 'paused' ||
            furnaceState.operation_status === 'stopped'
          }
        >
          保温
        </button>

        <button
          className="btn btn-danger"
          style={{ marginLeft: '8px' }}
          onClick={furnaceControls.stop}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.operation_status === 'stopped'
          }
        >
          停止
        </button>

        <button
          className="btn btn-secondary"
          style={{ marginLeft: '8px' }}
          onClick={async () => {
            const input = document.getElementById('monitoringSegmentInput') as HTMLInputElement;
            const segment = parseInt(input.value);
            if (segment >= 1 && segment <= 30) {
              try {
                await furnaceControls.set_segment(segment);
              } catch (error) {
                alert(`设置程序段失败: ${error instanceof Error ? error.message : '未知错误'}`);
              }
            } else {
              alert('程序段号必须在1-30之间');
            }
          }}
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading ||
            furnaceState.operation_status === 'stopped'
          }
        >
          更改程序段
        </button>
        <input
          type="number"
          min="1"
          max="30"
          placeholder="1-30"
          className="monitoring-segment-input"
          id="monitoringSegmentInput"
          disabled={
            furnaceState.connection_status !== 'connected' ||
            furnaceState.loading
          }
          style={{ marginLeft: '8px', width: '80px' }}
        />
      </div>
    </div>
  );
};