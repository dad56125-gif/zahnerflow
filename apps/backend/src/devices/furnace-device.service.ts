import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class FurnaceDeviceService {
  private readonly logger = new Logger(FurnaceDeviceService.name);
  private readonly baseURL: string;
  private readonly http: AxiosInstance;

  constructor() {
    this.baseURL = process.env.FURNACE_FASTAPI_URL || 'http://127.0.0.1:8011';
    this.http = axios.create({ baseURL: this.baseURL, timeout: 1500 });
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
    const { data } = await this.http.get('/status');
    return data;
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
    const { data } = await this.http.get('/program/segments');
    return data;
  }

  async setProgramSegments(segments: Array<{ id: number; temperature: number; time: number }>): Promise<any> {
    const { data } = await this.http.post('/program/segments', segments);
    return data;
  }
}

