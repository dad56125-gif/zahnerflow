import React, { useState, useEffect } from 'react';
import { hasDesktopBridge } from '../desktopBridge';

/**
 * 最大化状态下内嵌在主窗口顶部的窗口控制按钮（最小化/还原/关闭）。
 * 非最大化时由独立的 closeTabWindow 承担，此组件不渲染。
 * 非 Electron 环境下不渲染。
 */
export const WindowControls: React.FC = () => {
  const [maximized, setMaximized] = useState(() =>
    hasDesktopBridge() ? window.zahnerflowDesktop!.isMaximized() : false
  );

  useEffect(() => {
    if (!hasDesktopBridge()) return;
    return window.zahnerflowDesktop!.onMaximizedChanged(setMaximized);
  }, []);

  if (!maximized || !hasDesktopBridge()) return null;

  const bridge = window.zahnerflowDesktop!;

  return (
    <div className="window-controls-bar">
      <button
        type="button"
        className="window-controls-bar__btn"
        onClick={() => bridge.windowMinimize()}
        aria-label="最小化窗口"
        title="最小化"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 12H18" />
        </svg>
      </button>
      <button
        type="button"
        className="window-controls-bar__btn"
        onClick={() => bridge.windowToggleMaximize()}
        aria-label="还原窗口"
        title="还原"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 8H16V16H8Z" />
        </svg>
      </button>
      <button
        type="button"
        className="window-controls-bar__btn window-controls-bar__btn--close"
        onClick={() => bridge.windowClose()}
        aria-label="关闭窗口"
        title="关闭"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 7L17 17M17 7L7 17" />
        </svg>
      </button>
    </div>
  );
};
