/**
 * Furnace 模块类型定义
 *
 * 共享类型从 @zahnerflow/types 导入（自动生成）。
 * 此文件仅定义前端特有的组件 Props 类型和配置常量。
 */

// 从共享包导入基础类型
import type {
  FurnaceStatus,
  ProgramSegment,
  FurnacePreset,
  FurnaceConnectRequest,
  FurnaceConfig,
  SegmentProgress,
  HistoryQueryParams,
  ChartDataPoint,
  DeviceError,
  LogEntry,
} from '@zahnerflow/types';

// 重导出基础类型（保持向后兼容）
export type {
  FurnaceStatus,
  ProgramSegment,
  FurnacePreset,
  FurnaceConnectRequest,
  FurnaceConfig,
  SegmentProgress,
  HistoryQueryParams,
  ChartDataPoint,
  DeviceError,
  LogEntry,
};

// ==================== 前端特有的数据类型 ====================

/** 预设元数据（列表展示用，比 FurnacePreset 轻量） */
export type FurnacePresetMeta = Pick<FurnacePreset, 'name' | 'summary' | 'createdAt' | 'updatedAt'>;

/** 带时间戳的加热炉采样数据（历史查询返回格式） */
export interface FurnaceSampleWithTimestamp {
  timestamp: string;
  temperature: number;
  sv?: number;
  mv?: number;
  segment?: number;
  segmentTime?: number;
  segmentTimeSet?: number;
}
