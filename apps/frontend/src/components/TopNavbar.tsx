import React, { useState, useEffect, useRef } from 'react';
import { UserSelector } from './UserSelector';
import { useUser } from '../shared/UserContext';
import { Portal } from './common/Portal';
import './UserSelector.css';

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
  const { currentUser, setCurrentUser } = useUser();
  const [isWorkstationDropdownOpen, setIsWorkstationDropdownOpen] = useState(false);
  const [isWorkstationHiding, setIsWorkstationHiding] = useState(false);
  const [selectedWorkstation, setSelectedWorkstation] = useState<Workstation | null>(null);
  const [workstationPosition, setWorkstationPosition] = useState({ top: 0, left: 0, width: 0 });
  const workstationButtonRef = useRef<HTMLButtonElement>(null);
  const workstationDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  
  // 处理动画结束事件
  useEffect(() => {
    if (!isWorkstationHiding) return;

    const dropdown = workstationDropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      // 备用方案：如果动画事件没有触发，在300ms后强制关闭
      if (!animationCompleted) {
        setIsWorkstationDropdownOpen(false);
        setIsWorkstationHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsWorkstationDropdownOpen(false);
        setIsWorkstationHiding(false);
      }
    };

    // 延迟添加事件监听器，确保DOM已更新
    const timer = setTimeout(() => {
      dropdown.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      dropdown.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isWorkstationHiding]);

  // 计算工作站下拉菜单位置（相对于视口）
  const updateWorkstationPosition = () => {
    if (!workstationButtonRef.current) return;

    const buttonRect = workstationButtonRef.current.getBoundingClientRect();
    const dropdownWidth = 280; // 缩短宽度，与普通下拉菜单一致

    setWorkstationPosition({
      top: buttonRect.bottom + 18, // 按钮底部 + 间距（下移18px，比之前多5px）
      left: buttonRect.right - dropdownWidth, // 右对齐：菜单右边与按钮右边对齐
      width: dropdownWidth
    });
  };

  useEffect(() => {
    if (isWorkstationDropdownOpen) {
      updateWorkstationPosition();
      const handleScroll = () => updateWorkstationPosition();
      const handleResize = () => updateWorkstationPosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isWorkstationDropdownOpen]);

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
    setIsWorkstationHiding(true);
    onWorkstationSelect?.(workstation);
  };

  const handleToggleDropdown = () => {
    if (isWorkstationDropdownOpen) {
      // 如果在打开状态，立即重置箭头状态，开始关闭动画
      setIsWorkstationDropdownOpen(false);
      setIsWorkstationHiding(true);
    } else {
      // 如果在关闭状态，直接打开
      setIsWorkstationDropdownOpen(true);
    }
  };

  const handleDeviceClick = (device: 'furnace' | 'mfc') => onDeviceClick?.(device);

  return (
    <div className="top-navbar glass">
      <div className="flex items-center gap_sm flex-1">
          <div className="flex items-center gap_sm">
            <div className="logo">
              <span className="logo-text">ZahnerFlow</span>
            </div>
            <div className="flex items-center gap_sm">
              <span className="app-version">v2.0.0</span>
              <span className="separator">|</span>
              <span className="app-status">就绪</span>
            </div>

            {/* 用户选择器 - 位于"就绪"状态文字右侧 */}
            <div className="user-section">
              <UserSelector
                currentUser={currentUser}
                onUserChange={setCurrentUser}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap_sm">
          <div
            className="btn_base btn_layout btn_style_common btn_medium glass btn-secondary"
            onClick={() => handleDeviceClick('furnace')}
          >
            <span className="btn-icon">🔥</span>
            <span className="btn-text">管式炉</span>
            <span className="device-status-indicator disconnected" />
          </div>

          <div
            className="btn_base btn_layout btn_style_common btn_medium glass btn-secondary"
            onClick={() => handleDeviceClick('mfc')}
          >
            <span className="btn-icon">💧</span>
            <span className="btn-text">流量计</span>
            <span className="device-status-indicator disconnected" />
          </div>

          <div className="workstation-selector" ref={dropdownContainerRef}>
            <button
              ref={workstationButtonRef}
              className="btn_base btn_layout btn_style_common btn_medium glass btn-primary"
              onClick={handleToggleDropdown}
            >
              <span className="btn-icon">{selectedWorkstation ? selectedWorkstation.icon : '🔬'}</span>
              <span className="btn-text">{selectedWorkstation ? selectedWorkstation.name : '选择工作站'}</span>
              <span className={`workstation-status-indicator ${selectedWorkstation?.status || 'disconnected'}`} />
              <svg className={`dropdown-arrow ${isWorkstationDropdownOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                <path
                  d="M -8 -3 L 0 5 L 8 -3"
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 工作站下拉菜单 - 使用Portal渲染 */}
          <Portal
            isOpen={isWorkstationDropdownOpen || isWorkstationHiding} // ✅ 动画期间保持挂载
            onClose={() => setIsWorkstationHiding(true)} // ✅ 点击外部启动关闭动画
            pointerEvents="none"
          >
            <div
              ref={workstationDropdownRef}
              className={`dropdown_base dropdown_workstation overlay_base ${isWorkstationHiding ? 'hiding' : 'show'}`}
              style={{
                top: `${workstationPosition.top}px`,
                left: `${workstationPosition.left}px`,
                width: `${workstationPosition.width}px`,
                pointerEvents: 'auto' // ✅ 确保内部可点击
              }}
            >
              {workstations.map((workstation) => (
                <div
                  key={workstation.id}
                  className={`dropdown_workstation_option ${workstation.status}`}
                  onClick={() => handleWorkstationSelect(workstation)}
                >
                  <div className="dropdown_workstation_content">
                    <div className="dropdown_workstation_icon">{workstation.icon}</div>
                    <div className="dropdown_workstation_info">
                      <div className="dropdown_workstation_name">{workstation.name}</div>
                      <div className="dropdown_workstation_type">{workstation.type}</div>
                    </div>
                    <div className={`dropdown_workstation_status ${workstation.status}`}>
                      <span className={`status_dot ${workstation.status}`} />
                      <span className="status_text">{workstation.status === 'connected' ? '已连接' : '未连接'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Portal>

        </div>
    </div>
  );
};
