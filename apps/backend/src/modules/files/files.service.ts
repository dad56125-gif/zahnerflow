import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import * as path from 'path';

export interface RegisterFilePayload {
  user: string;
  project_name: string;
  individual_name: string;
  test_type: string;
  base_path?: string;
  filename: string;
}

export interface RegisterFileResult {
  id: string;
  dir_path: string;
  project_name: string;
  individual_name: string;
  test_type: string;
}

export interface BuildOutputPathOptions {
  base_path?: string;
  project_name?: string;
  individual_name?: string;
  test_type?: string;
  measurement_type?: string;
  workflow_id?: string;
  workflow_name?: string;
  useDefaultStructure?: boolean;
}

@Injectable()
export class FilesService {
  constructor(private readonly dbService: DbService) {}

  async registerFile(payload: RegisterFilePayload): Promise<RegisterFileResult> {
    const basePath = payload.base_path || 'C:\\data\\archive';

    // Normalize Windows path
    const normalizedBasePath = basePath.replace(/\//g, '\\');

    // Create directory structure: basePath/projectName/individualName/testType/
    const dirPath = path.join(
      normalizedBasePath,
      payload.project_name,
      payload.individual_name,
      payload.test_type
    );

    const record = await this.dbService.createDataFilePath({
      user: payload.user,
      project_name: payload.project_name,
      individual_name: payload.individual_name,
      test_type: payload.test_type,
      base_path: normalizedBasePath
    });

    return {
      id: record.id,
      dir_path: record.dir_path,
      project_name: payload.project_name,
      individual_name: payload.individual_name,
      test_type: payload.test_type
    };
  }

  getProjects(user: string): string[] {
    return this.dbService.getProjects(user);
  }

  getProjectConfig(user: string, project_name: string, individual_name: string) {
    const paths = this.dbService.getDataFilePaths(user)
      .filter(p => p.project_name === project_name && p.individual_name === individual_name);

    if (paths.length === 0) {
      return null;
    }

    const firstPath = paths[0];
    return {
      base_path: firstPath.base_path,
      project_name: firstPath.project_name,
      individual_name: firstPath.individual_name,
      test_type: firstPath.test_type
    };
  }

  async getWorkflowFiles(user: string, project?: string): Promise<Array<{
    id: string;
    name: string;
    filename: string;
    filepath: string;
    project_name: string;
    created_at: string;
    file_size?: number;
    node_count?: number;
    connection_count?: number;
  }>> {
    // 导入文件系统模块
    const fs = require('fs').promises;
    const path = require('path');

    try {
      // 读取工作流JSON文件
      const workflowsPath = path.join(process.cwd(), 'data', 'workflows', 'workflows.json');

      try {
        const workflowsData = JSON.parse(await fs.readFile(workflowsPath, 'utf8'));
        const workflowArray = workflowsData.workflows || [];

        const workflowFiles: Array<{
          id: string;
          name: string;
          filename: string;
          filepath: string;
          project_name: string;
          created_at: string;
          file_size?: number;
          node_count?: number;
          connection_count?: number;
        }> = [];

        // 处理工作流数组
        for (const [workflowKey, workflowData] of workflowArray) {
          if (workflowData && typeof workflowData === 'object') {
            const workflow = workflowData as any;

            // 计算节点和连接数
            let node_count = 0;
            let connection_count = 0;

            if (workflow.definition && workflow.definition.nodes) {
              node_count = Array.isArray(workflow.definition.nodes) ? workflow.definition.nodes.length : 0;
            }

            if (workflow.definition && workflow.definition.edges) {
              connection_count = Array.isArray(workflow.definition.edges) ? workflow.definition.edges.length : 0;
            }

            // 从项目列表中获取项目名，如果没有则使用默认值
            const projects = this.getProjects(user);
            const project_name = project || (projects.length > 0 ? projects[0] : '默认项目');

            workflowFiles.push({
              id: workflow.id || workflowKey,
              name: workflow.name || '未命名工作流',
              filename: `${workflow.id || workflowKey}.json`,
              filepath: workflowsPath,
              project_name,
              created_at: workflow.createdAt || workflow.updated_at || new Date().toISOString(),
              node_count,
              connection_count
            });
          }
        }

        // 按创建时间排序，最新的在前
        workflowFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return workflowFiles;

      } catch (readError) {
        console.warn('无法读取工作流文件，返回空列表:', readError);
        return [];
      }

    } catch (error) {
      console.error('Error getting workflow files:', error);
      return [];
    }
  }

  /**
   * 从measurementType推断test_type
   */
  getTestTypeFromMeasurement(measurementType: string): string {
    const testTypeMap: Record<string, string> = {
      'eis_potentiostatic': 'eis',
      'eis_galvanostatic': 'eis',
      'ocp_measurement': 'ocp',
      'chronoamperometry': 'ca',
      'chronopotentiometry': 'cp',
      'voltage_ramp': 'lsv',
      'current_ramp': 'cv',
      'lsv_measurement': 'lsv'
    };

    return testTypeMap[measurementType] || 'general';
  }

  /**
   * 构建输出路径
   *
   * 规则：
   * 1. test_type必须存在作为最后一级目录
   * 2. base_path默认为 C:\data\archive
   * 3. 完整信息：base_path/project_name/individual_name/test_type
   * 4. 默认结构：base_path/workflow_id/YYMMDD_HHmm/test_type
   */
  buildOutputPath(options: BuildOutputPathOptions): string {
    const {
      base_path = 'C:\\data\\archive',
      project_name,
      individual_name,
      test_type,
      measurement_type,
      workflow_id,
      workflow_name,
      useDefaultStructure = false
    } = options;

    // 确定test_type
    let finalTestType: string;
    if (test_type) {
      finalTestType = test_type;
    } else if (measurement_type) {
      finalTestType = this.getTestTypeFromMeasurement(measurement_type);
    } else {
      finalTestType = 'general';
    }

    // 判断是否使用默认结构
    if (!useDefaultStructure && project_name && individual_name && test_type) {
      // 完整信息路径
      return path.join(
        base_path,
        project_name,
        individual_name,
        finalTestType
      );
    } else {
      // 默认路径结构
      const now = new Date();
      const timestamp = now.toISOString()
        .slice(2, 16) // YYMMDD_HHmm 格式（正确：slice(2,16)）
        .replace(/[-:]/g, '')
        .replace('T', '_');

      // 优先使用workflow_id，如果没有则使用workflow_name
      const workflowIdForPath = workflow_id || workflow_name || 'unknown_workflow';

      return path.join(
        base_path,
        workflowIdForPath,
        timestamp,
        finalTestType
      );
    }
  }
}
