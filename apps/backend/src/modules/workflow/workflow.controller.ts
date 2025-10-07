import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowStorageService } from './workflow-storage.service';
import { Workflow, WorkflowDefinition, ValidationResult } from '../../interfaces/module-interfaces';
import { PaginatedResponse } from '@zahnerflow/types';

@Controller('api/workflows')
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowStorage: WorkflowStorageService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkflow(@Body() definition: WorkflowDefinition): Promise<Workflow> {
    return this.workflowService.createWorkflow(definition);
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string): Promise<Workflow> {
    return this.workflowService.getWorkflow(id);
  }

  @Put(':id')
  async updateWorkflow(@Param('id') id: string, @Body() definition: WorkflowDefinition): Promise<Workflow> {
    return this.workflowService.updateWorkflow(id, definition);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteWorkflow(@Param('id') id: string): Promise<{ message: string }> {
    await this.workflowService.deleteWorkflow(id);
    return { message: 'Workflow deleted successfully' };
  }

  @Get()
  async getAllWorkflows(
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ): Promise<PaginatedResponse<Workflow>> {
    const workflows = await this.workflowService.listWorkflows();
    const pageNum = page && page > 0 ? page : 1;
    const limitNum = limit && limit > 0 ? limit : 20;
    
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    const paginatedWorkflows = workflows.slice(startIndex, endIndex);
    
    return {
      items: paginatedWorkflows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: workflows.length,
        totalPages: Math.ceil(workflows.length / limitNum),
        hasNext: endIndex < workflows.length,
        hasPrev: pageNum > 1
      }
    };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateWorkflow(@Body() definition: WorkflowDefinition): Promise<ValidationResult> {
    return this.workflowService.validateWorkflow(definition);
  }

  /**
   * 批量更新节点参数
   * body: { key: string; value: any; nodeType?: string }
   */
  @Post(':id/params/batch-update')
  @HttpCode(HttpStatus.OK)
  async batchUpdateNodeParam(
    @Param('id') id: string,
    @Body() body: { key: string; value: any; nodeType?: string },
  ): Promise<Workflow> {
    if (!body || !body.key) {
      throw new Error('Missing parameter: key');
    }
    return this.workflowService.batchUpdateNodeParam(id, body.key, body.value, body.nodeType);
  }

  @Get(':id/exists')
  @HttpCode(HttpStatus.OK)
  async workflowExists(@Param('id') id: string): Promise<{ exists: boolean }> {
    const exists = await this.workflowStorage.workflowExists(id);
    return { exists };
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicateWorkflow(
    @Param('id') id: string,
    @Body() body?: { name?: string }
  ): Promise<Workflow> {
    return this.workflowService.duplicateWorkflow(id, body?.name);
  }
}
