/**
 * 统一设备 runtime 契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/runtime_device.py
 */

export interface RuntimeDeviceStatusEnvelope {
  /** 设备类型 */
  device: string;
  /** 设备是否已连接 */
  connected: boolean;
  /** 运行模式: real / simulator / disconnected */
  mode: string;
  /** 模拟器 profile / 故障预设 */
  profile?: string | null;
  /** 状态产生时间 (ISO) */
  timestamp: string;
  /** 设备专属状态载荷 */
  payload: Record<string, any>;
  /** 统一连接状态信息 */
  connectionState: Record<string, any>;
  /** 最近命令、错误和扫描诊断 */
  diagnostics?: Record<string, any>;
  /** 设备能力标记 */
  capabilities?: string[];
  /** 子设备数量，适用于 MFC */
  deviceCount?: number | null;
  /** 错误信息 */
  error?: string | null;
}

/** 设备类型 */
export type RuntimeDeviceKind = 'furnace' | 'mfc' | 'zahner';

/** 设备运行模式 */
export type RuntimeDeviceMode = 'real' | 'simulator' | 'disconnected';
