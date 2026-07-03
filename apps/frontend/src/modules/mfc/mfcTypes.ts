/**
 * MFC 模块类型定义
 *
 * 共享类型从 @zahnerflow/types 导入（自动生成）。
 * 此文件仅定义前端特有的组件 Props 类型。
 */

// 从共享包导入基础类型
import type {
  MfcDeviceInfo,
  MfcStatus,
  MfcSetpointRequest,
  MfcScanRequest,
  ChartDataPoint,
} from '@zahnerflow/types';

// 重导出基础类型（保持向后兼容）
export type {
  MfcDeviceInfo,
  MfcStatus,
  MfcSetpointRequest,
  MfcScanRequest,
  ChartDataPoint,
};

// ==================== 前端特有的运行时数据类型 ====================

/** MFC 设备运行时状态（扩展 MfcDeviceInfo，添加前端运行时字段） */
export interface MfcDevice extends MfcDeviceInfo {
  /** 实际流量 (sccm) */
  flowSccm: number;
  /** 设定流量 (sccm) */
  setFlow: number;
  /** 实际流量百分比 (0-100) */
  flowPercent: number;
  /** 数字通道设定百分比 (0-100) */
  digitalSetpointPercent: number;
  /** 实际生效设定百分比 (0-100) */
  activeSetpointPercent: number;
  /** 运行模式 */
  mode: 'follow' | 'override';
  /** 设备连接状态 */
  status: 'connected' | 'disconnected' | 'warning' | 'error';
}

/** MFC 历史数据样本 */
export interface MfcSample {
  /** 时间戳 (ISO) */
  timestamp: string;
  /** 设备地址 */
  address: number;
  /** 实际流量 (sccm) */
  flowSccm: number;
  /** 实际流量百分比 (0-100) */
  flowPercent: number;
  /** 数字通道设定百分比 */
  digitalSetpointPercent: number;
  /** 实际生效设定百分比 */
  activeSetpointPercent: number;
}

// ==================== 前端特有的组件 Props 类型 ====================

/** 设备卡片 Props */
export interface DeviceCardProps {
  device: MfcDeviceInfo;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onConfigure?: () => void;
}
