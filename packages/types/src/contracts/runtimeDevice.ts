/**
 * 统一设备 runtime 契约
 * 自动生成 — 勿手动修改
 * 来源: apps/shared/contracts/runtime_device.py
 */

export interface RuntimeDeviceState {
  /** 连接状态: disconnected / connecting / connected / communication_error */
  connectionStatus: string;
  /** 当前连接端口 */
  connectedPort?: string | null;
  /** 本次连接建立时间 (ISO) */
  connectedAt?: string | null;
  /** Furnace 执行状态: idle / running / paused / stopped / completed / error */
  executionStatus?: string | null;
  /** 当前 Furnace 程序执行 ID */
  executionId?: string | null;
  /** 当前 Furnace 程序段 */
  currentSegmentIndex?: number | null;
  /** 整次 Furnace 程序首次开始时间 (ISO) */
  startedAt?: string | null;
  /** 本次运行或恢复开始时间 (ISO) */
  currentRunStartedAt?: string | null;
  /** 已确认的有效运行时间 (秒) */
  accumulatedRunSeconds?: number;
  /** 停止或完成时间 (ISO) */
  stoppedAt?: string | null;
  /** 当前实时设备快照 */
  deviceStatus?: Record<string, any> | null;
  /** 本次扫描的设备快照 */
  scannedDevices?: Record<string, any>[];
  /** 最近一次成功通信时间 (ISO) */
  lastSuccessfulCommunicationAt?: string | null;
  /** 最近一次设备或运行时错误 */
  lastError?: Record<string, any> | null;
  /** 单调递增的状态版本 */
  stateVersion?: number;
  /** 状态更新时间 (ISO) */
  updatedAt: string;
}

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
  /** 后端权威运行时状态快照 */
  runtimeState: RuntimeDeviceState;
  /** 运行时状态版本 */
  stateVersion: number;
  /** 运行时状态更新时间 (ISO) */
  updatedAt: string;
}

/** 设备类型 */
export type RuntimeDeviceKind = 'furnace' | 'mfc' | 'zahner';

/** 设备运行模式 */
export type RuntimeDeviceMode = 'real' | 'simulator' | 'disconnected';
