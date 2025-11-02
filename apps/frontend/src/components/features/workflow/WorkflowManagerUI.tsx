/**
 * 工作流管理UI组件
 *
 * 提供工作流的导出、导入和管理功能
 * 集成工作流模板、历史记录和配置管理
 */

import React, { useState, useRef } from 'react';
import { ElectrochemicalNode } from '@/types/nodes';
import { useCanvasStore } from '@/services/stores/canvasStore';
import { LoopDetector } from '.';
import WorkflowExporter, { WorkflowExporterProps } from './WorkflowExporter';
import WorkflowImporter, { WorkflowImporterProps } from './WorkflowImporter';
import WorkflowManager, { type WorkflowData, type WorkflowMetadata } from './WorkflowManager';
import { useOnClickOutside } from '@/services/hooks/useOnClickOutside';

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
  timestamp: number;
  nodeCount: number;
  connectionCount: number;
  loopCount: number;
  fileData?: string;
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

  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'templates' | 'history'>('export');
  const [showExporter, setShowExporter] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
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

  // 添加到历史记录
  const addToHistory = (filename: string) => {
    const historyItem: WorkflowHistory = {
      id: Date.now().toString(),
      name: filename.replace(/\.json$/, '').replace(/_\d{4}-\d{2}-\d{2}$/, ''),
      timestamp: Date.now(),
      nodeCount: nodes.length,
      connectionCount: connections.length,
      loopCount: detectedLoops.length
    };

    setWorkflowHistory(prev => [historyItem, ...prev.slice(0, 9)]); // 保留最近10条记录
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
              <h4>工作流历史</h4>
              <p>最近导出的工作流记录</p>
            </div>

            {workflowHistory.length === 0 ? (
              <div className="history-empty">
                <div className="empty-icon">📋</div>
                <div className="empty-text">暂无历史记录</div>
                <div className="empty-hint">导出工作流后会在这里显示记录</div>
              </div>
            ) : (
              <div className="history-list">
                {workflowHistory.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-info">
                      <div className="history-name">{item.name}</div>
                      <div className="history-details">
                        <span>节点: {item.nodeCount}</span>
                        <span>连接: {item.connectionCount}</span>
                        <span>循环: {item.loopCount}</span>
                      </div>
                      <div className="history-time">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="history-actions">
                      <button className="btn-reuse" title="重新使用">
                        🔄
                      </button>
                      <button className="btn-delete" title="删除记录">
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