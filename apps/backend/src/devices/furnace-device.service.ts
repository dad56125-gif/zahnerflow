import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class FurnaceDeviceService {
  private readonly logger = new Logger(FurnaceDeviceService.name);
  private readonly baseURL: string;
  private readonly http: AxiosInstance;
  private readonly normalTimeout = 1500;
  private readonly extendedTimeout = 15000;
  private isBusy = false;
  private lastBusyTime = 0;
  private readonly busyCooldownMs = 3000; // 3秒冷却时间
  private isPollingPaused = false; // 新增：轮询暂停标志

  constructor() {
    // 连接到Python FastAPI服务端口
    this.baseURL = process.env.FURNACE_FASTAPI_URL || 'http://127.0.0.1:8011';
    this.http = axios.create({ baseURL: this.baseURL, timeout: this.normalTimeout });
  }

  async health(): Promise<any> {
    const { data } = await this.http.get('/health');
    return data;
  }

  async ports(): Promise<string[]> {
    const { data } = await this.http.get('/ports');
    return data;
  }

  async getCommLog(): Promise<any> {
    const { data } = await this.http.get('/comm-log');
    return data;
  }

  async connect(body: { port: string; baudrate?: number; address?: number; stopbits?: number; timeout?: number }): Promise<any> {
    const { data } = await this.http.post('/connect', body);
    return data;
  }

  async disconnect(): Promise<any> {
    const { data } = await this.http.post('/disconnect', {});
    return data;
  }

  async status(): Promise<any> {
    // 如果轮询被暂停，直接跳过本次请求
    if (this.isPollingPaused) {
      this.logger.debug('轮询已暂停，跳过status请求');
      return;
    }

    // 检查是否需要使用扩展超时
    const needsExtendedTimeout = this.isBusy ||
      (Date.now() - this.lastBusyTime < this.busyCooldownMs);

    // 动态设置超时时间
    this.http.defaults.timeout = needsExtendedTimeout ? this.extendedTimeout : this.normalTimeout;

    try {
      const { data } = await this.http.get('/status');
      // 成功响应后，重置忙碌状态
      this.isBusy = false;
      return data;
    } catch (error: any) {
      // 如果是超时错误，标记为忙碌状态
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        this.isBusy = true;
        this.lastBusyTime = Date.now();
        this.logger.warn(`设备响应超时，切换到扩展超时模式 (${this.extendedTimeout}ms)`);
      }
      throw error;
    }
  }

  // 新增：暂停轮询的方法
  pausePolling(): void {
    this.isPollingPaused = true;
    this.logger.debug('轮询已暂停');
  }

  // 新增：恢复轮询的方法
  resumePolling(): void {
    this.isPollingPaused = false;
    this.logger.debug('轮询已恢复');
  }

  // 新增：检查轮询是否暂停
  isPollingPausedState(): boolean {
    return this.isPollingPaused;
  }

  async run(): Promise<any> { const { data } = await this.http.post('/run', {}); return data; }
  async pause(): Promise<any> { const { data } = await this.http.post('/pause', {}); return data; }
  async stop(): Promise<any> { const { data } = await this.http.post('/stop', {}); return data; }

  async setSv(sv: number): Promise<any> {
    const { data } = await this.http.post('/sv', { sv });
    return data;
  }

  async setSegment(segment: number): Promise<any> {
    const { data } = await this.http.post('/segment/set', { segment });
    return data;
  }

  async getProgramSegments(): Promise<any> {
    // 暂停轮询
    this.pausePolling();

    try {
      this.http.defaults.timeout = this.extendedTimeout;
      const { data } = await this.http.get('/program/segments');
      return data;
    } catch (error) {
      throw error;
    } finally {
      // 程序段读取完成后，立即恢复轮询
      this.resumePolling();
      this.logger.debug('程序段读取完成，恢复轮询');
    }
  }

  async setProgramSegments(segments: Array<{ id: number; temperature: number; time: number }>): Promise<any> {
    // 暂停轮询
    this.pausePolling();

    try {
      this.http.defaults.timeout = this.extendedTimeout;
      const { data } = await this.http.post('/program/segments', segments);
      return data;
    } catch (error) {
      throw error;
    } finally {
      // 程序段写入完成后，立即恢复轮询
      this.resumePolling();
      this.logger.debug('程序段写入完成，恢复轮询');
    }
  }
}

