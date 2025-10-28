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
      timeout: 1500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  /**
   * 精简地记录Axios错误，避免冗长的日志输出
   */
  private logAxiosError(operation: string, error: any): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const url = axiosError.config?.url;
      const baseURL = axiosError.config?.baseURL;
      const fullUrl = baseURL && url ? `${baseURL}${url}` : (url || 'unknown');
      const timeout = axiosError.config?.timeout;
      const responseData = axiosError.response?.data;

      this.logger.warn(
        `MFC ${operation} failed: ${axiosError.message}; status=${status}; url=${fullUrl}; timeout=${timeout}`
      );

      // 只记录响应数据的关键部分，避免完整对象展开
      if (responseData) {
        try {
          const responseStr = typeof responseData === 'string'
            ? responseData
            : JSON.stringify(responseData, null, 0); // 无缩进，紧凑格式
          this.logger.warn(`Response data: ${responseStr}`);
        } catch (e) {
          this.logger.warn(`Response data: [Object - too large to serialize]`);
        }
      }
    } else {
      // 非Axios错误，记录堆栈信息
      this.logger.error(`MFC ${operation} failed: ${error instanceof Error ? error.stack : String(error)}`);
    }
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
      this.logAxiosError('health check', error);
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
      this.logAxiosError('get available ports', error);
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
      this.logAxiosError('connect device', error);
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
      this.logAxiosError('disconnect device', error);
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
      this.logAxiosError('get connection info', error);
      throw error;
    }
  }

  // ==================== 设备管理功能 ====================

  /**
   * 扫描MFC设备地址 - 支持实时设备发现
   */
  async scan_devices(request_body: { start?: number; end?: number }) {
    try {
      // 计算扫描所需的超时时间：(end - start + 1) * 0.5s + 5s缓冲
      const start = request_body.start ?? 32;
      const end = request_body.end ?? 80;
      const address_count = end - start + 1;
      const scan_timeout = address_count * 500 + 5000; // 每个地址0.5秒 + 5秒缓冲

      // 使用独立的axios实例进行扫描，避免影响其他操作
      const scan_http = axios.create({
        baseURL: this.http.defaults.baseURL,
        timeout: Math.max(scan_timeout, 30000), // 最少30秒超时
        headers: {
          'Content-Type': 'application/json',
        }
      });

      this.logger.debug(`Calling FastAPI /scan interface for addresses ${start}-${end} (with realtime discovery)`);
      const { data } = await scan_http.post('/scan', request_body);
      return data;
    } catch (error) {
      this.logAxiosError('scan devices', error);
      throw error;
    }
  }

  /**
   * 启动实时扫描会话 - 单地址发现即推送
   */
  async start_realtime_scan_session(request_body: { start?: number; end?: number }) {
    try {
      this.logger.debug(`Starting realtime scan session: addresses ${request_body.start ?? 32}-${request_body.end ?? 80}`);

      const { data } = await this.http.post('/scan-realtime-start', request_body);

      this.logger.log(`Realtime scan session started: ${data.session_id}`);
      return data;
    } catch (error) {
      this.logAxiosError('start realtime scan session', error);
      throw error;
    }
  }

  /**
   * 获取实时扫描状态
   */
  async get_realtime_scan_status(session_id: string) {
    try {
      const { data } = await this.http.get(`/scan-realtime-status/${session_id}`);
      return data;
    } catch (error) {
      this.logAxiosError('get realtime scan status', error);
      throw error;
    }
  }

  /**
   * 获取设备发现事件（前端轮询）
   */
  async get_device_discovery_events() {
    try {
      const { data } = await this.http.get('/scan-realtime-events');
      return data;
    } catch (error) {
      this.logAxiosError('get device discovery events', error);
      throw error;
    }
  }

  /**
   * 取消实时扫描会话
   */
  async cancel_realtime_scan(session_id: string) {
    try {
      const { data } = await this.http.post(`/scan-realtime-cancel/${session_id}`);
      return data;
    } catch (error) {
      this.logAxiosError('cancel realtime scan', error);
      throw error;
    }
  }

  /**
   * 获取MFC设备状态
   */
  async get_device_status(address?: number, timeout = 500) {
    try {
      const { data } = await this.http.get('/status', {
        params: address != null ? { address } : {},
        timeout: address != null ? timeout : 1500 // 单个地址查询使用0.5秒超时
      });
      return data;
    } catch (error) {
      this.logAxiosError('get device status', error);
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
      this.logAxiosError('set device flow', error);
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
      this.logAxiosError('get communication log', error);
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
      this.logAxiosError('clear communication log', error);
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

  /**
   * 单地址扫描 - 实现真正的单地址发现即推送
   */
  async scan_single_address(address: number) {
    try {
      const { data } = await this.http.post('/scan', { address });
      return data;
    } catch (error) {
      this.logAxiosError('scan single address', error);
      throw error;
    }
  }
}

