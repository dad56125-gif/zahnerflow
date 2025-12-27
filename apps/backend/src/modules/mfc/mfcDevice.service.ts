import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import * as http from 'http';

// 🔧 HTTP Keep-Alive 连接池 - 复用 TCP 连接，避免 TIME_WAIT 累积
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 5,
});

@Injectable()
export class MfcDeviceService {
  private readonly logger = new Logger(MfcDeviceService.name);

  // 端点配置
  private readonly realEndpoint: string;
  private readonly simulatorEndpoint: string;

  // 设备模式: 'real' = 真实设备, 'simulator' = 模拟器
  private deviceMode: 'real' | 'simulator' = 'real';

  // 动态 HTTP 客户端
  private http: AxiosInstance;

  constructor() {
    // 真实设备端点
    this.realEndpoint = process.env.MFC_FASTAPI_URL || 'http://127.0.0.1:8010';
    // 模拟器端点
    this.simulatorEndpoint = process.env.MFC_SIMULATOR_URL || 'http://127.0.0.1:8013';

    // 从环境变量读取默认模式
    const envMode = process.env.MFC_MODE?.toLowerCase();
    if (envMode === 'simulator' || envMode === 'sim') {
      this.deviceMode = 'simulator';
      this.logger.log(`[MFC] ⚡ SIMULATOR MODE (set by MFC_MODE env)`);
    } else {
      this.deviceMode = 'real';
      this.logger.log(`[MFC] 🔌 REAL DEVICE MODE`);
    }

    this.logger.log(`[MFC] Endpoints - Real: ${this.realEndpoint}, Simulator: ${this.simulatorEndpoint}`);

    // 创建 HTTP 客户端
    this.http = this.createHttpClient();
  }

  private get activeEndpoint(): string {
    return this.deviceMode === 'simulator' ? this.simulatorEndpoint : this.realEndpoint;
  }

  private createHttpClient(): AxiosInstance {
    return axios.create({
      baseURL: this.activeEndpoint,
      timeout: 1500,
      headers: { 'Content-Type': 'application/json' },
      httpAgent: keepAliveAgent,  // 🔧 复用 TCP 连接
    });
  }

  // 设备模式切换 API
  setDeviceMode(mode: 'real' | 'simulator'): { success: boolean; mode: string; endpoint: string } {
    if (this.deviceMode !== mode) {
      this.deviceMode = mode;
      this.http = this.createHttpClient();
      this.logger.log(`[MFC] Device mode changed to: ${mode}, endpoint: ${this.activeEndpoint}`);
    }
    return { success: true, mode: this.deviceMode, endpoint: this.activeEndpoint };
  }

  getDeviceMode(): { mode: string; endpoint: string } {
    return { mode: this.deviceMode, endpoint: this.activeEndpoint };
  }

  /**
   * 精简地记录Axios错误
   */
  private logAxiosError(operation: string, error: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const url = axiosError.config?.url;
      const msg = axiosError.message;

      // 降低日志级别，避免刷屏，除非是严重错误
      this.logger.warn(`MFC ${operation} failed: ${msg} (Status: ${status}, URL: ${url})`);
    } else {
      this.logger.error(`MFC ${operation} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==================== 连接管理 ====================

  async health() {
    try {
      const { data } = await this.http.get('/health');
      return data;
    } catch (error) {
      // 健康检查失败通常不需要打印堆栈，静默处理或轻微警告
      throw error;
    }
  }

  async get_available_ports() {
    try {
      const { data } = await this.http.get('/ports');
      return data;
    } catch (error) {
      this.logAxiosError('get ports', error);
      throw error;
    }
  }

  async get_connection_info() {
    try {
      const { data } = await this.http.get('/connection/info');
      return data;
    } catch (error) {
      this.logAxiosError('get connection info', error);
      throw error;
    }
  }

  async connect_device(request_body: { port: string; baudrate?: number; timeout?: number }) {
    try {
      const { data } = await this.http.post('/connect', request_body);
      return data;
    } catch (error) {
      this.logAxiosError('connect', error);
      throw error;
    }
  }

  async disconnect_device() {
    try {
      const { data } = await this.http.post('/disconnect', {});
      return data;
    } catch (error) {
      this.logAxiosError('disconnect', error);
      throw error;
    }
  }

  // ==================== 设备操作 ====================

  /**
   * 单地址扫描 (核心扫描方法)
   */
  async scan_single_address(address: number) {
    try {
      // 扫描单个地址通常很快，但为了稳定给 1s 超时
      const { data } = await this.http.post('/scan', { address }, { timeout: 1000 });
      return data;
    } catch (error) {
      // 扫描不到是正常现象，不需要 verbose log
      // 只有非超时错误才值得记录
      if (axios.isAxiosError(error) && error.code !== 'ECONNABORTED') {
        this.logAxiosError(`scan address ${address}`, error);
      }
      throw error;
    }
  }

  async get_device_status(address?: number, timeout = 500) {
    try {
      const { data } = await this.http.get('/status', {
        params: address != null ? { address } : {},
        timeout: address != null ? timeout : 1500
      });
      return data;
    } catch (error) {
      // 状态查询失败很常见（设备掉线），由上层处理
      throw error;
    }
  }

  async set_device_flow(request_body: { address: number; sccm: number }) {
    try {
      const { data } = await this.http.post('/setpoint', request_body);
      return data;
    } catch (error) {
      this.logAxiosError('set flow', error);
      throw error;
    }
  }

  async read_gas_name(address: number) {
    try {
      const { data } = await this.http.get('/gas-name', { params: { address } });
      return data;
    } catch (error) {
      this.logAxiosError('read gas name', error);
      throw error;
    }
  }

  async read_active_setpoint(address: number) {
    try {
      const { data } = await this.http.get('/active-setpoint', { params: { address } });
      return data;
    } catch (error) {
      this.logAxiosError('read active setpoint', error);
      throw error;
    }
  }

  // ==================== 日志管理 ====================

  async get_communication_log() {
    try {
      const { data } = await this.http.get('/comm-log');
      return data;
    } catch (error) {
      this.logAxiosError('get log', error);
      throw error;
    }
  }

  async clear_communication_log() {
    try {
      const { data } = await this.http.delete('/comm-log');
      return data;
    } catch (error) {
      this.logAxiosError('clear log', error);
      throw error;
    }
  }
}