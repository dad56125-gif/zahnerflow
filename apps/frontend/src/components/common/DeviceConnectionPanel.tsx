/**
 * 通用设备连接面板组件
 *
 * 内部结构统一：端口选择（Dropdown）+ 连接按钮 + 已连接状态
 * 外部样式由 className 控制，不同设备通过 CSS 覆盖实现差异化
 */

import React, { useState } from 'react';
import { Dropdown } from '../shared/Dropdown';
import type { DeviceConnectionStatus } from '@zahnerflow/types';
import { SpacedCjkText } from './SpacedCjkText';

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

    /** 刷新端口列表回调（可选，不传则隐藏刷新按钮） */
    onRefreshPorts?: () => void;

    /** 连接回调 */
    onConnect: () => void;

    /** 断开连接回调 */
    onDisconnect: () => void;

    /** 是否正在加载 */
    isLoading?: boolean;

    /** 已连接时的额外信息插槽 */
    connectionInfo?: React.ReactNode;

    /** 自定义 CSS 类名（控制外层样式） */
    className?: string;
}

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
    connectionInfo,
    className = '',
}) => {
    const isConnecting = connectionStatus === 'connecting';
    const isConnected = connectionStatus === 'connected';
    const isError = connectionStatus === 'error';

    // Dropdown 状态
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [dropdownHiding, setDropdownHiding] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

    const openDropdown = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        setDropdownOpen(true);
        setDropdownHiding(false);
    };

    const closeDropdown = () => {
        setDropdownHiding(true);
        setTimeout(() => {
            setDropdownOpen(false);
            setDropdownHiding(false);
            setDropdownPosition(null);
        }, 200);
    };

    const selectPort = (port: string) => {
        onPortChange(port);
        closeDropdown();
    };

    // === 未连接状态 ===
    if (!isConnected) {
        return (
            <div className={`device-connection ${isError ? 'error' : ''}`}>
                <div className="connection__header">
                    <h4><SpacedCjkText text={`${deviceName}设备连接`} /></h4>
                </div>

                <div className="device-connection__control-group" style={{ justifyContent: 'space-between' }}>
                    {/* 端口选择器（Dropdown） */}
                    <div className="device-connection__port-selector">
                        <button
                            type="button"
                            className="btn btn--md btn--secondary"
                            onClick={openDropdown}
                            disabled={isConnecting || availablePorts.length === 0}
                            style={{ width: '100%', justifyContent: 'space-between' }}
                        >
                            <span>{selectedPort || <SpacedCjkText text="-- 选择端口 --" />}</span>
                            <svg className={`dropdown__arrow ${dropdownOpen ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                                <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <Dropdown
                            isOpen={dropdownOpen}
                            isHiding={dropdownHiding}
                            onClose={closeDropdown}
                            position={dropdownPosition || { top: 0, left: 0, width: 0 }}
                        >
                            {availablePorts.map(port => (
                                <div
                                    key={port}
                                    className={`dropdown__option ${selectedPort === port ? 'is-selected' : ''}`}
                                    onClick={() => selectPort(port)}
                                >
                                    {port}
                                </div>
                            ))}
                            {availablePorts.length === 0 && (
                                <div className="dropdown__option is-disabled"><SpacedCjkText text="无可用端口" /></div>
                            )}
                        </Dropdown>
                    </div>

                    {/* 按钮组：刷新 + 连接 */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {onRefreshPorts && (
                            <button
                                onClick={onRefreshPorts}
                                className="btn btn--md btn--secondary"
                                disabled={isLoading}
                            >
                                <SpacedCjkText text="刷新" />
                            </button>
                        )}

                        <button
                            onClick={onConnect}
                            disabled={!selectedPort || isConnecting || isLoading}
                            className="btn btn--md btn--primary"
                        >
                            {isConnecting ? <SpacedCjkText text="连接中..." /> : <SpacedCjkText text="连接" />}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // === 已连接状态 ===
    return (
        <div className="device-connection is-connected">
            <span className="device-connection__status"><SpacedCjkText text={`${deviceName}设备已连接`} /></span>
            <span className="device-connection__port"><SpacedCjkText text="端口" />: <strong>{selectedPort}</strong></span>
            {connectionInfo}
            <button
                onClick={onDisconnect}
                className="btn btn--sm btn--danger"
                disabled={isLoading}
            >
                <SpacedCjkText text="断开连接" />
            </button>
        </div>
    );
};

export default DeviceConnectionPanel;
