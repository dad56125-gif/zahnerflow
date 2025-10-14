/**
 * 循环控制面板组件
 *
 * 提供完整的循环参数设置、执行控制和数据管理界面
 * 集成循环参数编辑、执行状态监控和数据导出功能
 */

import React, { useState, useEffect } from 'react';
import { LoopInfo } from './LoopDetector';
import {
  LoopContextManager,
  type LoopExecutionContext,
  type LoopExecutionState
} from './LoopContextManager';

// 循环控制面板属性接口
export interface LoopControlPanelProps {
  loops: LoopInfo[];
  contexts: Map<string, LoopExecutionContext>;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  onLoopStart?: (loopId: string) => void;
  onLoopPause?: (loopId: string) => void;
  onLoopResume?: (loopId: string) => void;
  onLoopCancel?: (loopId: string) => void;
  onLoopReset?: (loopId: string) => void;
  onLoopParametersUpdate?: (loopId: string, parameters: Record<string, any>) => void;
  className?: string;
  style?: React.CSSProperties;
}

// 循环参数编辑器组件
const LoopParameterEditor: React.FC<{
  loop: LoopInfo;
  onUpdate: (parameters: Record<string, any>) => void;
  disabled?: boolean;
}> = ({ loop, onUpdate, disabled = false }) => {
  const [parameters, setParameters] = useState(loop.parameters);

  useEffect(() => {
    setParameters(loop.parameters);
  }, [loop.parameters]);

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate(newParameters);
  };

  return (
    <div className="loop-parameter-editor">
      <div className="parameter-group">
        <label className="parameter-label">
          迭代次数:
          <input
            type="number"
            min="1"
            max="10000"
            value={parameters.iteration_count || 1}
            onChange={(e) => handleParameterChange('iteration_count', parseInt(e.target.value))}
            disabled={disabled}
            className="parameter-input"
          />
        </label>

        <label className="parameter-label">
          延迟时间 (ms):
          <input
            type="number"
            min="0"
            max="60000"
            value={parameters.delay_ms || 0}
            onChange={(e) => handleParameterChange('delay_ms', parseInt(e.target.value))}
            disabled={disabled}
            className="parameter-input"
          />
        </label>
      </div>

      <div className="parameter-group">
        <label className="parameter-label">
          数据累积:
          <select
            value={parameters.data_accumulation || 'all'}
            onChange={(e) => handleParameterChange('data_accumulation', e.target.value)}
            disabled={disabled}
            className="parameter-select"
          >
            <option value="all">所有数据</option>
            <option value="last">最后一次</option>
            <option value="average">平均值</option>
            <option value="sum">总和</option>
          </select>
        </label>

        <label className="parameter-label">
          导出格式:
          <select
            value={parameters.export_format || 'csv'}
            onChange={(e) => handleParameterChange('export_format', e.target.value)}
            disabled={disabled}
            className="parameter-select"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="xlsx">Excel</option>
          </select>
        </label>
      </div>

      <div className="parameter-group">
        <label className="parameter-label">
          中断条件:
          <input
            type="text"
            value={parameters.break_condition || ''}
            onChange={(e) => handleParameterChange('break_condition', e.target.value)}
            disabled={disabled}
            placeholder="例如: value > 100"
            className="parameter-input"
          />
        </label>

        <label className="parameter-label">
          继续条件:
          <input
            type="text"
            value={parameters.continue_condition || ''}
            onChange={(e) => handleParameterChange('continue_condition', e.target.value)}
            disabled={disabled}
            placeholder="例如: value < 50"
            className="parameter-input"
          />
        </label>
      </div>
    </div>
  );
};

// 循环状态监控组件
const LoopStatusMonitor: React.FC<{
  context: LoopExecutionContext;
  loop: LoopInfo;
}> = ({ context, loop }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusColor = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '#4CAF50';
      case 'paused': return '#FF9800';
      case 'completed': return '#2196F3';
      case 'error': return '#F44336';
      case 'cancelled': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getStatusText = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '运行中';
      case 'paused': return '已暂停';
      case 'completed': return '已完成';
      case 'error': return '错误';
      case 'cancelled': return '已取消';
      default: return '未开始';
    }
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getDataPoints = () => {
    return context.accumulatedData.length;
  };

  const getEstimatedTimeRemaining = () => {
    if (context.state !== 'running' || context.currentIteration === 0) {
      return null;
    }

    const averageIterationTime = context.elapsedTime / context.currentIteration;
    const remainingIterations = context.totalIterations - context.currentIteration;
    return remainingIterations * averageIterationTime;
  };

  return (
    <div className="loop-status-monitor">
      <div
        className="status-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <div className="status-indicator" style={{ color: getStatusColor(context.state) }}>
          {getStatusText(context.state)}
        </div>
        <div className="status-progress">
          {context.currentIteration}/{context.totalIterations} ({context.progress.toFixed(1)}%)
        </div>
        <div className="status-time">
          {formatTime(context.elapsedTime)}
        </div>
      </div>

      {expanded && (
        <div className="status-details">
          <div className="detail-item">
            <span className="detail-label">当前迭代:</span>
            <span className="detail-value">{context.currentIteration}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">总迭代数:</span>
            <span className="detail-value">{context.totalIterations}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">运行时间:</span>
            <span className="detail-value">{formatTime(context.elapsedTime)}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">数据点数:</span>
            <span className="detail-value">{getDataPoints()}</span>
          </div>
          {context.state === 'running' && getEstimatedTimeRemaining() && (
            <div className="detail-item">
              <span className="detail-label">预计剩余:</span>
              <span className="detail-value">{formatTime(getEstimatedTimeRemaining()!)}</span>
            </div>
          )}
          {context.error && (
            <div className="detail-item error">
              <span className="detail-label">错误:</span>
              <span className="detail-value">{context.error}</span>
            </div>
          )}
          {context.currentNodeId && (
            <div className="detail-item">
              <span className="detail-label">当前节点:</span>
              <span className="detail-value">{context.currentNodeId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 循环控制面板主组件
 */
export const LoopControlPanel: React.FC<LoopControlPanelProps> = ({
  loops,
  contexts,
  nodes,
  onLoopStart,
  onLoopPause,
  onLoopResume,
  onLoopCancel,
  onLoopReset,
  onLoopParametersUpdate,
  className = '',
  style = {}
}) => {
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'parameters' | 'data'>('control');

  const selectedLoop = loops.find(loop => loop.id === selectedLoopId);
  const selectedContext = selectedLoopId ? contexts.get(selectedLoopId) : undefined;

  const handleLoopStart = (loopId: string) => {
    onLoopStart?.(loopId);
  };

  const handleLoopPause = (loopId: string) => {
    onLoopPause?.(loopId);
  };

  const handleLoopResume = (loopId: string) => {
    onLoopResume?.(loopId);
  };

  const handleLoopCancel = (loopId: string) => {
    onLoopCancel?.(loopId);
  };

  const handleLoopReset = (loopId: string) => {
    onLoopReset?.(loopId);
  };

  const handleParametersUpdate = (loopId: string, parameters: Record<string, any>) => {
    onLoopParametersUpdate?.(loopId, parameters);
  };

  const handleExportData = (loopId: string, format: 'json' | 'csv') => {
    const data = LoopContextManager.exportLoopData(loopId, format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loop_${loopId}_data.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loops.length === 0) {
    return (
      <div className={`loop-control-panel empty ${className}`} style={style}>
        <div className="empty-message">
          <div className="empty-icon">🔄</div>
          <div className="empty-text">未检测到循环</div>
          <div className="empty-hint">
            添加循环开始和结束节点来创建循环
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`loop-control-panel ${className}`} style={style}>
      <div className="panel-header">
        <h3>循环控制面板</h3>
        <div className="panel-stats">
          <span className="stat-item">总计: {loops.length}</span>
          <span className="stat-item active">
            运行中: {Array.from(contexts.values()).filter(c => c.state === 'running').length}
          </span>
        </div>
      </div>

      {/* 循环列表 */}
      <div className="loop-list">
        {loops.map(loop => {
          const context = contexts.get(loop.id);
          return (
            <div
              key={loop.id}
              className={`loop-item ${selectedLoopId === loop.id ? 'selected' : ''}`}
              onClick={() => setSelectedLoopId(loop.id)}
            >
              <div className="loop-item-header">
                <div className="loop-name">循环 {loop.id}</div>
                <div className="loop-state">
                  {context ? (
                    <span
                      className="state-badge"
                      style={{
                        backgroundColor: context.state === 'running' ? '#4CAF50' :
                                       context.state === 'paused' ? '#FF9800' :
                                       context.state === 'completed' ? '#2196F3' :
                                       context.state === 'error' ? '#F44336' : '#9E9E9E'
                      }}
                    >
                      {context.state === 'running' ? '运行中' :
                       context.state === 'paused' ? '已暂停' :
                       context.state === 'completed' ? '已完成' :
                       context.state === 'error' ? '错误' : '未开始'}
                    </span>
                  ) : (
                    <span className="state-badge" style={{ backgroundColor: '#9E9E9E' }}>
                      未初始化
                    </span>
                  )}
                </div>
              </div>

              <div className="loop-item-details">
                <div className="loop-info">
                  <span>节点数: {loop.nodeIds.length}</span>
                  <span>迭代: {loop.iterationCount}</span>
                </div>
                {context && (
                  <div className="loop-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${context.progress}%` }}
                      />
                    </div>
                    <span className="progress-text">
                      {context.currentIteration}/{context.totalIterations}
                    </span>
                  </div>
                )}
              </div>

              {/* 快速控制按钮 */}
              <div className="loop-quick-controls">
                {(!context || context.state === 'idle' || context.state === 'completed' || context.state === 'error' || context.state === 'cancelled') && (
                  <button
                    className="btn-quick-start"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoopStart(loop.id);
                    }}
                    title="开始循环"
                  >
                    ▶️
                  </button>
                )}
                {context?.state === 'running' && (
                  <>
                    <button
                      className="btn-quick-pause"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoopPause(loop.id);
                      }}
                      title="暂停循环"
                    >
                      ⏸️
                    </button>
                    <button
                      className="btn-quick-cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoopCancel(loop.id);
                      }}
                      title="取消循环"
                    >
                      ❌
                    </button>
                  </>
                )}
                {context?.state === 'paused' && (
                  <>
                    <button
                      className="btn-quick-resume"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoopResume(loop.id);
                      }}
                      title="恢复循环"
                    >
                      ▶️
                    </button>
                    <button
                      className="btn-quick-cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoopCancel(loop.id);
                      }}
                      title="取消循环"
                    >
                      ❌
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 详细控制面板 */}
      {selectedLoop && (
        <div className="loop-details">
          <div className="details-header">
            <h4>循环 {selectedLoop.id} 详细信息</h4>
            <div className="tab-nav">
              <button
                className={`tab-btn ${activeTab === 'control' ? 'active' : ''}`}
                onClick={() => setActiveTab('control')}
              >
                控制
              </button>
              <button
                className={`tab-btn ${activeTab === 'parameters' ? 'active' : ''}`}
                onClick={() => setActiveTab('parameters')}
              >
                参数
              </button>
              <button
                className={`tab-btn ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => setActiveTab('data')}
              >
                数据
              </button>
            </div>
          </div>

          <div className="details-content">
            {activeTab === 'control' && (
              <div className="control-tab">
                {selectedContext && (
                  <LoopStatusMonitor context={selectedContext} loop={selectedLoop} />
                )}

                <div className="control-buttons">
                  {(!selectedContext || selectedContext.state === 'idle' || selectedContext.state === 'completed' || selectedContext.state === 'error' || selectedContext.state === 'cancelled') && (
                    <button
                      className="btn-control btn-start"
                      onClick={() => handleLoopStart(selectedLoop.id)}
                    >
                      ▶️ 开始循环
                    </button>
                  )}
                  {selectedContext?.state === 'running' && (
                    <>
                      <button
                        className="btn-control btn-pause"
                        onClick={() => handleLoopPause(selectedLoop.id)}
                      >
                        ⏸️ 暂停
                      </button>
                      <button
                        className="btn-control btn-cancel"
                        onClick={() => handleLoopCancel(selectedLoop.id)}
                      >
                        ❌ 取消
                      </button>
                    </>
                  )}
                  {selectedContext?.state === 'paused' && (
                    <>
                      <button
                        className="btn-control btn-resume"
                        onClick={() => handleLoopResume(selectedLoop.id)}
                      >
                        ▶️ 恢复
                      </button>
                      <button
                        className="btn-control btn-cancel"
                        onClick={() => handleLoopCancel(selectedLoop.id)}
                      >
                        ❌ 取消
                      </button>
                    </>
                  )}
                  <button
                    className="btn-control btn-reset"
                    onClick={() => handleLoopReset(selectedLoop.id)}
                  >
                    🔄 重置
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'parameters' && (
              <div className="parameters-tab">
                <LoopParameterEditor
                  loop={selectedLoop}
                  onUpdate={(parameters) => handleParametersUpdate(selectedLoop.id, parameters)}
                  disabled={selectedContext?.state === 'running'}
                />
              </div>
            )}

            {activeTab === 'data' && (
              <div className="data-tab">
                <div className="data-info">
                  <div className="data-stats">
                    <span>数据点: {selectedContext?.accumulatedData.length || 0}</span>
                    <span>迭代: {selectedContext?.currentIteration || 0}</span>
                  </div>
                </div>

                <div className="data-controls">
                  <button
                    className="btn-export"
                    onClick={() => handleExportData(selectedLoop.id, 'json')}
                    disabled={!selectedContext || selectedContext.accumulatedData.length === 0}
                  >
                    📄 导出 JSON
                  </button>
                  <button
                    className="btn-export"
                    onClick={() => handleExportData(selectedLoop.id, 'csv')}
                    disabled={!selectedContext || selectedContext.accumulatedData.length === 0}
                  >
                    📊 导出 CSV
                  </button>
                </div>

                {/* 数据预览 */}
                {selectedContext && selectedContext.accumulatedData.length > 0 && (
                  <div className="data-preview">
                    <h5>数据预览</h5>
                    <div className="data-table">
                      <div className="table-header">
                        <span>迭代</span>
                        <span>节点</span>
                        <span>类型</span>
                        <span>时间</span>
                      </div>
                      <div className="table-body">
                        {selectedContext.accumulatedData.slice(-5).map((data, index) => (
                          <div key={index} className="table-row">
                            <span>{data.iteration}</span>
                            <span>{data.nodeId}</span>
                            <span>{data.dataType}</span>
                            <span>{new Date(data.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoopControlPanel;