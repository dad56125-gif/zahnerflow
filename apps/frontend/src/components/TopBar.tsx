import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserSelector } from './user/UserSelector';
import { useUser } from './shared/UserContext';
import { Dropdown } from './shared/Dropdown';
import { renderCjkText, SpacedCjkText } from './common/SpacedCjkText';
import { useRafWindowEvent } from '../hooks/useRafWindowEvent';
import {
  DEVELOPER_MODE_EVENT,
  readDeveloperMode,
  writeDeveloperMode,
} from '../modules/simulator/developerMode';


interface Workstation {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
}

interface TopBarProps {
  onWorkstationSelect?: (workstation: Workstation) => void;
  onDeviceClick?: (device: 'furnace' | 'mfc') => void;
  fixedDevice?: 'furnace' | 'mfc' | null;
  selectedWorkstationId?: string | null;
  simulatorActive?: boolean;
  onSimulatorPanelOpen?: () => void;
  hasRunMetadataWarning?: boolean;
  furnaceConnected?: boolean;
  mfcConnected?: boolean;
}

const DEVICE_ICON_PATHS = {
  furnace: 'M12,21c-3.9,0-7-2-7-7s5-5,5-11c3,2,4.37,4.1,5,8a5,5,0,0,0,2-3c1,1,2,4,2,6C19,17.14,17.72,21,12,21Z',
  mfc: 'M19,14A7,7,0,0,1,5,14C5,8,12,3,12,3S19,8,19,14Z',
} as const;

function TopBarDeviceIcon({ type }: { type: 'furnace' | 'mfc' }) {
  const gradientId = `topbar-device-icon-${type}-gradient`;

  return (
    <svg
      className={`btn-svg-icon topbar-device-icon topbar-device-icon--${type}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="6" y1="3" x2="18" y2="21" gradientUnits="userSpaceOnUse">
          <stop className="topbar-device-icon__gradient-start" offset="0" />
          <stop className="topbar-device-icon__gradient-end" offset="1" />
        </linearGradient>
      </defs>
      <path
        className="topbar-device-icon__shape"
        d={DEVICE_ICON_PATHS[type]}
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

function WorkstationIcon() {
  return (
    <svg
      className="btn-svg-icon topbar-workstation-icon"
      viewBox="0 0 36 36"
      aria-hidden="true"
      focusable="false"
    >
      <path className="topbar-workstation-icon__secondary" d="M19.78 21.345l-6.341-6.342l-.389 4.38l2.35 2.351z" />
      <path className="topbar-workstation-icon__secondary" d="M15.4 22.233a.507.507 0 0 1-.354-.146l-2.351-2.351a.501.501 0 0 1-.145-.397l.389-4.38a.5.5 0 0 1 .851-.309l6.341 6.342a.5.5 0 0 1-.31.851l-4.379.389l-.042.001zm-1.832-3.039l2.021 2.021l3.081-.273l-4.828-4.828l-.274 3.08z" />
      <path className="topbar-workstation-icon__secondary" d="M31 32h-3c0-3.314-2.63-6-5.875-6c-3.244 0-5.875 2.686-5.875 6H8.73a2 2 0 0 0-4 0a2 2 0 0 0 0 4H31a2 2 0 0 0 0-4z" />
      <path className="topbar-workstation-icon__secondary" d="M20 10v4a7 7 0 1 1 0 14h-8.485c2.018 2.443 5.069 4 8.485 4c6.075 0 11-4.925 11-11s-4.925-11-11-11z" />
      <path className="topbar-workstation-icon__secondary" d="M16.414 30.414a2 2 0 0 1-2.828 0l-9.899-9.9a2 2 0 1 1 2.829-2.828l9.899 9.9a2 2 0 0 1-.001 2.828zm-7.225-1.786a1 1 0 1 1 .278 1.98l-5.942.834a1 1 0 1 1-.277-1.981l5.941-.833z" />
      <path className="topbar-workstation-icon__secondary" d="M27.341 2.98l4.461 4.461l-3.806 3.807l-4.461-4.461z" />
      <path className="topbar-workstation-icon__primary" d="M34.037 7.083a2.12 2.12 0 0 1-2.997 0l-3.339-3.34A2.12 2.12 0 0 1 30.696.747l3.342 3.34a2.12 2.12 0 0 1-.001 2.996zm-14.56 15.026l-6.802-6.803a1.003 1.003 0 0 1 0-1.414l9.858-9.858a1.003 1.003 0 0 1 1.414 0l6.801 6.803a1.003 1.003 0 0 1 0 1.414l-9.858 9.858a1.001 1.001 0 0 1-1.413 0z" />
      <path className="topbar-workstation-icon__primary" d="M13.766 12.8l1.638-1.637l8.216 8.216l-1.638 1.637z" />
    </svg>
  );
}

export const TopBar: React.FC<TopBarProps> = ({
  onWorkstationSelect,
  onDeviceClick,
  selectedWorkstationId,
  simulatorActive = false,
  onSimulatorPanelOpen,
  hasRunMetadataWarning,
  furnaceConnected = false,
  mfcConnected = false,
}) => {
  const { currentUser, setCurrentUser } = useUser();
  const [isWorkstationDropdownOpen, setIsWorkstationDropdownOpen] = useState(false);
  const [selectedWorkstation, setSelectedWorkstation] = useState<Workstation | null>(null);
  const [workstationPosition, setWorkstationPosition] = useState({ top: 0, left: 0, width: 0 });
  const [developerMode, setDeveloperMode] = useState(() => readDeveloperMode());
  const [developerHint, setDeveloperHint] = useState<string | null>(null);
  const workstationButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const developerClickCountRef = useRef(0);
  const developerClickTimerRef = useRef<number | null>(null);
  const developerHintTimerRef = useRef<number | null>(null);


  // 计算工作站下拉菜单位置（相对于视口）
  const updateWorkstationPosition = useCallback(() => {
    if (!workstationButtonRef.current) return;

    const buttonRect = workstationButtonRef.current.getBoundingClientRect();
    const dropdownWidth = 280; // 缩短宽度，与普通下拉菜单一致

    const nextPosition = {
      top: buttonRect.bottom + 18, // 按钮底部 + 间距（下移18px，比之前多5px）
      left: buttonRect.right - dropdownWidth, // 右对齐：菜单右边与按钮右边对齐
      width: dropdownWidth
    };
    setWorkstationPosition((current) => (
      current.top === nextPosition.top &&
      current.left === nextPosition.left &&
      current.width === nextPosition.width
        ? current
        : nextPosition
    ));
  }, []);

  useEffect(() => {
    if (isWorkstationDropdownOpen) {
      updateWorkstationPosition();
    }
  }, [isWorkstationDropdownOpen, updateWorkstationPosition]);
  useRafWindowEvent('scroll', updateWorkstationPosition, isWorkstationDropdownOpen, { capture: true, passive: true });
  useRafWindowEvent('resize', updateWorkstationPosition, isWorkstationDropdownOpen);

  useEffect(() => () => {
    if (developerClickTimerRef.current) {
      window.clearTimeout(developerClickTimerRef.current);
    }
    if (developerHintTimerRef.current) {
      window.clearTimeout(developerHintTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handleDeveloperModeChange = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setDeveloperMode(typeof customEvent.detail === 'boolean' ? customEvent.detail : readDeveloperMode());
    };
    const handleStorage = () => setDeveloperMode(readDeveloperMode());

    window.addEventListener(DEVELOPER_MODE_EVENT, handleDeveloperModeChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(DEVELOPER_MODE_EVENT, handleDeveloperModeChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const workstations: Workstation[] = [
    {
      id: 'zahner-zennium',
      name: 'ZAHNER ZENNIUM',
      type: '电化学工作站',
      status: 'connected',
    },
  ];

  useEffect(() => {
    setSelectedWorkstation(workstations.find((workstation) => workstation.id === selectedWorkstationId) || null);
  }, [selectedWorkstationId]);

  const handleWorkstationSelect = (workstation: Workstation) => {
    setSelectedWorkstation(workstation);
    setIsWorkstationDropdownOpen(false);
    onWorkstationSelect?.(workstation);
  };

  const handleToggleDropdown = () => {
    if (isWorkstationDropdownOpen) {
      setIsWorkstationDropdownOpen(false);
    } else {
      setIsWorkstationDropdownOpen(true);
    }
  };

  const handleDeviceClick = (device: 'furnace' | 'mfc') => onDeviceClick?.(device);

  const showDeveloperHint = (message: string) => {
    if (developerHintTimerRef.current) {
      window.clearTimeout(developerHintTimerRef.current);
    }
    setDeveloperHint(message);
    developerHintTimerRef.current = window.setTimeout(() => {
      setDeveloperHint(null);
      developerHintTimerRef.current = null;
    }, 1800);
  };

  const handleVersionClick = () => {
    if (developerMode) {
      showDeveloperHint('您已处于开发者模式');
      return;
    }

    if (developerClickTimerRef.current) {
      window.clearTimeout(developerClickTimerRef.current);
    }

    developerClickCountRef.current += 1;
    const remainingClicks = 5 - developerClickCountRef.current;

    if (remainingClicks <= 0) {
      developerClickCountRef.current = 0;
      writeDeveloperMode(true);
      showDeveloperHint('您已处于开发者模式');
      return;
    }

    if (remainingClicks <= 2) {
      showDeveloperHint(`再点击 ${remainingClicks} 次进入开发者模式`);
    }

    developerClickTimerRef.current = window.setTimeout(() => {
      developerClickCountRef.current = 0;
      developerClickTimerRef.current = null;
    }, 1600);
  };

  return (
    <div className="top-bar glass-layout">
      <div className="top-bar__brand">
        <div className="user-section">
          <UserSelector
            currentUser={currentUser}
            onUserChange={setCurrentUser}
            hasRunMetadataWarning={hasRunMetadataWarning}
            developerControls={(
              <>
                <span className="developer-mode-trigger-slot">
                  <button
                    type="button"
                    className={`app-version app-version--hidden-trigger ${developerMode ? 'is-developer' : ''} ${simulatorActive ? 'is-simulator' : ''}`}
                    onClick={handleVersionClick}
                    aria-label="开发者模式入口"
                    title={developerMode ? '开发者模式已启用' : undefined}
                  />
                </span>
                {developerHint && <span className="developer-hint">{renderCjkText(developerHint)}</span>}
                {developerMode && (
                  <button
                    type="button"
                    className={`sim-status-pill ${simulatorActive ? 'is-active' : ''}`}
                    onClick={onSimulatorPanelOpen}
                    title={simulatorActive ? '模拟模式已启用' : '打开模拟控制面板'}
                  >
                    SIM
                  </button>
                )}
              </>
            )}
          />
        </div>
      </div>

      <div className="top-bar__actions">
        <div
          className="btn btn--md btn--secondary"
          onClick={() => handleDeviceClick('furnace')}
        >
          <span className="btn-icon"><TopBarDeviceIcon type="furnace" /></span>
          <span className="btn-text"><SpacedCjkText text="管式炉" /></span>
          <span className={`device-status__indicator is-${furnaceConnected ? 'connected' : 'disconnected'}`} />
        </div>

        <div
          className="btn btn--md btn--secondary"
          onClick={() => handleDeviceClick('mfc')}
        >
          <span className="btn-icon"><TopBarDeviceIcon type="mfc" /></span>
          <span className="btn-text"><SpacedCjkText text="流量计" /></span>
          <span className={`device-status__indicator is-${mfcConnected ? 'connected' : 'disconnected'}`} />
        </div>

        <div className="workstation-selector" ref={dropdownContainerRef}>
          <button
            ref={workstationButtonRef}
            className="btn btn--md btn--primary"
            onClick={handleToggleDropdown}
          >
            <span className="btn-icon"><WorkstationIcon /></span>
            <span className={`btn-text ${selectedWorkstation ? 'workstation-model-text' : ''}`}>
              {renderCjkText(selectedWorkstation ? selectedWorkstation.name : '选择工作站')}
            </span>
            <span className={`workstation-status__indicator is-${selectedWorkstation?.status || 'disconnected'}`} />
            <svg className={`dropdown__arrow ${isWorkstationDropdownOpen ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
              <path
                d="M -8 -3 L 0 5 L 8 -3"
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* 工作站下拉菜单 */}
        <Dropdown
          isOpen={isWorkstationDropdownOpen}
          isHiding={false}
          onClose={() => setIsWorkstationDropdownOpen(false)}
          position={{ ...workstationPosition, id: 'workstation-dropdown' }}
          pointerEvents="none"
          className="dropdown--workstation"
          triggerRef={workstationButtonRef}
        >
            {workstations.map((workstation) => (
              <div
                key={workstation.id}
                className={`dropdown__option--workstation dropdown__option--${workstation.status}`}
                onClick={() => handleWorkstationSelect(workstation)}
              >
                <div className="dropdown__workstation-content">
                  <div className="dropdown__workstation-icon"><WorkstationIcon /></div>
                  <div className="dropdown__workstation-info">
                    <div className="dropdown__workstation-name workstation-model-text">{workstation.name}</div>
                    <div className="dropdown__workstation-type">{renderCjkText(workstation.type)}</div>
                  </div>
                  <div className={`dropdown__workstation-status is-${workstation.status}`}>
                    <span className={`status__dot is-${workstation.status}`} />
                    <span className="status__text">{workstation.status === 'connected' ? <SpacedCjkText text="已连接" /> : <SpacedCjkText text="未连接" />}</span>
                  </div>
                </div>
              </div>
            ))}
        </Dropdown>

      </div>
    </div>
  );
};
