import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ConsoleDisplayManager } from './console-display-manager.service';
import { LogLevelConfig } from './console-display-manager.service';

@Controller('api/console')
export class ConsoleDisplayManagerController {
  constructor(
    private readonly consoleDisplayManager: ConsoleDisplayManager
  ) {}

  /**
   * 获取当前的日志配置
   */
  @Get('config')
  getConfig() {
    return this.consoleDisplayManager.getConfigStats();
  }

  /**
   * 设置全局日志级别
   */
  @Post('global')
  setGlobalLogLevel(@Body() config: Partial<LogLevelConfig>) {
    this.consoleDisplayManager.setGlobalLogLevel(config);
    return { message: 'Global log level updated', config };
  }

  /**
   * 设置特定模块的日志级别
   */
  @Post('module/:moduleName')
  setModuleLogLevel(
    @Param('moduleName') moduleName: string,
    @Body() config: Partial<LogLevelConfig>
  ) {
    this.consoleDisplayManager.setModuleLogLevel(moduleName, config);
    return { message: `Module '${moduleName}' log level updated`, config };
  }

  /**
   * 切换debug模式
   */
  @Post('debug/:enable')
  toggleDebug(@Param('enable') enable: string) {
    const enabled = enable === 'true';
    this.consoleDisplayManager.toggleDebugMode(enabled);
    return { message: `Debug mode ${enabled ? 'enabled' : 'disabled'}` };
  }

  /**
   * 启用静默模式（仅显示错误和警告）
   */
  @Post('quiet')
  setQuietMode() {
    this.consoleDisplayManager.setQuietMode();
    return { message: 'Quiet mode enabled' };
  }

  /**
   * 启用详细模式（显示所有日志）
   */
  @Post('verbose')
  setVerboseMode() {
    this.consoleDisplayManager.setVerboseMode();
    return { message: 'Verbose mode enabled' };
  }

  /**
   * 重置所有配置到默认状态
   */
  @Delete('reset')
  resetToDefaults() {
    this.consoleDisplayManager.resetToDefaults();
    return { message: 'All configurations reset to defaults' };
  }

  /**
   * 获取支持的模块列表
   */
  @Get('modules')
  getSupportedModules() {
    const config = this.consoleDisplayManager.getConfigStats();
    return {
      modules: Object.keys(config.modules),
      global: config.global
    };
  }
}