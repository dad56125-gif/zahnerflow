/**
 * 工作流导入组件
 *
 * 提供工作流导入的用户界面
 * 支持文件选择、预览和验证功能
 */

import React, { useState, useRef } from 'react';
import { WorkflowManager, type WorkflowData, type WorkflowImportOptions, type WorkflowValidationResult } from './WorkflowManager';

// 工作流导入器属性接口
export interface WorkflowImporterProps {
  className?: string;
  style?: React.CSSProperties;
  onImportComplete?: (workflow: WorkflowData) => void;
  onImportError?: (error: string) => void;
  onImportCancel?: () => void;
}

/**
 * 工作流导入器组件
 */
export const WorkflowImporter: React.FC<WorkflowImporterProps> = ({
  className = '',
  style = {},
  onImportComplete,
  onImportError,
  onImportCancel
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<WorkflowImportOptions>({
    validateStructure: true,
    mergeWithExisting: false,
    preserveIds: false,
    upgradeVersion: true
  });
  const [workflowPreview, setWorkflowPreview] = useState<WorkflowData | null>(null);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setWorkflowPreview(null);
      setValidationResult(null);
      setShowPreview(false);

      // 检查文件类型
      if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) {
        onImportError?.('请选择 JSON 或 CSV 格式的文件');
        return;
      }

      // 检查文件大小 (限制为 10MB)
      if (file.size > 10 * 1024 * 1024) {
        onImportError?.('文件大小不能超过 10MB');
        return;
      }

      // 预览文件
      previewFile(file);
    }
  };

  // 预览文件内容
  const previewFile = async (file: File) => {
    const format = file.name.endsWith('.csv') ? 'csv' : 'json';

    try {
      const content = await file.text();
      const { workflow, validation } = await WorkflowManager.importWorkflow(
        content,
        format,
        { ...importOptions, validateStructure: true }
      );

      setWorkflowPreview(workflow);
      setValidationResult(validation);
    } catch (error) {
      onImportError?.(error instanceof Error ? error.message : '文件预览失败');
    }
  };

  // 执行导入
  const handleImport = async () => {
    if (!selectedFile || !workflowPreview) {
      onImportError?.('请先选择要导入的文件');
      return;
    }

    setIsImporting(true);

    try {
      const content = await selectedFile.text();
      const format = selectedFile.name.endsWith('.csv') ? 'csv' : 'json';

      const { workflow } = await WorkflowManager.importWorkflow(content, format, importOptions);

      onImportComplete?.(workflow);
    } catch (error) {
      onImportError?.(error instanceof Error ? error.message : '导入失败');
    } finally {
      setIsImporting(false);
    }
  };

  // 更新导入选项
  const updateImportOption = (field: keyof WorkflowImportOptions, value: any) => {
    setImportOptions(prev => ({
      ...prev,
      [field]: value
    }));

    // 重新预览文件
    if (selectedFile) {
      previewFile(selectedFile);
    }
  };

  // 重置状态
  const handleReset = () => {
    setSelectedFile(null);
    setWorkflowPreview(null);
    setValidationResult(null);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`workflow-importer ${className}`} style={style}>
      <div className="importer-header">
        <h3>导入工作流</h3>
        <button
          type="button"
          onClick={onImportCancel}
          className="btn-close"
          title="取消导入"
        >
          ×
        </button>
      </div>

      <div className="importer-content">
        {/* 文件选择 */}
        <div className="form-section">
          <h4>选择文件</h4>
          <div className="file-upload">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleFileSelect}
              className="file-input"
              id="workflow-file-input"
            />
            <label htmlFor="workflow-file-input" className="file-label">
              <div className="file-icon">📁</div>
              <div className="file-text">
                <div className="file-title">
                  {selectedFile ? selectedFile.name : '点击选择文件或拖拽到此处'}
                </div>
                <div className="file-subtitle">
                  {selectedFile
                    ? `${formatFileSize(selectedFile.size)} • ${selectedFile.type || '未知类型'}`
                    : '支持 JSON 和 CSV 格式，最大 10MB'
                  }
                </div>
              </div>
            </label>
          </div>

          {selectedFile && (
            <div className="file-actions">
              <button
                type="button"
                onClick={handleReset}
                className="btn-reset"
              >
                重新选择
              </button>
            </div>
          )}
        </div>

        {/* 导入选项 */}
        {selectedFile && (
          <div className="form-section">
            <h4>导入选项</h4>

            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={importOptions.validateStructure}
                  onChange={(e) => updateImportOption('validateStructure', e.target.checked)}
                />
                验证工作流结构
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={importOptions.upgradeVersion}
                  onChange={(e) => updateImportOption('upgradeVersion', e.target.checked)}
                />
                自动升级版本
              </label>
            </div>

            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={importOptions.mergeWithExisting}
                  onChange={(e) => updateImportOption('mergeWithExisting', e.target.checked)}
                />
                与现有工作流合并
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={importOptions.preserveIds}
                  onChange={(e) => updateImportOption('preserveIds', e.target.checked)}
                />
                保留原始ID
              </label>
            </div>
          </div>
        )}

        {/* 验证结果 */}
        {validationResult && (
          <div className="form-section">
            <h4>验证结果</h4>
            <div className={`validation-result ${validationResult.isValid ? 'valid' : 'invalid'}`}>
              <div className="validation-status">
                <span className={`status-icon ${validationResult.isValid ? 'valid' : 'invalid'}`}>
                  {validationResult.isValid ? '✅' : '❌'}
                </span>
                <span className="status-text">
                  {validationResult.isValid ? '验证通过' : '验证失败'}
                </span>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="validation-errors">
                  <h5>错误 ({validationResult.errors.length})</h5>
                  <ul>
                    {validationResult.errors.map((error, index) => (
                      <li key={index} className="error-item">{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.warnings.length > 0 && (
                <div className="validation-warnings">
                  <h5>警告 ({validationResult.warnings.length})</h5>
                  <ul>
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index} className="warning-item">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.suggestions.length > 0 && (
                <div className="validation-suggestions">
                  <h5>建议 ({validationResult.suggestions.length})</h5>
                  <ul>
                    {validationResult.suggestions.map((suggestion, index) => (
                      <li key={index} className="suggestion-item">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 工作流预览 */}
        {workflowPreview && (
          <div className="form-section">
            <div className="preview-header">
              <h4>工作流预览</h4>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="btn-toggle"
              >
                {showPreview ? '隐藏' : '显示'}详情
              </button>
            </div>

            <div className="workflow-summary">
              <div className="summary-item">
                <span className="label">名称:</span>
                <span className="value">{workflowPreview.metadata?.name || '未命名'}</span>
              </div>
              <div className="summary-item">
                <span className="label">版本:</span>
                <span className="value">{workflowPreview.version}</span>
              </div>
              <div className="summary-item">
                <span className="label">节点:</span>
                <span className="value">{workflowPreview.nodes.length}</span>
              </div>
              <div className="summary-item">
                <span className="label">连接:</span>
                <span className="value">{workflowPreview.connections.length}</span>
              </div>
              <div className="summary-item">
                <span className="label">循环:</span>
                <span className="value">{workflowPreview.loops.length}</span>
              </div>
              <div className="summary-item">
                <span className="label">创建时间:</span>
                <span className="value">
                  {new Date(workflowPreview.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            {showPreview && (
              <div className="workflow-details">
                {/* 节点列表 */}
                <div className="detail-section">
                  <h5>节点列表</h5>
                  <div className="node-list">
                    {workflowPreview.nodes.slice(0, 10).map((node, index) => (
                      <div key={node.id} className="node-item">
                        <span className="node-index">{index + 1}</span>
                        <span className="node-name">{node.name}</span>
                        <span className="node-type">{node.type}</span>
                      </div>
                    ))}
                    {workflowPreview.nodes.length > 10 && (
                      <div className="node-more">
                        ... 还有 {workflowPreview.nodes.length - 10} 个节点
                      </div>
                    )}
                  </div>
                </div>

                {/* 描述信息 */}
                {workflowPreview.metadata?.description && (
                  <div className="detail-section">
                    <h5>描述</h5>
                    <p className="workflow-description">
                      {workflowPreview.metadata.description}
                    </p>
                  </div>
                )}

                {/* 标签信息 */}
                {workflowPreview.metadata?.tags && workflowPreview.metadata.tags.length > 0 && (
                  <div className="detail-section">
                    <h5>标签</h5>
                    <div className="workflow-tags">
                      {workflowPreview.metadata.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="importer-actions">
        <button
          type="button"
          onClick={onImportCancel}
          className="btn-cancel"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={
            isImporting ||
            !selectedFile ||
            !workflowPreview ||
            (validationResult && !validationResult.isValid)
          }
          className="btn-import"
        >
          {isImporting ? '导入中...' : '导入工作流'}
        </button>
      </div>
    </div>
  );
};

export default WorkflowImporter;