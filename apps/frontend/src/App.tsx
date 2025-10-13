import React, { useState, useEffect, useCallback } from 'react';
import { WorkstationType, getNodeGroupsByWorkstation } from './nodes/types';
import { Toolbar } from './components/Toolbar';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { PropertyPanel } from './components/PropertyPanel';
import { StatusBar } from './components/StatusBar';
import { DeviceModal } from './components/DeviceModal';

const ZahnerFlowApp: React.FC = () => {
  const [activePanel, setActivePanel] = useState<'nodes'>('nodes');
  const [selectedWorkstation, setSelectedWorkstation] = useState<WorkstationType | null>(null);
  const [workstationNodeGroups, setWorkstationNodeGroups] = useState<any>({} as any);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [fixedDevice, setFixedDevice] = useState<'furnace' | 'mfc' | null>(null);

  useEffect(() => {
    if (selectedWorkstation) {
      try {
        const groups = getNodeGroupsByWorkstation(selectedWorkstation);
        setWorkstationNodeGroups(groups);
      } catch (e) {
        setWorkstationNodeGroups({} as any);
      }
    } else {
      setWorkstationNodeGroups({} as any);
    }
  }, [selectedWorkstation]);

  const handleRunFlow = useCallback(() => setIsRunning(true), []);
  const handleStopFlow = useCallback(() => setIsRunning(false), []);
  const handleZoomIn = useCallback(() => setZoomLevel((z) => Math.min(3, +(z + 0.1).toFixed(2))), []);
  const handleZoomOut = useCallback(() => setZoomLevel((z) => Math.max(0.2, +(z - 0.1).toFixed(2))), []);
  const handleResetZoom = useCallback(() => setZoomLevel(1), []);

  return (
    <>
      <div className="app-root">
        <TopNavbar
          fixedDevice={fixedDevice}
          onDeviceClick={(d) => setFixedDevice(d)}
          onWorkstationSelect={(w: any) => setSelectedWorkstation(w?.id as WorkstationType)}
        />

        <div className="main-viewport">
          {/* 左侧：侧边栏 */}
          <Sidebar
            activePanel={activePanel}
            onPanelChange={setActivePanel}
            nodeGroups={workstationNodeGroups}
            selectedWorkstation={selectedWorkstation}
          />

          {/* 中间：画布区域与工具栏 */}
          <div className="canvas-area glass">
            <Toolbar
              onRunFlow={handleRunFlow}
              onStopFlow={handleStopFlow}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
              selectedWorkstation={selectedWorkstation}
            />
            <div className="canvas-container canvas-grid">
              <div className="canvas-inner">
                <p>Main Canvas Area</p>
              </div>
            </div>
          </div>

          {/* 右侧：属性面板容器 */}
          <div className="right-panels">
            <PropertyPanel selectedWorkstation={selectedWorkstation} />
          </div>
          {/* 浮层：设备模态框，吸附左侧与画布顶部（在 main-viewport 内） */}
          {fixedDevice && (
            <div className="layout-overlay">
              <div className="align-to-L align-to-canvas-top">
                <DeviceModal
                  device={fixedDevice}
                  onClose={() => setFixedDevice(null)}
                  modalTop={0}
                  modalLeft={0}
                  modalWidth={500}
                  modalHeight={400}
                />
              </div>
            </div>
          )}
        </div>

      {/* 固定在视口底部的状态栏（不在 app-root 网格内） */}
      <StatusBar
        zoomLevel={zoomLevel}
        isRunning={isRunning}
        isNotificationPanelOpen={isNotificationPanelOpen}
        setIsNotificationPanelOpen={setIsNotificationPanelOpen}
      />
    </div>
    </>
  );
};

export default ZahnerFlowApp;
