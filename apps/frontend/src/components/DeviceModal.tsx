import React, { useState, useRef } from 'react';
import type { FurnaceState, FurnaceControls } from '../services/hooks/useFurnace';
import { useOnClickOutside } from '../services/hooks/useOnClickOutside';
import { StatusPanel } from './furnace/StatusPanel';
import { ProgramEditor } from './furnace/ProgramEditor';
import { PresetManager } from './furnace/PresetManager';
import { ConnectionPanel } from './furnace/ConnectionPanel';


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
  const modalRef = useRef<HTMLDivElement>(null);

  // 使用 useOnClickOutside Hook 实现点击外部关闭
  useOnClickOutside(modalRef, onClose);

  // 保持对 props 的读取以避免 TS 未使用报错
  void modalTop; void modalLeft; void modalWidth; void modalHeight;

  return (
    <div className="device-modal furnace-modal" ref={modalRef}>
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