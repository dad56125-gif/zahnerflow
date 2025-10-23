import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { FurnacePreset, ProgramSegment } from '@zahnerflow/types';

/**
 * 预设写入限制器
 * 防止频繁写入操作，限制最小写入间隔
 */
class PresetWriteLimiter {
  private lastWriteAt: number = 0;
  private readonly intervalMs = 5000;

  check(): void {
    const now = Date.now();
    const delta = now - this.lastWriteAt;
    if (delta < this.intervalMs) {
      const wait = Math.ceil((this.intervalMs - delta) / 1000);
      throw new HttpException(
        { message: `Rate limited. Retry after ${wait}s.` },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    this.lastWriteAt = now;
  }
}

/**
 * 熔炉数据管理服务
 * 负责所有数据管理相关逻辑：预设管理、历史数据、数据持久化等
 */
@Injectable()
export class FurnaceDataService {
  private readonly logger = new Logger(FurnaceDataService.name);
  private readonly dataDir: string;
  private readonly presetFile: string;
  private writeLimiter = new PresetWriteLimiter();

  constructor() {
    this.dataDir = path.join(process.cwd(), 'apps', 'backend', 'data', 'furnace');
    this.presetFile = path.join(this.dataDir, 'presets.json');
  }

  // ---------- 数据目录管理 ----------
  private async ensureDataDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  // ---------- 预设数据管理 ----------
  private async loadPresets(): Promise<FurnacePreset[]> {
    await this.ensureDataDir();
    try {
      const raw = await fs.readFile(this.presetFile, 'utf-8');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private async savePresets(list: FurnacePreset[]): Promise<void> {
    await this.ensureDataDir();
    const tmp = this.presetFile + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf-8');
    await fs.rename(tmp, this.presetFile);
  }

  /**
   * 获取预设列表（仅包含基本信息）
   */
  async listPresets(): Promise<Pick<FurnacePreset, 'name' | 'createdAt' | 'updatedAt'>[]> {
    const list = await this.loadPresets();
    return list.map(({ name, createdAt, updatedAt }) => ({ name, createdAt, updatedAt }));
  }

  /**
   * 获取完整预设信息
   */
  async getPreset(name: string): Promise<FurnacePreset> {
    const list = await this.loadPresets();
    const p = list.find(x => x.name === name);
    if (!p) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    return p;
  }

  /**
   * 创建新预设
   */
  async createPreset(
    name: string,
    segments: ProgramSegment[],
    summary?: string
  ): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const now = new Date().toISOString();
    const list = await this.loadPresets();
    if (list.some(x => x.name === name)) {
      throw new HttpException('Preset name already exists', HttpStatus.CONFLICT);
    }
    const preset: FurnacePreset = {
      name,
      createdAt: now,
      updatedAt: now,
      segments,
      summary
    } as any;
    list.push(preset);
    await this.savePresets(list);
    return preset;
  }

  /**
   * 更新预设
   */
  async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const idx = list.findIndex(x => x.name === name);
    if (idx < 0) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    list[idx] = { ...list[idx], segments, updatedAt: new Date().toISOString() };
    await this.savePresets(list);
    return list[idx];
  }

  /**
   * 删除预设
   */
  async deletePreset(name: string): Promise<void> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const next = list.filter(x => x.name !== name);
    await this.savePresets(next);
  }

  /**
   * 克隆预设
   */
  async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const src = list.find(x => x.name === name);
    if (!src) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    if (list.some(x => x.name === newName)) {
      throw new HttpException('Preset name already exists', HttpStatus.CONFLICT);
    }
    const now = new Date().toISOString();
    const clone: FurnacePreset = {
      name: newName,
      createdAt: now,
      updatedAt: now,
      segments: src.segments,
      summary: src.summary
    } as any;
    list.push(clone);
    await this.savePresets(list);
    return clone;
  }

  /**
   * 应用预设到设备（幂等操作 + 回滚机制）
   */
  async applyPreset(
    name: string,
    getDeviceSegments: () => Promise<ProgramSegment[]>,
    setDeviceSegments: (segments: ProgramSegment[]) => Promise<void>
  ): Promise<{ changed: boolean; steps: string[] }> {
    this.writeLimiter.check();
    const preset = await this.getPreset(name);

    const before: ProgramSegment[] = await getDeviceSegments();
    const steps: string[] = [];

    try {
      // 比较差异（若完全一致则幂等不写入）
      const same = this.segmentsEqual(before, preset.segments);
      if (same) {
        steps.push('No change (idempotent).');
        return { changed: false, steps };
      }

      // 写入目标段
      await setDeviceSegments(preset.segments);

      // 校验
      const after = await getDeviceSegments();
      if (!this.segmentsEqual(after, preset.segments)) {
        throw new Error('Verification failed after write');
      }
      steps.push('Applied preset and verified.');
      return { changed: true, steps };
    } catch (err: any) {
      this.logger.warn(`Apply failed, rolling back: ${err?.message || err}`);
      // 回滚
      try {
        await setDeviceSegments(before);
        steps.push('Rolled back to snapshot.');
      } catch (rbErr) {
        steps.push('Rollback failed. Manual intervention required.');
      }
      throw new HttpException(
        { message: 'Apply failed and rolled back', steps },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 比较两个程序段数组是否相等
   */
  private segmentsEqual(a: ProgramSegment[], b: ProgramSegment[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (!x || !y) return false;
      if (x.id !== y.id || x.temperature !== y.temperature || x.time !== y.time) return false;
    }
    return true;
  }

  // ---------- 历史数据管理 ----------
  /**
   * 获取历史数据
   * TODO: 集成采样服务实现历史数据查询
   */
  async getHistoryData(params: {
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    // 这里应该调用采样服务获取历史数据
    this.logger.log(`Getting history data with params: ${JSON.stringify(params)}`);

    // 临时返回空数组，实际实现中需要集成采样服务
    return {
      data: [],
      total: 0,
      params
    };
  }

  /**
   * 导出数据
   * TODO: 实现数据导出功能
   */
  async exportData(params: {
    start_date?: string;
    end_date?: string;
    format?: 'csv' | 'json' | 'excel';
  }): Promise<{ download_url: string; filename: string }> {
    this.logger.log(`Exporting data with params: ${JSON.stringify(params)}`);

    // 临时返回，实际实现中需要生成导出文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `furnace_data_${timestamp}.${params.format || 'csv'}`;

    return {
      download_url: `/api/furnace/download/${filename}`,
      filename
    };
  }

  /**
   * 清理过期数据
   * TODO: 实现数据清理逻辑
   */
  async cleanupData(olderThanDays: number = 30): Promise<{ deleted_count: number }> {
    this.logger.log(`Cleaning up data older than ${olderThanDays} days`);

    // 临时返回，实际实现中需要删除过期数据
    return { deleted_count: 0 };
  }
}