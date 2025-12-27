import React, { useState, useEffect } from 'react';
import { Portal } from '../../components/Portal';
import type { FurnaceState, FurnaceControls } from './useFurnace';
import { StatusPanel } from './StatusPanel';
import { ProgramEditor } from './ProgramEditor';
import { PresetManager } from './PresetManager';
import { ConnectionPanel } from './ConnectionPanel';
import { FurnaceApi } from './furnaceApi';


interface DeviceModalProps {
  device: 'furnace';
  onClose: () => void;
  modalTop: number;
  modalLeft: number;
  modalWidth: number;
  modalHeight: number;
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  device,
  onClose,
  modalTop,
  modalLeft,
  modalWidth,
  modalHeight,
  furnaceState,
  furnaceControls
}) => {
  if (!device) return null;

  // 当前选项卡状态
  const [activeTab, setActiveTab] = useState<'monitoring' | 'program' | 'presets' | 'recording' | 'history'>('monitoring');

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  return (
    <Portal isOpen={true} onClose={onClose} pointerEvents="auto" id="furnace-modal-portal">
      <div
        className="modal_content device-modal-content"
        style={{
          position: 'fixed',
          left: `calc(var(--sidebar-l))`,
          top: `calc(var(--canvas-t))`,
          width: 'calc(100vw - 2 * var(--space))',
          height: 'calc(100vh - 2 * var(--canvas-b))',
          background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.4) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 'var(--effect-xl)',
          backdropFilter: 'blur(var(--effect-xl))',
          WebkitBackdropFilter: 'blur(var(--effect-xl))',
          boxShadow: '0 16px 64px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'modal_scale_in 0.3s var(--ease-bounce)',
          isolation: 'isolate',
          pointerEvents: 'auto',
          zIndex: 2000
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal_header">
          <h3>AI-518P 温度控制器</h3>
          <div className="tabs">
            {/* 选项卡导航 */}
            <div className="tabs_list">
              <button
                className={`btn_base btn_layout btn_style_common btn_medium btn_secondary tabs_trigger ${activeTab === 'monitoring' ? 'active' : ''}`}
                onClick={() => setActiveTab('monitoring')}
              >
                实时监控
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_medium btn_secondary tabs_trigger ${activeTab === 'program' ? 'active' : ''}`}
                onClick={() => setActiveTab('program')}
              >
                设置程序段
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_medium btn_secondary tabs_trigger ${activeTab === 'presets' ? 'active' : ''}`}
                onClick={() => setActiveTab('presets')}
              >
                预设程序段
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_medium btn_secondary tabs_trigger ${activeTab === 'recording' ? 'active' : ''}`}
                onClick={() => setActiveTab('recording')}
              >
                数据记录
              </button>
              <button
                className={`btn_base btn_layout btn_style_common btn_medium btn_secondary tabs_trigger ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                历史数据
              </button>
            </div>
          </div>
          <button className="modal_close" onClick={onClose}>×</button>
        </div>

        {/* 双列布局容器 */}
        <div className="modal_body">
          <div className="furnace-modal-layout">
            {/* 左侧主内容区域 (2/3宽度) */}
            <div className="furnace-modal-main">
              {/* 选项卡内容 */}
              <div className="tabs_content">
                {activeTab === 'monitoring' && (
                  <div className="tabs_panel active">
                    <StatusPanel
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'program' && (
                  <div className="tabs_panel active">
                    <ProgramEditor
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'presets' && (
                  <div className="tabs_panel active">
                    <PresetManager
                      furnaceState={furnaceState}
                      furnaceControls={furnaceControls}
                    />
                  </div>
                )}
                {activeTab === 'recording' && (
                  <div className="tabs_panel active">
                    <RecordingTab furnaceState={furnaceState} />
                  </div>
                )}
                {activeTab === 'history' && (
                  <div className="tabs_panel active">
                    <HistoryTab />
                  </div>
                )}
              </div>
            </div>

            {/* 右侧区域 (1/3宽度) */}
            <div className="furnace-modal-sidebar">
              <div className="card">
                <div className="card_body">
                  <ConnectionPanel
                    furnaceState={furnaceState}
                    furnaceControls={furnaceControls}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ========== RecordingTab：实时数据表格（WebSocket 推送） ==========

interface RecordingTabProps {
  furnaceState: FurnaceState;
}

function RecordingTab({ furnaceState }: RecordingTabProps) {
  // 使用 WebSocket 推送的实时数据（内存缓存，无延迟）
  const samples = furnaceState.history_data;
  const isConnected = furnaceState.connection_status === 'connected';

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="recording-tab">
      <div className="recording-header">
        <h4 className="recording-title">实时数据记录</h4>
        <span className="recording-subtitle">
          {isConnected
            ? `已记录 ${samples.length} 条（本次会话）`
            : '设备未连接'}
        </span>
      </div>
      <div className="recording-body">
        {!isConnected ? (
          <div className="text-secondary">请先连接 Furnace 设备以开始记录</div>
        ) : samples.length === 0 ? (
          <div className="text-secondary">等待数据...</div>
        ) : (
          <div className="recording-table-wrapper">
            <table className="data-table data-table-sm">
              <thead><tr>
                <th>时间</th><th>PV</th><th>SV</th><th>MV</th>
                <th>状态</th><th>段</th><th>段时间</th><th>段设定</th>
              </tr></thead>
              <tbody>
                {[...samples].reverse().map((sample, idx) => (
                  <tr key={`${sample.timestamp}-${idx}`}>
                    <td>{formatTime(sample.timestamp)}</td>
                    <td>{(sample.temperature ?? 0).toFixed(1)}°C</td>
                    <td>{(sample.sv ?? 0).toFixed(1)}°C</td>
                    <td>{(sample.mv ?? 0).toFixed(1)}%</td>
                    <td>{sample.status ?? '-'}</td>
                    <td>{sample.segment ?? '-'}</td>
                    <td>{sample.segment_time ?? '-'}</td>
                    <td>{sample.segment_time_set ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== HistoryTab：历史数据表格（带事件补全） ==========

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
  const [samples, setSamples] = useState<Array<{ timestamp: string; pv: number; sv: number; mv: number; status_code?: number }>>([]);
  const [loading, setLoading] = useState(false);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

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

  const mapStatusCode = (code: number): string => {
    switch (code) {
      case 0: return '运行';
      case 4: return '暂停';
      case 12: return '停止';
      default: return '未知';
    }
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const calculateDays = (from: string, to: string): number => {
    return (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000);
  };

  const queryHistory = async () => {
    if (!startDate || !endDate) { alert('请选择开始和结束日期'); return; }
    setLoading(true);
    try {
      const sampleData = await FurnaceApi.queryFurnaceSamples({ from: startDate, to: endDate, limit: 10000 });
      const eventData = await FurnaceApi.getFurnaceEvents({ from: startDate, to: endDate });
      const enriched = enrichWithEvents(sampleData, eventData);
      setSamples(enriched);
    } catch (error) {
      console.error('Failed to query history:', error);
      alert('查询失败：' + error);
    } finally {
      setLoading(false);
    }
  };

  const enrichWithEvents = (
    sampleData: Array<{ timestamp: string; pv: number; sv: number; mv: number; status_code?: number }>,
    events: Array<{ timestamp: string; status_code: number }>
  ): Array<{ timestamp: string; pv: number; sv: number; mv: number; status_code?: number }> => {
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sampleData.map(sample => {
      const nearestEvent = sortedEvents.filter(e => new Date(e.timestamp).getTime() <= new Date(sample.timestamp).getTime()).reduce((nearest, current) => {
        if (!nearest) return current;
        return (new Date(sample.timestamp).getTime() - new Date(current.timestamp).getTime()) <
          (new Date(sample.timestamp).getTime() - new Date(nearest.timestamp).getTime()) ? current : nearest;
      }, sortedEvents[0]);
      return { ...sample, status_code: nearestEvent?.status_code };
    });
  };

  const isArchiveRange = startDate && endDate && calculateDays(startDate, endDate) > 30;

  return (
    <div className="history-tab">
      {/* 控制栏 - 与预设选项卡样式一致 */}
      <div className="control-bar">
        {/* 时间范围选择器 */}
        <select
          className="preset-selector"
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
          className="preset-name-input"
          value={getDateValue(startDate, showTimeButton)}
          onChange={(e) => {
            setStartDate(showTimeButton ? e.target.value : e.target.value + 'T00:00');
            setTimeRange('custom');
          }}
        />

        {/* 开始时间的圆形按钮 */}
        <button
          className="btn_base btn_layout btn_style_common btn_small btn_secondary history-time-btn"
          title={showTimeButton ? '选择时间' : '选择日期'}
          onClick={() => {
            const input = document.querySelector('.history-tab .preset-name-input:first-of-type') as HTMLInputElement;
            input?.showPicker?.();
          }}
        >
          {showTimeButton ? '🕐' : '📅'}
        </button>

        {/* 结束时间输入 */}
        <input
          type={showTimeButton ? 'datetime-local' : 'date'}
          className="preset-name-input"
          value={getDateValue(endDate, showTimeButton)}
          onChange={(e) => {
            setEndDate(showTimeButton ? e.target.value : e.target.value + 'T23:59');
            setTimeRange('custom');
          }}
        />

        {/* 结束时间的圆形按钮 */}
        <button
          className="btn_base btn_layout btn_style_common btn_small btn_secondary history-time-btn"
          title={showTimeButton ? '选择时间' : '选择日期'}
          onClick={() => {
            const inputs = document.querySelectorAll('.history-tab .preset-name-input') as NodeListOf<HTMLInputElement>;
            inputs[1]?.showPicker?.();
          }}
        >
          {showTimeButton ? '🕐' : '📅'}
        </button>

        {/* 查询按钮 */}
        <button
          className="btn_base btn_layout btn_style_common btn_small btn_primary"
          onClick={queryHistory}
          disabled={loading}
        >
          {loading ? '查询中...' : '查询'}
        </button>
      </div>

      {/* 数据表格 */}
      {!loading && samples.length > 0 && (
        <div className="recording-body">
          <div className="recording-table-wrapper">
            <table className="data-table data-table-sm">
              <thead><tr>
                <th>序号</th><th>记录时间</th><th>实际温度</th>
                {!isArchiveRange && <th>设定温度</th>}
                {!isArchiveRange && <th>输出功率</th>}
                {!isArchiveRange && <th>设备状态</th>}
                <th>程序段</th><th>段内时间</th><th>段设定时间</th>
              </tr></thead>
              <tbody>
                {samples
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((sample, idx) => (
                    <tr key={sample.timestamp}>
                      <td>{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td>{formatTime(sample.timestamp)}</td>
                      <td>{(sample.pv ?? 0).toFixed(1)}°C</td>
                      {!isArchiveRange && <td>{(sample.sv ?? 0).toFixed(1)}°C</td>}
                      {!isArchiveRange && <td>{(sample.mv ?? 0).toFixed(1)}%</td>}
                      {!isArchiveRange && <td>{mapStatusCode(sample.status_code || 0)}</td>}
                      <td>-</td><td>-</td><td>-</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          <div className="history-pagination">
            <span className="history-pagination-info">
              共 {samples.length} 条{isArchiveRange && ' · 归档模式'}
            </span>
            <div className="history-pagination-buttons">
              <button
                className="btn_base btn_layout btn_style_common btn_small btn_secondary"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                首页
              </button>
              <button
                className="btn_base btn_layout btn_style_common btn_small btn_secondary"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </button>
              <span className="history-page-info">
                {currentPage} / {Math.ceil(samples.length / PAGE_SIZE)}
              </span>
              <button
                className="btn_base btn_layout btn_style_common btn_small btn_secondary"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(samples.length / PAGE_SIZE), p + 1))}
                disabled={currentPage >= Math.ceil(samples.length / PAGE_SIZE)}
              >
                下一页
              </button>
              <button
                className="btn_base btn_layout btn_style_common btn_small btn_secondary"
                onClick={() => setCurrentPage(Math.ceil(samples.length / PAGE_SIZE))}
                disabled={currentPage >= Math.ceil(samples.length / PAGE_SIZE)}
              >
                末页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}