/**
 * 循环信息面板组件
 *
 * 提供循环参数显示和状态监控界面
 * 专注于信息展示，不包含执行控制功能
 */

import React, { useState } from 'react';
import { LoopInfo } from '../core/LoopDetector';
import {
  LoopContextManager,
  type LoopExecutionContext,
  type LoopExecutionState
} from '../core/LoopContextManager';

// 循环信息面板属性接口
export interface LoopControlPanelProps {
  loops: LoopInfo[];
  contexts: Map<string, LoopExecutionContext>;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 循环状态显示器组件
 */
const LoopStatusMonitor: React.FC<{
  context: LoopExecutionContext;
  loop: LoopInfo;
}> = ({ context, loop }) => {
  const getStateColor = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '#4CAF50';
      case 'paused': return '#FF9800';
      case 'completed': return '#2196F3';
      case 'error': return '#F44336';
      case 'cancelled': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getStateText = (state: LoopExecutionState) => {
    switch (state) {
      case 'running': return '运行中';
      case 'paused': return '已暂停';
      case 'completed': return '已完成';
      case 'error': return '错误';
      case 'cancelled': return '已取消';
      default: return '未开始';
    }
  };

  return (
    <div className="loop-status-monitor">
      <div className="status-header">
        <span
          className="status-indicator"
          style={{ color: getStateColor(context.state) }}
        >
          {getStateText(context.state)}
        </span>
        <span className="progress-text">
          {context.current_iteration}/{context.total_iterations}
          ({context.progress.toFixed(1)}%)
        </span>
      </div>

      {context.error && (
        <div className="error-message" style={{ color: '#F44336' }}>
          错误: {context.error}
        </div>
      )}

      <div className="execution-info">
        <div>运行时间: {(context.elapsed_time / 1000).toFixed(1)}s</div>
        <div>数据点: {context.accumulated_data.length}</div>
        {loop.parameters.delay_ms && (
          <div>延迟: {loop.parameters.delay_ms}ms</div>
        )}
      </div>
    </div>
  );
};

/**
 * 循环参数显示器组件
 */
const LoopParameterDisplay: React.FC<{
  loop: LoopInfo;
}> = ({ loop }) => {
  return (
    <div className="loop-parameter-display">
      <h4>循环参数</h4>
      <div className="parameter-grid">
        <div className="parameter-item">
          <label>循环ID:</label>
          <span>{loop.id}</span>
        </div>
        <div className="parameter-item">
          <label>迭代次数:</label>
          <span>{loop.iteration_count}</span>
        </div>
        <div className="parameter-item">
          <label>包含节点:</label>
          <span>{loop.node_ids.length}</span>
        </div>
        {loop.parameters.loop_variable && (
          <div className="parameter-item">
            <label>循环变量:</label>
            <span>{loop.parameters.loop_variable}</span>
          </div>
        )}
        {loop.parameters.start_value !== undefined && (
          <div className="parameter-item">
            <label>起始值:</label>
            <span>{loop.parameters.start_value}</span>
          </div>
        )}
        {loop.parameters.step !== undefined && (
          <div className="parameter-item">
            <label>步长:</label>
            <span>{loop.parameters.step}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 循环信息面板主组件
 */
export const LoopControlPanel: React.FC<LoopControlPanelProps> = ({
  loops,
  contexts,
  nodes,
  className = '',
  style = {}
}) => {
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'parameters' | 'data'>('info');

  const selectedLoop = loops.find(loop => loop.id === selectedLoopId);
  const selectedContext = selectedLoopId ? contexts.get(selectedLoopId) : undefined;

  const handleExportData = (loopId: string, format: 'json' | 'csv') => {
    const data = LoopContextManager.exportLoopData(loopId, format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loop_${loopId}_data.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`loop-control-panel ${className}`} style={style}>
      {/* 循环列表 */}
      <div className="loop-list">
        <h3>循环列表</h3>
        {loops.length === 0 ? (
          <div className="empty-state">当前工作流中没有检测到循环</div>
        ) : (
          <div className="loop-items">
            {loops.map(loop => {
              const context = contexts.get(loop.id);
              return (
                <div
                  key={loop.id}
                  className={`loop-item ${selectedLoopId === loop.id ? 'selected' : ''}`}
                  onClick={() => setSelectedLoopId(loop.id)}
                >
                  <div className="loop-item-header">
                    <span className="loop-id">{loop.id}</span>
                    {context && (
                      <span
                        className="loop-state"
                        style={{
                          color: context.state === 'running' ? '#4CAF50' :
                                 context.state === 'paused' ? '#FF9800' :
                                 context.state === 'error' ? '#F44336' :
                                 context.state === 'completed' ? '#2196F3' : '#9E9E9E'
                        }}
                      >
                        {context.state === 'running' ? '运行中' :
                         context.state === 'paused' ? '已暂停' :
                         context.state === 'error' ? '错误' :
                         context.state === 'completed' ? '已完成' : '未开始'}
                      </span>
                    )}
                  </div>
                  <div className="loop-item-details">
                    <span>迭代: {loop.iteration_count}</span>
                    <span>节点: {loop.node_ids.length}</span>
                    {context && (
                      <span>进度: {context.current_iteration}/{context.total_iterations}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 详细信息面板 */}
      {selectedLoop && (
        <div className="loop-details">
          <div className="details-header">
            <h4>循环 {selectedLoop.id} 详细信息</h4>
            <div className="tab-nav">
              <button
                className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => setActiveTab('info')}
              >
                状态
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
            {activeTab === 'info' && (
              <div className="info-tab">
                {selectedContext ? (
                  <LoopStatusMonitor context={selectedContext} loop={selectedLoop} />
                ) : (
                  <div className="no-context">
                    循环尚未开始执行
                  </div>
                )}
              </div>
            )}

            {activeTab === 'parameters' && (
              <div className="parameters-tab">
                <LoopParameterDisplay loop={selectedLoop} />
              </div>
            )}

            {activeTab === 'data' && (
              <div className="data-tab">
                <div className="data-info">
                  <div className="data-stats">
                    <span>数据点: {selectedContext?.accumulated_data.length || 0}</span>
                    <span>迭代: {selectedContext?.current_iteration || 0}</span>
                  </div>
                </div>

                <div className="data-controls">
                  <button
                    className="btn-export"
                    onClick={() => handleExportData(selectedLoop.id, 'json')}
                    disabled={!selectedContext || selectedContext.accumulated_data.length === 0}
                  >
                    📄 导出 JSON
                  </button>
                  <button
                    className="btn-export"
                    onClick={() => handleExportData(selectedLoop.id, 'csv')}
                    disabled={!selectedContext || selectedContext.accumulated_data.length === 0}
                  >
                    📊 导出 CSV
                  </button>
                </div>

                {/* 数据预览 */}
                {selectedContext && selectedContext.accumulated_data.length > 0 && (
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
                        {selectedContext.accumulated_data.slice(-5).map((data, index) => (
                          <div key={index} className="table-row">
                            <span>{data.iteration}</span>
                            <span>{data.node_id}</span>
                            <span>{data.data_type}</span>
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