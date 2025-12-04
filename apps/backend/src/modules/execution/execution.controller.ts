import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionResult, ExecutionStatus } from '../../interfaces/module-interfaces';

@Controller('api/executions')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExecution(@Body() body: { workflowId: string | null; nodes?: any[] }): Promise<ExecutionResult> {
    return this.executionService.executeWorkflow(body.workflowId, body.nodes);
  }

  @Get()
  async getAllExecutions(): Promise<ExecutionStatus[]> {
    // ✅ 需要在 Service 补回此方法
    return this.executionService.getAllExecutions();
  }

  @Get('hooks/rules')
  @HttpCode(HttpStatus.OK)
  getHookRules() {
    // ✅ 需要在 Service 补回此方法
    return { items: this.executionService.getLoadedHookRules() };
  }

  @Get(':id')
  async getExecution(@Param('id') executionId: string): Promise<ExecutionStatus> {
    return this.executionService.getExecutionStatus(executionId);
  }

  @Put(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseExecution(@Param('id') executionId: string) {
    await this.executionService.pauseExecution(executionId);
    return { message: 'Execution paused' };
  }

  @Put(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeExecution(@Param('id') executionId: string) {
    await this.executionService.resumeExecution(executionId);
    return { message: 'Execution resumed' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancelExecution(@Param('id') executionId: string) {
    await this.executionService.cancelExecution(executionId);
    return { message: 'Execution cancelled' };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetExecution() {
    const result = await this.executionService.resetExecution();
    // ✅ 修复：Service 返回 { success, error }，这里适配一下
    if (!result.success) {
       throw new Error(result.error || 'Reset failed');
    }
    return {
      success: true,
      message: 'Execution reset successfully',
      timestamp: new Date()
    };
  }
}