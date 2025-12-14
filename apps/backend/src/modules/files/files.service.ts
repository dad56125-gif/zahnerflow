import { Injectable, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

export interface RegisterFilePayload {
  user: string;
  project_name: string;
  individual_name: string;
  test_type: string;
  base_path?: string;
  filename: string;
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
  workflow_timestamp?: string;
}

@Injectable()
export class FilesService implements OnModuleInit {
  constructor(private readonly db: DbService) { }

  onModuleInit() {
    // 初始化 files 表，存储文件元数据
    // 整合了原有的 data_file_paths 和 data_file 概念
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user TEXT,
        project_name TEXT,
        individual_name TEXT,
        test_type TEXT,
        base_path TEXT,
        dir_path TEXT,
        filename TEXT,
        created_at TEXT
      )
    `).run();
  }

  /**
   * 注册文件元数据 (替代旧的 db.createDataFilePath)
   * 支持三种路径构建模式：
   * 1. 完整配置：base_path\project\individual\test_type
   * 2. 仅项目：base_path\project\default\timestamp\test_type
   * 3. 纯工作流：base_path\workflow_timestamp\test_type
   */
  async registerFile(payload: RegisterFilePayload) {
    const basePath = payload.base_path || 'C:\\data\\archive';
    const normalizedBasePath = basePath.replace(/\//g, '\\');
    const timestamp = new Date().toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_'); // 例如: 241129_1430

    let dirPath = '';

    // 模式1: 完整配置 (标准归档模式)
    if (payload.project_name && payload.individual_name) {
      dirPath = path.join(
        normalizedBasePath,
        payload.project_name,
        payload.individual_name,
        payload.test_type
      );
    }
    // 模式2: 只有项目名 (新增的项目默认模式)
    else if (payload.project_name && !payload.individual_name) {
      dirPath = path.join(
        normalizedBasePath,
        payload.project_name,
        'default',    // 固定目录名
        timestamp,     // 时间戳子目录
        payload.test_type
      );
    }
    // 模式3: 既无项目也无样品 (纯工作流临时模式)
    else {
      const workflowFolderName = `workflow_${timestamp}`;
      dirPath = path.join(
        normalizedBasePath,
        workflowFolderName,
        payload.test_type
      );
    }

    const id = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // 确保 individual_name 为空字符串而不是 undefined/null
    const individualNameVal = payload.individual_name || '';

    // 写入 SQLite
    this.db.prepare(`
      INSERT INTO files (id, user, project_name, individual_name, test_type, base_path, dir_path, filename, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.user,
      payload.project_name || '',    // 确保空字符串而不是 undefined
      individualNameVal,
      payload.test_type,
      normalizedBasePath,
      dirPath,
      payload.filename || 'placeholder',
      now
    );

    return {
      id,
      dir_path: dirPath,
      project_name: payload.project_name || '',
      individual_name: individualNameVal,
      test_type: payload.test_type
    };
  }

  /**
   * 获取用户的所有项目列表
   */
  getProjects(user: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT project_name 
      FROM files 
      WHERE user = ?
    `).all(user) as { project_name: string }[];

    return rows.map(r => r.project_name);
  }

  /**
   * 获取特定项目的配置
   */
  getProjectConfig(user: string, project_name: string, individual_name: string) {
    const row = this.db.prepare(`
      SELECT base_path, project_name, individual_name, test_type 
      FROM files 
      WHERE user = ? AND project_name = ? AND individual_name = ?
      LIMIT 1
    `).get(user, project_name, individual_name) as any;

    return row || null;
  }

  /**
   * 获取工作流文件列表
   * ⚠️ 关键修改：不再读 JSON 文件，而是查 workflows 表
   */
  async getWorkflowFiles(user: string, project?: string): Promise<Array<{
    id: string;
    name: string;
    filename: string;
    filepath: string;
    project_name: string;
    created_at: string;
    node_count?: number;
    connection_count?: number;
  }>> {
    // 从数据库查 workflows
    const rows = this.db.prepare(`SELECT id, json_data, updated_at FROM workflows`).all() as any[];

    const workflowFiles = [];

    // 获取用户的项目列表，作为默认项目
    const projects = this.getProjects(user);
    const defaultProject = projects.length > 0 ? projects[0] : '默认项目';

    for (const row of rows) {
      try {
        const wf = JSON.parse(row.json_data);

        // 如果需要按项目过滤 (假设 workflow 对象里有 ownerName 或其他字段可以关联项目，暂时用默认)
        // 这里为了兼容旧逻辑，project_name 逻辑比较模糊，先保留
        const wfProject = project || defaultProject;

        const nodeCount = Array.isArray(wf.definition?.nodes) ? wf.definition.nodes.length : 0;

        workflowFiles.push({
          id: wf.id,
          name: wf.name || '未命名工作流',
          filename: `${wf.id}.json`, // 虚拟文件名
          filepath: 'SQLite DB',      // 虚拟路径
          project_name: wfProject,
          created_at: wf.createdAt || row.updated_at,
          node_count: nodeCount,
          connection_count: 0
        });
      } catch (e) {
        console.warn(`Skipping invalid workflow json for id ${row.id}`);
      }
    }

    // 排序
    return workflowFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // ... 下面的 buildOutputPath 和 getTestTypeFromMeasurement 方法完全保留原样 ...
  // (请直接复制你原文件里 buildOutputPath 及其之后的所有代码，不需要改动)

  getTestTypeFromMeasurement(measurementType: string): string {
    const testTypeMap: Record<string, string> = {
      'eis_potentiostatic': 'eis',
      'eis_galvanostatic': 'eis',
      'ocp_measurement': 'ocp',
      'chronoamperometry': 'ca',
      'chronopotentiometry': 'cp',
      'voltage_ramp': 'lsv',
      'current_ramp': 'cv'
    };
    return testTypeMap[measurementType] || 'general';
  }

  /**
   * 打开系统原生文件夹选择对话框
   * 使用 Windows Forms FolderBrowserDialog
   * 注意：此功能仅当服务器与用户在同一台物理机器上运行时有效
   */
  async openSystemFolderDialog(): Promise<string> {
    return new Promise((resolve, reject) => {
      // PowerShell 脚本，使用 Windows Forms 的 FolderBrowserDialog
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;

        # 创建一个隐藏的父窗口来确保对话框置顶
        $form = New-Object System.Windows.Forms.Form;
        $form.WindowState = 'Minimized';
        $form.ShowInTaskbar = $false;
        $form.TopMost = $true;
        $form.Show();
        $form.Hide();

        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
        $dialog.Description = "请选择 ZahnerFlow 数据存储路径";
        $dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer;
        $result = $dialog.ShowDialog($form);

        if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.SelectedPath
        } else {
            Write-Output "CANCEL"
        }

        $form.Dispose();
        $dialog.Dispose();
      `;

      // 启动 PowerShell
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-Sta', // 👈 必须加上这一行！单线程单元模式，System.Windows.Forms 需要
        '-ExecutionPolicy', 'Bypass',
        '-Command', psCommand
      ]);

      let output = '';

      // 监听 stdout 和 stderr 输出
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        const result = output.trim();
        console.log('PowerShell 输出:', result); // 调试输出

        if (result === 'CANCEL') {
          // 用户明确取消，传递特殊错误
          reject(new Error('USER_CANCELLED'));
        } else if (result === '') {
          reject(new Error('无输出结果'));
        } else if (result.includes('ERROR:') || result.includes('Exception')) {
          reject(new Error(`PowerShell 错误: ${result}`));
        } else {
          resolve(result); // 返回路径
        }
      });

      child.on('error', (err) => {
        console.error('打开对话框失败:', err);
        reject(new Error(`启动 PowerShell 失败: ${err.message}`));
      });
    });
  }


  buildOutputPath(options: BuildOutputPathOptions): string {
    const {
      base_path = 'C:\\data\\archive',
      project_name,
      individual_name,
      test_type,
      measurement_type,
      workflow_id,
      workflow_name,
      useDefaultStructure = false,
      workflow_timestamp
    } = options;

    let finalTestType: string;
    if (test_type) {
      finalTestType = test_type;
    } else if (measurement_type) {
      finalTestType = this.getTestTypeFromMeasurement(measurement_type);
    } else {
      finalTestType = 'general';
    }

    if (!useDefaultStructure && project_name && individual_name && test_type) {
      return path.join(base_path, project_name, individual_name, finalTestType);
    } else {
      const timestamp = workflow_timestamp || (() => {
        const now = new Date();
        return now.toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_');
      })();
      const workflowIdForPath = workflow_id || workflow_name || 'unknown_workflow';
      return path.join(base_path, workflowIdForPath, timestamp, finalTestType);
    }
  }
}