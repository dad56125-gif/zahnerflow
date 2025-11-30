import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesService, RegisterFilePayload } from './files.service';
import { exec } from 'child_process';
import * as os from 'os';

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

  /**
   * 打开系统文件夹选择器（纯 PowerShell 方案）
   * 仅当服务器与用户在同一台物理机器上运行时有效
   */
  @Get('browse-system-path')
  async browseSystemPath() {
    try {
      // 这行代码会挂起，直到用户在服务器弹出的窗口中点击"确定"或"取消"
      const path = await this.filesService.openSystemFolderDialog();
      return {
        success: true,
        path: path,
        message: '路径选择成功'
      };
    } catch (error) {
      console.error('打开系统文件夹选择器失败:', error);
      // 使用清晰的状态码检测
      if (error.message === 'USER_CANCELLED') {
        return {
          success: false,
          message: 'USER_CANCELLED'
        };
      } else {
        return {
          success: false,
          message: '无法打开系统对话框，请手动输入路径'
        };
      }
    }
  }

  /**
   * 获取常用文件夹路径列表
   * 优先尝试使用系统文件夹选择器，失败时提供常用路径
   */
  @Get('browse-path')
  async browsePath() {
    try {
      // 首先尝试使用系统文件夹选择器
      try {
        const path = await this.filesService.openSystemFolderDialog();
        return {
          success: true,
          path: path,
          message: '路径选择成功'
        };
      } catch (folderError) {
        console.log('系统文件夹选择器失败，回退到路径列表:', folderError.message);

        // 使用清晰的状态码检测
        if (folderError.message === 'USER_CANCELLED') {
          return {
            success: false,
            message: 'USER_CANCELLED'
          };
        }

        // 如果系统选择失败，提供常用路径列表
        const commonPaths = [];
        const userInfo = require('os').userInfo();

        if (os.platform() === 'win32') {
          // Windows 常用路径
          commonPaths.push(
            'C:\\data\\archive',
            `C:\\Users\\${userInfo.username}\\Documents`,
            `C:\\Users\\${userInfo.username}\\Desktop`,
            `C:\\Users\\${userInfo.username}\\Downloads`,
            'D:\\data',
            'E:\\data'
          );
        } else {
          // macOS/Linux 常用路径
          const homeDir = require('os').homedir();
          commonPaths.push(
            `${homeDir}/Documents`,
            `${homeDir}/Desktop`,
            `${homeDir}/Downloads`,
            '/tmp/data',
            '/var/data'
          );
        }

        return {
          success: true,
          paths: commonPaths,
          defaultPath: 'C:\\data\\archive',
          message: '请选择或输入以下路径之一'
        };
      }
    } catch (error) {
      console.error('browsePath错误:', error);
      return {
        success: false,
        message: error.message || '获取路径失败'
      };
    }
  }
}

