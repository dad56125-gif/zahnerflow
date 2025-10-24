import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { FurnacePreset, ProgramSegment, FurnaceSample } from '@zahnerflow/types';

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

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

/**
 * 熔炉数据管理服务
 * 负责所有数据管理相关逻辑：预设管理、历史数据、数据持久化等
 */
@Injectable()
export class FurnaceDataService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceDataService.name);
  private readonly dataDir: string;
  private readonly presetFile: string;
  private readonly samplesDir: string;
  private writeLimiter = new PresetWriteLimiter();

  // 采样数据缓冲区
  private furnaceBuf: FurnaceSample[] = [];
  private readonly maxKeepMs = 3600 * 1000; // 1h

  constructor() {
    this.dataDir = path.join(process.cwd(), 'apps', 'backend', 'data', 'furnace');
    this.presetFile = path.join(this.dataDir, 'presets.json');
    this.samplesDir = path.join(this.dataDir, 'samples');
  }

  async onModuleInit() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.samplesDir, { recursive: true });
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

  // ---------- 采样数据管理 ----------
  /**
   * 添加熔炉采样数据（用于轮询管理器）
   */
  async addFurnaceSample(samplingData: {
    device_name: string;
    timestamp: string;
    temperature: number;
    sv: number;
    mv: number;
  }): Promise<void> {
    const sample: FurnaceSample = {
      ts: samplingData.timestamp,
      pv: samplingData.temperature,
      sv: samplingData.sv,
      mv: samplingData.mv,
      segment: 0,
      segmentTime: 0,
      segmentTimeSet: 0,
    };

    // 添加到内存缓冲区
    this.furnaceBuf.push(sample);

    // 写入文件
    const now = new Date(samplingData.timestamp);
    await this.appendJsonl(path.join(this.samplesDir, `${isoDate(now)}.jsonl`), [sample]);

    this.logger.debug(`Added furnace sample: ${samplingData.temperature}°C at ${samplingData.timestamp}`);
  }

  /**
   * 查询熔炉历史数据
   */
  async queryFurnace(from?: string, to?: string, limit?: number, downsample?: number) {
    return this.queryGeneric(this.furnaceBuf, from, to, limit, downsample);
  }

  private async appendJsonl(filePath: string, data: any | any[]) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const lines = Array.isArray(data) ? data.map((x) => JSON.stringify(x)).join('\n') + '\n' : JSON.stringify(data) + '\n';
    await fs.appendFile(filePath, lines, 'utf-8');
  }

  private async queryGeneric(mem: any[], from?: string, to?: string, limit?: number, downsample?: number) {
    const fromMs = from ? new Date(from).getTime() : 0;
    const toMs = to ? new Date(to).getTime() : Date.now();
    // from..to day files
    const days = this.enumerateDays(fromMs, toMs);
    const fileData = await this.readFiles(days, fromMs, toMs);
    const memData = mem.filter((s) => {
      const t = new Date(s.ts).getTime();
      return t >= fromMs && t <= toMs;
    });
    let merged = [...fileData, ...memData];
    merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    if (downsample && downsample > 1) {
      merged = merged.filter((_, i) => i % downsample === 0);
    }
    if (limit && limit > 0 && merged.length > limit) {
      merged = merged.slice(-limit);
    }
    return merged;
  }

  private enumerateDays(fromMs: number, toMs: number): string[] {
    const days: string[] = [];
    const d = new Date(fromMs);
    d.setUTCHours(0, 0, 0, 0);
    while (d.getTime() <= toMs) {
      days.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
  }

  private async readFiles(days: string[], fromMs: number, toMs: number): Promise<any[]> {
    const out: any[] = [];
    for (const day of days) {
      const p = path.join(this.samplesDir, `${day}.jsonl`);
      try {
        const raw = await fs.readFile(p, 'utf-8');
        for (const line of raw.split(/\r?\n/)) {
          const s = line.trim(); if (!s) continue;
          try {
            const obj = JSON.parse(s);
            const t = new Date(obj.ts).getTime();
            if (t >= fromMs && t <= toMs) out.push(obj);
          } catch {}
        }
      } catch {}
    }
    return out;
  }

  private trimBuffers(now: Date) {
    const cutoff = now.getTime() - this.maxKeepMs;
    this.furnaceBuf = this.furnaceBuf.filter(s => new Date(s.ts).getTime() >= cutoff);
  }

  // ---------- 历史数据管理 ----------
  /**
   * 获取历史数据
   */
  async getHistoryData(params: {
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const data = await this.queryFurnace(params.start_date, params.end_date, params.limit);
    return {
      data,
      total: data.length,
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