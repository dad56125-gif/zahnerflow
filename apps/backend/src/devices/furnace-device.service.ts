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

  constructor() {
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
    // 程序段读取期间，标记为忙碌状态
    this.isBusy = true;
    this.lastBusyTime = Date.now();
    this.logger.debug('开始读取程序段，设备进入忙碌状态');

    try {
      this.http.defaults.timeout = this.extendedTimeout;
      const { data } = await this.http.get('/program/segments');
      return data;
    } catch (error) {
      throw error;
    } finally {
      // 程序段读取完成后，保持忙碌状态一段时间以避免立即轮询
      setTimeout(() => {
        this.isBusy = false;
        this.logger.debug('程序段读取完成，设备退出忙碌状态');
      }, this.busyCooldownMs);
    }
  }

  async setProgramSegments(segments: Array<{ id: number; temperature: number; time: number }>): Promise<any> {
    // 程序段写入期间，标记为忙碌状态
    this.isBusy = true;
    this.lastBusyTime = Date.now();
    this.logger.debug('开始写入程序段，设备进入忙碌状态');

    try {
      this.http.defaults.timeout = this.extendedTimeout;
      const { data } = await this.http.post('/program/segments', segments);
      return data;
    } catch (error) {
      throw error;
    } finally {
      // 程序段写入完成后，保持忙碌状态一段时间以避免立即轮询
      setTimeout(() => {
        this.isBusy = false;
        this.logger.debug('程序段写入完成，设备退出忙碌状态');
      }, this.busyCooldownMs);
    }
  }
}

