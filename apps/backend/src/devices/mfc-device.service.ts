import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class MfcDeviceService {
  private readonly http: AxiosInstance;
  constructor() {
    const baseURL = process.env.MFC_FASTAPI_URL || 'http://127.0.0.1:8010';
    this.http = axios.create({ baseURL, timeout: 1500 });
  }

  async health() { const { data } = await this.http.get('/health'); return data; }
  async ports() { const { data } = await this.http.get('/ports'); return data; }
  async connect(body: { port: string; baudrate?: number; timeout?: number }) { const { data } = await this.http.post('/connect', body); return data; }
  async disconnect() { const { data } = await this.http.post('/disconnect', {}); return data; }
  async scan(body: { start?: number; end?: number }) { const { data } = await this.http.post('/scan', body); return data; }
  async status(address?: number) { const { data } = await this.http.get('/status', { params: address != null ? { address } : {} }); return data; }
  async setpoint(address: number, sccm: number) { const { data } = await this.http.post('/setpoint', { address, sccm }); return data; }
}

