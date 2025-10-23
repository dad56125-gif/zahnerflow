import React, { useState } from 'react';
import type { FurnaceState, FurnaceControls } from '../services/hooks/useFurnace';
import { useMfc } from '../services/hooks/useMfc';
import { MFCDeviceCard } from './MFCDeviceCard';
import { StatusPanel } from './furnace/StatusPanel';
import { ProgramEditor } from './furnace/ProgramEditor';
import { PresetManager } from './furnace/PresetManager';
import { ConnectionPanel } from './furnace/ConnectionPanel';


interface DeviceModalProps {
  device: 'furnace' | 'mfc' | null;
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

  const [mfcState, mfcControls] = useMfc();

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  // MFC设备 - 使用真实数据和API
  if (device !== 'furnace') {
    return (
      <div className="device-modal furnace-modal">
        <div className="device-modal-content">
          <div className="device-header">
            <h3>质量流量控制器 (MFC)</h3>
            <div className="header-controls">
              <button
                className={`btn ${mfcState.isScanning ? 'btn-loading' : 'btn-primary'}`}
                onClick={() => mfcControls.scanDevices()}
                disabled={mfcState.isScanning}
              >
                {mfcState.isScanning ? '扫描中...' : '扫描设备'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => mfcControls.refreshDevices()}
                disabled={mfcState.isLoading}
              >
                刷新状态
              </button>
            </div>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>

          <div className="mfc-modal-content">
            {/* 错误显示 */}
            {mfcState.error && (
              <div className="error-banner">
                <span className="error-message">
                  错误: {mfcState.error.message}
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={mfcControls.clearError}
                >
                  关闭
                </button>
              </div>
            )}

            {/* 设备列表 */}
            {mfcState.devices.length === 0 && !mfcState.isScanning && !mfcState.error ? (
              <div className="no-devices">
                <div className="no-data">
                  <h4>未发现MFC设备</h4>
                  <p>请点击"扫描设备"按钮来搜索可用的MFC设备</p>
                </div>
              </div>
            ) : (
              <div className="mfc-cards-container">
                {mfcState.devices.map((device) => (
                  <MFCDeviceCard
                    key={device.address}
                    device={device}
                    onSetFlow={mfcControls.setFlowRate}
                    loading={mfcState.isLoading}
                    disabled={mfcState.isScanning}
                  />
                ))}
              </div>
            )}

            {/* 加载状态 */}
            {mfcState.isScanning && (
              <div className="scanning-overlay">
                <div className="scanning-content">
                  <div className="loading-spinner" />
                  <p>正在扫描MFC设备...</p>
                </div>
              </div>
            )}
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
                设置程序段
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
              {activeTab === 'monitoring' && (
                <StatusPanel
                  furnaceState={furnaceState}
                  furnaceControls={furnaceControls}
                />
              )}
              {activeTab === 'program' && (
                <ProgramEditor
                  furnaceState={furnaceState}
                  furnaceControls={furnaceControls}
                />
              )}
              {activeTab === 'presets' && (
                <PresetManager
                  furnaceState={furnaceState}
                  furnaceControls={furnaceControls}
                />
              )}
              {activeTab === 'recording' && (
                <div className="recording-tab">
                  <div className="recording-header">
                    <h4>数据记录</h4>
                  </div>
                  <div className="recording-content">
                    <div className="no-data">数据记录功能待实现...</div>
                  </div>
                </div>
              )}
              {activeTab === 'history' && (
                <div className="history-tab">
                  <div className="history-header">
                    <h4>历史数据</h4>
                  </div>
                  <div className="history-content">
                    <div className="no-data">历史数据功能待实现...</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧区域 (1/3宽度) */}
          <div className="content-sidebar">
            <ConnectionPanel
              furnaceState={furnaceState}
              furnaceControls={furnaceControls}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
