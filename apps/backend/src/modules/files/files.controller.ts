import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesService, RegisterFilePayload } from './files.service';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerFile(@Body() payload: RegisterFilePayload) {
    try {
      const result = await this.filesService.registerFile(payload);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('projects')
  getProjects(@Query('user') user: string) {
    if (!user) {
      return {
        success: false,
        message: 'User parameter is required'
      };
    }

    const projects = this.filesService.getProjects(user);
    return {
      success: true,
      projects
    };
  }

  @Post('path-config')
  async savePathConfig(@Body() config: {
    user: string;
    base_path: string;
    project_name: string;
    individual_name: string;
    test_type: string;
  }) {
    try {
      const result = await this.filesService.registerFile({
        ...config,
        filename: 'placeholder.csv' // Will be replaced by device layer
      });

      return {
        success: true,
        id: result.id,
        dir_path: result.dir_path
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('workflows')
  async getWorkflowFiles(@Query('user') user: string, @Query('project') project?: string) {
    if (!user) {
      return {
        success: false,
        message: 'User parameter is required'
      };
    }

    try {
      const workflows = await this.filesService.getWorkflowFiles(user, project);
      return {
        success: true,
        data: workflows
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

