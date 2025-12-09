/**
 * 缩放控制组件
 * 从 Canvas.tsx 提取的缩放按钮 UI
 */

import React from 'react';

export interface ZoomControlsProps {
    zoomLevel: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
    isDragEnabled: boolean;
    onToggleDrag: () => void;
    /** 最小缩放级别 */
    minZoom?: number;
    /** 最大缩放级别 */
    maxZoom?: number;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
    zoomLevel,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    isDragEnabled,
    onToggleDrag,
    minZoom = 0.6,
    maxZoom = 1.2
}) => {
    // 浮点数容差处理
    const isAtMinZoom = zoomLevel <= minZoom + 0.001;
    const isAtMaxZoom = zoomLevel >= maxZoom - 0.001;

    return (
        <div className="zoom-controls">
            <button
                className={`btn_zoom btn-drag-toggle ${isDragEnabled ? 'active' : ''}`}
                onClick={onToggleDrag}
                title={isDragEnabled ? "关闭拖动模式" : "开启拖动模式"}
            >
                ✋
            </button>

            <button
                className="btn_zoom"
                onClick={onZoomOut}
                title="缩小"
                disabled={isAtMinZoom}
                style={{
                    opacity: isAtMinZoom ? 0.5 : 1,
                    cursor: isAtMinZoom ? 'not-allowed' : 'pointer'
                }}
            >
                ➖
            </button>

            <button
                className="btn_zoom"
                onClick={onResetZoom}
                title="重置缩放"
            >
                🎯
            </button>

            <button
                className="btn_zoom"
                onClick={onZoomIn}
                title="放大"
                disabled={isAtMaxZoom}
                style={{
                    opacity: isAtMaxZoom ? 0.5 : 1,
                    cursor: isAtMaxZoom ? 'not-allowed' : 'pointer'
                }}
            >
                ➕
            </button>
        </div>
    );
};
