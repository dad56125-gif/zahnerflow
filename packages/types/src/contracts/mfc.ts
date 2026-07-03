/**
 * MFC 数据契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/mfc.py
 */

export interface MfcDeviceInfo {
  /** Modbus 设备地址 */
  address: number;
  /** 气体类型 (如 N2, Ar, H2) */
  gasType: string;
  /** 满量程 (标准毫升/分钟) */
  maxFlowSccm: number;
  /** 设备名称 */
  name?: string;
  /** 串口号 */
  port?: string | null;
  /** 超时 (毫秒) */
  timeout?: number;
  /** 轮询间隔 (毫秒) */
  pollingInterval?: number;
}

export interface MfcStatus {
  /** 时间戳 (ISO 格式) */
  ts: string;
  /** 设备地址 */
  address: number;
  /** 实际流量 (sccm) */
  flowSccm: number;
  /** 实际流量百分比 (0-100) */
  flowPercent: number;
  /** 数字通道设定百分比 (0-100) */
  digitalSetpointPercent: number;
  /** 实际生效设定百分比 (0-100) */
  activeSetpointPercent: number;
}

export interface MfcSetpointRequest {
  /** 设备地址 */
  address: number;
  /** 目标流量 (标准毫升/分钟) */
  sccm: number;
}

export interface MfcScanRequest {
  /** 起始地址 */
  startAddress?: number;
  /** 结束地址 */
  endAddress?: number;
  /** 串口号 (可选) */
  port?: string | null;
  /** 每地址超时 (毫秒) */
  timeoutMs?: number | null;
}

export type MfcSample = MfcStatus;
