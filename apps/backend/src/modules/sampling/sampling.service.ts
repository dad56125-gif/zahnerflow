import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { FurnaceDeviceService } from '../../devices/furnace-device.service';
import { MfcDeviceService } from '../../devices/mfc-device.service';
import { MfcService } from '../mfc/mfc.service';
import * as path from 'path';
import { promises as fs } from 'fs';
import type { FurnaceSample, MfcSample } from '@zahnerflow/types';

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

@Injectable()
export class SamplingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SamplingService.name);
  private timer?: NodeJS.Timeout;
  private readonly intervalMs = 1000;
  private readonly maxKeepMs = 3600 * 1000; // 1h
  private readonly idle_timeout_ms = 30_000;
  private furnaceBuf: FurnaceSample[] = [];
  private mfcBuf: MfcSample[] = [];
  private readonly baseDir: string;
  private active_devices = new Map<'furnace'|'mfc', number>();

  constructor(
    private readonly furnace: FurnaceDeviceService,
    private readonly mfc: MfcDeviceService,
    private readonly mfcService: MfcService,
  ) {
    this.baseDir = path.join(process.cwd(), 'apps', 'backend', 'data', 'samples');
  }

  async onModuleInit() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }
  onModuleDestroy() { this.stop(); }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  mark_device_activity(device: 'furnace'|'mfc') {
    this.active_devices.set(device, Date.now());
    this.start();
  }
  mark_device_inactive(device: 'furnace'|'mfc') {
    this.active_devices.delete(device);
    if (!this.active_devices.size) this.stop();
  }

  private collect_active_devices(now_ms: number): Set<'furnace'|'mfc'> {
    const active = new Set<'furnace'|'mfc'>();
    for (const [device, last] of this.active_devices.entries()) {
      if (now_ms - last <= this.idle_timeout_ms) active.add(device);
      else this.active_devices.delete(device);
    }
    if (!active.size) this.stop();
    return active;
  }

  private async tick() {
    const active = this.collect_active_devices(Date.now());
    if (!active.size) return;
    const now = new Date();
    const tasks: Promise<void>[] = [];
    if (active.has('furnace')) tasks.push(this.sampleFurnace(now));
    if (active.has('mfc')) tasks.push(this.sampleMfc(now));
    if (!tasks.length) return;
    await Promise.allSettled(tasks);
    this.trimBuffers(now);
  }

  private trimBuffers(now: Date) {
    const cutoff = now.getTime() - this.maxKeepMs;
    this.furnaceBuf = this.furnaceBuf.filter(s => new Date(s.ts).getTime() >= cutoff);
    this.mfcBuf = this.mfcBuf.filter(s => new Date(s.ts).getTime() >= cutoff);
  }

  private async sampleFurnace(now: Date) {
    try {
      const st = await this.furnace.status();
      const sample: FurnaceSample = {
        ts: now.toISOString(),
        pv: Number(st.pv ?? 0),
        sv: Number(st.sv ?? 0),
        mv: Number(st.mv ?? 0),
        segment: Number(st.segment ?? 0),
        segmentTime: Number(st.segment_time ?? 0),
        segmentTimeSet: Number(st.segment_time_set ?? 0),
      };
      this.furnaceBuf.push(sample);
      await this.appendJsonl(path.join(this.baseDir, 'furnace', `${isoDate(now)}.jsonl`), sample);
    } catch (e) {
      // ignore if device offline
    }
  }

  private async sampleMfc(now: Date) {
    try {
      // If specific devices discovered, we can sample all via /status (no address)
      const arr = await this.mfc.status(undefined);
      const list: MfcSample[] = Array.isArray(arr)
        ? arr.map((s: any) => ({
            ts: now.toISOString(),
            address: Number(s.address ?? 0),
            flow_sccm: Number(s.flowSccm ?? 0),
            flow_percent: Number(s.flowPercent ?? 0),
            digital_setpoint_percent: Number(s.digitalSetpointPercent ?? 0),
            active_setpoint_percent: Number(s.activeSetpointPercent ?? 0),
          }))
        : [];
      if (list.length) {
        this.mfcBuf.push(...list);
        await this.appendJsonl(path.join(this.baseDir, 'mfc', `${isoDate(now)}.jsonl`), list);
      }
    } catch (e) {
      // ignore if device offline
    }
  }

  private async appendJsonl(filePath: string, data: any | any[]) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const lines = Array.isArray(data) ? data.map((x) => JSON.stringify(x)).join('\n') + '\n' : JSON.stringify(data) + '\n';
    await fs.appendFile(filePath, lines, 'utf-8');
  }

  // 读取历史（合并内存与文件）
  async queryFurnace(from?: string, to?: string, limit?: number, downsample?: number) {
    return this.queryGeneric('furnace', this.furnaceBuf, from, to, limit, downsample);
  }
  async queryMfc(address?: number, from?: string, to?: string, limit?: number, downsample?: number) {
    const data = await this.queryGeneric('mfc', this.mfcBuf, from, to, limit, downsample);
    return address != null ? data.filter((x: any) => x.address === address) : data;
  }

  private async queryGeneric(kind: 'furnace'|'mfc', mem: any[], from?: string, to?: string, limit?: number, downsample?: number) {
    const fromMs = from ? new Date(from).getTime() : 0;
    const toMs = to ? new Date(to).getTime() : Date.now();
    // from..to day files
    const days = this.enumerateDays(fromMs, toMs);
    const fileData = await this.readFiles(kind, days, fromMs, toMs);
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

  private async readFiles(kind: 'furnace'|'mfc', days: string[], fromMs: number, toMs: number): Promise<any[]> {
    const dir = path.join(this.baseDir, kind);
    const out: any[] = [];
    for (const day of days) {
      const p = path.join(dir, `${day}.jsonl`);
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
}
