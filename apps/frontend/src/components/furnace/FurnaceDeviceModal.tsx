import React, { useState, useEffect, useMemo } from 'react';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import { FurnaceDashboardPanel, StatusPanel } from './StatusPanel';
import { ProgramEditor } from './ProgramEditor';
import { PresetManager } from './PresetManager';
import { FurnaceLogPanel } from './FurnaceLogPanel';
import { TemperatureChart } from './FurnaceTemperatureChart';
import { DeviceConnectionPanel } from '../../components/common/DeviceConnectionPanel';
import { DeviceDiagnosticsPanel } from '../../components/common/DeviceDiagnosticsPanel';
import { runtimeClient } from '../../runtimeClient';
import {
  SimulatorSettings,
  isSimulatorDeviceEnabled,
  simulatorPortFor,
  simulatorProfileFor,
} from '../../modules/simulator/simulatorSettings';


interface DeviceModalProps {
  device: 'furnace';
  onClose: () => void;
  modalTop: number;
  modalLeft: number;
  modalWidth: number;
  modalHeight: number;
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
  simulatorSettings: SimulatorSettings;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  device,
  onClose,
  modalTop,
  modalLeft,
  modalWidth,
  modalHeight,
  furnaceState,
  furnaceControls,
  simulatorSettings,
}) => {
  if (!device) return null;

  // 当前选项卡状态
  const [activeTab, setActiveTab] = useState<'monitoring' | 'dashboard' | 'program' | 'presets' | 'recording' | 'history'>('monitoring');
  const isConnected = furnaceState.connection_status === 'connected';

  useEffect(() => {
    if (!isConnected && activeTab === 'dashboard') {
      setActiveTab('monitoring');
    }
  }, [activeTab, isConnected]);

  // 端口管理
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');

  const loadPorts = async () => {
    try {
      const portList = await runtimeClient.devices.furnace.ports();
      setPorts(portList);
    } catch {
      setPorts([]);
    }
  };

  const handleConnect = async () => {
    const port = simulatorPortFor('furnace', selectedPort, simulatorSettings);
    if (!port) return;
    const simulatorProfile = simulatorProfileFor('furnace', simulatorSettings);
    await furnaceControls.connect({
      port,
      baudrate: 9600,
      address: 1,
      stopbits: 2,
      timeout: 1.0,
      ...(simulatorProfile && { simulatorProfile }),
    });
  };

  const isFurnaceSimulator = isSimulatorDeviceEnabled('furnace', simulatorSettings);
  const effectiveSelectedPort = isFurnaceSimulator ? 'COM_SIMULATOR' : selectedPort;
  const effectivePorts = isFurnaceSimulator
    ? Array.from(new Set(['COM_SIMULATOR', ...ports]))
    : ports;

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  return (
      <div
        className="modal__content device-modal-content workspace-device-modal"
      >
        <div className="modal__header">
          <h3>AI-518P 温度控制器</h3>
          <div className="tabs">
            {/* 选项卡导航 */}
            <div className="tabs__list">
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'monitoring' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('monitoring')}
              >
                实时监控
              </button>
              {isConnected && (
                <button
                  className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'dashboard' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  仪表盘
                </button>
              )}
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'program' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('program')}
              >
                设置程序段
              </button>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'presets' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('presets')}
              >
                预设程序段
              </button>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'recording' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('recording')}
              >
                实时曲线
              </button>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'history' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                历史曲线
              </button>
            </div>
          </div>
          <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={onClose}>✕</button>
        </div>

        {/* 双列布局容器 */}
        <div className="modal__body">
          <div className="furnace-modal">
            {/* 左侧主内容区域 (2/3宽度) */}
            <div className="furnace-modal__main">
              {/* 选项卡内容 */}
              <div className="tabs__content">
                {activeTab === 'monitoring' && (
                  <div className="tabs__panel is-active">
                    <StatusPanel
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'dashboard' && isConnected && (
                  <div className="tabs__panel is-active">
                    <FurnaceDashboardPanel furnaceState={furnaceState} />
                  </div>
                )}
                {activeTab === 'program' && (
                  <div className="tabs__panel is-active">
                    <ProgramEditor
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'presets' && (
                  <div className="tabs__panel is-active">
                    <PresetManager
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'recording' && (
                  <div className="tabs__panel is-active">
                    <RecordingTab furnaceState={furnaceState} />
                  </div>
                )}
                {activeTab === 'history' && (
                  <div className="tabs__panel is-active">
                    <HistoryTab />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧区域 (1/3宽度) */}
            <div className="furnace-modal__sidebar">
              <div className="card">
                <div className="card__body">
                  <DeviceConnectionPanel
                    deviceName="炉子"
                    connectionStatus={furnaceState.connection_status}
                    availablePorts={effectivePorts}
                    selectedPort={effectiveSelectedPort}
                    onPortChange={setSelectedPort}
                    onRefreshPorts={loadPorts}
                    onConnect={handleConnect}
                    onDisconnect={furnaceControls.disconnect}
                  />
                </div>
              </div>
              <DeviceDiagnosticsPanel
                diagnostics={furnaceState.diagnostics}
                commandLogs={furnaceState.command_logs}
                onRefreshLogs={furnaceControls.load_command_logs}
                onClearLogs={furnaceControls.clear_command_logs}
              />
              <FurnaceLogPanel
                logs={furnaceState.logs}
                onClear={furnaceControls.clear_logs}
                title="前端操作日志"
              />
            </div>
          </div>
        </div>
      </div>
  );
}

type FurnaceChartSample = {
  timestamp: string;
  temperature: number;
  sv?: number;
  mv?: number;
  status?: string;
  statusCode?: number;
  segment?: number;
  segmentTime?: number;
  segmentTimeSet?: number;
};

type ActivityDay = {
  key: string;
  date: Date;
  count: number;
  minTemperature: number | null;
  maxTemperature: number | null;
  isPadding?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
  const result = startOfDay(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
};

const formatActivityLabel = (date: Date) => {
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const buildActivityDays = (startDate: string, endDate: string, samples: FurnaceChartSample[]): ActivityDay[] => {
  const rangeStart = startOfDay(new Date(startDate));
  const rangeEnd = startOfDay(new Date(endDate));
  const start = startOfWeek(rangeStart);
  const end = startOfDay(rangeEnd);
  end.setDate(end.getDate() + (6 - end.getDay()));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];

  const buckets = new Map<string, ActivityDay>();
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const date = new Date(time);
    const key = toDateKey(date);
    buckets.set(key, {
      key,
      date,
      count: 0,
      minTemperature: null,
      maxTemperature: null,
      isPadding: date < rangeStart || date > rangeEnd,
    });
  }

  samples.forEach((sample) => {
    const sampleDate = new Date(sample.timestamp);
    if (!Number.isFinite(sampleDate.getTime())) return;
    const key = toDateKey(sampleDate);
    const bucket = buckets.get(key);
    if (!bucket) return;
    bucket.count += 1;
    const temperature = Number(sample.temperature);
    if (Number.isFinite(temperature)) {
      bucket.minTemperature = bucket.minTemperature === null ? temperature : Math.min(bucket.minTemperature, temperature);
      bucket.maxTemperature = bucket.maxTemperature === null ? temperature : Math.max(bucket.maxTemperature, temperature);
    }
  });

  return Array.from(buckets.values());
};

const buildActivityMonthLabels = (days: ActivityDay[]) => {
  const labels: Array<{ key: string; label: string; column: number }> = [];
  let lastMonth = '';
  days.forEach((day, index) => {
    if (day.isPadding) return;
    const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
    if (monthKey === lastMonth) return;
    lastMonth = monthKey;
    labels.push({
      key: monthKey,
      label: `${day.date.getMonth() + 1}月`,
      column: Math.floor(index / 7) + 1,
    });
  });
  return labels;
};

const downloadCsv = (filename: string, rows: FurnaceChartSample[]) => {
  const headers = ['timestamp', 'pv', 'sv', 'mv', 'status', 'statusCode', 'segment', 'segmentTime', 'segmentTimeSet'];
  const escapeCell = (value: unknown) => {
    if (value === undefined || value === null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = rows.map(row => [
    row.timestamp,
    row.temperature,
    row.sv,
    row.mv,
    row.status,
    row.statusCode,
    row.segment,
    row.segmentTime,
    row.segmentTimeSet,
  ].map(escapeCell).join(','));
  const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// ========== RecordingTab：实时曲线（WebSocket 推送） ==========

interface RecordingTabProps {
  furnaceState: FurnaceState;
}

function RecordingTab({ furnaceState }: RecordingTabProps) {
  const samples = furnaceState.history_data as FurnaceChartSample[];
  const isConnected = furnaceState.connection_status === 'connected';

  return (
    <div className="recording__tab">
      <div className="recording__header">
        <div>
          <h4 className="recording__title">实时加热曲线</h4>
          <span className="recording__subtitle">
            {isConnected
              ? `本次会话 ${samples.length} 个采样点`
              : '设备未连接'}
          </span>
        </div>
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => downloadCsv('furnace-session.csv', samples)}
          disabled={samples.length === 0}
        >
          导出数据
        </button>
      </div>
      <div className="recording__body">
        {!isConnected ? (
          <div className="recording__empty">连接 Furnace 后会自动绘制实时曲线</div>
        ) : samples.length === 0 ? (
          <div className="recording__empty">等待设备采样...</div>
        ) : (
          <div className="chart__container chart__container--full">
            <div className="chart__header chart__header--compact">
              <h5 className="chart__title">本次会话</h5>
              <div className="chart__legend chart__legend--inline">
                <span className="chart__legend-item chart__legend-item--pv">PV</span>
                <span className="chart__legend-item chart__legend-item--sv">SV</span>
                <span className="chart__legend-item chart__legend-item--mv">MV</span>
              </div>
            </div>
            <div className="chart__content">
              <TemperatureChart data={samples as any} is_loading={furnaceState.loading} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== HistoryTab：历史曲线与导出 ==========

type TimeRangeOption = 'past_1h' | 'past_24h' | 'past_7d' | 'past_30d' | 'past_1y' | 'custom';

const TIME_RANGE_OPTIONS: { value: TimeRangeOption; label: string; days: number }[] = [
  { value: 'past_1h', label: '过去1小时', days: 0.04 },
  { value: 'past_24h', label: '过去24小时', days: 1 },
  { value: 'past_7d', label: '过去7天', days: 7 },
  { value: 'past_30d', label: '过去一个月', days: 30 },
  { value: 'past_1y', label: '过去一年', days: 365 },
];

function HistoryTab() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('past_24h');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [samples, setSamples] = useState<FurnaceChartSample[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 根据时间范围计算开始和结束日期
  const calculateTimeRange = (range: TimeRangeOption): { start: string; end: string } => {
    const now = new Date();
    const end = now.toISOString().slice(0, 16);
    let start: Date;

    switch (range) {
      case 'past_1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case 'past_24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'past_7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'past_30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'past_1y':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start: start.toISOString().slice(0, 16), end };
  };

  // 时间范围变化时更新日期（包括初始化）
  useEffect(() => {
    if (timeRange !== 'custom') {
      const { start, end } = calculateTimeRange(timeRange);
      setStartDate(start);
      setEndDate(end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  // 判断是否显示时间按钮（过去7天及之前）或日期按钮（过去7天及之后）
  const showTimeButton = ['past_1h', 'past_24h', 'past_7d'].includes(timeRange);

  // 安全地获取日期值，防止空字符串问题
  const getDateValue = (dateStr: string, isDateTime: boolean): string => {
    if (!dateStr) return '';
    return isDateTime ? dateStr : (dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr);
  };

  const queryHistory = async () => {
    if (!startDate || !endDate) { alert('请选择开始和结束日期'); return; }
    setLoading(true);
    try {
      const sampleData = await runtimeClient.devices.furnace.samples<Array<{ timestamp: string; pv: number; sv?: number; mv?: number; statusCode?: number; segment?: number; segmentTime?: number; segmentTimeSet?: number }>>({
        from_ts: startDate,
        to: endDate,
        limit: 10000,
      });
      const normalizedSamples = sampleData.map(sample => ({
        timestamp: sample.timestamp,
        temperature: Number(sample.pv ?? 0),
        sv: sample.sv,
        mv: sample.mv,
        statusCode: sample.statusCode,
        segment: sample.segment,
        segmentTime: sample.segmentTime,
        segmentTimeSet: sample.segmentTimeSet,
      }));
      setSamples(normalizedSamples);
      const latestSample = normalizedSamples[normalizedSamples.length - 1];
      setSelectedDay(latestSample ? toDateKey(new Date(latestSample.timestamp)) : null);
    } catch (error) {
      console.error('Failed to query history:', error);
      alert('查询失败：' + error);
    } finally {
      setLoading(false);
    }
  };

  const activityDays = useMemo(
    () => buildActivityDays(startDate, endDate, samples),
    [startDate, endDate, samples]
  );
  const activityMonthLabels = useMemo(
    () => buildActivityMonthLabels(activityDays),
    [activityDays]
  );
  const activityColumns = Math.max(1, Math.ceil(activityDays.length / 7));
  const maxDayCount = Math.max(1, ...activityDays.map(day => day.count));
  const selectedDaySamples = useMemo(
    () => selectedDay
      ? samples.filter(sample => toDateKey(new Date(sample.timestamp)) === selectedDay)
      : [],
    [samples, selectedDay]
  );
  const selectedActivityDay = activityDays.find(day => day.key === selectedDay);
  const selectedDateStart = selectedActivityDay
    ? new Date(selectedActivityDay.date.getFullYear(), selectedActivityDay.date.getMonth(), selectedActivityDay.date.getDate()).toISOString()
    : startDate;
  const selectedDateEnd = selectedActivityDay
    ? new Date(selectedActivityDay.date.getFullYear(), selectedActivityDay.date.getMonth(), selectedActivityDay.date.getDate() + 1).toISOString()
    : endDate;

  return (
    <div className="history__tab">
      {/* 控制栏 - 与预设选项卡样式一致 */}
      <div className="control-bar">
        {/* 时间范围选择器 */}
        <select
          className="select preset__selector"
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRangeOption)}
        >
          {TIME_RANGE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* 开始时间输入 */}
        <input
          type={showTimeButton ? 'datetime-local' : 'date'}
          className="input preset__name-input"
          value={getDateValue(startDate, showTimeButton)}
          onChange={(e) => {
            setStartDate(showTimeButton ? e.target.value : e.target.value + 'T00:00');
            setTimeRange('custom');
          }}
        />

        {/* 开始时间的圆形按钮 */}
        <button
          className="btn btn--sm btn--secondary history-time-btn"
          title={showTimeButton ? '选择时间' : '选择日期'}
          onClick={() => {
            const input = document.querySelector('.history__tab .preset__name-input:first-of-type') as HTMLInputElement;
            input?.showPicker?.();
          }}
        >
          {showTimeButton ? '🕐' : '📅'}
        </button>

        {/* 结束时间输入 */}
        <input
          type={showTimeButton ? 'datetime-local' : 'date'}
          className="input preset__name-input"
          value={getDateValue(endDate, showTimeButton)}
          onChange={(e) => {
            setEndDate(showTimeButton ? e.target.value : e.target.value + 'T23:59');
            setTimeRange('custom');
          }}
        />

        {/* 结束时间的圆形按钮 */}
        <button
          className="btn btn--sm btn--secondary history-time-btn"
          title={showTimeButton ? '选择时间' : '选择日期'}
          onClick={() => {
            const inputs = document.querySelectorAll('.history__tab .preset__name-input') as NodeListOf<HTMLInputElement>;
            inputs[1]?.showPicker?.();
          }}
        >
          {showTimeButton ? '🕐' : '📅'}
        </button>

        {/* 查询按钮 */}
        <button
          className="btn btn--sm btn--primary"
          onClick={queryHistory}
          disabled={loading}
        >
          {loading ? '查询中...' : '查询'}
        </button>
      </div>

      <div className="recording__body">
        {loading ? (
          <div className="recording__empty">正在加载历史曲线...</div>
        ) : samples.length === 0 ? (
          <div className="recording__empty">选择时间范围后查询，页面只展示曲线；原始数据可按需导出。</div>
        ) : (
          <div className="history-insight">
            <div className="activity-map">
              <div className="activity-map__header">
                <div>
                  <h5 className="activity-map__title">采样活动</h5>
                  <span className="activity-map__subtitle">
                    {samples.length} 个采样点 · {activityDays.filter(day => day.count > 0).length} 天有数据
                  </span>
                </div>
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={() => downloadCsv(`furnace-${startDate || 'from'}-${endDate || 'to'}.csv`, samples)}
                >
                  导出数据
                </button>
              </div>
              <div className="activity-map__canvas">
                <div
                  className="activity-map__grid"
                  style={{ ['--activity-columns' as string]: activityColumns }}
                >
                  {activityDays.map(day => {
                  const intensity = day.isPadding || day.count === 0 ? 0 : Math.max(1, Math.ceil((day.count / maxDayCount) * 4));
                  const isSelected = day.key === selectedDay;
                  const title = day.count > 0
                    ? `${formatActivityLabel(day.date)} · ${day.count} 点 · ${day.minTemperature?.toFixed(1)}-${day.maxTemperature?.toFixed(1)}°C`
                    : `${formatActivityLabel(day.date)} · 无采样`;
                  return (
                    <button
                      key={day.key}
                      className={`activity-map__day activity-map__day--level-${intensity} ${day.isPadding ? 'is-padding' : ''} ${isSelected ? 'is-selected' : ''}`}
                      title={title}
                      onClick={() => !day.isPadding && day.count > 0 && setSelectedDay(day.key)}
                      disabled={day.isPadding || day.count === 0}
                    >
                      <span>{day.date.getDate()}</span>
                    </button>
                  );
                })}
                </div>
                <div
                  className="activity-map__months"
                  style={{ ['--activity-columns' as string]: activityColumns }}
                >
                  {activityMonthLabels.map(month => (
                    <span
                      key={month.key}
                      className="activity-map__month"
                      style={{ gridColumn: month.column }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="chart__container chart__container--full">
              <div className="chart__header chart__header--compact">
                <h5 className="chart__title">
                  {selectedActivityDay ? `${formatActivityLabel(selectedActivityDay.date)} 曲线 · ${selectedDaySamples.length} 点` : '选择有数据的日期'}
                </h5>
                <div className="chart__legend chart__legend--inline">
                  <span className="chart__legend-item chart__legend-item--pv">PV</span>
                  <span className="chart__legend-item chart__legend-item--sv">SV</span>
                  <span className="chart__legend-item chart__legend-item--mv">MV</span>
                </div>
              </div>
              <div className="chart__content">
                <TemperatureChart
                  data={selectedDaySamples as any}
                  is_loading={false}
                  xDomainStart={selectedDateStart}
                  xDomainEnd={selectedDateEnd}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
