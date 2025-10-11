import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MfcDeviceService } from '../../devices/mfc-device.service';
import type { MfcDeviceInfo } from '@zahnerflow/types';

@Injectable()
export class MfcService implements OnModuleInit {
  private discovered: MfcDeviceInfo[] = [];
  private readonly logger = new Logger(MfcService.name);
  constructor(private readonly device: MfcDeviceService) {}

  async onModuleInit(): Promise<void> {
    try {
      const h = await this.device.health();
      this.logger.log(`MFC FastAPI health: ${JSON.stringify(h)}`);
    } catch (e: any) {
      this.logger.warn(`MFC FastAPI health check failed: ${e?.message || e}`);
    }
  }

  async scan(start?: number, end?: number): Promise<MfcDeviceInfo[]> {
    const list: MfcDeviceInfo[] = await this.device.scan({ start, end });
    // 合并到缓存（按 address 去重）
    for (const it of list) {
      const idx = this.discovered.findIndex((x) => x.address === it.address);
      if (idx >= 0) this.discovered[idx] = it; else this.discovered.push(it);
    }
    return this.discovered;
  }

  getDevices(): MfcDeviceInfo[] { return [...this.discovered]; }
  async status(address?: number) { return this.device.status(address); }
  async setpoint(address: number, sccm: number) { return this.device.setpoint(address, sccm); }
}
