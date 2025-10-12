import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Workstation {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
  icon: string;
}

interface TopNavbarProps {
  onWorkstationSelect?: (workstation: Workstation) => void;
  onDeviceClick?: (device: 'furnace' | 'mfc') => void;
  fixedDevice?: 'furnace' | 'mfc' | null;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ onWorkstationSelect, onDeviceClick }) => {
  const [isWorkstationDropdownOpen, setIsWorkstationDropdownOpen] = useState(false);
  const [selectedWorkstation, setSelectedWorkstation] = useState<Workstation | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

  const resolveFrostedGlassConflict = useCallback((menuElement: HTMLElement) => {
    (menuElement.style as any).backdropFilter = 'blur(30px)';
    (menuElement.style as any).webkitBackdropFilter = 'blur(30px)';
    menuElement.style.background = 'rgba(0, 0, 0, 0.4)';
    menuElement.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    menuElement.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
    menuElement.style.isolation = 'isolate';
    return true;
  }, []);

  const positionDropdown = useCallback(() => {
    if (dropdownRef.current && dropdownMenuRef.current && isWorkstationDropdownOpen) {
      const buttonRect = dropdownRef.current.getBoundingClientRect();
      const menu = dropdownMenuRef.current;
      menu.style.position = 'fixed';
      menu.style.top = `${buttonRect.bottom + 8}px`;
      menu.style.left = `${buttonRect.right - 280}px`;
      menu.style.width = '280px';
      menu.style.zIndex = '2000';
      resolveFrostedGlassConflict(menu);
    }
  }, [isWorkstationDropdownOpen, resolveFrostedGlassConflict]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isWorkstationDropdownOpen && dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsWorkstationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWorkstationDropdownOpen]);

  useEffect(() => {
    if (isWorkstationDropdownOpen) {
      positionDropdown();
      const handleScroll = () => positionDropdown();
      const handleResize = () => positionDropdown();
      window.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isWorkstationDropdownOpen, positionDropdown]);

  const workstations: Workstation[] = [
    {
      id: 'zahner-zennium',
      name: 'Zahner Zennium',
      type: '电化学工作站',
      status: 'connected',
      icon: '🔬',
    },
  ];

  const handleWorkstationSelect = (workstation: Workstation) => {
    setSelectedWorkstation(workstation);
    setIsWorkstationDropdownOpen(false);
    onWorkstationSelect?.(workstation);
  };

  const handleToggleDropdown = () => setIsWorkstationDropdownOpen(!isWorkstationDropdownOpen);

  const handleDeviceClick = (device: 'furnace' | 'mfc') => onDeviceClick?.(device);

  return (
    <div className="top-navbar glass">
      <div className="navbar-section">
        <div className="navbar-left">
          <div className="logo">
            <span className="logo-text">ZahnerFlow</span>
          </div>
          <div className="navbar-info">
            <span className="app-version">v2.0.0</span>
            <span className="separator">|</span>
            <span className="app-status">就绪</span>
          </div>
        </div>

        <div className="device-controls">
          <div
            className="device-status-block workstation-button-base glass"
            onClick={() => handleDeviceClick('furnace')}
          >
            <span className="device-icon">🔥</span>
            <span className="device-name">管式炉</span>
            <span className="device-status-indicator disconnected" />
          </div>

          <div
            className="device-status-block workstation-button-base glass"
            onClick={() => handleDeviceClick('mfc')}
          >
            <span className="device-icon">💧</span>
            <span className="device-name">流量计</span>
            <span className="device-status-indicator disconnected" />
          </div>

          <div className="workstation-selector">
            <div className="workstation-dropdown" ref={dropdownRef}>
              <button className="workstation-selector-btn workstation-button-base glass" onClick={handleToggleDropdown}>
                <span className="workstation-icon">{selectedWorkstation ? selectedWorkstation.icon : '🔬'}</span>
                <span className="workstation-name">{selectedWorkstation ? selectedWorkstation.name : '选择工作站'}</span>
                <span className={`workstation-status-indicator ${selectedWorkstation?.status || 'disconnected'}`} />
                <span className="dropdown-arrow">▾</span>
              </button>

              {isWorkstationDropdownOpen && (
                <div className="workstation-dropdown-menu" ref={dropdownMenuRef}>
                  {workstations.map((workstation) => (
                    <div
                      key={workstation.id}
                      className={`workstation-option ${workstation.status}`}
                      onClick={() => handleWorkstationSelect(workstation)}
                    >
                      <div className="workstation-option-icon">{workstation.icon}</div>
                      <div className="workstation-option-info">
                        <div className="workstation-option-name">{workstation.name}</div>
                        <div className="workstation-option-type">{workstation.type}</div>
                      </div>
                      <div className={`workstation-option-status ${workstation.status}`}>
                        <span className="status-dot" />
                        <span className="status-text">{workstation.status === 'connected' ? '已连接' : '未连接'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

