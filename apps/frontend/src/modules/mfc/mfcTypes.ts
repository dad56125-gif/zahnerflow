/**
 * MFC 模块类型定义
 */

// 从 @zahnerflow/types 导入基础类型
export type {
  MfcDeviceInfo,
  MfcStatus,
  MfcSample
} from '@zahnerflow/types';

// 兼容性接口 - 使用 timestamp 而不是 ts
export interface MfcSampleWithTimestamp {
  timestamp: string;          // ISO 时间戳
  address: number;            // 设备地址
  flow_sccm: number;          // 实测流量（sccm）
  flow_percent: number;       // 实测流量百分比（0-100）
  digital_setpoint_percent: number; // 数字通道设定百分比
  active_setpoint_percent: number;  // 实际生效设定百分比
}

// 前端扩展类型定义
export interface MfcDevice extends MfcDeviceInfo {
  flow_sccm: number;               // 实际流量（sccm）
  set_flow: number;                // 设定流量（sccm）
  flow_percent: number;            // 实际流量百分比
  digital_setpoint_percent: number; // 数字通道设定百分比
  active_setpoint_percent: number;  // 实际生效设定百分比
  mode: 'hold' | 'follow';
  status: 'connected' | 'warning' | 'error' | 'disconnected';
}

export interface MfcSetpointRequest {
  address: number;
  sccm: number;
}

export interface MfcConfig {
  name: string;
  address: number;
  port?: string;
  timeout?: number;
  polling_interval?: number;
  gas_type: string;
  max_flow_sccm: number;
  calibration_factor?: number;
  flow_mode?: 'hold' | 'follow';
  retry_attempts?: number;
  retry_delay?: number;
}

// 默认配置常量
export const DEFAULT_MFC_CONFIG: MfcConfig = {
  name: 'MFC',
  address: 1,
  port: 'COM1',
  timeout: 3000,
  polling_interval: 500,
  gas_type: 'N2',
  max_flow_sccm: 1000,
  calibration_factor: 1.0,
  flow_mode: 'hold',
  retry_attempts: 3,
  retry_delay: 1000,
};

// MFC扫描请求类型
export interface MfcScanRequest {
  start_address?: number;
  end_address?: number;
  timeout_ms?: number;
  port?: string;  // 要扫描的端口，用于明确指定在哪个端口上扫描
}

// 组件Props类型
export interface DeviceCardProps {
  device: MfcDevice | any;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConfigure?: () => void;
}

// 图表数据类型
export interface FlowChartData {
  data: ChartDataPoint[];
  setpoint?: ChartDataPoint[];
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface ChartDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}
