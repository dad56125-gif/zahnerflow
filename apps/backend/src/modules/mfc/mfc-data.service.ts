import { Injectable, Logger } from '@nestjs/common';
import { MfcDeviceInfo, MfcStatus, MfcSample } from '@zahnerflow/types';

/**
 * 流量历史查询参数
 */
export interface FlowHistoryQuery {
  device_address?: number;
  from?: Date;
  to?: Date;
  limit?: number;
  downsample?: number;
}

/**
 * 通信日志条目
 */
export interface CommunicationLogEntry {
  timestamp: string;
  direction: 'TX' | 'RX' | 'ERROR';
  data: string;
  connection_id?: string;
  error?: string;
  error_category?: string;
}

/**
 * 错误统计信息
 */
export interface ErrorStats {
  total_errors: number;
  recent_errors_5min: number;
  error_categories: Record<string, number>;
  last_error_time: string;
}

/**
 * MFC数据服务
 *
 * 负责MFC设备的历史数据管理、统计分析和数据持久化
 */
@Injectable()
export class MfcDataService {
  private readonly logger = new Logger(MfcDataService.name);

  // 内存数据存储 - 生产环境应使用数据库
  private flowHistory: MfcSample[] = [];
  private communicationLog: CommunicationLogEntry[] = [];
  private errorStats: ErrorStats = {
    total_errors: 0,
    recent_errors_5min: 0,
    error_categories: {},
    last_error_time: '',
  };

  // 数据清理配置
  private readonly MAX_HISTORY_SIZE = 10000;
  private readonly MAX_LOG_SIZE = 5000;
  private readonly CLEANUP_INTERVAL = 300000; // 5分钟

  constructor() {
    // 启动定期清理任务
    this.startPeriodicCleanup();
  }

  // ==================== 流量数据管理 ====================

  /**
   * 添加流量采样数据
   */
  addFlowSample(sample: MfcSample): void {
    try {
      this.flowHistory.push(sample);

      // 限制历史数据大小
      if (this.flowHistory.length > this.MAX_HISTORY_SIZE) {
        this.flowHistory = this.flowHistory.slice(-this.MAX_HISTORY_SIZE);
      }

      this.logger.debug(`Added flow sample for device ${sample.address}: ${sample.flow_sccm} sccm`);
    } catch (error) {
      this.logger.error('Failed to add flow sample', error);
    }
  }

  /**
   * 查询历史流量数据
   */
  async queryFlowHistory(query: FlowHistoryQuery): Promise<{
    samples: MfcSample[];
    total: number;
    query_info: FlowHistoryQuery;
  }> {
    try {
      let filteredData = [...this.flowHistory];

      // 按设备地址过滤
      if (query.device_address !== undefined) {
        filteredData = filteredData.filter(sample => sample.address === query.device_address);
      }

      // 按时间范围过滤
      if (query.from) {
        const fromDate = new Date(query.from);
        filteredData = filteredData.filter(sample => new Date(sample.ts) >= fromDate);
      }

      if (query.to) {
        const toDate = new Date(query.to);
        filteredData = filteredData.filter(sample => new Date(sample.ts) <= toDate);
      }

      // 限制返回数量
      if (query.limit && query.limit > 0) {
        filteredData = filteredData.slice(-query.limit);
      }

      // 降采样处理
      if (query.downsample && query.downsample > 1 && filteredData.length > query.downsample) {
        filteredData = this.performDownsample(filteredData, query.downsample);
      }

      return {
        samples: filteredData,
        total: this.flowHistory.length,
        query_info: query,
      };
    } catch (error) {
      this.logger.error('Failed to query flow history', error);
      throw error;
    }
  }

  /**
   * 获取最新的流量数据
   */
  getLatestFlowSamples(device_address?: number, count: number = 10): MfcSample[] {
    let data = [...this.flowHistory];

    if (device_address !== undefined) {
      data = data.filter(sample => sample.address === device_address);
    }

    return data.slice(-count);
  }

  // ==================== 通信日志管理 ====================

  /**
   * 添加通信日志条目
   */
  addCommunicationLog(entry: Omit<CommunicationLogEntry, 'timestamp'>): void {
    try {
      const logEntry: CommunicationLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      };

      this.communicationLog.push(logEntry);

      // 限制日志大小
      if (this.communicationLog.length > this.MAX_LOG_SIZE) {
        this.communicationLog = this.communicationLog.slice(-this.MAX_LOG_SIZE);
      }

      // 更新错误统计
      if (entry.direction === 'ERROR') {
        this.updateErrorStats(entry);
      }

      this.logger.debug(`Added communication log: ${entry.direction} - ${entry.data}`);
    } catch (error) {
      this.logger.error('Failed to add communication log', error);
    }
  }

  /**
   * 获取通信日志
   */
  getCommunicationLog(limit?: number): CommunicationLogEntry[] {
    let logs = [...this.communicationLog];

    if (limit && limit > 0) {
      logs = logs.slice(-limit);
    }

    return logs.reverse(); // 最新的在前
  }

  /**
   * 清空通信日志
   */
  clearCommunicationLog(): { ok: boolean; cleared_count: number } {
    const count = this.communicationLog.length;
    this.communicationLog = [];

    // 重置错误统计
    this.errorStats = {
      total_errors: 0,
      recent_errors_5min: 0,
      error_categories: {},
      last_error_time: '',
    };

    this.logger.log(`Cleared ${count} communication log entries`);

    return {
      ok: true,
      cleared_count: count,
    };
  }

  // ==================== 错误统计管理 ====================

  /**
   * 获取错误统计信息
   */
  getErrorStats(): ErrorStats {
    // 计算最近5分钟的错误数
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentErrors = this.communicationLog.filter(
      entry => entry.direction === 'ERROR' && new Date(entry.timestamp) > fiveMinutesAgo
    );

    return {
      ...this.errorStats,
      recent_errors_5min: recentErrors.length,
    };
  }

  /**
   * 更新错误统计
   */
  private updateErrorStats(entry: Omit<CommunicationLogEntry, 'timestamp'>): void {
    this.errorStats.total_errors++;
    this.errorStats.last_error_time = new Date().toISOString();

    if (entry.error_category) {
      this.errorStats.error_categories[entry.error_category] =
        (this.errorStats.error_categories[entry.error_category] || 0) + 1;
    }
  }

  // ==================== 数据统计和分析 ====================

  /**
   * 获取设备统计信息
   */
  getDeviceStatistics(device_address?: number): {
    total_samples: number;
    latest_sample?: MfcSample;
    average_flow?: number;
    max_flow?: number;
    min_flow?: number;
    device_status: 'active' | 'inactive' | 'error';
  } {
    let deviceData = [...this.flowHistory];

    if (device_address !== undefined) {
      deviceData = deviceData.filter(sample => sample.address === device_address);
    }

    if (deviceData.length === 0) {
      return {
        total_samples: 0,
        device_status: 'inactive',
      };
    }

    const latestSample = deviceData[deviceData.length - 1];
    const flowValues = deviceData.map(sample => sample.flow_sccm);

    // 判断设备状态（基于最后通信时间）
    const lastCommunication = new Date(latestSample.ts);
    const now = new Date();
    const timeDiff = now.getTime() - lastCommunication.getTime();
    const deviceStatus = timeDiff > 60000 ? 'inactive' : 'active'; // 1分钟无数据视为非活跃

    return {
      total_samples: deviceData.length,
      latest_sample: latestSample,
      average_flow: flowValues.reduce((a, b) => a + b, 0) / flowValues.length,
      max_flow: Math.max(...flowValues),
      min_flow: Math.min(...flowValues),
      device_status: deviceStatus,
    };
  }

  /**
   * 获取系统概览
   */
  getSystemOverview(): {
    total_devices: number;
    active_devices: number;
    total_samples: number;
    total_errors: number;
    system_status: 'healthy' | 'warning' | 'error';
    last_update: string;
  } {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    // 找出所有活跃的设备地址
    const activeDevices = new Set(
      this.flowHistory
        .filter(sample => new Date(sample.ts) > oneMinuteAgo)
        .map(sample => sample.address)
    );

    const totalDevices = new Set(
      this.flowHistory.map(sample => sample.address)
    ).size;

    // 判断系统状态
    let systemStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    if (this.errorStats.recent_errors_5min > 10) {
      systemStatus = 'error';
    } else if (this.errorStats.recent_errors_5min > 3 || activeDevices.size === 0) {
      systemStatus = 'warning';
    }

    return {
      total_devices: totalDevices,
      active_devices: activeDevices.size,
      total_samples: this.flowHistory.length,
      total_errors: this.errorStats.total_errors,
      system_status: systemStatus,
      last_update: now.toISOString(),
    };
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 执行数据降采样
   */
  private performDownsample(data: MfcSample[], factor: number): MfcSample[] {
    const downsampled: MfcSample[] = [];

    for (let i = 0; i < data.length; i += factor) {
      const chunk = data.slice(i, i + factor);
      if (chunk.length > 0) {
        // 计算平均值
        const avgFlow = chunk.reduce((sum, sample) => sum + sample.flow_sccm, 0) / chunk.length;
        const avgPercent = chunk.reduce((sum, sample) => sum + sample.flow_percent, 0) / chunk.length;
        const avgDigitalSetpoint = chunk.reduce((sum, sample) => sum + sample.digital_setpoint_percent, 0) / chunk.length;
        const avgActiveSetpoint = chunk.reduce((sum, sample) => sum + sample.active_setpoint_percent, 0) / chunk.length;

        downsampled.push({
          ...chunk[0], // 使用第一个样本的时间戳和地址
          flow_sccm: Number(avgFlow.toFixed(2)),
          flow_percent: Number(avgPercent.toFixed(2)),
          digital_setpoint_percent: Number(avgDigitalSetpoint.toFixed(2)),
          active_setpoint_percent: Number(avgActiveSetpoint.toFixed(2)),
        });
      }
    }

    return downsampled;
  }

  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL);

    this.logger.log('Started periodic cleanup task');
  }

  /**
   * 执行数据清理
   */
  private performCleanup(): void {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // 清理一小时前的流量数据（保留部分用于统计）
      const recentFlowData = this.flowHistory.filter(
        sample => new Date(sample.ts) > oneHourAgo
      );

      // 如果清理后数据太少，保留最近的数据
      if (recentFlowData.length < 1000) {
        this.flowHistory = this.flowHistory.slice(-2000);
      } else {
        this.flowHistory = recentFlowData;
      }

      // 清理旧的通信日志
      const recentLogData = this.communicationLog.filter(
        entry => new Date(entry.timestamp) > oneHourAgo
      );

      if (recentLogData.length < 500) {
        this.communicationLog = this.communicationLog.slice(-1000);
      } else {
        this.communicationLog = recentLogData;
      }

      this.logger.debug('Periodic cleanup completed');
    } catch (error) {
      this.logger.error('Failed to perform cleanup', error);
    }
  }
}