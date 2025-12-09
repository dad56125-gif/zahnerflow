/**
 * 通用设备连接面板组件
 * 
 * 提供设备连接 UI 的通用实现，支持：
 * - 端口选择
 * - 连接/断开操作
 * - 连接状态显示
 * - 错误状态显示
 */

import React from 'react';
import { DeviceConnectionStatus } from './types';

// ==================== Props 类型 ====================

export interface DeviceConnectionPanelProps {
    /** 设备名称（用于显示） */
    deviceName: string;

    /** 当前连接状态 */
    connectionStatus: DeviceConnectionStatus;

    /** 可用端口列表 */
    availablePorts: string[];

    /** 当前选中的端口 */
    selectedPort: string;

    /** 端口选择变更回调 */
    onPortChange: (port: string) => void;

    /** 刷新端口列表回调（可选） */
    onRefreshPorts?: () => void;

    /** 连接回调 */
    onConnect: () => void;

    /** 断开连接回调 */
    onDisconnect: () => void;

    /** 是否正在加载 */
    isLoading?: boolean;

    /** 错误信息（可选） */
    errorMessage?: string;

    /** 额外的连接信息（已连接状态显示） */
    connectionInfo?: React.ReactNode;

    /** 自定义 CSS 类名 */
    className?: string;
}

// ==================== 组件实现 ====================

export const DeviceConnectionPanel: React.FC<DeviceConnectionPanelProps> = ({
    deviceName,
    connectionStatus,
    availablePorts,
    selectedPort,
    onPortChange,
    onRefreshPorts,
    onConnect,
    onDisconnect,
    isLoading = false,
    errorMessage,
    connectionInfo,
    className = '',
}) => {
    const isConnecting = connectionStatus === 'connecting';
    const isConnected = connectionStatus === 'connected';
    const isError = connectionStatus === 'error';

    return (
        <div className={`device-connection-section ${className}`}>
            {/* 未连接状态：显示端口选择面板 */}
            {!isConnected && (
                <div className={`device-connection-panel ${isError ? 'error' : ''}`}>
                    <div className="connection-header">
                        <h4>{deviceName}设备连接</h4>
                        {availablePorts.length === 0 && !isLoading && (
                            <div className="status-message warning">
                                ⚠️ 未检测到可用端口，请检查物理连接
                            </div>
                        )}
                        {isError && errorMessage && (
                            <div className="status-message error">
                                ❌ {errorMessage}
                            </div>
                        )}
                    </div>

                    <div className="control-group">
                        <select
                            value={selectedPort}
                            onChange={(e) => onPortChange(e.target.value)}
                            disabled={isConnecting || availablePorts.length === 0}
                            className="port-select"
                        >
                            <option value="">-- 选择端口 --</option>
                            {availablePorts.map((port) => (
                                <option key={port} value={port}>
                                    {port}
                                </option>
                            ))}
                        </select>

                        {onRefreshPorts && (
                            <button
                                onClick={onRefreshPorts}
                                className="btn_base btn_layout btn_style_common btn_medium btn_secondary"
                                disabled={isLoading}
                            >
                                刷新
                            </button>
                        )}

                        <button
                            onClick={onConnect}
                            disabled={!selectedPort || isConnecting || isLoading}
                            className="btn_base btn_layout btn_style_common btn_medium btn_primary"
                        >
                            {isConnecting ? '连接中...' : '连接'}
                        </button>
                    </div>
                </div>
            )}

            {/* 已连接状态：显示连接信息 */}
            {isConnected && (
                <div className="device-connection-panel connected">
                    <div className="connection-status-header">
                        <div className="status-indicator success"></div>
                        <h4>{deviceName}设备已连接</h4>
                    </div>

                    <div className="connection-info">
                        <div className="info-item">
                            <span className="info-label">连接端口:</span>
                            <span className="info-value">{selectedPort}</span>
                        </div>
                        {connectionInfo}
                    </div>

                    <div className="connection-actions">
                        <button
                            onClick={onDisconnect}
                            className="btn_base btn_layout btn_style_common btn_medium btn_danger"
                            disabled={isLoading}
                        >
                            断开连接
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeviceConnectionPanel;
