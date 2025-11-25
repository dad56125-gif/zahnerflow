import React, { useState } from 'react';
import { Portal } from '../../components/common/Portal';
import type { FurnaceState, FurnaceControls } from './useFurnace';
import { StatusPanel } from './StatusPanel';
import { ProgramEditor } from './ProgramEditor';
import { PresetManager } from './PresetManager';
import { ConnectionPanel } from './ConnectionPanel';


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
                    <div className="card">
                      <div className="card_header">
                        <h4 className="card_title">数据记录</h4>
                      </div>
                      <div className="card_body">
                        <div className="text-secondary">数据记录功能待实现...</div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'history' && (
                  <div className="tabs_panel active">
                    <div className="card">
                      <div className="card_header">
                        <h4 className="card_title">历史数据</h4>
                      </div>
                      <div className="card_body">
                        <div className="text-secondary">历史数据功能待实现...</div>
                      </div>
                    </div>
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
};