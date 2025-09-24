import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';

@Controller('api/console')
export class ConsoleController {
  constructor(private readonly consoleDisplayManager: ConsoleDisplayManager) {}

  @Get('config')
  getConfig() {
    return this.consoleDisplayManager.getConfigStats();
  }

  @Post('global')
  setGlobalConfig(@Body() config: any) {
    this.consoleDisplayManager.setGlobalLogLevel(config);
    return { success: true };
  }

  @Post('module/:moduleName')
  setModuleConfig(@Param('moduleName') moduleName: string, @Body() config: any) {
    this.consoleDisplayManager.setModuleLogLevel(moduleName, config);
    return { success: true };
  }

  @Post('quiet')
  setQuietMode() {
    this.consoleDisplayManager.setQuietMode();
    return { success: true };
  }

  @Post('verbose')
  setVerboseMode() {
    this.consoleDisplayManager.setVerboseMode();
    return { success: true };
  }

  @Delete('reset')
  resetToDefaults() {
    this.consoleDisplayManager.resetToDefaults();
    return { success: true };
  }
}