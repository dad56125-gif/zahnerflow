import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class MfcDeviceService {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(MfcDeviceService.name);

  constructor() {
    const baseURL = process.env.MFC_FASTAPI_URL || 'http://127.0.0.1:8010';
    this.http = axios.create({
      baseURL,
      timeout: 1500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  // ==================== 连接管理功能 ====================

  /**
   * 健康检查
   */
  async health() {
    try {
      const { data } = await this.http.get('/health');
      return data;
    } catch (error) {
      this.logger.error('Health check failed', error);
      throw error;
    }
  }

  /**
   * 获取可用串口列表
   */
  async get_available_ports() {
    try {
      const { data } = await this.http.get('/ports');
      return data;
    } catch (error) {
      this.logger.error('Get available ports failed', error);
      throw error;
    }
  }

  /**
   * 连接MFC设备
   */
  async connect_device(request_body: { port: string; baudrate?: number; timeout?: number }) {
    try {
      const { data } = await this.http.post('/connect', request_body);
      return data;
    } catch (error) {
      this.logger.error('Connect device failed', error);
      throw error;
    }
  }

  /**
   * 断开MFC设备连接
   */
  async disconnect_device() {
    try {
      const { data } = await this.http.post('/disconnect', {});
      return data;
    } catch (error) {
      this.logger.error('Disconnect device failed', error);
      throw error;
    }
  }

  /**
   * 获取连接信息
   */
  async get_connection_info() {
    try {
      const { data } = await this.http.get('/connection/info');
      return data;
    } catch (error) {
      this.logger.error('Get connection info failed', error);
      throw error;
    }
  }

  // ==================== 设备管理功能 ====================

  /**
   * 扫描MFC设备地址
   */
  async scan_devices(request_body: { start?: number; end?: number }) {
    try {
      const { data } = await this.http.post('/scan', request_body);
      return data;
    } catch (error) {
      this.logger.error('Scan devices failed', error);
      throw error;
    }
  }

  /**
   * 获取MFC设备状态
   */
  async get_device_status(address?: number) {
    try {
      const { data } = await this.http.get('/status', {
        params: address != null ? { address } : {}
      });
      return data;
    } catch (error) {
      this.logger.error('Get device status failed', error);
      throw error;
    }
  }

  /**
   * 设置MFC流量设定点
   */
  async set_device_flow(request_body: { address: number; sccm: number }) {
    try {
      const { data } = await this.http.post('/setpoint', request_body);
      return data;
    } catch (error) {
      this.logger.error('Set device flow failed', error);
      throw error;
    }
  }

  // ==================== 数据管理功能 ====================

  /**
   * 获取通信日志
   */
  async get_communication_log() {
    try {
      const { data } = await this.http.get('/comm-log');
      return data;
    } catch (error) {
      this.logger.error('Get communication log failed', error);
      throw error;
    }
  }

  /**
   * 清空通信日志
   */
  async clear_communication_log() {
    try {
      const { data } = await this.http.delete('/comm-log');
      return data;
    } catch (error) {
      this.logger.error('Clear communication log failed', error);
      throw error;
    }
  }

  // ==================== 兼容性方法 ====================

  /**
   * 兼容性方法 - 获取端口列表
   */
  async ports() {
    return this.get_available_ports();
  }

  /**
   * 兼容性方法 - 连接设备
   */
  async connect(body: { port: string; baudrate?: number; timeout?: number }) {
    return this.connect_device(body);
  }

  /**
   * 兼容性方法 - 断开设备
   */
  async disconnect() {
    return this.disconnect_device();
  }

  /**
   * 兼容性方法 - 扫描设备
   */
  async scan(body: { start?: number; end?: number }) {
    return this.scan_devices(body);
  }

  /**
   * 兼容性方法 - 获取状态
   */
  async status(address?: number) {
    return this.get_device_status(address);
  }

  /**
   * 兼容性方法 - 设置流量
   */
  async setpoint(address: number, sccm: number) {
    return this.set_device_flow({ address, sccm });
  }
}

