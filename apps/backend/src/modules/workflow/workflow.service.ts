import { Injectable, OnModuleInit } from '@nestjs/common';
import { IWorkflowModule, Workflow, WorkflowDefinition, ValidationResult } from '../../interfaces/module-interfaces';
import { WorkflowStorageService } from './workflow-storage.service';

@Injectable()
export class WorkflowService implements IWorkflowModule, OnModuleInit {
  readonly name = 'workflow';
  readonly version = '1.0.0';
  readonly dependencies = [];

  // 保持内存缓存，为了极致的读取性能
  private workflows = new Map<string, Workflow>();

  constructor(
    private readonly workflowStorage: WorkflowStorageService,
    // 注意：这里不再需要注入 DbService，实现了彻底解耦
  ) {}

  async onModuleInit(): Promise<void> {
    // ✅ 关键修复：强制先初始化表结构
    this.workflowStorage.ensureTables();

    // ✅ 然后再读取数据
    await this.loadWorkflowsFromStorage();
  }

  private async loadWorkflowsFromStorage(): Promise<void> {
    try {
      this.workflows = await this.workflowStorage.loadAllWorkflows();
      console.log(`[WorkflowService] Loaded ${this.workflows.size} workflows from SQLite.`);
    } catch (error) {
      console.error('Failed to load workflows from storage:', error);
      this.workflows = new Map();
    }
  }

  async createWorkflow(definition: WorkflowDefinition): Promise<Workflow> {
    const validation = this.validateWorkflow(definition);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
    }

    const id = this.generateWorkflowId();

    // 为所有临时节点ID生成真正的ID
    const nodeIdMap = new Map<string, string>();
    const updatedNodes = definition.nodes.map(node => {
      const newId = node.id.startsWith('temp_node_') ? this.generateNodeId() : node.id;
      nodeIdMap.set(node.id, newId);
      return { ...node, id: newId };
    });

    const updatedDefinition = {
      ...definition,
      id,
      nodes: updatedNodes
    };

    const workflow: Workflow = {
      id,
      name: definition.name,
      description: definition.description,
      ownerName: definition.ownerName,
      individualName: definition.individualName,
      definition: updatedDefinition,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1. 更新内存
    this.workflows.set(id, workflow);
    // 2. 持久化到 SQLite
    await this.workflowStorage.saveWorkflow(workflow);
    
    return workflow;
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowDefinition>): Promise<Workflow> {
    const current = await this.getWorkflow(id);

    // 更新属性逻辑保持不变...
    if (typeof updates.name === 'string') {
      current.name = updates.name;
      current.definition.name = updates.name;
    }
    if (typeof updates.description === 'string') {
      current.description = updates.description;
      current.definition.description = updates.description;
    }
    if (typeof updates.ownerName !== 'undefined') {
      current.ownerName = updates.ownerName;
      current.definition.ownerName = updates.ownerName;
    }
    if (typeof updates.individualName !== 'undefined') {
      current.individualName = updates.individualName;
      current.definition.individualName = updates.individualName;
    }

    if (updates.nodes) {
      const updatedDefinition: WorkflowDefinition = {
        ...current.definition,
        nodes: updates.nodes || current.definition.nodes
      };

      const validation = this.validateWorkflow(updatedDefinition);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      }

      current.definition = updatedDefinition;
    }

    current.version += 1;
    current.updatedAt = new Date();

    this.workflows.set(id, current);
    await this.workflowStorage.updateWorkflow(id, current);
    return current;
  }

  async deleteWorkflow(id: string): Promise<void> {
    // 先查是否存在
    const exists = this.workflows.has(id) || (await this.workflowStorage.getWorkflow(id));
    if (!exists) throw new Error(`Workflow ${id} not found`);
    
    this.workflows.delete(id);
    await this.workflowStorage.deleteWorkflow(id);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    // 优先查内存
    const inMem = this.workflows.get(id);
    if (inMem) return inMem;
    
    // 内存没有查数据库
    const fromStore = await this.workflowStorage.getWorkflow(id);
    if (!fromStore) throw new Error(`Workflow ${id} not found`);
    
    // 补回内存
    this.workflows.set(id, fromStore);
    return fromStore;
  }

  async listWorkflows(): Promise<Workflow[]> {
    if (this.workflows.size === 0) await this.loadWorkflowsFromStorage();
    return Array.from(this.workflows.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async duplicateWorkflow(id: string, newName?: string): Promise<Workflow> {
    const original = await this.getWorkflow(id);
    const cloned: WorkflowDefinition = {
      id: '',
      name: newName || `${original.name} (Copy)`,
      description: original.definition.description || '',
      ownerName: original.ownerName,
      individualName: original.individualName,
      nodes: JSON.parse(JSON.stringify(original.definition.nodes)),
      version: 1,
    };

    const idMap = new Map<string, string>();
    cloned.nodes.forEach((n: any) => {
      const nid = this.generateNodeId();
      idMap.set(n.id, nid);
      n.id = nid;
    });

    return this.createWorkflow(cloned);
  }

  // 验证逻辑保持完全不变
  validateWorkflow(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!definition.description?.trim()) warnings.push('Workflow description is recommended');

    if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    } else {
      definition.nodes.forEach((node: any, idx: number) => {
        if (!node.id?.trim()) errors.push(`Node ${idx + 1} must have an ID`);
        if (!node.type?.trim()) errors.push(`Node ${node.id || idx + 1} must have a type`);
        if (!node.name?.trim()) warnings.push(`Node ${node.id || idx + 1} should have a name`);
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // 【重构点】生成 Workflow ID：改为调用 storage 的原子计数器
  private generateWorkflowId(): string {
    try {
      // 直接从 DB 获取下一个数字，如 101
      const currentCount = this.workflowStorage.getNextCounter('workflow');
      // 格式化为 workflow_00000101
      return `workflow_${String(currentCount).padStart(8, '0')}`;
    } catch (error) {
      console.warn('Failed to generate workflow ID with DB counter, falling back to timestamp:', error);
      return `workflow_${Date.now()}`;
    }
  }

  // 【重构点】生成 Node ID：改为调用 storage 的原子计数器
  private generateNodeId(): string {
    try {
      const currentCount = this.workflowStorage.getNextCounter('node');
      return `node_${String(currentCount).padStart(8, '0')}`;
    } catch (error) {
      console.warn('Failed to generate node ID with DB counter, falling back to timestamp:', error);
      return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  async batchUpdateNodeParam(id: string, key: string, value: any, nodeType?: string): Promise<Workflow> {
    const wf = await this.getWorkflow(id);
    const nodes = wf.definition?.nodes || [];
    for (const node of nodes) {
      if (nodeType && node.type !== nodeType) continue;
      if (!node.config || typeof node.config !== 'object') node.config = {} as any;
      (node.config as any)[key] = value;
    }
    wf.definition.nodes = nodes;
    wf.version += 1;
    wf.updatedAt = new Date();
    this.workflows.set(id, wf);
    await this.workflowStorage.updateWorkflow(id, wf);
    return wf;
  }

  getStatus() {
    return { state: 'running', health: 'healthy', lastCheck: new Date() } as any;
  }
}