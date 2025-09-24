import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionResult, ExecutionStatus } from '../../interfaces/module-interfaces';

@Controller('api/executions')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExecution(@Body() body: { workflowId: string }): Promise<ExecutionResult> {
    return this.executionService.executeWorkflow(body.workflowId);
  }

  @Get(':id')
  async getExecution(@Param('id') executionId: string): Promise<ExecutionStatus> {
    return this.executionService.getExecutionStatus(executionId);
  }

  @Put(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseExecution(@Param('id') executionId: string): Promise<{ message: string }> {
    await this.executionService.pauseExecution(executionId);
    return { message: 'Execution paused successfully' };
  }

  @Put(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeExecution(@Param('id') executionId: string): Promise<{ message: string }> {
    await this.executionService.resumeExecution(executionId);
    return { message: 'Execution resumed successfully' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancelExecution(@Param('id') executionId: string): Promise<{ message: string }> {
    await this.executionService.cancelExecution(executionId);
    return { message: 'Execution cancelled successfully' };
  }

  @Get()
  async getAllExecutions(): Promise<ExecutionStatus[]> {
    // 这里应该从数据库获取所有执行状态
    return [];
  }
}