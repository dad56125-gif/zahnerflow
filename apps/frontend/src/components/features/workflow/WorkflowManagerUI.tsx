/**
 * 工作流管理UI组件
 *
 * 提供工作流的导出、导入和管理功能
 * 集成工作流模板、历史记录和配置管理
 */

import React, { useState, useRef, useEffect } from 'react';
import { ElectrochemicalNode } from '@/types/nodes';
import { useCanvasStore } from '@/services/stores/canvasStore';
import { useWorkflowStore } from '@/services/stores';
import { useWorkflowParameterStore } from '@/services/stores';
import { LoopDetector } from '.';
import WorkflowManager, { type WorkflowData, type WorkflowMetadata } from './WorkflowManager';
import { useOnClickOutside } from '@/services/hooks/useOnClickOutside';
import { api } from '@/services/api';
import { useUser } from '@/contexts/UserContext';
import Portal from '@/components/Portal';

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

  const { setCurrentWorkflow } = useWorkflowStore();
  const { setCurrentEditingWorkflowId } = useWorkflowParameterStore();

  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('history');
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isProjectDropdownHiding, setIsProjectDropdownHiding] = useState(false);
  const [projectDropdownPosition, setProjectDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const projectDropdownButtonRef = useRef<HTMLButtonElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

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

  // 项目下拉菜单点击外部关闭处理
  useEffect(() => {
    if (!isProjectDropdownOpen && !isProjectDropdownHiding) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在按钮上，不关闭
      if (projectDropdownButtonRef.current?.contains(target)) return;

      // 如果点击在下拉菜单上，不关闭
      if (projectDropdownRef.current?.contains(target)) return;

      // 点击在其他地方，开始关闭动画
      setIsProjectDropdownHiding(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProjectDropdownOpen, isProjectDropdownHiding]);

  // 处理项目下拉菜单动画结束事件
  useEffect(() => {
    if (!isProjectDropdownHiding) return;

    const dropdown = projectDropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      if (!animationCompleted) {
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
      }
    };

    const timer = setTimeout(() => {
      dropdown.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      dropdown.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isProjectDropdownHiding]);

  // 计算项目下拉菜单位置
  const updateProjectDropdownPosition = () => {
    if (!projectDropdownButtonRef.current) return;

    const buttonRect = projectDropdownButtonRef.current.getBoundingClientRect();
    setProjectDropdownPosition({
      top: buttonRect.bottom + 8, // 按钮底部 + 小间距
      left: buttonRect.left,
      width: Math.max(200, buttonRect.width)
    });
  };

  // 打开项目下拉菜单时更新位置
  useEffect(() => {
    if (isProjectDropdownOpen) {
      updateProjectDropdownPosition();

      const handleResize = () => updateProjectDropdownPosition();
      const handleScroll = () => updateProjectDropdownPosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isProjectDropdownOpen]);

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

      // 按创建时间降序排列（最新的在前面）
      const sortedWorkflows = formattedWorkflows.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // 如果选择了项目，进行过滤
      const filteredWorkflows = selectedProject
        ? sortedWorkflows.filter(w => w.project_name === selectedProject)
        : sortedWorkflows;

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

  
  
  // 加载历史工作流
  const loadHistoryWorkflow = async (workflow: WorkflowHistory) => {
    try {
      console.log('Loading workflow:', workflow.id); // 调试日志

      // 使用现有的工作流API获取特定工作流
      const response = await api.get(`/workflows/${workflow.id}`);

      console.log('Single workflow response:', response); // 调试日志

      // 直接使用响应数据
      let workflowData = response;

      if (!workflowData) {
        throw new Error(`找不到工作流 "${workflow.name}"`);
      }

      console.log('Workflow data to process:', workflowData); // 调试日志

      // 转换工作流数据格式以适配前端期望的结构
      const convertedNodes = workflowData.data?.definition?.nodes?.map((node: any) => {
        // 兼容性处理：处理新旧版本节点结构差异
        const isOldVersion = !node.data; // 旧版本没有data字段

        return {
          id: node.id,
          type: node.type,
          name: node.name,
          category: 'basic_measurement',
          position: node.position,
          style: { width: 140, height: 60 },
          status: node.status || 'ready', // 优先使用原有status，否则默认为ready
          data: {
            name: node.name,
            description: isOldVersion ? `Node: ${node.type}` : (node.data?.description || `Node: ${node.type}`),
            parameters: isOldVersion
              ? (node.config?.parameters || {})
              : (node.data?.parameters || node.config?.parameters || {}),
            createdAt: isOldVersion ? new Date() : (node.data?.createdAt ? new Date(node.data.createdAt) : new Date()),
            updatedAt: isOldVersion ? new Date() : (node.data?.updatedAt ? new Date(node.data.updatedAt) : new Date())
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
        };
      }) || [];

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

      // 同步更新WorkflowStore状态
      setCurrentWorkflow({
        id: workflow.id,
        name: workflow.name,
        createdAt: new Date(workflow.created_at),
        updatedAt: new Date(workflow.created_at),
        workstation: 'zahner-zennium', // 添加缺失的workstation字段
        status: 'active', // 添加缺失的status字段
        // 构建完整的工作流对象
        definition: {
          nodes: convertedNodes,
          id: workflow.id,
          name: workflow.name,
          version: 1.0,
          edges: formattedConnections
        },
        ownerName: workflow.project_name || '默认项目'
      });
      // 同步设置当前编辑的工作流ID以加载对应的默认参数
      setCurrentEditingWorkflowId(workflow.id);

      console.log(`历史工作流 "${workflow.name}" 加载成功`);

    } catch (error) {
      console.error('加载历史工作流失败:', error);
      alert(`加载工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除历史工作流文件
  const deleteHistoryWorkflow = async (workflow: WorkflowHistory) => {
    try {
      // 这里可以添加删除文件的API调用
      // 暂时只从本地列表中移除
      setWorkflowHistory(prev => prev.filter(item => item.id !== workflow.id));
      setDeletingItemId(null); // 清除删除状态
      console.log(`历史工作流 "${workflow.name}" 已从列表中移除`);
    } catch (error) {
      console.error('删除历史工作流失败:', error);
      setDeletingItemId(null); // 清除删除状态
      alert(`删除工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 显示删除确认
  const showDeleteConfirm = (workflow: WorkflowHistory) => {
    setDeletingItemId(workflow.id);
  };

  // 取消删除
  const cancelDelete = () => {
    setDeletingItemId(null);
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
    <Portal>
      <div className="portal-overlay">
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
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              历史记录
            </button>
            <button
              className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              收藏
            </button>
          </div>

          {/* 标签内容 */}
          <div className="tab-content">

            {/* 历史记录标签 */}
            {activeTab === 'history' && (
              <div className="history-tab">
                <div className="history-header">
                  {/* 项目筛选器 - 自定义下拉菜单 */}
                  <div className="history-filter">
                    <button
                      ref={projectDropdownButtonRef}
                      className="project-filter-select"
                      onClick={() => {
                        if (isProjectDropdownOpen) {
                          setIsProjectDropdownOpen(false);
                          setIsProjectDropdownHiding(true);
                        } else {
                          setIsProjectDropdownOpen(true);
                        }
                      }}
                    >
                      <span className="user-display">{selectedProject || '所有项目'}</span>
                      <svg className={`dropdown-arrow ${isProjectDropdownOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                        <path
                          d="M -8 -3 L 0 5 L 8 -3"
                          fill="none"
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
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
                      <div
                        key={item.id}
                        className="history-item"
                        onDoubleClick={() => loadHistoryWorkflow(item)}
                        title="双击加载工作流"
                      >
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
                          onClick={() => showDeleteConfirm(item)}
                          className="delete-user-btn"
                          title="删除记录"
                          style={{ display: deletingItemId === item.id ? 'none' : 'flex' }}
                        >
                          ×
                        </button>
                        {deletingItemId === item.id && (
                          <div className="delete-confirm">
                            <span className="delete-confirm-text">确认删除？</span>
                            <button
                              onClick={() => deleteHistoryWorkflow(item)}
                              className="delete-confirm-btn confirm"
                              title="确认删除"
                            >
                              ✓
                            </button>
                            <button
                              onClick={cancelDelete}
                              className="delete-confirm-btn cancel"
                              title="取消删除"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 收藏标签 */}
            {activeTab === 'templates' && (
              <div className="templates-tab">
                <div className="templates-header">
                  <h4>收藏</h4>
                  <p>选择一个收藏快速开始新的工作流</p>
                </div>

                <div className="templates-grid">
                  {templates.map((template, index) => (
                    <div key={index} className="template-card">
                      <div className="template-header">
                        <h5>{template.metadata?.name}</h5>
                        <span className="template-badge">收藏</span>
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
          </div>
        </div>
      </div>

      {/* 项目下拉菜单 - 使用Portal渲染 */}
      <Portal>
        {(isProjectDropdownOpen || isProjectDropdownHiding) && (
          <div
            ref={projectDropdownRef}
            className={`user-dropdown ${isProjectDropdownHiding ? 'hiding' : 'show'}`}
            style={{
              top: `${projectDropdownPosition.top}px`,
              left: `${projectDropdownPosition.left}px`,
              width: `${projectDropdownPosition.width}px`
            } as React.CSSProperties}
          >
            <div className="user-list">
              <div
                className={`user-option ${selectedProject === '' ? 'selected' : ''}`}
              >
                <span
                  className="user-name"
                  onClick={() => {
                    setSelectedProject('');
                    setIsProjectDropdownHiding(true);
                  }}
                >
                  所有项目
                </span>
              </div>
              {projects.length > 0 ? (
                projects.map(project => (
                  <div
                    key={project}
                    className={`user-option ${project === selectedProject ? 'selected' : ''}`}
                  >
                    <span
                      className="user-name"
                      onClick={() => {
                        setSelectedProject(project);
                        setIsProjectDropdownHiding(true);
                      }}
                    >
                      {project}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-users">暂无项目</div>
              )}
            </div>
          </div>
        )}
      </Portal>
    </Portal>
  );
};

export default WorkflowManagerUI;