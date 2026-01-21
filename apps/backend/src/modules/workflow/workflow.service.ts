import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IWorkflowModule, Workflow, WorkflowNode, ValidationResult } from '../../interfaces/module-interfaces';
import { WorkflowStorageService } from './workflow-storage.service';

@Injectable()
export class WorkflowService implements IWorkflowModule, OnModuleInit {
  readonly name = 'workflow';
  readonly version = '2.0.0';
  readonly dependencies = [];
  private readonly logger = new Logger(WorkflowService.name);

  // 内存缓存
  private workflows = new Map<string, Workflow>();

  constructor(
    private readonly workflowStorage: WorkflowStorageService,
  ) { }

  async onModuleInit(): Promise<void> {
    this.workflowStorage.ensureTables();
    await this.loadWorkflowsFromStorage();
  }

  private async loadWorkflowsFromStorage(): Promise<void> {
    try {
      this.workflows = await this.workflowStorage.loadAllWorkflows();
      this.logger.log(`Loaded ${this.workflows.size} workflows from storage.`);
    } catch (error) {
      this.logger.error('Failed to load workflows', error);
      this.workflows = new Map();
    }
  }

  // --- 核心方法：创建工作流 ---
  async createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workflow> {
    // 【日志】WorkflowService 创建工作流 - 记录节点信息
    this.logger.log(`[WorkflowService] 创建工作流 - 节点数量: ${data.nodes.length}`);
    data.nodes.forEach((node, index) => {
      this.logger.log(`[WorkflowService节点] 索引: ${index}, 类型: ${node.type}, 参数: ${JSON.stringify(node.config || {})}`);
    });

    // 1. 校验
    const validation = this.validateWorkflow(data);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    // 2. ID 生成 (Workflow ID & Node IDs)
    const id = this.generateWorkflowId();

    // 处理节点 ID：如果是临时 ID (temp_) 则重新生成，否则保留
    const processedNodes = data.nodes.map(node => ({
      ...node,
      id: (!node.id || node.id.startsWith('temp_')) ? this.generateNodeId() : node.id
    }));

    // 【日志】处理后的节点信息
    this.logger.log(`[WorkflowService] 处理后节点列表 - ID: ${id}`);
    processedNodes.forEach((node, index) => {
      this.logger.log(`[WorkflowService处理后] 索引: ${index}, ID: ${node.id}, 类型: ${node.type}, 参数: ${JSON.stringify(node.config || {})}`);
    });

    // 3. 构建完整对象
    const workflow: Workflow = {
      ...data,
      id,
      nodes: processedNodes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 4. 保存
    this.workflows.set(id, workflow);
    await this.workflowStorage.saveWorkflow(workflow);

    this.logger.log(`Created workflow ${id} with ${workflow.nodes.length} nodes`);
    return workflow;
  }
  // --- [补全缺失方法] ---

  async duplicateWorkflow(id: string, newName?: string): Promise<Workflow> {
    const original = await this.getWorkflow(id);

    // 生成新 ID
    const newId = this.generateWorkflowId();

    // 深拷贝 nodes 并重生成 node IDs
    const newNodes = original.nodes.map(node => ({
      ...node,
      id: this.generateNodeId()
    }));

    const clonedWorkflow: Workflow = {
      id: newId,
      name: newName || `${original.name} (Copy)`,
      // description 等其他字段被移除了，不用管
      ownerName: original.ownerName,
      individualName: original.individualName,
      nodes: newNodes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.workflows.set(newId, clonedWorkflow);
    await this.workflowStorage.saveWorkflow(clonedWorkflow);

    return clonedWorkflow;
  }

  async batchUpdateNodeParam(id: string, key: string, value: any, nodeType?: string): Promise<Workflow> {
    const wf = await this.getWorkflow(id);

    let updated = false;
    for (const node of wf.nodes) {
      if (nodeType && node.type !== nodeType) continue;

      if (!node.config) node.config = {};
      node.config[key] = value;
      updated = true;
    }

    if (updated) {
      wf.updatedAt = new Date();
      this.workflows.set(id, wf);
      await this.workflowStorage.updateWorkflow(id, wf);
    }

    return wf;
  }

  // --- [补全结束] ---
  async updateWorkflow(id: string, updates: Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Workflow> {
    const current = await this.getWorkflow(id);

    // 简单合并
    const updatedWorkflow: Workflow = {
      ...current,
      ...updates,
      updatedAt: new Date()
    };

    // 如果更新了节点，重新校验
    if (updates.nodes) {
      const validation = this.validateWorkflow(updatedWorkflow);
      if (!validation.valid) throw new Error(`Invalid workflow update: ${validation.errors.join(', ')}`);
    }

    this.workflows.set(id, updatedWorkflow);
    await this.workflowStorage.updateWorkflow(id, updatedWorkflow);
    return updatedWorkflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    if (!this.workflows.has(id)) throw new Error(`Workflow ${id} not found`);
    this.workflows.delete(id);
    await this.workflowStorage.deleteWorkflow(id);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const wf = this.workflows.get(id);
    if (wf) return wf;

    const fromStore = await this.workflowStorage.getWorkflow(id);
    if (!fromStore) throw new Error(`Workflow ${id} not found`);

    this.workflows.set(id, fromStore);
    return fromStore;
  }

  async listWorkflows(): Promise<any[]> {
    return Array.from(this.workflows.values())
      .map(wf => {
        const nodes = wf.nodes || (wf as any).definition?.nodes || [];
        return {
          id: wf.id,
          name: wf.name,
          ownerName: wf.ownerName || wf.individualName || (wf as any).definition?.ownerName,
          nodeCount: nodes.length,
          loopCount: nodes.filter((n: any) => n.type === 'loop_start').length,
          isFavorite: wf.isFavorite || false,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // 验证逻辑 (针对简化后的结构)
  validateWorkflow(data: Partial<Workflow>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.name?.trim()) errors.push('Workflow name is required');

    if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    } else {
      data.nodes.forEach((node, idx) => {
        if (!node.type) errors.push(`Node at index ${idx} missing type`);
        // config 是 Record<string, any>，不需要严格校验内容，只要存在即可
        if (!node.config) warnings.push(`Node ${node.id || idx} has no config`);
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // --- ID 生成器 (封装了 Storage Counter) ---
  private generateWorkflowId(): string {
    try {
      const count = this.workflowStorage.getNextCounter('workflow');
      return `wf_${String(count).padStart(6, '0')}`;
    } catch (e) {
      return `wf_${Date.now()}`;
    }
  }

  private generateNodeId(): string {
    try {
      const count = this.workflowStorage.getNextCounter('node');
      return `n_${String(count).padStart(8, '0')}`;
    } catch (e) {
      return `n_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    }
  }

  getStatus() {
    return { state: 'running', health: 'healthy', lastCheck: new Date() } as any;
  }
}