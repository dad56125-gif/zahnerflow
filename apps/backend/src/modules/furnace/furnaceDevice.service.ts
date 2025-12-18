import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class FurnaceDeviceService {
  private readonly logger = new Logger(FurnaceDeviceService.name);

  // 端点配置
  private readonly realEndpoint: string;
  private readonly simulatorEndpoint: string;

  // 设备模式: 'real' = 真实设备, 'simulator' = 模拟器
  private deviceMode: 'real' | 'simulator' = 'real';

  // 动态 HTTP 客户端
  private http: AxiosInstance;

  // 超时配置
  private readonly normalTimeout = 1500;
  private readonly extendedTimeout = 30000;

  constructor() {
    // 真实设备端点
    this.realEndpoint = process.env.FURNACE_FASTAPI_URL || 'http://127.0.0.1:8011';
    // 模拟器端点
    this.simulatorEndpoint = process.env.FURNACE_SIMULATOR_URL || 'http://127.0.0.1:8012';

    // 从环境变量读取默认模式
    const envMode = process.env.FURNACE_MODE?.toLowerCase();
    if (envMode === 'simulator' || envMode === 'sim') {
      this.deviceMode = 'simulator';
      this.logger.log(`[Furnace] ⚡ SIMULATOR MODE (set by FURNACE_MODE env)`);
    } else {
      this.deviceMode = 'real';
      this.logger.log(`[Furnace] 🔌 REAL DEVICE MODE`);
    }

    this.logger.log(`[Furnace] Endpoints - Real: ${this.realEndpoint}, Simulator: ${this.simulatorEndpoint}`);

    // 创建 HTTP 客户端
    this.http = this.createHttpClient();
  }

  private get activeEndpoint(): string {
    return this.deviceMode === 'simulator' ? this.simulatorEndpoint : this.realEndpoint;
  }

  private createHttpClient(): AxiosInstance {
    return axios.create({ baseURL: this.activeEndpoint, timeout: this.normalTimeout });
  }

  // 设备模式切换 API
  setDeviceMode(mode: 'real' | 'simulator'): { success: boolean; mode: string; endpoint: string } {
    if (this.deviceMode !== mode) {
      this.deviceMode = mode;
      this.http = this.createHttpClient();
      this.logger.log(`[Furnace] Device mode changed to: ${mode}, endpoint: ${this.activeEndpoint}`);
    }
    return { success: true, mode: this.deviceMode, endpoint: this.activeEndpoint };
  }

  getDeviceMode(): { mode: string; endpoint: string } {
    return { mode: this.deviceMode, endpoint: this.activeEndpoint };
  }

  async health(): Promise<any> { const { data } = await this.http.get('/health'); return data; }
  async ports(): Promise<string[]> { const { data } = await this.http.get('/ports'); return data; }
  async connect(body: any): Promise<any> { const { data } = await this.http.post('/connect', body); return data; }
  async disconnect(): Promise<any> { const { data } = await this.http.post('/disconnect', {}); return data; }
  async status(): Promise<any> { const { data } = await this.http.get('/status'); return data; }

  async run(): Promise<any> { const { data } = await this.http.post('/run', {}); return data; }
  async pause(): Promise<any> { const { data } = await this.http.post('/pause', {}); return data; }
  async stop(): Promise<any> { const { data } = await this.http.post('/stop', {}); return data; }
  async setSegment(segment: number): Promise<any> { const { data } = await this.http.post('/segment/set', { segment }); return data; }

  // [关键修复] 必须包含这个方法
  async getSegment(id: number): Promise<any> {
    const { data } = await this.http.get(`/program/segments/${id}`);
    return data;
  }

  async setParameter(code: number, value: number): Promise<any> {
    const { data } = await this.http.post('/parameter/write', { code, value });
    return data;
  }
}