import { Injectable, OnModuleInit } from '@nestjs/common';
import { IWorkflowModule, Workflow, WorkflowDefinition, ValidationResult } from '../../interfaces/module-interfaces';
import { WorkflowStorageService } from './workflow-storage.service';

@Injectable()
export class WorkflowService implements IWorkflowModule, OnModuleInit {
  readonly name = 'workflow';
  readonly version = '1.0.0';
  readonly dependencies = [];

  private workflows = new Map<string, Workflow>();
  private workflowCounter = 0;

  constructor(
    private readonly workflowStorage: WorkflowStorageService,
  ) {}

  async onModuleInit() {
    await this.loadWorkflowsFromStorage();
  }

  /**
   * 从存储加载工作流
   */
  private async loadWorkflowsFromStorage(): Promise<void> {
    try {
      this.workflows = await this.workflowStorage.loadAllWorkflows();
      this.workflowCounter = this.workflowStorage.getNextCounter() - 1;
      // 工作流加载完成通知
      } catch (error) {
      console.error('Failed to load workflows from storage:', error);
    }
  }

  async createWorkflow(definition: WorkflowDefinition): Promise<Workflow> {
    const workflowId = this.generateWorkflowId();
    
            //   `Creating workflow ${definition.name}`,
    //   `ID: ${workflowId}`
    // );

    
    // 验证工作流定义
    const validationResult = this.validateWorkflow(definition);
    if (!validationResult.valid) {
      throw new Error(`Workflow validation failed: ${validationResult.errors.join(', ')}`);
    }

    // 创建工作流
    const workflow: Workflow = {
      id: workflowId,
      name: definition.name,
      description: definition.description,
      definition,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 保存到内存和存储
    this.workflows.set(workflowId, workflow);
    await this.workflowStorage.saveWorkflow(workflow);

            //   `Workflow ${definition.name} created successfully`,
    //   '工作流创建成功并已保存'
    // );

    
    return workflow;
  }

  async updateWorkflow(id: string, definition: WorkflowDefinition): Promise<Workflow> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

            //   `Updating workflow ${id}`,
    //   '开始更新工作流定义'
    // );


    // 验证工作流定义
    const validationResult = this.validateWorkflow(definition);
    if (!validationResult.valid) {
      throw new Error(`Workflow validation failed: ${validationResult.errors.join(', ')}`);
    }

    // 更新工作流
    workflow.definition = definition;
    workflow.version++;
    workflow.updatedAt = new Date();

    // 保存到内存和存储
    this.workflows.set(id, workflow);
    await this.workflowStorage.updateWorkflow(id, workflow);

            //   `Workflow ${id} updated successfully`,
    //   '工作流已成功更新'
    // );

    
    return workflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

            //   `Deleting workflow ${id}`,
    //   '开始删除工作流'
    // );


    // 从内存和存储删除
    this.workflows.delete(id);
    await this.workflowStorage.deleteWorkflow(id);

            //   `Workflow ${id} deleted successfully`,
    //   '工作流已成功删除'
    // );

  }

  async getWorkflow(id: string): Promise<Workflow> {
    // 首先检查内存
    let workflow = this.workflows.get(id);
    
    // 如果内存中没有，尝试从存储加载
    if (!workflow) {
      workflow = await this.workflowStorage.getWorkflow(id);
      if (workflow) {
        // 如果从存储找到，添加到内存
        this.workflows.set(id, workflow);
      }
    }
    
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

    return workflow;
  }

  async listWorkflows(): Promise<Workflow[]> {
    return Array.from(this.workflows.values());
  }

  async duplicateWorkflow(id: string, newName?: string): Promise<Workflow> {
    const originalWorkflow = this.workflows.get(id);
    if (!originalWorkflow) {
      throw new Error(`Workflow ${id} not found`);
    }


    // 创建新的工作流定义（深度复制）
    const newDefinition: WorkflowDefinition = {
      id: '', // 将在创建时生成
      name: newName || `${originalWorkflow.name} (Copy)`,
      description: originalWorkflow.definition.description 
        ? `${originalWorkflow.definition.description} (Copy)` 
        : '',
      nodes: JSON.parse(JSON.stringify(originalWorkflow.definition.nodes)),
      edges: JSON.parse(JSON.stringify(originalWorkflow.definition.edges)),
      version: 1
    };

    // 生成新的节点ID以避免冲突
    const nodeIdMap = new Map<string, string>();
    newDefinition.nodes.forEach(node => {
      const newId = this.generateNodeId();
      nodeIdMap.set(node.id, newId);
      node.id = newId;
    });

    // 更新边的连接关系
    newDefinition.edges.forEach(edge => {
      if (nodeIdMap.has(edge.source)) {
        edge.source = nodeIdMap.get(edge.source)!;
      }
      if (nodeIdMap.has(edge.target)) {
        edge.target = nodeIdMap.get(edge.target)!;
      }
    });

    // 创建新工作流
    const newWorkflow = await this.createWorkflow(newDefinition);

    
    return newWorkflow;
  }

  validateWorkflow(definition: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证基本信息
    if (!definition.name || definition.name.trim() === '') {
      errors.push('Workflow name is required');
    }

    if (!definition.description || definition.description.trim() === '') {
      warnings.push('Workflow description is recommended');
    }

    // 验证节点
    if (!definition.nodes || definition.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    } else {
      definition.nodes.forEach((node, index) => {
        if (!node.id || node.id.trim() === '') {
          errors.push(`Node ${index + 1} must have an ID`);
        }

        if (!node.type || node.type.trim() === '') {
          errors.push(`Node ${node.id} must have a type`);
        }

        if (!node.name || node.name.trim() === '') {
          warnings.push(`Node ${node.id} should have a name`);
        }

        // 验证节点配置
        if (!node.config) {
          warnings.push(`Node ${node.id} should have configuration`);
        }
      });
    }

    // 验证边
    if (definition.edges) {
      const nodeIds = new Set(definition.nodes.map(n => n.id));
      
      definition.edges.forEach((edge, index) => {
        if (!edge.source || !nodeIds.has(edge.source)) {
          errors.push(`Edge ${index + 1} has invalid source node: ${edge.source}`);
        }

        if (!edge.target || !nodeIds.has(edge.target)) {
          errors.push(`Edge ${index + 1} has invalid target node: ${edge.target}`);
        }

        if (edge.source === edge.target) {
          errors.push(`Edge ${index + 1} cannot connect a node to itself`);
        }
      });

      // 检查循环依赖
      const hasCycle = this.detectCycle(definition.nodes, definition.edges);
      if (hasCycle) {
        errors.push('Workflow contains circular dependencies');
      }
    }

    // 验证工作流完整性
    if (definition.nodes && definition.nodes.length > 0) {
      const disconnectedNodes = this.findDisconnectedNodes(definition.nodes, definition.edges);
      if (disconnectedNodes.length > 0) {
        warnings.push(`Workflow has disconnected nodes: ${disconnectedNodes.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private detectCycle(nodes: any[], edges: any[]): boolean {
    const graph = new Map<string, string[]>();
    
    // 构建图
    nodes.forEach(node => {
      graph.set(node.id, []);
    });
    
    edges.forEach(edge => {
      const neighbors = graph.get(edge.source) || [];
      neighbors.push(edge.target);
      graph.set(edge.source, neighbors);
    });
    
    // DFS检测循环
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const nodeId of nodes.map(n => n.id)) {
      if (hasCycle(nodeId)) {
        return true;
      }
    }
    
    return false;
  }

  private findDisconnectedNodes(nodes: any[], edges: any[]): string[] {
    if (nodes.length === 0) {
      return [];
    }

    if (edges.length === 0) {
      return nodes.map(n => n.id);
    }

    const connected = new Set<string>();
    
    // 构建连接图
    const graph = new Map<string, string[]>();
    nodes.forEach(node => {
      graph.set(node.id, []);
    });
    
    edges.forEach(edge => {
      const sourceNeighbors = graph.get(edge.source) || [];
      sourceNeighbors.push(edge.target);
      graph.set(edge.source, sourceNeighbors);
      
      const targetNeighbors = graph.get(edge.target) || [];
      targetNeighbors.push(edge.source);
      graph.set(edge.target, targetNeighbors);
    });
    
    // 从第一个节点开始DFS
    const startNode = nodes[0].id;
    const stack = [startNode];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (connected.has(current)) {
        continue;
      }
      
      connected.add(current);
      
      const neighbors = graph.get(current) || [];
      for (const neighbor of neighbors) {
        if (!connected.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
    
    // 找出未连接的节点
    return nodes
      .map(n => n.id)
      .filter(id => !connected.has(id));
  }

  private generateWorkflowId(): string {
    this.workflowCounter = this.workflowStorage.getNextCounter();
    this.workflowStorage.saveCounter(this.workflowCounter);
    return `workflow_${this.workflowCounter}_${Date.now()}`;
  }

  private generateNodeId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStatus() {
    return {
      state: 'running' as 'initialized' | 'running' | 'stopped' | 'error',
      health: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      lastCheck: new Date(),
    };
  }
}