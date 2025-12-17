import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ExecutionService, ExecutionSnapshot } from './execution.service';
import { ExecutionStatus } from '../../interfaces/module-interfaces';
import { Logger } from '@nestjs/common';

@Controller('api/executions')
export class ExecutionController {
  private readonly logger = new Logger(ExecutionController.name);

  constructor(private readonly executionService: ExecutionService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createExecution(@Body() body: {
    workflowId: string | null;
    nodes?: any[];
    ownerName?: string;  // ✅ 新增：当前用户名，用于关联路径配置
  }): Promise<ExecutionSnapshot> {
    // 【日志】Controller 层接收的节点列表
    if (body.nodes) {
      this.logger.log(`[Controller] 接收前端节点列表 - 数量: ${body.nodes.length}, 用户: ${body.ownerName}`);
      body.nodes.forEach((node, index) => {
        this.logger.log(`[Controller节点] 索引: ${index}, 类型: ${node.type}, 参数: ${JSON.stringify(node.config || {})}`);
      });
    }

    return this.executionService.executeWorkflow(body.workflowId, body.nodes, body.ownerName);
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
    console.log(`[ExecutionController:resetExecution] - Request received`);
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