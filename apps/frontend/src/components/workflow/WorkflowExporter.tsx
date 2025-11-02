/**
 * 工作流导出组件
 *
 * 提供工作流导出的用户界面
 * 支持多种导出格式和选项配置
 */

import React, { useState } from 'react';
import { ElectrochemicalNode } from '../../nodes/types';
import { LoopInfo } from '../loops/LoopDetector';
import { WorkflowManager, type WorkflowMetadata, type WorkflowSettings, type WorkflowExportOptions } from './WorkflowManager';

// 工作流导出器属性接口
export interface WorkflowExporterProps {
  nodes: ElectrochemicalNode[];
  connections: Array<{ id: string; source_id: string; target_id: string }>;
  loops: LoopInfo[];
  className?: string;
  style?: React.CSSProperties;
  onExportComplete?: (filename: string) => void;
  onExportError?: (error: string) => void;
}

/**
 * 工作流导出器组件
 */
export const WorkflowExporter: React.FC<WorkflowExporterProps> = ({
  nodes,
  connections,
  loops,
  className = '',
  style = {},
  onExportComplete,
  onExportError
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState<WorkflowExportOptions>({
    includeMetadata: true,
    includeSettings: true,
    includeData: false,
    format: 'json',
    prettyPrint: true
  });
  const [metadata, setMetadata] = useState<WorkflowMetadata>({
    name: '',
    description: '',
    author: '',
    tags: [],
    category: '',
    created_at: Date.now(),
    updated_at: Date.now()
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 执行导出
  const handleExport = async () => {
    if (!metadata.name.trim()) {
      onExportError?.('请输入工作流名称');
      return;
    }

    setIsExporting(true);

    try {
      const settings: WorkflowSettings = {
        canvasSettings: {
          zoomLevel: 1.0,
          canvasSize: {
            width: window.innerWidth,
            height: window.innerHeight
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
          saveInterval: 300000,
          exportFormat: exportOptions.format || 'json'
        }
      };

      // 转换连接线格式：从 snake_case 到 camelCase
      const formattedConnections = connections.map(conn => ({
        id: conn.id,
        sourceId: conn.source_id,
        targetId: conn.target_id
      }));

      const result = await WorkflowManager.exportWorkflow(
        nodes,
        formattedConnections,
        loops,
        metadata,
        settings,
        exportOptions
      );

      // 下载文件
      const blob = new Blob([result.data], {
        type: exportOptions.format === 'json' ? 'application/json' : 'text/csv'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onExportComplete?.(result.filename);
    } catch (error) {
      onExportError?.(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  // 更新元数据
  const updateMetadata = (field: keyof WorkflowMetadata, value: any) => {
    setMetadata(prev => ({
      ...prev,
      [field]: value,
      updated_at: Date.now()
    }));
  };

  // 更新导出选项
  const updateExportOption = (field: keyof WorkflowExportOptions, value: any) => {
    setExportOptions(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 添加标签
  const addTag = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '输入标签名称';

    input.onblur = () => {
      if (input.value.trim()) {
        updateMetadata('tags', [...(metadata.tags || []), input.value.trim()]);
      }
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
    };

    input.focus();
    document.body.appendChild(input);
  };

  // 移除标签
  const removeTag = (tagToRemove: string) => {
    updateMetadata('tags', (metadata.tags || []).filter(tag => tag !== tagToRemove));
  };

  return (
    <div className={`workflow-exporter ${className}`} style={style}>
      <div className="exporter-header">
        <h3>导出工作流</h3>
        <div className="exporter-stats">
          <span>节点: {nodes.length}</span>
          <span>连接: {connections.length}</span>
          <span>循环: {loops.length}</span>
        </div>
      </div>

      <div className="exporter-content">
        {/* 基本信息 */}
        <div className="form-section">
          <h4>基本信息</h4>
          <div className="form-group">
            <label className="form-label">
              工作流名称 *
              <input
                type="text"
                value={metadata.name}
                onChange={(e) => updateMetadata('name', e.target.value)}
                className="form-input"
                placeholder="输入工作流名称"
                maxLength={100}
              />
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">
              描述
              <textarea
                value={metadata.description || ''}
                onChange={(e) => updateMetadata('description', e.target.value)}
                className="form-textarea"
                placeholder="输入工作流描述"
                rows={3}
                maxLength={500}
              />
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                作者
                <input
                  type="text"
                  value={metadata.author || ''}
                  onChange={(e) => updateMetadata('author', e.target.value)}
                  className="form-input"
                  placeholder="输入作者名称"
                  maxLength={50}
                />
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">
                分类
                <select
                  value={metadata.category || ''}
                  onChange={(e) => updateMetadata('category', e.target.value)}
                  className="form-select"
                >
                  <option value="">选择分类</option>
                  <option value="research">研究</option>
                  <option value="production">生产</option>
                  <option value="testing">测试</option>
                  <option value="education">教育</option>
                  <option value="template">模板</option>
                  <option value="other">其他</option>
                </select>
              </label>
            </div>
          </div>

          {/* 标签管理 */}
          <div className="form-group">
            <label className="form-label">
              标签
              <div className="tags-container">
                {(metadata.tags || []).map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="tag-remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={addTag}
                  className="tag-add"
                >
                  + 添加标签
                </button>
              </div>
            </label>
          </div>
        </div>

        {/* 导出选项 */}
        <div className="form-section">
          <h4>导出选项</h4>

          <div className="form-group">
            <label className="form-label">
              导出格式
              <select
                value={exportOptions.format}
                onChange={(e) => updateExportOption('format', e.target.value)}
                className="form-select"
              >
                <option value="json">JSON (推荐)</option>
                <option value="csv">CSV (仅结构)</option>
                <option value="xlsx" disabled>Excel (即将支持)</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.includeMetadata}
                onChange={(e) => updateExportOption('includeMetadata', e.target.checked)}
              />
              包含元数据
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.includeSettings}
                onChange={(e) => updateExportOption('includeSettings', e.target.checked)}
              />
              包含设置
            </label>
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.includeData}
                onChange={(e) => updateExportOption('includeData', e.target.checked)}
              />
              包含执行数据
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.prettyPrint}
                onChange={(e) => updateExportOption('prettyPrint', e.target.checked)}
              />
              格式化输出
            </label>
          </div>
        </div>

        {/* 高级选项 */}
        <div className="form-section">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="advanced-toggle"
          >
            {showAdvanced ? '隐藏' : '显示'}高级选项
          </button>

          {showAdvanced && (
            <div className="advanced-options">
              <div className="form-group">
                <label className="form-label">
                  版本信息
                  <input
                    type="text"
                    value="2.0.0"
                    readOnly
                    className="form-input readonly"
                  />
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">
                  导出时间
                  <input
                    type="text"
                    value={new Date().toLocaleString()}
                    readOnly
                    className="form-input readonly"
                  />
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">
                  文件预览名称
                  <input
                    type="text"
                    value={`${metadata.name || 'workflow'}_${new Date().toISOString().split('T')[0]}.json`}
                    readOnly
                    className="form-input readonly"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="exporter-actions">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !metadata.name.trim()}
          className="btn-export"
        >
          {isExporting ? '导出中...' : '导出工作流'}
        </button>
      </div>
    </div>
  );
};

export default WorkflowExporter;