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
    <div className="card">
      <div className="card_header">
        <h4 className="card_title">实时数据记录</h4>
        <div className="text-sm text-secondary">
          {isConnected
            ? `WebSocket 实时推送，已记录 ${samples.length} 条（本次会话）`
            : '设备未连接，请先连接设备'}
        </div>
      </div>
      <div className="card_body">
        {!isConnected ? (
          <div className="text-secondary">请先连接 Furnace 设备以开始记录</div>
        ) : samples.length === 0 ? (
          <div className="text-secondary">等待数据...</div>
        ) : (
          <div className="data-table-container" style={{ maxHeight: '500px', overflow: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>记录时间</th><th>实际温度</th><th>设定温度</th><th>输出功率</th>
                <th>设备状态</th><th>程序段</th><th>段内时间</th><th>段设定时间</th>
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
                    <td>{sample.segment_time != null ? `${sample.segment_time}min` : '-'}</td>
                    <td>{sample.segment_time_set != null ? `${sample.segment_time_set}min` : '-'}</td>
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

function HistoryTab() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [samples, setSamples] = useState<Array<{ timestamp: string; pv: number; sv: number; mv: number; status_code?: number }>>([]);
  const [loading, setLoading] = useState(false);

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
    <div className="card">
      <div className="card_header"><h4 className="card_title">历史数据查询</h4></div>
      <div className="card_body">
        <div className="form_group"><label className="form_label">开始日期</label>
          <input type="datetime-local" className="form_control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="form_group"><label className="form_label">结束日期</label>
          <input type="datetime-local" className="form_control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {isArchiveRange && <div className="text-sm text-secondary mb-2">检测到查询范围超过30天，SV/MV/状态数据将被隐藏（Archive优化）</div>}
        <button className="btn btn_primary" onClick={queryHistory} disabled={loading}>
          {loading ? '查询中...' : '查询历史数据'}
        </button>
      </div>

      {!loading && samples.length > 0 && (
        <div className="card_body">
          <div className="mb-2 text-sm text-secondary">共 {samples.length} 条记录{isArchiveRange && '（归档数据，已隐藏SV/MV/状态）'}</div>
          <div className="data-table-container" style={{ maxHeight: '500px', overflow: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>序号</th><th>记录时间</th><th>实际温度</th>
                {!isArchiveRange && <th>设定温度</th>}
                {!isArchiveRange && <th>输出功率</th>}
                {!isArchiveRange && <th>设备状态</th>}
                <th>程序段</th><th>段内时间</th><th>段设定时间</th>
              </tr></thead>
              <tbody>
                {samples.map((sample, idx) => (
                  <tr key={sample.timestamp}>
                    <td>{idx + 1}</td>
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
        </div>
      )}
    </div>
  );
}