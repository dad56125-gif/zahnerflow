import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

@Injectable()
export class MfcDeviceService {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(MfcDeviceService.name);

  constructor() {
    const baseURL = process.env.MFC_FASTAPI_URL || 'http://127.0.0.1:8010';
    this.http = axios.create({
      baseURL,
      timeout: 1500, // 默认超时
      headers: {
        'Content-Type': 'application/json',
      }
    });
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