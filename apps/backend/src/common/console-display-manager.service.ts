import { Injectable, Logger } from '@nestjs/common';

export interface LogLevelConfig {
  enableError: boolean;
  enableWarn: boolean;
  enableLog: boolean;
  enableDebug: boolean;
  enableVerbose: boolean;
}

export interface ModuleLogLevel {
  module: string;
  config: LogLevelConfig;
}

@Injectable()
export class ConsoleDisplayManager {
  private readonly logger = new Logger(ConsoleDisplayManager.name);
  private moduleLoggers = new Map<string, Logger>();
  private globalLogLevel: LogLevelConfig = {
    enableError: true,
    enableWarn: true,
    enableLog: true,
    enableDebug: false,  // 默认关闭debug
    enableVerbose: false,
  };

  private moduleLogLevels: Map<string, LogLevelConfig> = new Map();

  constructor() {
    this.initializeDefaultConfigs();
  }

  /**
   * 根据模块配置输出日志
   */
  log(moduleName: string, level: keyof LogLevelConfig, message: string, context?: any): void {
    if (!this.shouldDisplayLog(moduleName, level)) {
      return;
    }

    const logger = this.getModuleLogger(moduleName);

    switch (level) {
      case 'enableError':
        logger.error(message, context);
        break;
      case 'enableWarn':
        logger.warn(message, context);
        break;
      case 'enableLog':
        logger.log(message, context);
        break;
      case 'enableDebug':
        logger.debug(message, context);
        break;
      case 'enableVerbose':
        logger.verbose(message, context);
        break;
    }
  }

  /**
   * 获取模块的Logger实例
   */
  private getModuleLogger(moduleName: string): Logger {
    if (!this.moduleLoggers.has(moduleName)) {
      this.moduleLoggers.set(moduleName, new Logger(moduleName));
    }
    return this.moduleLoggers.get(moduleName)!;
  }

  /**
   * 初始化默认的模块日志级别配置
   */
  private initializeDefaultConfigs(): void {
    // 为不同模块设置默认的日志级别
    const defaultConfigs: ModuleLogLevel[] = [
      {
        module: 'SimpleEventBus',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: false,  // 关闭SimpleEventBus的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'ExecutionService',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: true,   // 保留ExecutionService的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'ExecutionNotificationService',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: false,  // 关闭ExecutionNotificationService的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'WorkflowGateway',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: false,  // 关闭WorkflowGateway的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'ZahnerZenniumService',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: false,  // 关闭ZahnerZenniumService的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'ZahnerDeviceService',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: false,  // 关闭ZahnerDeviceService的debug日志
          enableVerbose: false,
        }
      },
      {
        module: 'NotificationEventHandler',
        config: {
          enableError: true,
          enableWarn: true,
          enableLog: true,
          enableDebug: true,  // 启用NotificationEventHandler的debug日志
          enableVerbose: false,
        }
      }
    ];

    defaultConfigs.forEach(config => {
      this.moduleLogLevels.set(config.module, config.config);
    });
  }

  /**
   * 设置全局日志级别
   */
  setGlobalLogLevel(config: Partial<LogLevelConfig>): void {
    this.globalLogLevel = { ...this.globalLogLevel, ...config };
    this.logger.log(`Global log level updated: ${JSON.stringify(this.globalLogLevel)}`);
  }

  /**
   * 设置特定模块的日志级别
   */
  setModuleLogLevel(moduleName: string, config: Partial<LogLevelConfig>): void {
    const currentConfig = this.moduleLogLevels.get(moduleName) || this.globalLogLevel;
    this.moduleLogLevels.set(moduleName, { ...currentConfig, ...config });
    this.logger.log(`Module '${moduleName}' log level updated`);
  }

  /**
   * 获取模块的日志级别配置
   */
  getModuleLogLevel(moduleName: string): LogLevelConfig {
    return this.moduleLogLevels.get(moduleName) || this.globalLogLevel;
  }

  /**
   * 检查是否应该显示指定模块和级别的日志
   */
  shouldDisplayLog(moduleName: string, level: keyof LogLevelConfig): boolean {
    const config = this.getModuleLogLevel(moduleName);
    return config[level] as boolean;
  }

  /**
   * 快速切换debug模式
   */
  toggleDebugMode(enabled: boolean): void {
    this.setGlobalLogLevel({ enableDebug: enabled });

    // 也可以选择性地为某些模块开启debug
    if (enabled) {
      this.setModuleLogLevel('ExecutionService', { enableDebug: true });
    } else {
      this.setModuleLogLevel('SimpleEventBus', { enableDebug: false });
      this.setModuleLogLevel('NotificationService', { enableDebug: false });
    }

    this.logger.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 快速配置：仅显示错误和警告
   */
  setQuietMode(): void {
    this.setGlobalLogLevel({
      enableError: true,
      enableWarn: true,
      enableLog: false,
      enableDebug: false,
      enableVerbose: false,
    });
    this.logger.log('Quiet mode enabled - only errors and warnings will be shown');
  }

  /**
   * 快速配置：显示所有日志
   */
  setVerboseMode(): void {
    this.setGlobalLogLevel({
      enableError: true,
      enableWarn: true,
      enableLog: true,
      enableDebug: true,
      enableVerbose: true,
    });
    this.logger.log('Verbose mode enabled - all logs will be shown');
  }

  /**
   * 获取当前配置的统计信息
   */
  getConfigStats(): { global: LogLevelConfig; modules: Record<string, LogLevelConfig> } {
    const modules: Record<string, LogLevelConfig> = {};
    this.moduleLogLevels.forEach((config, module) => {
      modules[module] = config;
    });

    return {
      global: this.globalLogLevel,
      modules,
    };
  }

  /**
   * 重置所有配置到默认状态
   */
  resetToDefaults(): void {
    this.globalLogLevel = {
      enableError: true,
      enableWarn: true,
      enableLog: true,
      enableDebug: false,
      enableVerbose: false,
    };
    this.moduleLogLevels.clear();
    this.initializeDefaultConfigs();
    this.logger.log('All configurations reset to defaults');
  }

  /**
   * 创建装饰器，用于自动控制日志输出
   */
  createLoggedMethod(moduleName: string, originalMethod: any, context: any): any {
    return (...args: any[]) => {
      const methodName = originalMethod.name;

      // 如果启用了debug级别，则输出方法调用信息
      if (this.shouldDisplayLog(moduleName, 'enableDebug')) {
        this.logger.debug(`[${moduleName}] Calling method: ${methodName}`, {
          args: args.length > 0 ? args : 'no args'
        });
      }

      try {
        const result = originalMethod.apply(context, args);

        if (this.shouldDisplayLog(moduleName, 'enableDebug')) {
          this.logger.debug(`[${moduleName}] Method ${methodName} completed successfully`);
        }

        return result;
      } catch (error) {
        if (this.shouldDisplayLog(moduleName, 'enableError')) {
          this.logger.error(`[${moduleName}] Method ${methodName} failed:`, error);
        }
        throw error;
      }
    };
  }
}