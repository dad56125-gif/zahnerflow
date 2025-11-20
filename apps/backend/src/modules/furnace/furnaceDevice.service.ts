import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class FurnaceDeviceService {
  private readonly baseURL: string;
  private readonly http: AxiosInstance;
  // 普通指令超时 1.5s，批量操作超时 30s
  private readonly normalTimeout = 1500;
  private readonly extendedTimeout = 30000;

  constructor() {
    this.baseURL = process.env.FURNACE_FASTAPI_URL || 'http://127.0.0.1:8011';
    this.http = axios.create({ baseURL: this.baseURL, timeout: this.normalTimeout });
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

  async getProgramSegments(): Promise<any> {
    const { data } = await this.http.get('/program/segments', { timeout: this.extendedTimeout });
    return data;
  }

  async setProgramSegments(segments: any[]): Promise<any> {
    const { data } = await this.http.post('/program/segments', segments, { timeout: this.extendedTimeout });
    return data;
  }

  async setParameter(code: number, value: number): Promise<any> {
    const { data } = await this.http.post('/parameter/write', { code, value });
    return data;
  }
}