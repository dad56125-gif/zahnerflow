import { Injectable, OnModuleInit } from '@nestjs/common';
import { IWorkflowModule, Workflow, WorkflowDefinition, ValidationResult } from '../../interfaces/module-interfaces';
import { WorkflowStorageService } from './workflow-storage.service';
import { DbService } from '../../db/db.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WorkflowService implements IWorkflowModule, OnModuleInit {
  readonly name = 'workflow';
  readonly version = '1.0.0';
  readonly dependencies = [];

  private workflows = new Map<string, Workflow>();

  constructor(
    private readonly workflowStorage: WorkflowStorageService,
    private readonly db: DbService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadWorkflowsFromStorage();
  }

  private async loadWorkflowsFromStorage(): Promise<void> {
    try {
      this.workflows = await this.workflowStorage.loadAllWorkflows();
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
    const workflow: Workflow = {
      id,
      name: definition.name,
      description: definition.description,
      ownerName: definition.ownerName,
      individualName: definition.individualName,
      definition,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.workflows.set(id, workflow);
    await this.workflowStorage.saveWorkflow(workflow);
    await this.db.upsertWorkflow(workflow as any);
    return workflow;
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowDefinition>): Promise<Workflow> {
    const current = await this.getWorkflow(id);

    // 更新工作流基本属性
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

    // 如果更新包含节点或边，进行完整验证
    if (updates.nodes || updates.edges) {
      const updatedDefinition: WorkflowDefinition = {
        ...current.definition,
        nodes: updates.nodes || current.definition.nodes,
        edges: updates.edges || current.definition.edges
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
    await this.db.upsertWorkflow(current as any);
    return current;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const exists = this.workflows.has(id) || (await this.workflowStorage.getWorkflow(id));
    if (!exists) throw new Error(`Workflow ${id} not found`);
    this.workflows.delete(id);
    await this.workflowStorage.deleteWorkflow(id);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const inMem = this.workflows.get(id);
    if (inMem) return inMem;
    const fromStore = await this.workflowStorage.getWorkflow(id);
    if (!fromStore) throw new Error(`Workflow ${id} not found`);
    this.workflows.set(id, fromStore);
    return fromStore;
  }

  async listWorkflows(): Promise<Workflow[]> {
    if (this.workflows.size === 0) await this.loadWorkflowsFromStorage();
    // 按创建时间降序排列（最新的在前面），确保分页能获取到最新记录
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
      edges: JSON.parse(JSON.stringify(original.definition.edges)),
      version: 1,
    };

    // 重新分配节点ID，保持边关系一致
    const idMap = new Map<string, string>();
    cloned.nodes.forEach((n: any) => {
      const nid = this.generateNodeId();
      idMap.set(n.id, nid);
      n.id = nid;
    });
    cloned.edges.forEach((e: any) => {
      if (idMap.has(e.source)) e.source = idMap.get(e.source)!;
      if (idMap.has(e.target)) e.target = idMap.get(e.target)!;
    });

    return this.createWorkflow(cloned);
  }

  validateWorkflow(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!definition.name?.trim()) errors.push('Workflow name is required');
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

    if (Array.isArray(definition.edges)) {
      const nodeIds = new Set(definition.nodes.map((n: any) => n.id));
      definition.edges.forEach((edge: any, idx: number) => {
        if (!edge.source || !nodeIds.has(edge.source)) errors.push(`Edge ${idx + 1} invalid source`);
        if (!edge.target || !nodeIds.has(edge.target)) errors.push(`Edge ${idx + 1} invalid target`);
        if (edge.source === edge.target) errors.push(`Edge ${idx + 1} cannot self-connect`);
      });
      if (this.detectCycle(definition.nodes as any[], definition.edges as any[])) {
        errors.push('Workflow contains circular dependencies');
      }
    }

    if (definition.nodes?.length) {
      const disconnected = this.findDisconnectedNodes(definition.nodes as any[], definition.edges as any[]);
      if (disconnected.length > 0) warnings.push(`Disconnected nodes: ${disconnected.join(', ')}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private detectCycle(nodes: any[], edges: any[]): boolean {
    const graph = new Map<string, string[]>();
    nodes.forEach(n => graph.set(n.id, []));
    edges.forEach(e => graph.get(e.source)!.push(e.target));

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (id: string): boolean => {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id); inStack.add(id);
      for (const nb of graph.get(id) || []) if (dfs(nb)) return true;
      inStack.delete(id);
      return false;
    };

    return nodes.some(n => dfs(n.id));
  }

  private findDisconnectedNodes(nodes: any[], edges: any[]): string[] {
    if (!nodes.length) return [];
    if (!edges?.length) return nodes.map(n => n.id);

    const graph = new Map<string, string[]>();
    nodes.forEach(n => graph.set(n.id, []));
    edges.forEach(e => { graph.get(e.source)!.push(e.target); graph.get(e.target)!.push(e.source); });

    const visited = new Set<string>();
    const stack = [nodes[0].id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      (graph.get(cur) || []).forEach(nb => { if (!visited.has(nb)) stack.push(nb); });
    }
    return nodes.map(n => n.id).filter(id => !visited.has(id));
  }

  private generateWorkflowId(): string {
    const counterPath = path.join(process.cwd(), 'data', 'counters');

    // 确保计数器目录存在
    if (!fs.existsSync(counterPath)) {
      fs.mkdirSync(counterPath, { recursive: true });
    }

    const workflowCounterFile = path.join(counterPath, 'workflow-counter.txt');

    try {
      // 读取当前计数器值
      let currentCount = 1;
      if (fs.existsSync(workflowCounterFile)) {
        const content = fs.readFileSync(workflowCounterFile, 'utf8').trim();
        currentCount = parseInt(content, 10) || 1;
      }

      // 生成8位数字的工作流ID
      const workflowId = `workflow_${String(currentCount).padStart(8, '0')}`;

      // 保存下一个计数器值
      fs.writeFileSync(workflowCounterFile, String(currentCount + 1), 'utf8');

      return workflowId;
    } catch (error) {
      // 如果文件操作失败，回退到时间戳方案
      console.warn('Failed to generate workflow ID with counter, falling back to timestamp:', error);
      return `workflow_${Date.now()}`;
    }
  }

  private generateNodeId(): string {
    const counterPath = path.join(process.cwd(), 'data', 'counters');

    // 确保计数器目录存在
    if (!fs.existsSync(counterPath)) {
      fs.mkdirSync(counterPath, { recursive: true });
    }

    const nodeCounterFile = path.join(counterPath, 'node-counter.txt');

    try {
      // 读取当前计数器值
      let currentCount = 1;
      if (fs.existsSync(nodeCounterFile)) {
        const content = fs.readFileSync(nodeCounterFile, 'utf8').trim();
        currentCount = parseInt(content, 10) || 1;
      }

      // 生成8位数字的节点ID
      const nodeId = `node_${String(currentCount).padStart(8, '0')}`;

      // 保存下一个计数器值
      fs.writeFileSync(nodeCounterFile, String(currentCount + 1), 'utf8');

      return nodeId;
    } catch (error) {
      // 如果文件操作失败，回退到时间戳方案
      console.warn('Failed to generate node ID with counter, falling back to timestamp:', error);
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
    // 同步数据库索引：展平写入 node / node_param
    await this.db.upsertWorkflow(wf as any);
    return wf;
  }

  getStatus() {
    return { state: 'running', health: 'healthy', lastCheck: new Date() } as any;
  }
}
