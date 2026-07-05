import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import { StatusPanel } from './StatusPanel';
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
import { readDeveloperMode, DEVELOPER_MODE_EVENT } from '../../modules/simulator/developerMode';
import { SpacedCjkText } from '../common/SpacedCjkText';


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
  const [activeTab, setActiveTab] = useState<'monitoring' | 'segments' | 'history'>('monitoring');
  const [contentTab, setContentTab] = useState<'monitoring' | 'segments' | 'history'>('monitoring');
  const [mountedTabs, setMountedTabs] = useState({
    monitoring: true,
    segments: false,
    history: false,
  });
  const pendingContentTabRef = useRef<number | null>(null);
  const isConnected = furnaceState.connection_status === 'connected';
  const [developerMode, setDeveloperMode] = useState(() => readDeveloperMode());

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setDeveloperMode(typeof ce.detail === 'boolean' ? ce.detail : readDeveloperMode());
    };
    window.addEventListener(DEVELOPER_MODE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(DEVELOPER_MODE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

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
  const effectivePorts = developerMode
    ? Array.from(new Set(['COM_SIMULATOR', ...ports]))
    : ports;

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;
  const activeTabIndex = {
    monitoring: 0,
    segments: 1,
    history: 2,
  }[activeTab];
  const tabListStyle = {
    '--device-tab-index': activeTabIndex,
    '--device-tab-count': 3,
  } as React.CSSProperties;
  const isFullWidthTab = contentTab === 'segments' || contentTab === 'history';
  const activateTab = (tab: 'monitoring' | 'segments' | 'history') => {
    if (pendingContentTabRef.current !== null) {
      window.clearTimeout(pendingContentTabRef.current);
      pendingContentTabRef.current = null;
    }
    setMountedTabs((current) => (
      current[tab]
        ? current
        : { ...current, [tab]: true }
    ));
    setActiveTab(tab);
    if (tab === 'segments' && contentTab !== 'segments') {
      pendingContentTabRef.current = window.setTimeout(() => {
        setContentTab('segments');
        pendingContentTabRef.current = null;
      }, 240);
      return;
    }
    setContentTab(tab);
  };

  useEffect(() => () => {
    if (pendingContentTabRef.current !== null) {
      window.clearTimeout(pendingContentTabRef.current);
    }
  }, []);

  useEffect(() => {
    const browserWindow = typeof window !== 'undefined' ? window : null;
    let timeoutIds: number[] = [];
    let idleIds: number[] = [];

    const scheduleMount = (tab: 'segments', delay: number) => {
      const mountTab = () => {
        setMountedTabs((current) => (
          current[tab]
            ? current
            : { ...current, [tab]: true }
        ));
      };

      if (browserWindow && 'requestIdleCallback' in browserWindow) {
        const timeoutId = browserWindow.setTimeout(() => {
          const idleId = browserWindow.requestIdleCallback(() => {
            mountTab();
          }, { timeout: 240 });
          idleIds.push(idleId);
        }, delay);
        timeoutIds.push(timeoutId);
        return;
      }

      if (!browserWindow) {
        mountTab();
        return;
      }

      const timeoutId = browserWindow.setTimeout(mountTab, delay);
      timeoutIds.push(timeoutId);
    };

    scheduleMount('segments', 80);

    return () => {
      if (!browserWindow) {
        return;
      }
      timeoutIds.forEach((id) => browserWindow.clearTimeout(id));
      if ('cancelIdleCallback' in browserWindow) {
        idleIds.forEach((id) => browserWindow.cancelIdleCallback(id));
      }
    };
  }, []);

  return (
      <div
        className="modal__content device-modal-content workspace-device-modal workspace-device-modal--furnace"
      >
        <div className="modal__header">
          <h3 className="device-title" aria-label="AI-518P 温度控制器">
            <span className="device-title__model" aria-hidden="true">AI-518P</span>
            <SpacedCjkText text="温度控制器" className="device-title__name cjk-spaced" />
          </h3>
          <div className="tabs">
            {/* 选项卡导航 */}
            <div className="tabs__list" style={tabListStyle}>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'monitoring' ? 'is-active' : ''}`}
                onClick={() => activateTab('monitoring')}
              >
                <SpacedCjkText text="实时监控" />
              </button>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'segments' ? 'is-active' : ''}`}
                onClick={() => activateTab('segments')}
              >
                <SpacedCjkText text="程序段" />
              </button>
              <button
                className={`btn btn--secondary btn--sm tabs__trigger ${activeTab === 'history' ? 'is-active' : ''}`}
                onClick={() => activateTab('history')}
              >
                <SpacedCjkText text="历史曲线" />
              </button>
            </div>
          </div>
          <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={onClose}>✕</button>
        </div>

        {/* 双列布局容器 */}
        <div className="modal__body">
          <div className={`furnace-modal ${isFullWidthTab ? 'furnace-modal--full' : ''}`}>
            {/* 左侧主内容区域 (2/3宽度) */}
            <div className="furnace-modal__main">
              {/* 选项卡内容 */}
              <div className="tabs__content">
                <div className={`tabs__panel ${contentTab === 'monitoring' ? 'is-active' : 'is-inactive'}`}>
                  <StatusPanel
                    furnaceState={furnaceState}
                    furnaceControls={furnaceControls}
                  />
                </div>
                {mountedTabs.segments && (
                  <div className={`tabs__panel ${contentTab === 'segments' ? 'is-active' : 'is-inactive'}`}>
                    <div className="furnace-segments-combo">
                      <section className="furnace-segments-combo__pane">
                        <ProgramEditor
                          furnaceState={furnaceState}
                          furnaceControls={furnaceControls}
                        />
                      </section>
                      <section className="furnace-segments-combo__pane">
                        <PresetManager
                          furnaceState={furnaceState}
                          furnaceControls={furnaceControls}
                        />
                      </section>
                    </div>
                  </div>
                )}
                {mountedTabs.history && (
                  <div className={`tabs__panel ${contentTab === 'history' ? 'is-active' : 'is-inactive'}`}>
                    <HistoryTab isActive={contentTab === 'history'} />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧区域 (1/3宽度) */}
            <div className={`furnace-modal__sidebar ${isFullWidthTab ? 'is-collapsed' : ''}`}>
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
              {developerMode && (
                <>
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
                </>
              )}
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

type ActivityDaySummary = {
  key: string;
  date: Date;
  count: number;
  maxTemperature: number | null;
  runningMs: number;
};

type FurnaceActivitySummaryRow = {
  day: string;
  slotIndex: number;
  count: number;
  maxTemperature: number | null;
  runningMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVITY_DAYS = 60;
const ACTIVITY_COLUMN_WIDTH_PX = 21;
const ACTIVITY_MONTH_GAP_WIDTH_PX = 12;
const ACTIVITY_COLUMN_GAP_WIDTH_PX = 6;
const ACTIVITY_SLOT_COUNT = 6;
const ACTIVITY_SLOT_HOURS = 4;
const ACTIVITY_TOOLTIP_WIDTH = 220;
const ACTIVITY_TOOLTIP_HEIGHT = 152;
const ACTIVITY_TOOLTIP_GAP = 14;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatActivityLabel = (date: Date) => {
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const formatActivityDayLabel = (date: Date) => {
  return String(date.getDate()).padStart(2, '0');
};

const formatActivityDate = (date: Date) => {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const formatActivityDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0 min';
  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  return `${minutes} min`;
};

const formatActivitySlotLabel = (slotIndex: number) => {
  const startHour = slotIndex * ACTIVITY_SLOT_HOURS;
  const endHour = startHour + ACTIVITY_SLOT_HOURS;
  return `${String(startHour).padStart(2, '0')}-${String(endHour).padStart(2, '0')}h`;
};

const shouldShowActivityMonth = (days: Array<{ date: Date }>, index: number) => {
  if (index === 0) return true;
  const previousDate = days[index - 1]?.date;
  const currentDate = days[index]?.date;
  return Boolean(previousDate && currentDate && (
    previousDate.getFullYear() !== currentDate.getFullYear()
    || previousDate.getMonth() !== currentDate.getMonth()
  ));
};

const buildRecentActivityDays = (endDate: Date, dayCount = MAX_ACTIVITY_DAYS) => {
  const end = startOfDay(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - (dayCount - 1));
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = toDateKey(date);
    return { key, date };
  });
};

const resolveCssLength = (element: Element, propertyName: string, fallbackPx: number) => {
  const value = window.getComputedStyle(element).getPropertyValue(propertyName).trim();
  if (!value) return fallbackPx;
  if (value.endsWith('px')) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallbackPx;
  }
  if (value.endsWith('rem')) {
    const parsed = Number.parseFloat(value);
    const rootSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(parsed) && Number.isFinite(rootSize) ? parsed * rootSize : fallbackPx;
  }
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.width = value;
  element.appendChild(probe);
  const measured = probe.getBoundingClientRect().width;
  probe.remove();
  if (Number.isFinite(measured) && measured > 0) return measured;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallbackPx;
};

const calculateActivityLayoutWidth = (
  days: Array<{ date: Date }>,
  cellWidth: number,
  gapWidth: number,
  monthGapWidth: number
) => {
  const monthGapCount = days.filter((_, index) => (
    index > 0 && shouldShowActivityMonth(days, index)
  )).length;
  const gridColumnCount = days.length + monthGapCount;
  return (
    (days.length * cellWidth)
    + (monthGapCount * monthGapWidth)
    + (Math.max(0, gridColumnCount - 1) * gapWidth)
  );
};

const buildActivitySummaries = (
  days: Array<{ key: string; date: Date }>,
  rows: FurnaceActivitySummaryRow[]
) => {
  const summaries = new Map<string, ActivityDaySummary>();
  const slots = new Map<string, number[]>();

  days.forEach((day) => {
    summaries.set(day.key, {
      key: day.key,
      date: day.date,
      count: 0,
      maxTemperature: null,
      runningMs: 0,
    });
    slots.set(day.key, Array.from({ length: ACTIVITY_SLOT_COUNT }, () => 0));
  });

  rows.forEach((row) => {
    const summary = summaries.get(row.day);
    const daySlots = slots.get(row.day);
    if (!summary || !daySlots) return;

    const count = Number(row.count);
    summary.count += Number.isFinite(count) ? count : 0;
    const temperature = Number(row.maxTemperature);
    if (Number.isFinite(temperature)) {
      summary.maxTemperature = summary.maxTemperature === null ? temperature : Math.max(summary.maxTemperature, temperature);
    }

    const rawSlotIndex = Number(row.slotIndex);
    const slotIndex = Number.isFinite(rawSlotIndex)
      ? Math.max(0, Math.min(ACTIVITY_SLOT_COUNT - 1, Math.floor(rawSlotIndex)))
      : 0;
    daySlots[slotIndex] += Number.isFinite(count) ? count : 0;
    summary.runningMs += Number(row.runningMs) || 0;
  });

  return { summaries, slots };
};

// ========== HistoryTab: history chart ==========

type ActivityHoverState = {
  key: string;
  slotIndex: number;
  x: number;
  y: number;
};

function HistoryTab({ isActive }: { isActive: boolean }) {
  const [rangeEnd, setRangeEnd] = useState(() => new Date());
  const [summaryRows, setSummaryRows] = useState<FurnaceActivitySummaryRow[]>([]);
  const [chartSamples, setChartSamples] = useState<FurnaceChartSample[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<ActivityHoverState | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);
  const [visibleDayCount, setVisibleDayCount] = useState(30);
  const chartSectionRef = useRef<HTMLDivElement>(null);
  const activityMapRef = useRef<HTMLElement>(null);
  const activityCanvasRef = useRef<HTMLDivElement>(null);

  const queryActivityDays = useMemo(() => buildRecentActivityDays(rangeEnd, MAX_ACTIVITY_DAYS), [rangeEnd]);
  const activityDays = useMemo(
    () => queryActivityDays.slice(-Math.min(visibleDayCount, MAX_ACTIVITY_DAYS)),
    [queryActivityDays, visibleDayCount]
  );
  const rangeStart = activityDays[0]?.date ?? new Date(rangeEnd.getTime() - (MAX_ACTIVITY_DAYS - 1) * DAY_MS);
  const rangeEndExclusive = useMemo(() => {
    const end = startOfDay(rangeEnd);
    end.setDate(end.getDate() + 1);
    return end;
  }, [rangeEnd]);

  const loadActivitySummary = async () => {
    setSummaryLoading(true);
    const now = new Date();
    const days = buildRecentActivityDays(now, MAX_ACTIVITY_DAYS);
    const start = days[0]?.date ?? new Date(now.getTime() - (MAX_ACTIVITY_DAYS - 1) * DAY_MS);
    const end = startOfDay(now);
    end.setDate(end.getDate() + 1);

    try {
      const rows = await runtimeClient.devices.furnace.activitySummary<FurnaceActivitySummaryRow[]>({
        from_ts: start.toISOString(),
        to: end.toISOString(),
        slot_hours: ACTIVITY_SLOT_HOURS,
      });

      setRangeEnd(now);
      setSummaryRows(rows);
      setHasLoadedSummary(true);
    } catch (error) {
      console.error('Failed to query furnace activity summary:', error);
      setSummaryRows([]);
      setSelectedDay(null);
      setChartSamples([]);
      setHasLoadedSummary(true);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive || hasLoadedSummary) return;
    void loadActivitySummary();
  }, [hasLoadedSummary, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const updateVisibleDayCount = () => {
      const element = activityCanvasRef.current;
      if (!element) return;
      const availableWidth = element.clientWidth;
      if (!Number.isFinite(availableWidth) || availableWidth <= 0) return;
      const cellWidth = resolveCssLength(element, '--activity-cell', ACTIVITY_COLUMN_WIDTH_PX);
      const gapWidth = resolveCssLength(element, '--activity-gap', ACTIVITY_COLUMN_GAP_WIDTH_PX);
      const monthGapWidth = resolveCssLength(element, '--activity-month-gap', ACTIVITY_MONTH_GAP_WIDTH_PX);
      const usableWidth = Math.max(0, availableWidth);
      let nextCount = 1;
      for (let count = 1; count <= MAX_ACTIVITY_DAYS; count += 1) {
        const days = buildRecentActivityDays(rangeEnd, count);
        const estimatedWidth = calculateActivityLayoutWidth(days, cellWidth, gapWidth, monthGapWidth);
        if (estimatedWidth > usableWidth) break;
        nextCount = count;
      }
      setVisibleDayCount(previous => (previous === nextCount ? previous : nextCount));
    };

    updateVisibleDayCount();
    const element = activityCanvasRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateVisibleDayCount);
      return () => window.removeEventListener('resize', updateVisibleDayCount);
    }

    const observer = new ResizeObserver(updateVisibleDayCount);
    observer.observe(element);
    window.addEventListener('resize', updateVisibleDayCount);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateVisibleDayCount);
    };
  }, [isActive, summaryLoading, rangeEnd, summaryRows.length]);

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHoveredSlot(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  const { summaries, slots } = useMemo(
    () => buildActivitySummaries(activityDays, summaryRows),
    [activityDays, summaryRows]
  );

  const maxSlotCount = useMemo(() => {
    const allCounts = Array.from(slots.values()).flat();
    return Math.max(1, ...allCounts);
  }, [slots]);

  const selectedActivityDay = selectedDay ? summaries.get(selectedDay) : undefined;
  const selectedDateStart = selectedActivityDay
    ? startOfDay(selectedActivityDay.date).toISOString()
    : rangeStart.toISOString();
  const selectedDateEnd = selectedActivityDay
    ? new Date(selectedActivityDay.date.getFullYear(), selectedActivityDay.date.getMonth(), selectedActivityDay.date.getDate() + 1).toISOString()
    : rangeEndExclusive.toISOString();
  const hoveredSummary = hoveredSlot ? summaries.get(hoveredSlot.key) : undefined;
  const hoveredSlotCount = hoveredSlot ? slots.get(hoveredSlot.key)?.[hoveredSlot.slotIndex] ?? 0 : 0;
  const hasActivity = summaryRows.some(row => row.count > 0);
  const activityGridLayout = useMemo(() => {
    const dayColumns = new Map<string, number>();
    const columns: string[] = [];
    let gridColumn = 1;

    activityDays.forEach((day, index) => {
      if (index > 0 && shouldShowActivityMonth(activityDays, index)) {
        columns.push('var(--activity-month-gap)');
        gridColumn += 1;
      }

      columns.push('var(--activity-cell)');
      dayColumns.set(day.key, gridColumn);
      gridColumn += 1;
    });

    return {
      dayColumns,
      gridTemplateColumns: columns.join(' '),
    };
  }, [activityDays]);

  const loadDaySamples = async (dayKey: string) => {
    const day = activityDays.find(item => item.key === dayKey);
    if (!day) return;
    const start = startOfDay(day.date);
    const end = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate() + 1);

    setChartLoading(true);
    try {
      const sampleData = await runtimeClient.devices.furnace.samples<Array<{
        timestamp: string;
        pv: number;
        sv?: number;
        mv?: number;
        status?: string;
        statusCode?: number;
        segment?: number;
        segmentTime?: number;
        segmentTimeSet?: number;
      }>>({
        from_ts: start.toISOString(),
        to: end.toISOString(),
        limit: 10000,
      });

      setChartSamples(sampleData.map(sample => ({
        timestamp: sample.timestamp,
        temperature: Number(sample.pv ?? 0),
        sv: sample.sv,
        mv: sample.mv,
        status: sample.status,
        statusCode: sample.statusCode,
        segment: sample.segment,
        segmentTime: sample.segmentTime,
        segmentTimeSet: sample.segmentTimeSet,
      })));
    } catch (error) {
      console.error('Failed to query furnace daily samples:', error);
      setChartSamples([]);
    } finally {
      setChartLoading(false);
    }
  };

  const handleSelectActivitySlot = (dayKey: string) => {
    setSelectedDay(dayKey);
    setChartSamples([]);
    void loadDaySamples(dayKey);
    requestAnimationFrame(() => {
      chartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const showActivityTooltip = (dayKey: string, slotIndex: number, element: HTMLElement) => {
    const mapRect = activityMapRef.current?.getBoundingClientRect();
    const slotRect = element.getBoundingClientRect();
    if (!mapRect) return;

    const anchorX = slotRect.left - mapRect.left + slotRect.width / 2;
    const anchorY = slotRect.top - mapRect.top + slotRect.height / 2;
    const shouldFlipX = anchorX + ACTIVITY_TOOLTIP_GAP + ACTIVITY_TOOLTIP_WIDTH > mapRect.width;
    const shouldFlipY = anchorY + ACTIVITY_TOOLTIP_GAP + ACTIVITY_TOOLTIP_HEIGHT > mapRect.height;
    const rawX = shouldFlipX
      ? anchorX - ACTIVITY_TOOLTIP_GAP - ACTIVITY_TOOLTIP_WIDTH
      : anchorX + ACTIVITY_TOOLTIP_GAP;
    const rawY = shouldFlipY
      ? anchorY - ACTIVITY_TOOLTIP_GAP - ACTIVITY_TOOLTIP_HEIGHT
      : anchorY + ACTIVITY_TOOLTIP_GAP;
    const maxX = Math.max(8, mapRect.width - ACTIVITY_TOOLTIP_WIDTH - 8);
    const maxY = Math.max(8, mapRect.height - ACTIVITY_TOOLTIP_HEIGHT - 8);

    setHoveredSlot({
      key: dayKey,
      slotIndex,
      x: Math.min(Math.max(rawX, 8), maxX),
      y: Math.min(Math.max(rawY, 8), maxY),
    });
  };

  return (
    <div className="history__tab">
      <div className="recording__body">
        {summaryLoading || !hasLoadedSummary ? (
          <div className="recording__empty"><SpacedCjkText text={'\u6b63\u5728\u52a0\u8f7d\u6700\u8fd1\u6700\u591a60\u5929\u91c7\u6837\u6d3b\u52a8...'} /></div>
        ) : !hasActivity ? (
          <div className="recording__empty"><SpacedCjkText text={'\u6700\u8fd1\u6700\u591a60\u5929\u6682\u65e0\u91c7\u6837\u6d3b\u52a8'} /></div>
        ) : (
          <div className="history-insight">
            <section className="activity-map" ref={activityMapRef} onMouseLeave={() => setHoveredSlot(null)}>
              <div className="activity-map__timeline">
                <div className="activity-map__slot-labels" aria-hidden="true">
                  {Array.from({ length: ACTIVITY_SLOT_COUNT }, (_, slotIndex) => (
                    <span key={slotIndex}>{formatActivitySlotLabel(slotIndex)}</span>
                  ))}
                </div>
                <div className="activity-map__canvas" ref={activityCanvasRef}>
                  <div className="activity-map__month-labels" style={{ gridTemplateColumns: activityGridLayout.gridTemplateColumns }} aria-hidden="true">
                    {activityDays.map((day, index) => {
                      const gridColumn = activityGridLayout.dayColumns.get(day.key) ?? index + 1;
                      return (
                        <span key={day.key} className="activity-map__month-label" style={{ gridColumn }}>
                          {shouldShowActivityMonth(activityDays, index) ? `${day.date.getMonth() + 1}\u6708` : ''}
                        </span>
                      );
                    })}
                  </div>
                  <div className="activity-map__grid" style={{ gridTemplateColumns: activityGridLayout.gridTemplateColumns }}>
                    {activityDays.flatMap((day, dayIndex) => {
                      const summary = summaries.get(day.key);
                      const daySlots = slots.get(day.key) ?? [];
                      const gridColumn = activityGridLayout.dayColumns.get(day.key) ?? dayIndex + 1;
                      return Array.from({ length: ACTIVITY_SLOT_COUNT }, (_, slotIndex) => {
                        const count = daySlots[slotIndex] ?? 0;
                        const intensity = count === 0 ? 0 : Math.max(1, Math.ceil((count / maxSlotCount) * 4));
                        const isSelected = selectedDay === day.key;
                        const label = formatActivityDate(day.date) + ' ' + formatActivitySlotLabel(slotIndex) + '\uff0c' + count + ' \u4e2a\u91c7\u6837\u70b9';
                        return (
                          <button
                            key={day.key + '-' + slotIndex}
                            type="button"
                            className={'activity-map__slot activity-map__slot--level-' + intensity + (isSelected ? ' is-selected' : '')}
                            style={{ gridColumn, gridRow: slotIndex + 1 }}
                            aria-label={label}
                            disabled={!summary || count === 0}
                            onMouseEnter={(event) => showActivityTooltip(day.key, slotIndex, event.currentTarget)}
                            onMouseMove={(event) => showActivityTooltip(day.key, slotIndex, event.currentTarget)}
                            onFocus={(event) => {
                              showActivityTooltip(day.key, slotIndex, event.currentTarget);
                            }}
                            onBlur={() => setHoveredSlot(null)}
                            onClick={() => count > 0 && handleSelectActivitySlot(day.key)}
                          />
                        );
                      });
                    })}
                  </div>
                  <div className="activity-map__day-labels" style={{ gridTemplateColumns: activityGridLayout.gridTemplateColumns }} aria-hidden="true">
                    {activityDays.map((day, index) => {
                      const labelInterval = activityDays.length > 48 ? 6 : activityDays.length > 36 ? 5 : activityDays.length > 28 ? 4 : activityDays.length > 18 ? 3 : 2;
                      const isMonthFirstDay = day.date.getDate() === 1;
                      const shouldShowLabel = index === 0
                        || index === activityDays.length - 1
                        || isMonthFirstDay
                        || (index % labelInterval === 0 && index < activityDays.length - 2);
                      const gridColumn = activityGridLayout.dayColumns.get(day.key) ?? index + 1;
                      return (
                        <span key={day.key} className="activity-map__day-label" style={{ gridColumn }}>
                          {shouldShowLabel ? formatActivityDayLabel(day.date) : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {hoveredSlot && hoveredSummary && hoveredSlotCount > 0 && (
                <div className="activity-map__tooltip" style={{ left: hoveredSlot.x, top: hoveredSlot.y }} role="status">
                  <strong>{formatActivityDate(hoveredSummary.date)}</strong>
                  <span>{formatActivitySlotLabel(hoveredSlot.slotIndex)}</span>
                  <span><SpacedCjkText text={'\u8fd0\u884c\u65f6\u957f ' + formatActivityDuration(hoveredSummary.runningMs)} /></span>
                  <span><SpacedCjkText text={'\u6700\u9ad8\u6e29\u5ea6 ' + (hoveredSummary.maxTemperature === null ? '--' : hoveredSummary.maxTemperature.toFixed(1) + ' \u00b0C')} /></span>
                  <span><SpacedCjkText text={'\u91c7\u6837\u70b9\u6570 ' + String(hoveredSummary.count)} /></span>
                </div>
              )}
            </section>

            <div ref={chartSectionRef} className="chart__container chart__container--full">
              <div className="chart__header chart__header--compact">
                <h5 className="chart__title">
                  {selectedActivityDay
                    ? <SpacedCjkText text={formatActivityLabel(selectedActivityDay.date) + ' \u66f2\u7ebf \u00b7 ' + chartSamples.length + ' \u70b9'} />
                    : <SpacedCjkText text={'\u9009\u62e9\u6709\u6570\u636e\u7684\u65e5\u671f'} />}
                </h5>
                <div className="chart__legend chart__legend--inline">
                  <span className="chart__legend-item chart__legend-item--pv">PV</span>
                  <span className="chart__legend-item chart__legend-item--sv">SV</span>
                  <span className="chart__legend-item chart__legend-item--mv">MV</span>
                </div>
              </div>
              <div className="chart__content">
                {selectedActivityDay ? (
                  <TemperatureChart
                    data={chartSamples as any}
                    is_loading={chartLoading}
                    xDomainStart={selectedDateStart}
                    xDomainEnd={selectedDateEnd}
                  />
                ) : (
                  <div className="recording__empty"><SpacedCjkText text={'\u70b9\u51fb\u4e0a\u65b9\u65f6\u6bb5\u540e\u52a0\u8f7d\u5f53\u5929\u66f2\u7ebf'} /></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
