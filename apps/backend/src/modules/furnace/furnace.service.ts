import { Injectable, HttpException, HttpStatus, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import type { FurnacePreset, ProgramSegment } from '@zahnerflow/types';

class PresetWriteLimiter {
  private lastWriteAt: number = 0;
  private readonly intervalMs = 5000;

  check(): void {
    const now = Date.now();
    const delta = now - this.lastWriteAt;
    if (delta < this.intervalMs) {
      const wait = Math.ceil((this.intervalMs - delta) / 1000);
      throw new HttpException({ message: `Rate limited. Retry after ${wait}s.` }, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.lastWriteAt = now;
  }
}

@Injectable()
export class FurnaceService implements OnModuleInit {
  private readonly logger = new Logger(FurnaceService.name);
  private readonly dataDir: string;
  private readonly presetFile: string;
  private writeLimiter = new PresetWriteLimiter();

  constructor(private readonly device: FurnaceDeviceService) {
    this.dataDir = path.join(process.cwd(), 'apps', 'backend', 'data', 'furnace');
    this.presetFile = path.join(this.dataDir, 'presets.json');
  }

  async onModuleInit(): Promise<void> {
    try {
      const h = await this.device.health();
      this.logger.log(`Furnace FastAPI health: ${JSON.stringify(h)}`);
    } catch (e: any) {
      this.logger.warn(`Furnace FastAPI health check failed: ${e?.message || e}`);
    }
  }

  // ---------- Device passthrough ----------
  async passthrough(action: 'connect'|'disconnect'|'run'|'pause'|'stop', body?: any) {
    if (action === 'connect') return this.device.connect(body);
    if (action === 'disconnect') return this.device.disconnect();
    if (action === 'run') return this.device.run();
    if (action === 'pause') return this.device.pause();
    if (action === 'stop') return this.device.stop();
  }

  async status() { return this.device.status(); }
  async ports() { return this.device.ports(); }
  async getCommLog() { return this.device.getCommLog(); }
  async setSv(sv: number) { return this.device.setSv(sv); }
  async setSegment(segment: number) { return this.device.setSegment(segment); }
  async getProgramSegments(): Promise<ProgramSegment[]> { return this.device.getProgramSegments(); }
  async setProgramSegments(segments: ProgramSegment[]): Promise<any> { return this.device.setProgramSegments(segments as any); }

  // ---------- Presets storage ----------
  private async ensureDataDir() { await fs.mkdir(this.dataDir, { recursive: true }); }

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

  async listPresets(): Promise<Pick<FurnacePreset, 'name'|'createdAt'|'updatedAt'>[]> {
    const list = await this.loadPresets();
    return list.map(({ name, createdAt, updatedAt }) => ({ name, createdAt, updatedAt }));
  }

  async getPreset(name: string): Promise<FurnacePreset> {
    const list = await this.loadPresets();
    const p = list.find(x => x.name === name);
    if (!p) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    return p;
  }

  async createPreset(name: string, segments: ProgramSegment[], summary?: string): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const now = new Date().toISOString();
    const list = await this.loadPresets();
    if (list.some(x => x.name === name)) throw new HttpException('Preset name already exists', HttpStatus.CONFLICT);
    const preset: FurnacePreset = { name, createdAt: now, updatedAt: now, segments, summary } as any;
    list.push(preset);
    await this.savePresets(list);
    return preset;
  }

  async updatePreset(name: string, segments: ProgramSegment[]): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const idx = list.findIndex(x => x.name === name);
    if (idx < 0) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    list[idx] = { ...list[idx], segments, updatedAt: new Date().toISOString() };
    await this.savePresets(list);
    return list[idx];
  }

  async deletePreset(name: string): Promise<void> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const next = list.filter(x => x.name !== name);
    await this.savePresets(next);
  }

  async clonePreset(name: string, newName: string): Promise<FurnacePreset> {
    this.writeLimiter.check();
    const list = await this.loadPresets();
    const src = list.find(x => x.name === name);
    if (!src) throw new HttpException('Preset not found', HttpStatus.NOT_FOUND);
    if (list.some(x => x.name === newName)) throw new HttpException('Preset name already exists', HttpStatus.CONFLICT);
    const now = new Date().toISOString();
    const clone: FurnacePreset = { name: newName, createdAt: now, updatedAt: now, segments: src.segments, summary: src.summary } as any;
    list.push(clone);
    await this.savePresets(list);
    return clone;
  }

  // 幂等应用 + 回滚
  async applyPreset(name: string): Promise<{ changed: boolean; steps: string[] }> {
    this.writeLimiter.check();
    const preset = await this.getPreset(name);

    const before: ProgramSegment[] = await this.getProgramSegments();
    const steps: string[] = [];
    try {
      // 比较差异（若完全一致则幂等不写入）
      const same = this.segmentsEqual(before, preset.segments);
      if (same) {
        steps.push('No change (idempotent).');
        return { changed: false, steps };
      }
      // 写入目标段
      await this.setProgramSegments(preset.segments);
      // 校验
      const after = await this.getProgramSegments();
      if (!this.segmentsEqual(after, preset.segments)) {
        throw new Error('Verification failed after write');
      }
      steps.push('Applied preset and verified.');
      return { changed: true, steps };
    } catch (err: any) {
      this.logger.warn(`Apply failed, rolling back: ${err?.message || err}`);
      // 回滚
      try {
        await this.setProgramSegments(before);
        steps.push('Rolled back to snapshot.');
      } catch (rbErr) {
        steps.push('Rollback failed. Manual intervention required.');
      }
      throw new HttpException({ message: 'Apply failed and rolled back', steps }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

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
}
