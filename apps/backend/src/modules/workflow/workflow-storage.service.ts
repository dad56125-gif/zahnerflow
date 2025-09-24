import { Injectable } from '@nestjs/common';
import { Workflow, WorkflowDefinition } from '../../interfaces/module-interfaces';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WorkflowStorageService {
  private readonly storagePath: string;
  private readonly workflowsFile: string;
  private readonly counterFile: string;

  constructor() {
    this.storagePath = path.join(process.cwd(), 'data', 'workflows');
    this.workflowsFile = path.join(this.storagePath, 'workflows.json');
    this.counterFile = path.join(this.storagePath, 'counter.txt');

    this.ensureStorageDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 获取下一个工作流ID计数器
   */
  getNextCounter(): number {
    try {
      if (fs.existsSync(this.counterFile)) {
        const counter = parseInt(fs.readFileSync(this.counterFile, 'utf-8'), 10);
        return isNaN(counter) ? 1 : counter + 1;
      }
      return 1;
    } catch (error) {
      console.error('Error reading counter file:', error);
      return 1;
    }
  }

  /**
   * 保存计数器值
   */
  saveCounter(counter: number): void {
    try {
      fs.writeFileSync(this.counterFile, counter.toString());
    } catch (error) {
      console.error('Error saving counter file:', error);
    }
  }

  /**
   * 保存工作流到存储
   */
  async saveWorkflow(workflow: Workflow): Promise<void> {
    try {
      const workflows = await this.loadAllWorkflows();
      workflows.set(workflow.id, workflow);
      
      const workflowsArray = Array.from(workflows.entries());
      const data = {
        workflows: workflowsArray,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(this.workflowsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving workflow to storage:', error);
      throw new Error(`Failed to save workflow: ${error.message}`);
    }
  }

  /**
   * 从存储加载所有工作流
   */
  async loadAllWorkflows(): Promise<Map<string, Workflow>> {
    try {
      if (!fs.existsSync(this.workflowsFile)) {
        return new Map();
      }
      
      const data = fs.readFileSync(this.workflowsFile, 'utf-8');
      const parsed = JSON.parse(data);
      
      const workflows = new Map<string, Workflow>();
      if (parsed.workflows && Array.isArray(parsed.workflows)) {
        parsed.workflows.forEach(([id, workflow]: [string, any]) => {
          // 转换日期字符串回Date对象
          workflow.createdAt = new Date(workflow.createdAt);
          workflow.updatedAt = new Date(workflow.updatedAt);
          workflows.set(id, workflow);
        });
      }
      
      return workflows;
    } catch (error) {
      console.error('Error loading workflows from storage:', error);
      return new Map();
    }
  }

  /**
   * 获取单个工作流
   */
  async getWorkflow(id: string): Promise<Workflow | null> {
    try {
      const workflows = await this.loadAllWorkflows();
      return workflows.get(id) || null;
    } catch (error) {
      console.error(`Error loading workflow ${id}:`, error);
      return null;
    }
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(id: string): Promise<void> {
    try {
      const workflows = await this.loadAllWorkflows();
      if (workflows.delete(id)) {
        const workflowsArray = Array.from(workflows.entries());
        const data = {
          workflows: workflowsArray,
          lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(this.workflowsFile, JSON.stringify(data, null, 2));
      } else {
        throw new Error(`Workflow ${id} not found`);
      }
    } catch (error) {
      console.error(`Error deleting workflow ${id}:`, error);
      throw new Error(`Failed to delete workflow: ${error.message}`);
    }
  }

  /**
   * 更新工作流
   */
  async updateWorkflow(id: string, workflow: Workflow): Promise<void> {
    try {
      const workflows = await this.loadAllWorkflows();
      if (workflows.has(id)) {
        workflows.set(id, workflow);
        
        const workflowsArray = Array.from(workflows.entries());
        const data = {
          workflows: workflowsArray,
          lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(this.workflowsFile, JSON.stringify(data, null, 2));
      } else {
        throw new Error(`Workflow ${id} not found`);
      }
    } catch (error) {
      console.error(`Error updating workflow ${id}:`, error);
      throw new Error(`Failed to update workflow: ${error.message}`);
    }
  }

  /**
   * 检查工作流是否存在
   */
  async workflowExists(id: string): Promise<boolean> {
    try {
      const workflow = await this.getWorkflow(id);
      return workflow !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * 列出所有工作流
   */
  async listWorkflows(): Promise<Workflow[]> {
    try {
      const workflows = await this.loadAllWorkflows();
      return Array.from(workflows.values());
    } catch (error) {
      console.error('Error listing workflows:', error);
      return [];
    }
  }

  /**
   * 清理存储
   */
  async clearStorage(): Promise<void> {
    try {
      if (fs.existsSync(this.workflowsFile)) {
        fs.unlinkSync(this.workflowsFile);
      }
      if (fs.existsSync(this.counterFile)) {
        fs.unlinkSync(this.counterFile);
      }
    } catch (error) {
      console.error('Error clearing workflow storage:', error);
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<{
    totalWorkflows: number;
    lastUpdated: Date | null;
    storageSize: number;
  }> {
    try {
      let totalWorkflows = 0;
      let lastUpdated: Date | null = null;
      let storageSize = 0;

      if (fs.existsSync(this.workflowsFile)) {
        const stats = fs.statSync(this.workflowsFile);
        storageSize += stats.size;
        
        const data = fs.readFileSync(this.workflowsFile, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed.workflows) {
          totalWorkflows = parsed.workflows.length;
        }
        if (parsed.lastUpdated) {
          lastUpdated = new Date(parsed.lastUpdated);
        }
      }

      if (fs.existsSync(this.counterFile)) {
        const stats = fs.statSync(this.counterFile);
        storageSize += stats.size;
      }

      return {
        totalWorkflows,
        lastUpdated,
        storageSize
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalWorkflows: 0,
        lastUpdated: null,
        storageSize: 0
      };
    }
  }
}