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
    enableDebug: false,
    enableVerbose: false,
  };

  private moduleLogLevels: Map<string, LogLevelConfig> = new Map();

  constructor() {
    this.initializeDefaultConfigs();
    this.loadFromEnv();
  }

  /**
   * 从环境变量加载日志配置
   * LOG_LEVEL: 全局日志级别 (error/warn/log/debug/verbose)
   * LOG_MODULES: 模块级别配置 (格式: ModuleName:level,ModuleName2:level)
   */
  private loadFromEnv(): void {
    // 全局日志级别
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel) {
      const levelMap: Record<string, Partial<LogLevelConfig>> = {
        'error': { enableError: true, enableWarn: false, enableLog: false, enableDebug: false, enableVerbose: false },
        'warn': { enableError: true, enableWarn: true, enableLog: false, enableDebug: false, enableVerbose: false },
        'log': { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false },
        'debug': { enableError: true, enableWarn: true, enableLog: true, enableDebug: true, enableVerbose: false },
        'verbose': { enableError: true, enableWarn: true, enableLog: true, enableDebug: true, enableVerbose: true },
      };
      if (levelMap[envLevel]) {
        this.globalLogLevel = { ...this.globalLogLevel, ...levelMap[envLevel] };
        this.logger.log(`Global log level set from env: ${envLevel}`);
      }
    }

    // 模块级别配置
    const envModules = process.env.LOG_MODULES;
    if (envModules) {
      envModules.split(',').forEach(item => {
        const [moduleName, level] = item.trim().split(':');
        if (moduleName && level) {
          const levelLower = level.toLowerCase();
          const config = this.moduleLogLevels.get(moduleName) || { ...this.globalLogLevel };

          // 根据级别设置
          if (levelLower === 'debug') {
            config.enableDebug = true;
          } else if (levelLower === 'verbose') {
            config.enableDebug = true;
            config.enableVerbose = true;
          } else if (levelLower === 'warn') {
            config.enableLog = false;
            config.enableDebug = false;
          } else if (levelLower === 'error') {
            config.enableLog = false;
            config.enableWarn = false;
            config.enableDebug = false;
          }

          this.moduleLogLevels.set(moduleName, config);
          this.logger.log(`Module '${moduleName}' log level set from env: ${level}`);
        }
      });
    }
  }

  log(moduleName: string, level: keyof LogLevelConfig, message: string, context?: any): void {
    if (!this.shouldDisplayLog(moduleName, level)) return;

    const logger = this.getModuleLogger(moduleName);
    switch (level) {
      case 'enableError': logger.error(message, context); break;
      case 'enableWarn': logger.warn(message, context); break;
      case 'enableLog': logger.log(message, context); break;
      case 'enableDebug': logger.debug(message, context); break;
      case 'enableVerbose': logger.verbose(message, context); break;
    }
  }

  private getModuleLogger(moduleName: string): Logger {
    if (!this.moduleLoggers.has(moduleName)) {
      this.moduleLoggers.set(moduleName, new Logger(moduleName));
    }
    return this.moduleLoggers.get(moduleName)!;
  }

  /**
   * 初始化默认配置
   * ⚠️ 已清理不存在的模块
   */
  private initializeDefaultConfigs(): void {
    const defaultConfigs: ModuleLogLevel[] = [
      {
        module: 'ExecutionService',
        config: { enableError: true, enableWarn: true, enableLog: true, enableDebug: true, enableVerbose: false }
      },
      {
        module: 'ZahnerZenniumService',
        config: { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false }
      },
      {
        module: 'FurnaceService',
        config: { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false }
      },
      {
        module: 'MfcService',
        config: { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false }
      },
      // 如果 NotificationModule 里有 EventHandler，保留这个
      {
        module: 'EventBus',
        config: { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false }
      }
    ];

    defaultConfigs.forEach(config => {
      this.moduleLogLevels.set(config.module, config.config);
    });
  }

  setGlobalLogLevel(config: Partial<LogLevelConfig>): void {
    this.globalLogLevel = { ...this.globalLogLevel, ...config };
    this.logger.log(`Global log level updated`);
  }

  setModuleLogLevel(moduleName: string, config: Partial<LogLevelConfig>): void {
    const currentConfig = this.moduleLogLevels.get(moduleName) || this.globalLogLevel;
    this.moduleLogLevels.set(moduleName, { ...currentConfig, ...config });
    this.logger.log(`Module '${moduleName}' log level updated`);
  }

  getModuleLogLevel(moduleName: string): LogLevelConfig {
    return this.moduleLogLevels.get(moduleName) || this.globalLogLevel;
  }

  shouldDisplayLog(moduleName: string, level: keyof LogLevelConfig): boolean {
    const config = this.getModuleLogLevel(moduleName);
    return config[level] as boolean;
  }

  setQuietMode(): void {
    this.setGlobalLogLevel({ enableError: true, enableWarn: true, enableLog: false, enableDebug: false, enableVerbose: false });
  }

  setVerboseMode(): void {
    this.setGlobalLogLevel({ enableError: true, enableWarn: true, enableLog: true, enableDebug: true, enableVerbose: true });
  }

  resetToDefaults(): void {
    this.globalLogLevel = { enableError: true, enableWarn: true, enableLog: true, enableDebug: false, enableVerbose: false };
    this.moduleLogLevels.clear();
    this.initializeDefaultConfigs();
  }

  getConfigStats() {
    const modules: Record<string, LogLevelConfig> = {};
    this.moduleLogLevels.forEach((config, module) => { modules[module] = config; });
    return { global: this.globalLogLevel, modules };
  }
}