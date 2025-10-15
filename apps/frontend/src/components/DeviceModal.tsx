import React, { useState } from 'react';

interface DeviceModalProps {
  device: 'furnace' | 'mfc' | null;
  onClose: () => void;
  modalTop: number;
  modalLeft: number;
  modalWidth: number;
  modalHeight: number;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({ device, onClose, modalTop, modalLeft, modalWidth, modalHeight }) => {
  if (!device) return null;

  // 当前选项卡状态
  const [activeTab, setActiveTab] = useState<'monitoring' | 'program' | 'presets' | 'recording' | 'history'>('monitoring');

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  // 如果不是furnace设备，显示简单界面
  if (device !== 'furnace') {
    return (
      <div className="device-modal">
        <div className="device-modal-content">
          <div className="device-header">
            <h3>流量计控制</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="device-controls-panel">
            <div className="control-group">
              <label>当前状态</label>
              <span className="current-value">未连接</span>
            </div>
            <div className="control-group">
              <label>设定值</label>
              <input type="number" placeholder="输入设定值" />
              <span className="unit">sccm</span>
            </div>
            <div className="control-actions">
              <button className="btn btn-primary">应用</button>
              <button className="btn btn-secondary">读取</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="device-modal furnace-modal">
      <div className="device-modal-content">
        <div className="device-header">
          <h3>AI-518P 温度控制器</h3>
          <div className="header-tabs">
            {/* 选项卡导航 */}
            <div className="tab-navigation">
              <button
                className={`tab-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
                onClick={() => setActiveTab('monitoring')}
              >
                实时监控
              </button>
              <button
                className={`tab-btn ${activeTab === 'program' ? 'active' : ''}`}
                onClick={() => setActiveTab('program')}
              >
                程序段设计
              </button>
              <button
                className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
                onClick={() => setActiveTab('presets')}
              >
                预设程序段
              </button>
              <button
                className={`tab-btn ${activeTab === 'recording' ? 'active' : ''}`}
                onClick={() => setActiveTab('recording')}
              >
                数据记录
              </button>
              <button
                className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                历史数据
              </button>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* 双列布局容器 */}
        <div className="main-content-wrapper">
          {/* 左侧主内容区域 (2/3宽度) */}
          <div className="content-main">
            {/* 选项卡内容 */}
            <div className="tab-content">
              {activeTab === 'monitoring' ? (
                <div className="monitoring-tab">
                  {/* 实时状态显示 */}
                  <div className="status-display">
                    {/* 第一行：PV/SV/MV */}
                    <div className="status-row-temp">
                      <div className="status-item">
                        <label className="status-label">PV:</label>
                        <span className="status-value pv-value">--.-°C</span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">SV:</label>
                        <span className="status-value sv-value">--.-°C</span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">MV:</label>
                        <span className="status-value mv-value">--%</span>
                      </div>
                    </div>

                    {/* 第二行：程序状态/程序段/时间 */}
                    <div className="status-row-program">
                      <div className="status-item">
                        <label className="status-label">程序状态:</label>
                        <span className="status-value program-status">断开</span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">程序段:</label>
                        <span className="status-value segment-value">--</span>
                      </div>
                      <div className="status-item">
                        <label className="status-label">运行时间/设定时间:</label>
                        <span className="status-value time-value">-- / -- 分钟</span>
                      </div>
                    </div>
                  </div>

                  {/* 温度曲线图 */}
                  <div className="chart-container">
                    <div className="chart-header">
                      <h4>温度曲线</h4>
                    </div>
                    <div className="chart-placeholder">
                      <div className="no-data">等待数据...</div>
                    </div>
                  </div>

                  {/* 控制按钮 */}
                  <div className="control-panel">
                    <button className="btn btn-primary">连接设备</button>
                    <button className="btn btn-success" disabled>开始监控</button>
                    <button className="btn btn-success" disabled>运行</button>
                    <button className="btn btn-warning" disabled>暂停</button>
                    <button className="btn btn-danger" disabled>停止</button>
                    <button className="btn btn-secondary" disabled>设置程序段</button>
                  </div>
                </div>
              ) : activeTab === 'program' ? (
                <div className="program-tab">
                  {/* 程序段控制按钮 */}
                  <div className="program-controls">
                    <button className="btn btn-primary">读取程序段</button>
                    <button className="btn btn-success">写入程序段</button>
                  </div>

                  {/* 程序段网格 */}
                  <div className="segments-grid">
                    <div className="segments-column">
                      {Array.from({ length: 15 }, (_, i) => {
                        const segId = i + 1;
                        return (
                          <div key={segId} className="segment-row">
                            <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input temp-input"
                              defaultValue="0.0"
                              step="0.1"
                            />
                            <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input time-input"
                              defaultValue="0"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="segments-column">
                      {Array.from({ length: 15 }, (_, i) => {
                        const segId = i + 16;
                        return (
                          <div key={segId} className="segment-row">
                            <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input temp-input"
                              defaultValue="0.0"
                              step="0.1"
                            />
                            <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                            <input
                              type="number"
                              className="segment-input time-input"
                              defaultValue="0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : activeTab === 'presets' ? (
                <div className="presets-tab">
                  <div className="presets-header">
                    <h4>预设程序段</h4>
                  </div>
                  <div className="presets-content">
                    <div className="no-data">预设程序段功能待实现...</div>
                  </div>
                </div>
              ) : activeTab === 'recording' ? (
                <div className="recording-tab">
                  <div className="recording-header">
                    <h4>数据记录</h4>
                  </div>
                  <div className="recording-content">
                    <div className="no-data">数据记录功能待实现...</div>
                  </div>
                </div>
              ) : activeTab === 'history' ? (
                <div className="history-tab">
                  <div className="history-header">
                    <h4>历史数据</h4>
                  </div>
                  <div className="history-content">
                    <div className="no-data">历史数据功能待实现...</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 右侧控制台区域 (1/3宽度) */}
          <div className="content-sidebar">
            {/* 控制台日志 */}
            <div className="console-section">
              <div className="console-header">
                <h4>控制台输出</h4>
              </div>
              <div className="console-content">
                <div className="console-log info">
                  <span className="log-timestamp">--:--:--</span>
                  <span className="log-message">等待日志输出...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};