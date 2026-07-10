import React from 'react';
import { hasDesktopBridge } from '../desktopBridge';

type WindowControlsProps = {
  expanded: boolean;
};

export const WindowControls: React.FC<WindowControlsProps> = ({ expanded }) => {
  if (!hasDesktopBridge()) return null;

  const bridge = window.zahnerflowDesktop!;

  return (
    <div className={`window-controls-bar ${expanded ? 'window-controls-bar--expanded' : ''}`}>
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
        aria-label={expanded ? '还原窗口' : '最大化窗口'}
        title={expanded ? '还原' : '最大化'}
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
