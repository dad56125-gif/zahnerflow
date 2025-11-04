/**
 * 工作流管理UI组件
 *
 * 提供工作流的导出、导入和管理功能
 * 集成工作流模板、历史记录和配置管理
 */

import React, { useState, useRef, useEffect } from 'react';
import { ElectrochemicalNode } from '@/types/nodes';
import { useCanvasStore } from '@/services/stores/canvasStore';
import { LoopDetector } from '.';
import WorkflowExporter, { WorkflowExporterProps } from './WorkflowExporter';
import WorkflowImporter, { WorkflowImporterProps } from './WorkflowImporter';
import WorkflowManager, { type WorkflowData, type WorkflowMetadata } from './WorkflowManager';
import { useOnClickOutside } from '@/services/hooks/useOnClickOutside';
import { api } from '@/services/api';
import { useUser } from '@/contexts/UserContext';

// 工作流管理UI属性接口
export interface WorkflowManagerUIProps {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}

// 工作流历史记录接口
interface WorkflowHistory {
  id: string;
  name: string;
  filename: string;
  filepath: string;
  project_name: string;
  created_at: string;
  file_size?: number;
  node_count?: number;
  connection_count?: number;
  loop_count?: number;
}

/**
 * 工作流管理UI组件
 */
export const WorkflowManagerUI: React.FC<WorkflowManagerUIProps> = ({
  className = '',
  style = {},
  onClose
}) => {
  const {
    nodes,
    connections,
    setNodes,
    setConnections
  } = useCanvasStore();

  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'templates' | 'history'>('export');
  const [showExporter, setShowExporter] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const panelRef = useRef<HTMLDivElement>(null);

  const [templates] = useState<WorkflowData[]>([
    WorkflowManager.createWorkflowTemplate(
      '基础电化学测试',
      '包含开路电位和计时安培法的基础测试流程',
      ['ocp_measurement', 'chronoamperometry']
    ),
    WorkflowManager.createWorkflowTemplate(
      '循环伏安测试',
      '标准的循环伏安法测试流程',
      ['ocp_measurement', 'cv_measurement', 'eis_potentiostatic']
    ),
    WorkflowManager.createWorkflowTemplate(
      '阻抗谱分析',
      '电化学阻抗谱分析流程',
      ['ocp_measurement', 'eis_potentiostatic']
    )
  ]);

  // 检测循环
  const detectedLoops = LoopDetector.detectLoops(nodes, connections).loops;

  // 使用useOnClickOutside Hook实现点击外部关闭
  useOnClickOutside(panelRef, () => {
    if (onClose) {
      onClose();
    }
  });

  // 加载项目列表和历史工作流
  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadWorkflowHistory();
    }
  }, [activeTab, selectedProject]);

  const loadProjects = async () => {
    try {
      const response: any = await api.get(`/files/projects?user=${currentUser}`);
      if (response?.success) {
        const list = Array.isArray(response.projects)
          ? (response.projects as string[])
          : (Array.isArray(response.data) ? (response.data as string[]) : []);
        setProjects(list);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadWorkflowHistory = async () => {
    setLoadingHistory(true);
    setHistoryError('');

    try {
      // 使用现有的工作流API，请求50条记录
      const response: any = await api.get('/workflows?limit=50');

      console.log('Raw API response:', response); // 调试日志

      // 检查不同的响应格式
      let workflows = [];
      let paginationInfo = null;

      if (response?.items && Array.isArray(response.items)) {
        // PaginatedResponse格式
        workflows = response.items;
        paginationInfo = response.pagination;
      } else if (Array.isArray(response)) {
        // 直接返回数组格式
        workflows = response;
      } else if (response?.data && Array.isArray(response.data)) {
        // ApiResponse格式
        workflows = response.data;
      } else {
        console.warn('Unexpected response format:', response);
        setHistoryError('无法解析工作流数据格式');
        setWorkflowHistory([]);
        return;
      }

      console.log('Parsed workflows:', workflows); // 调试日志
      console.log('Pagination info:', paginationInfo); // 调试日志

      const formattedWorkflows = workflows.map((workflow: any) => ({
        id: workflow.id,
        name: workflow.name,
        filename: `${workflow.id}.json`,
        filepath: `/api/workflows/${workflow.id}`,
        project_name: workflow.individualName || workflow.ownerName || '默认项目',
        created_at: workflow.createdAt,
        node_count: workflow.definition?.nodes?.length || 0,
        connection_count: workflow.definition?.edges?.length || 0,
        loop_count: Math.floor((workflow.definition?.nodes?.length || 0) / 2) // 估算循环数
      }));

      console.log('Formatted workflows:', formattedWorkflows); // 调试日志

      // 如果选择了项目，进行过滤
      const filteredWorkflows = selectedProject
        ? formattedWorkflows.filter(w => w.project_name === selectedProject)
        : formattedWorkflows;

      setWorkflowHistory(filteredWorkflows);

      if (filteredWorkflows.length === 0) {
        setHistoryError('没有找到匹配的工作流');
      }
    } catch (error) {
      console.error('Failed to load workflow history:', error);
      setHistoryError('网络错误，无法加载历史工作流');
      setWorkflowHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 导出完成处理
  const handleExportComplete = (filename: string) => {
    console.log('工作流导出成功:', filename);
    setShowExporter(false);
    addToHistory(filename);
  };

  // 导出错误处理
  const handleExportError = (error: string) => {
    console.error('工作流导出失败:', error);
    alert('导出失败: ' + error);
  };

  // 导入完成处理
  const handleImportComplete = (workflow: WorkflowData) => {
    console.log('工作流导入成功:', workflow.metadata?.name);

    // 应用导入的工作流
    setNodes(workflow.nodes);
    // 转换连接线格式：从 camelCase 到 snake_case
    const formattedConnections = workflow.connections.map(conn => ({
      id: conn.id,
      source_id: conn.sourceId,
      target_id: conn.targetId
    }));
    setConnections(formattedConnections);

    setShowImporter(false);
  };

  // 导入错误处理
  const handleImportError = (error: string) => {
    console.error('工作流导入失败:', error);
    alert('导入失败: ' + error);
  };

  // 添加到历史记录（现在直接重新加载历史记录）
  const addToHistory = (filename: string) => {
    // 导出完成后重新加载历史记录列表
    if (activeTab === 'history') {
      loadWorkflowHistory();
    }
  };

  // 加载历史工作流
  const loadHistoryWorkflow = async (workflow: WorkflowHistory) => {
    try {
      console.log('Loading workflow:', workflow.id); // 调试日志

      // 使用现有的工作流API获取特定工作流
      const response = await api.get(`/workflows/${workflow.id}`);

      console.log('Single workflow response:', response); // 调试日志

      // 检查响应格式
      let workflowData = response;

      if (response?.data) {
        workflowData = response.data;
      }

      if (!workflowData) {
        throw new Error(`找不到工作流 "${workflow.name}"`);
      }

      console.log('Workflow data to process:', workflowData); // 调试日志

      // 转换工作流数据格式以适配前端期望的结构
      const convertedNodes = workflowData.data?.definition?.nodes?.map((node: any) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        category: 'basic_measurement', // 添加必需的category字段
        position: node.position,
        style: { width: 140, height: 60 },
        status: 'ready' as any,
        data: {
          name: node.name,
          description: `Node: ${node.type}`,
          parameters: node.config?.parameters || {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        input: {
          id: `${node.id}_input`,
          name: 'Input',
          dataType: 'flow' as const
        },
        output: {
          id: `${node.id}_output`,
          name: 'Output',
          dataType: 'flow' as const
        }
      })) || [];

      const formattedConnections = workflowData.data?.definition?.edges?.map((edge: any) => ({
        id: edge.id,
        source_id: edge.source,
        target_id: edge.target
      })) || [];

      console.log('Converted nodes:', convertedNodes);
      console.log('Formatted connections:', formattedConnections);

      // 应用加载的工作流
      setNodes(convertedNodes);
      setConnections(formattedConnections);

      console.log(`历史工作流 "${workflow.name}" 加载成功`);

    } catch (error) {
      console.error('加载历史工作流失败:', error);
      alert(`加载工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除历史工作流文件
  const deleteHistoryWorkflow = async (workflow: WorkflowHistory) => {
    if (!confirm(`确定要删除历史工作流 "${workflow.name}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      // 这里可以添加删除文件的API调用
      // 暂时只从本地列表中移除
      setWorkflowHistory(prev => prev.filter(item => item.id !== workflow.id));
      console.log(`历史工作流 "${workflow.name}" 已从列表中移除`);
    } catch (error) {
      console.error('删除历史工作流失败:', error);
      alert(`删除工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 应用模板
  const applyTemplate = (template: WorkflowData) => {
    if (window.confirm(`确定要应用模板 "${template.metadata?.name}" 吗？这将替换当前工作流。`)) {
      setNodes(template.nodes);
      // 转换连接线格式：从 camelCase 到 snake_case
      const formattedConnections = template.connections.map(conn => ({
        id: conn.id,
        source_id: conn.sourceId,
        target_id: conn.targetId
      }));
      setConnections(formattedConnections);
    }
  };

  // 清空工作流
  const clearWorkflow = () => {
    if (window.confirm('确定要清空当前工作流吗？此操作不可撤销。')) {
      setNodes([]);
      setConnections([]);
    }
  };

  // 获取工作流统计
  const getWorkflowStats = () => {
    return {
      nodes: nodes.length,
      connections: connections.length,
      loops: detectedLoops.length,
      lastModified: new Date().toLocaleString()
    };
  };

  const stats = getWorkflowStats();

  return (
    <div
      ref={panelRef}
      className={`workflow-manager-ui ${className}`}
      style={style}
    >
      <div className="manager-header">
        <h3>工作流管理</h3>
        <div className="workflow-stats">
          <span>节点: {stats.nodes}</span>
          <span>连接: {stats.connections}</span>
          <span>循环: {stats.loops}</span>
        </div>
      </div>

      {/* 标签导航 */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          导出工作流
        </button>
        <button
          className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          导入工作流
        </button>
        <button
          className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          模板库
        </button>
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史记录
        </button>
      </div>

      {/* 标签内容 */}
      <div className="tab-content">
        {/* 导出标签 */}
        {activeTab === 'export' && (
          <div className="export-tab">
            <div className="tab-actions">
              <button
                onClick={() => setShowExporter(!showExporter)}
                className="btn-primary"
              >
                {showExporter ? '隐藏导出界面' : '导出当前工作流'}
              </button>
              <button
                onClick={clearWorkflow}
                className="btn-danger"
                disabled={nodes.length === 0}
              >
                清空工作流
              </button>
            </div>

            {showExporter && (
              <WorkflowExporter
                nodes={nodes}
                connections={connections}
                loops={detectedLoops}
                onExportComplete={handleExportComplete}
                onExportError={handleExportError}
              />
            )}
          </div>
        )}

        {/* 导入标签 */}
        {activeTab === 'import' && (
          <div className="import-tab">
            <div className="tab-actions">
              <button
                onClick={() => setShowImporter(!showImporter)}
                className="btn-primary"
              >
                {showImporter ? '隐藏导入界面' : '导入工作流文件'}
              </button>
            </div>

            {showImporter && (
              <WorkflowImporter
                onImportComplete={handleImportComplete}
                onImportError={handleImportError}
                onImportCancel={() => setShowImporter(false)}
              />
            )}
          </div>
        )}

        {/* 模板标签 */}
        {activeTab === 'templates' && (
          <div className="templates-tab">
            <div className="templates-header">
              <h4>工作流模板</h4>
              <p>选择一个模板快速开始新的工作流</p>
            </div>

            <div className="templates-grid">
              {templates.map((template, index) => (
                <div key={index} className="template-card">
                  <div className="template-header">
                    <h5>{template.metadata?.name}</h5>
                    <span className="template-badge">模板</span>
                  </div>
                  <div className="template-description">
                    {template.metadata?.description}
                  </div>
                  <div className="template-stats">
                    <span>节点: {template.nodes.length}</span>
                    <span>连接: {template.connections.length}</span>
                  </div>
                  <div className="template-actions">
                    <button
                      onClick={() => applyTemplate(template)}
                      className="btn-apply"
                    >
                      应用模板
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 历史记录标签 */}
        {activeTab === 'history' && (
          <div className="history-tab">
            <div className="history-header">
              <h4>历史工作流</h4>
              <p>查询和加载历史保存的工作流文件</p>

              {/* 项目筛选器 */}
              <div className="history-filter">
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="project-filter-select"
                >
                  <option value="">所有项目</option>
                  {projects.map(project => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
                <button
                  onClick={loadWorkflowHistory}
                  className="refresh-btn"
                  disabled={loadingHistory}
                  title="刷新列表"
                >
                  {loadingHistory ? '🔄' : '🔄'}
                </button>
              </div>
            </div>

            {historyError && (
              <div className="history-error">
                {historyError}
                <button
                  onClick={loadWorkflowHistory}
                  className="retry-btn"
                  disabled={loadingHistory}
                >
                  重试
                </button>
              </div>
            )}

            {loadingHistory ? (
              <div className="history-loading">
                <div className="loading-spinner">🔄</div>
                <div>正在加载历史工作流...</div>
              </div>
            ) : workflowHistory.length === 0 ? (
              <div className="history-empty">
                <div className="empty-icon">📋</div>
                <div className="empty-text">暂无历史工作流</div>
                <div className="empty-hint">
                  {selectedProject
                    ? `项目 "${selectedProject}" 中没有找到历史工作流`
                    : '导出工作流后会在这里显示记录'
                  }
                </div>
              </div>
            ) : (
              <div className="history-list">
                {workflowHistory.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-info">
                      <div className="history-name">{item.name}</div>
                      <div className="history-project">
                        项目: {item.project_name}
                      </div>
                      <div className="history-details">
                        <span>节点: {item.node_count || 0}</span>
                        <span>连接: {item.connection_count || 0}</span>
                        <span>循环: {item.loop_count || 0}</span>
                        {item.file_size && (
                          <span>大小: {Math.round(item.file_size / 1024)}KB</span>
                        )}
                      </div>
                      <div className="history-time">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="history-actions">
                      <button
                        onClick={() => loadHistoryWorkflow(item)}
                        className="btn-load"
                        title="加载工作流"
                      >
                        📂
                      </button>
                      <button
                        onClick={() => deleteHistoryWorkflow(item)}
                        className="btn-delete"
                        title="删除记录"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="quick-actions">
        <h5>快捷操作</h5>
        <div className="action-buttons">
          <button
            onClick={() => {
              setActiveTab('export');
              setShowExporter(true);
            }}
            className="quick-btn export"
            disabled={nodes.length === 0}
          >
            📤 快速导出
          </button>
          <button
            onClick={() => {
              setActiveTab('import');
              setShowImporter(true);
            }}
            className="quick-btn import"
          >
            📥 快速导入
          </button>
          <button
            onClick={clearWorkflow}
            className="quick-btn clear"
            disabled={nodes.length === 0}
          >
            🗑️ 清空画布
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowManagerUI;