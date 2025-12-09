/**
 * 设备模块共用基础设施导出
 */

// 类型定义
export * from './types';

// 基础服务
export { BaseWebSocketService } from './BaseWebSocketService';
export type { WsServiceConfig, BaseCallbacks } from './BaseWebSocketService';

export { BaseDeviceApi, apiRequest } from './BaseDeviceApi';

// Hooks
export { useDeviceState, createBaseDeviceState } from './useDeviceState';
export type { BaseDeviceState, UseDeviceStateReturn } from './useDeviceState';

// Components
export { DeviceConnectionPanel } from './DeviceConnectionPanel';
export type { DeviceConnectionPanelProps } from './DeviceConnectionPanel';
