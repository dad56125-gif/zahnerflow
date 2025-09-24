// 统一导出所有类型定义

// API相关类型
export * from './api.types.js';

// 工作流相关类型
export * from './workflow.types.js';

// 设备相关类型
export * from './device.types.js';

// 简化的应用配置 - 基于实际项目需求
export interface SimpleZahnerFlowConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  features: {
    enableWebSocket: boolean;  // 这个功能实际存在
  };
}

export interface SimpleEnvironmentConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  cors: {
    origin: string[];
    credentials: boolean;
  };
}

// 版本信息
export interface VersionInfo {
  version: string;
  build: string;
  commit: string;
  date: string;
}

// 基础错误类型
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// 基础事件类型
export interface AppEvent {
  type: string;
  payload: any;
  timestamp: Date;
  source: string;
  id: string;
}

// 工具类型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// 删除了以下无用接口，因为实际项目中不存在：
// - ZahnerFlowConfig (过于复杂的数据库、Redis、认证配置)
// - EnvironmentConfig (过度复杂的日志配置)
// - 复杂的调度、通知等功能配置