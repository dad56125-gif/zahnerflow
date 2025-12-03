/**
 * 工作流管理器
 *
 * 负责工作流的导出、导入、保存和加载功能
 * 支持工作流的版本控制和配置管理
 */

import { ElectrochemicalNode, NodeType, NodeCategory } from '@/types/nodes';
import type { SimpleLoopInfo } from '../../../canvas/useSimpleLoopDetection';

// 工作流数据接口
export interface WorkflowData {
  version: string;
  metadata: WorkflowMetadata;
  nodes: ElectrochemicalNode[];
  connections: Array<{
    id: string;
    sourceId: string;
    targetId: string;
  }>;
  loops: SimpleLoopInfo[];
  settings: WorkflowSettings;
  timestamp: number;
}

// 工作流元数据接口
export interface WorkflowMetadata {
  name: string;
  description?: string;
  author?: string;
  tags?: string[];
  category?: string;
  created_at: number;
  updated_at: number;
}

// 工作流设置接口
export interface WorkflowSettings {
  canvasSettings: {
    zoomLevel: number;
    canvasSize: {
      width: number;
      height: number;
    };
  };
  executionSettings: {
    autoStart: boolean;
    parallelExecution: boolean;
    errorHandling: 'stop' | 'continue' | 'retry';
    maxRetries: number;
  };
  dataSettings: {
    autoSave: boolean;
    saveInterval: number;
    exportFormat: 'json' | 'csv' | 'xlsx';
  };
}

// 工作流导出选项接口
export interface WorkflowExportOptions {
  includeMetadata?: boolean;
  includeSettings?: boolean;
  includeData?: boolean;
  format?: 'json' | 'csv' | 'xlsx';
  prettyPrint?: boolean;
}

// 工作流导入选项接口
export interface WorkflowImportOptions {
  validateStructure?: boolean;
  mergeWithExisting?: boolean;
  preserveIds?: boolean;
  upgradeVersion?: boolean;
}

// 工作流验证结果接口
export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * 工作流管理器类
 */
export class WorkflowManager {
  private static readonly CURRENT_VERSION = '2.0.0';
  private static readonly SUPPORTED_VERSIONS = ['1.0.0', '1.1.0', '2.0.0'];

  /**
   * 导出工作流
   */
  public static async exportWorkflow(
    nodes: ElectrochemicalNode[],
    connections: Array<{ id: string; sourceId: string; targetId: string }>,
    loops: SimpleLoopInfo[],
    metadata: WorkflowMetadata,
    settings: WorkflowSettings,
    options: WorkflowExportOptions = {}
  ): Promise<{ data: string; filename: string }> {
    const {
      includeMetadata = true,
      includeSettings = true,
      includeData = false,
      format = 'json',
      prettyPrint = true
    } = options;

    // 构建工作流数据
    const workflowData: WorkflowData = {
      version: this.CURRENT_VERSION,
      metadata: includeMetadata ? {
        ...metadata,
        updated_at: Date.now()
      } : this.getDefaultMetadata(),
      nodes,
      connections,
      loops,
      settings: includeSettings ? settings : this.getDefaultSettings(),
      timestamp: Date.now()
    };

    let data: string;
    let filename: string;

    switch (format) {
      case 'json':
        data = JSON.stringify(workflowData, null, prettyPrint ? 2 : 0);
        filename = `${this.sanitizeFilename(metadata.name || 'workflow')}_${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'csv':
        data = this.convertToCSV(workflowData, includeData);
        filename = `${this.sanitizeFilename(metadata.name || 'workflow')}_${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'xlsx':
        // 注意：这里需要实现 XLSX 导出功能
        throw new Error('XLSX 导出功能尚未实现，请使用 JSON 或 CSV 格式');

      default:
        throw new Error(`不支持的导出格式: ${format}`);
    }

    return { data, filename };
  }

  /**
   * 导入工作流
   */
  public static async importWorkflow(
    data: string,
    format: 'json' | 'csv' = 'json',
    options: WorkflowImportOptions = {}
  ): Promise<{
    workflow: WorkflowData;
    validation: WorkflowValidationResult;
  }> {
    const {
      validateStructure = true,
      mergeWithExisting = false,
      preserveIds = false,
      upgradeVersion = true
    } = options;

    let workflowData: WorkflowData;

    try {
      switch (format) {
        case 'json':
          workflowData = JSON.parse(data);
          break;

        case 'csv':
          workflowData = this.parseFromCSV(data);
          break;

        default:
          throw new Error(`不支持的导入格式: ${format}`);
      }

      // 验证工作流数据
      const validation = validateStructure
        ? this.validateWorkflow(workflowData)
        : this.createEmptyValidation();

      if (!validation.isValid && !mergeWithExisting) {
        throw new Error(`工作流验证失败: ${validation.errors.join(', ')}`);
      }

      // 版本升级
      if (upgradeVersion && workflowData.version !== this.CURRENT_VERSION) {
        workflowData = this.upgradeWorkflowVersion(workflowData);
      }

      // ID处理
      if (!preserveIds) {
        workflowData = this.regenerateIds(workflowData);
      }

      return {
        workflow: workflowData,
        validation
      };

    } catch (error) {
      throw new Error(`导入工作流失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 验证工作流数据
   */
  public static validateWorkflow(workflow: Partial<WorkflowData>): WorkflowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 版本检查
    if (!workflow.version) {
      errors.push('缺少工作流版本信息');
    } else if (!this.SUPPORTED_VERSIONS.includes(workflow.version)) {
      warnings.push(`工作流版本 ${workflow.version} 可能不完全兼容，建议升级到 ${this.CURRENT_VERSION}`);
    }

    // 节点验证
    if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
      errors.push('工作流缺少有效的节点数据');
    } else {
      // 定义当前支持的节点类型
      const supportedNodeTypes: NodeType[] = [
        'startup', 'shutdown', 'change_temperature', 'change_gas_flow',
        'eis_potentiostatic', 'eis_galvanostatic', 'ocp_measurement',
        'chronoamperometry', 'chronopotentiometry', 'voltage_ramp',
        'current_ramp', 'lsv_measurement', 'loop_start', 'loop_end', 'wait_delay'
      ];

      workflow.nodes.forEach((node, index) => {
        if (!node.id) {
          errors.push(`节点 ${index} 缺少 ID`);
        }
        if (!node.type) {
          errors.push(`节点 ${node.id || index} 缺少类型`);
        } else {
          // 检查节点类型是否受支持
          if (!supportedNodeTypes.includes(node.type)) {
            warnings.push(`节点 ${node.id} 使用了未知类型 "${node.type}"，将使用默认配置显示`);
          }
        }
        if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          errors.push(`节点 ${node.id || index} 位置信息无效`);
        }

        // 检查节点数据结构
        if (node.data && node.data.parameters) {
          // 检查是否有废弃的参数字段
          if ('loop_id' in node.data.parameters) {
            warnings.push(`节点 ${node.id} 包含废弃的 loop_id 参数，将被忽略`);
          }
        }
      });
    }

    // 连接验证
    if (!workflow.connections || !Array.isArray(workflow.connections)) {
      warnings.push('工作流缺少连接数据');
    } else {
      workflow.connections.forEach((connection, index) => {
        if (!connection.sourceId || !connection.targetId) {
          errors.push(`连接 ${index} 缺少源节点或目标节点 ID`);
        }

        // 检查连接的节点是否存在
        if (workflow.nodes) {
          const sourceExists = workflow.nodes.some(node => node.id === connection.sourceId);
          const targetExists = workflow.nodes.some(node => node.id === connection.targetId);

          if (!sourceExists) {
            errors.push(`连接 ${index} 的源节点 ${connection.sourceId} 不存在`);
          }
          if (!targetExists) {
            errors.push(`连接 ${index} 的目标节点 ${connection.targetId} 不存在`);
          }
        }
      });
    }

    // 循环验证
    if (workflow.loops && Array.isArray(workflow.loops)) {
      workflow.loops.forEach((loop, index) => {
        if (!loop.id) {
          errors.push(`循环 ${index} 缺少 ID`);
        }
        if (!loop.startNodeId || !loop.endNodeId) {
          errors.push(`循环 ${loop.id || index} 缺少开始或结束节点`);
        }
        if (!loop.nodeIds || !Array.isArray(loop.nodeIds)) {
          errors.push(`循环 ${loop.id || index} 节点列表无效`);
        }
      });
    }

    // 元数据验证
    if (!workflow.metadata) {
      warnings.push('工作流缺少元数据信息');
    } else {
      if (!workflow.metadata.name) {
        warnings.push('工作流缺少名称');
      }
    }

    // 设置验证
    if (!workflow.settings) {
      suggestions.push('建议添加工作流设置以获得更好的体验');
    }

    // 性能建议
    if (workflow.nodes && workflow.nodes.length > 50) {
      suggestions.push('工作流包含较多节点，建议考虑分组或模块化以提高性能');
    }

    if (workflow.connections && workflow.connections.length > 100) {
      suggestions.push('工作流包含较多连接，建议检查是否存在冗余连接');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * 转换为CSV格式
   */
  private static convertToCSV(workflow: WorkflowData, includeData: boolean = false): string {
    const csvLines: string[] = [];

    // 添加元数据
    csvLines.push('# 工作流元数据');
    csvLines.push(`名称,${workflow.metadata.name || ''}`);
    csvLines.push(`描述,${workflow.metadata.description || ''}`);
    csvLines.push(`版本,${workflow.version}`);
    csvLines.push(`创建时间,${new Date(workflow.timestamp).toISOString()}`);
    csvLines.push('');

    // 添加节点信息
    csvLines.push('# 节点信息');
    csvLines.push('ID,名称,类型,X坐标,Y坐标,宽度,高度,状态');
    workflow.nodes.forEach(node => {
      csvLines.push([
        node.id,
        node.name,
        node.type,
        node.position.x,
        node.position.y,
        node.style.width || 140,
        node.style.height || 60,
        node.status || 'ready'
      ].join(','));
    });
    csvLines.push('');

    // 添加连接信息
    csvLines.push('# 连接信息');
    csvLines.push('ID,源节点,目标节点');
    workflow.connections.forEach(connection => {
      csvLines.push([connection.id, connection.sourceId, connection.targetId].join(','));
    });
    csvLines.push('');

    // 添加循环信息
    if (workflow.loops.length > 0) {
      csvLines.push('# 循环信息');
      csvLines.push('ID,开始节点,结束节点,迭代次数,包含节点');
      workflow.loops.forEach(loop => {
        csvLines.push([
          loop.id,
          loop.startNodeId,
          loop.endNodeId,
          loop.iterationCount,
          loop.nodeIds.join(';')
        ].join(','));
      });
    }

    return csvLines.join('\n');
  }

  /**
   * 创建工作流配置
   */
  public static createWorkflowConfig(
    name: string,
    nodes: ElectrochemicalNode[],
    connections: Array<{ id: string; sourceId: string; targetId: string }>,
    loops: SimpleLoopInfo[]
  ): WorkflowData {
    return {
      version: this.CURRENT_VERSION,
      metadata: {
        name,
        description: '',
        created_at: Date.now(),
        updated_at: Date.now()
      },
      nodes,
      connections,
      loops,
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };
  }

  /**
   * 验证工作流配置
   */
  public static validateWorkflowConfig(config: Partial<WorkflowData>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.metadata?.name) {
      errors.push('工作流名称不能为空');
    }

    if (!config.nodes || config.nodes.length === 0) {
      errors.push('工作流必须包含至少一个节点');
    }

    if (config.connections && config.connections.length > 0) {
      config.connections.forEach((conn, index) => {
        if (!conn.sourceId || !conn.targetId) {
          errors.push(`连接 ${index + 1} 缺少源节点或目标节点`);
        }
      });
    }

    if (config.loops && config.loops.length > 0) {
      config.loops.forEach((loop, index) => {
        if (!loop.startNodeId || !loop.endNodeId) {
          errors.push(`循环 ${index + 1} 缺少开始或结束节点`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 从CSV解析工作流
   */
  private static parseFromCSV(csvData: string): WorkflowData {
    // 这是一个简化的CSV解析实现
    // 在实际项目中，建议使用专门的CSV解析库
    const lines = csvData.split('\n');
    const workflow: Partial<WorkflowData> = {
      version: '2.0.0',
      nodes: [],
      connections: [],
      loops: [],
      metadata: this.getDefaultMetadata(),
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };

    let currentSection = '';
    let metadata: Partial<WorkflowMetadata> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        if (trimmedLine.includes('元数据')) currentSection = 'metadata';
        else if (trimmedLine.includes('节点')) currentSection = 'nodes';
        else if (trimmedLine.includes('连接')) currentSection = 'connections';
        else if (trimmedLine.includes('循环')) currentSection = 'loops';
        continue;
      }

      const [key, value] = trimmedLine.split(',').map(s => s.trim());

      switch (currentSection) {
        case 'metadata':
          if (key === '名称') metadata.name = value;
          else if (key === '描述') metadata.description = value;
          break;

        case 'nodes':
          if (key !== 'ID' && workflow.nodes) {
            const node: ElectrochemicalNode = {
              id: key,
              name: value,
              type: (lines[lines.indexOf(line) + 1]?.split(',')[2]?.trim() || 'unknown') as NodeType,
              category: 'basic_measurement', // 添加必需的category字段
              position: {
                x: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[3] || '0'),
                y: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[4] || '0')
              },
              style: {
                width: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[5] || '140'),
                height: parseFloat(lines[lines.indexOf(line) + 1]?.split(',')[6] || '60')
              },
              status: (lines[lines.indexOf(line) + 1]?.split(',')[7]?.trim() || 'ready') as any,
              data: {
                name: value,
                description: `Imported node: ${key}`,
                parameters: {},
                createdAt: new Date(),
                updatedAt: new Date()
              },
              input: { // 添加必需的input字段
                id: `${key}_input`,
                name: 'Input',
                dataType: 'flow' as const
              },
              output: { // 添加必需的output字段
                id: `${key}_output`,
                name: 'Output',
                dataType: 'flow' as const
              }
            };
            workflow.nodes.push(node);
          }
          break;

        case 'connections':
          if (key !== 'ID' && workflow.connections) {
            workflow.connections.push({
              id: key,
              sourceId: value,
              targetId: lines[lines.indexOf(line) + 1]?.split(',')[2]?.trim() || ''
            });
          }
          break;

        case 'loops':
          if (key !== 'ID' && workflow.loops) {
            const parts = trimmedLine.split(',');
            workflow.loops.push({
              id: key,
              startNodeId: value,
              endNodeId: parts[2]?.trim() || '',
              nodeIds: parts[4]?.trim().split(';').filter(Boolean) || [],
              iterationCount: parseInt(parts[3] || '1'),
              level: 0
            });
          }
          break;
      }
    }

    if (metadata.name || metadata.description) {
      workflow.metadata = {
        name: metadata?.name || 'Imported Workflow',
        description: metadata?.description || '',
        author: metadata?.author || '',
        tags: metadata?.tags || [],
        category: metadata?.category || '',
        created_at: Date.now(),
        updated_at: Date.now()
      };
    }

    return workflow as WorkflowData;
  }

  /**
   * 升级工作流版本
   */
  private static upgradeWorkflowVersion(workflow: WorkflowData): WorkflowData {
    let upgradedWorkflow = { ...workflow };

    // 根据版本进行升级
    switch (workflow.version) {
      case '1.0.0':
        // 1.0.0 -> 1.1.0: 添加循环支持
        upgradedWorkflow.loops = upgradedWorkflow.loops || [];
        upgradedWorkflow.version = '1.1.0';
        break;

      case '1.1.0':
        // 1.1.0 -> 2.0.0: 添加新的设置和元数据
        upgradedWorkflow.settings = {
          ...this.getDefaultSettings(),
          ...upgradedWorkflow.settings
        };
        upgradedWorkflow.metadata = {
          ...this.getDefaultMetadata(),
          ...upgradedWorkflow.metadata,
          updated_at: Date.now()
        };
        upgradedWorkflow.version = '2.0.0';
        break;
    }

    return upgradedWorkflow;
  }

  /**
   * 重新生成ID
   */
  private static regenerateIds(workflow: WorkflowData): WorkflowData {
    const idMap = new Map<string, string>();

    // 生成新的节点ID
    const newNodes = workflow.nodes.map(node => {
      const newId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId
      };
    });

    // 更新连接中的节点ID
    const newConnections = workflow.connections.map(connection => ({
      ...connection,
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceId: idMap.get(connection.sourceId) || connection.sourceId,
      targetId: idMap.get(connection.targetId) || connection.targetId
    }));

    // 更新循环中的节点ID
    const newLoops = workflow.loops.map(loop => ({
      ...loop,
      startNodeId: idMap.get(loop.startNodeId) || loop.startNodeId,
      endNodeId: idMap.get(loop.endNodeId) || loop.endNodeId,
      nodeIds: loop.nodeIds.map(nodeId => idMap.get(nodeId) || nodeId)
    }));

    return {
      ...workflow,
      nodes: newNodes,
      connections: newConnections,
      loops: newLoops
    };
  }

  /**
   * 获取默认元数据
   */
  private static getDefaultMetadata(): WorkflowMetadata {
    return {
      name: '未命名工作流',
      description: '',
      created_at: Date.now(),
      updated_at: Date.now()
    };
  }

  /**
   * 获取默认设置
   */
  private static getDefaultSettings(): WorkflowSettings {
    return {
      canvasSettings: {
        zoomLevel: 1.0,
        canvasSize: {
          width: 1200,
          height: 800
        }
      },
      executionSettings: {
        autoStart: false,
        parallelExecution: false,
        errorHandling: 'stop',
        maxRetries: 3
      },
      dataSettings: {
        autoSave: true,
        saveInterval: 300000, // 5分钟
        exportFormat: 'json'
      }
    };
  }

  /**
   * 创建空的验证结果
   */
  private static createEmptyValidation(): WorkflowValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
  }

  /**
   * 清理文件名
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^\w\s-]/g, '') // 移除特殊字符
      .replace(/\s+/g, '_') // 空格替换为下划线
      .substring(0, 50); // 限制长度
  }

  /**
   * 创建工作流模板
   */
  public static createWorkflowTemplate(
    name: string,
    description: string,
    nodeTypes: string[]
  ): WorkflowData {
    const templateNodes: ElectrochemicalNode[] = nodeTypes.map((type, index) => ({
      id: `template_node_${index}`,
      name: `模板节点 ${index + 1}`,
      type: type as any,
      category: 'basic_measurement', // 添加必需的category字段
      position: { x: 100 + index * 200, y: 100 },
      style: { width: 140, height: 60 },
      status: 'ready' as any,
      data: { // 修复NodeData接口
        name: `模板节点 ${index + 1}`,
        description: `Template node: ${type}`,
        parameters: {},
        createdAt: new Date(),
        updatedAt: new Date()
      },
      input: { // 添加必需的input字段
        id: `template_node_${index}_input`,
        name: 'Input',
        dataType: 'flow' as const
      },
      output: { // 添加必需的output字段
        id: `template_node_${index}_output`,
        name: 'Output',
        dataType: 'flow' as const
      }
    }));

    return {
      version: this.CURRENT_VERSION,
      metadata: {
        name,
        description,
        created_at: Date.now(),
        updated_at: Date.now(),
        tags: ['template'],
        category: 'template'
      },
      nodes: templateNodes,
      connections: [],
      loops: [],
      settings: this.getDefaultSettings(),
      timestamp: Date.now()
    };
  }

  /**
   * 比较工作流差异
   */
  public static compareWorkflows(
    workflow1: WorkflowData,
    workflow2: WorkflowData
  ): {
    added: ElectrochemicalNode[];
    removed: ElectrochemicalNode[];
    modified: Array<{ old: ElectrochemicalNode; new: ElectrochemicalNode }>;
  } {
    const added: ElectrochemicalNode[] = [];
    const removed: ElectrochemicalNode[] = [];
    const modified: Array<{ old: ElectrochemicalNode; new: ElectrochemicalNode }> = [];

    const nodes1Map = new Map(workflow1.nodes.map(node => [node.id, node]));
    const nodes2Map = new Map(workflow2.nodes.map(node => [node.id, node]));

    // 查找新增的节点
    for (const [id, node] of nodes2Map) {
      if (!nodes1Map.has(id)) {
        added.push(node);
      }
    }

    // 查找删除的节点
    for (const [id, node] of nodes1Map) {
      if (!nodes2Map.has(id)) {
        removed.push(node);
      }
    }

    // 查找修改的节点
    for (const [id, node2] of nodes2Map) {
      const node1 = nodes1Map.get(id);
      if (node1 && JSON.stringify(node1) !== JSON.stringify(node2)) {
        modified.push({ old: node1, new: node2 });
      }
    }

    return { added, removed, modified };
  }
}

export default WorkflowManager;