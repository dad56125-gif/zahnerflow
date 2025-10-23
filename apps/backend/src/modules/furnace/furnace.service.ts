import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FurnaceControlService, ConnectionState } from './furnace-control.service';
import { FurnaceDataService } from './furnace-data.service';
import type { FurnacePreset, ProgramSegment } from '@zahnerflow/types';

// 重新导出ConnectionState以保持兼容性
export { ConnectionState } from './furnace-control.service';

/**
 * 熔炉服务门面模式
 * 协调设备控制服务和数据管理服务，提供统一的API接口
 * 保持与现有Controller的兼容性
 */
@Injectable()
export class FurnaceService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceService.name);

  constructor(
    private readonly furnaceControl: FurnaceControlService,
    private readonly furnaceData: FurnaceDataService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('FurnaceService module initialized');
  }

  // ========== 门面模式方法 - 委托给相应服务 ==========

  // ---------- 连接状态管理 ----------
  getConnectionState(): ConnectionState {
    return this.furnaceControl.getConnectionState();
  }

  async attemptReconnection(): Promise<boolean> {
    return this.furnaceControl.attemptReconnection();
  }

  isDeviceConnected(): boolean {
    return this.furnaceControl.isDeviceConnected();
  }

  // ---------- Device passthrough ----------
  async passthrough(action: 'connect'|'disconnect'|'run'|'pause'|'stop', body?: any) {
    if (action === 'connect') return this.connect(body);
    if (action === 'disconnect') return this.disconnect();
    if (action === 'run') return this.run();
    if (action === 'pause') return this.pause();
    if (action === 'stop') return this.stop();
  }

  // ---------- 设备控制方法（委托给FurnaceControlService） ----------
  async connect(connectionParams: { port: string; baudrate?: number; address?: number; stopbits?: number; timeout?: number }): Promise<any> {
    return this.furnaceControl.connect(connectionParams);
  }

  async disconnect(): Promise<any> {
    return this.furnaceControl.disconnect();
  }

  async run(): Promise<any> {
    return this.furnaceControl.run();
  }

  async pause(): Promise<any> {
    return this.furnaceControl.pause();
  }

  async stop(): Promise<any> {
    return this.furnaceControl.stop();
  }

  async status(): Promise<any> {
    return this.furnaceControl.getStatus();
  }

  async ports(): Promise<string[]> {
    return this.furnaceControl.getPorts();
  }

  async getCommLog(): Promise<any> {
    return this.furnaceControl.getCommLog();
  }

  async setSv(sv: number): Promise<any> {
    return this.furnaceControl.setSv(sv);
  }

  async setSegment(segment: number): Promise<any> {
    return this.furnaceControl.setSegment(segment);
  }

  async getProgramSegments(): Promise<ProgramSegment[]> {
    return this.furnaceControl.getProgramSegments();
  }

  async setProgramSegments(segments: ProgramSegment[]): Promise<any> {
    return this.furnaceControl.setProgramSegments(segments);
  }

  is_device_busy(): boolean {
    return this.furnaceControl.isDeviceBusy();
  }

  // ---------- 数据管理方法（委托给FurnaceDataService） ----------
  async listPresets(): Promise<Pick<FurnacePreset, 'name'|'createdAt'|'updatedAt'>[]> {
    return this.furnaceData.listPresets();
  }

  async getPreset(name: string): Promise<FurnacePreset> {
    return this.furnaceData.getPreset(name);
  }

  async createPreset(name: string, segments: ProgramSegment[], summary?: string): Promise<FurnacePreset> {
    return this.furnaceData.createPreset(name, segments, summary);
  }

  async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    return this.furnaceData.updatePreset(name, segments);
  }

  async deletePreset(name: string): Promise<void> {
    return this.furnaceData.deletePreset(name);
  }

  async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    return this.furnaceData.clonePreset(name, newName);
  }

  // 应用预设 - 需要协调设备控制和数据管理
  async applyPreset(name: string): Promise<{ changed: boolean; steps: string[] }> {
    return this.furnaceData.applyPreset(
      name,
      () => this.furnaceControl.getProgramSegments(),
      (segments) => this.furnaceControl.setProgramSegments(segments)
    );
  }

  // 历史数据管理
  async getHistoryData(params: {
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    return this.furnaceData.getHistoryData(params);
  }

  async exportData(params: {
    start_date?: string;
    end_date?: string;
    format?: 'csv' | 'json' | 'excel';
  }): Promise<{ download_url: string; filename: string }> {
    return this.furnaceData.exportData(params);
  }

  async cleanupData(olderThanDays: number = 30): Promise<{ deleted_count: number }> {
    return this.furnaceData.cleanupData(olderThanDays);
  }
}
