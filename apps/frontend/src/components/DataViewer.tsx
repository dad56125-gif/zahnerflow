import React, { useState, useEffect } from 'react';
import { ElectrochemicalNode } from '../types/nodes';


interface DataViewerProps {
  isVisible: boolean;
  selectedNode: ElectrochemicalNode | null;
}

interface ChartData {
  x: number[];
  y: number[];
  labels?: string[];
}

export const DataViewer: React.FC<DataViewerProps> = ({ isVisible, selectedNode }) => {
  const [activeTab, setActiveTab] = useState<'raw' | 'processed' | 'chart'>('raw');
  const [chartData, setChartData] = useState<ChartData | null>(null);

  useEffect(() => {
    if (selectedNode && selectedNode.data.results) {
      // 尝试从结果中提取图表数据
      const results = selectedNode.data.results;
      if (Array.isArray(results)) {
        // 如果是数组，假设是 [x, y] 数据对
        const xData = results.map((_item, index) => index);
        const yData = results.map(item => typeof item === 'number' ? item : 0);
        setChartData({ x: xData, y: yData });
      } else if (results.data && Array.isArray(results.data)) {
        // 如果是 { data: [...] } 格式
        const xData = results.data.map((item: any, index: number) => 
          item.x || item.time || index
        );
        const yData = results.data.map((item: any) => 
          item.y || item.value || item.current || item.potential || 0
        );
        setChartData({ x: xData, y: yData });
      }
    } else {
      setChartData(null);
    }
  }, [selectedNode]);

  const renderRawData = () => {
    if (!selectedNode) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon">📊</div>
          <div>选择一个节点查看数据</div>
        </div>
      );
    }

    const rawData = (selectedNode.data as any).rawData || selectedNode.data.results;

    if (!rawData) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon-sm">📭</div>
          <div>暂无数据</div>
          <div className="data-viewer-placeholder-subtext">
            运行节点后将显示数据
          </div>
        </div>
      );
    }

    return (
      <div className="raw-data-viewer">
        <div className="data-viewer-summary">
          <div><strong>数据类型:</strong> {typeof rawData}</div>
          <div><strong>数据大小:</strong> {JSON.stringify(rawData).length} 字符</div>
          <div><strong>数组长度:</strong> {Array.isArray(rawData) ? rawData.length : 'N/A'}</div>
        </div>

        <div className="data-viewer-content">
          <pre className="data-viewer-pre">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  const renderProcessedData = () => {
    if (!selectedNode || !selectedNode.data.results) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon-sm">📈</div>
          <div>暂无处理后的数据</div>
        </div>
      );
    }

    const results = selectedNode.data.results;
    
    return (
      <div className="processed-data-viewer">
        <div className="data-viewer-summary">
          <div><strong>执行时间:</strong> {(selectedNode.data as any).executionTime || 'N/A'} ms</div>
          <div><strong>状态:</strong> {selectedNode.status}</div>
          <div><strong>最后更新:</strong> {new Date(selectedNode.data.updatedAt).toLocaleString()}</div>
        </div>

        <div className="data-viewer-content">
          <pre className="data-viewer-pre">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  const renderChart = () => {
    if (!chartData) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon-sm">📉</div>
          <div>暂无可视化数据</div>
          <div className="data-viewer-placeholder-subtext">
            需要数值型数据才能生成图表
          </div>
        </div>
      );
    }

    // 简单的 SVG 图表实现
    const maxValue = Math.max(...chartData.y);
    const minValue = Math.min(...chartData.y);
    const range = maxValue - minValue || 1;
    
    const width = 300;
    const height = 200;
    const padding = 40;
    
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    const points = chartData.y.map((value, index) => {
      const x = padding + (index / (chartData.y.length - 1)) * chartWidth;
      const y = padding + ((maxValue - value) / range) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="chart-viewer">
        <div className="data-viewer-summary">
          <div><strong>数据点:</strong> {chartData.y.length}</div>
          <div><strong>最大值:</strong> {maxValue.toFixed(4)}</div>
          <div><strong>最小值:</strong> {minValue.toFixed(4)}</div>
          <div><strong>平均值:</strong> {(chartData.y.reduce((a, b) => a + b, 0) / chartData.y.length).toFixed(4)}</div>
        </div>

        <div className="chart-svg-container">
          <svg width={width} height={height} style={{ background: 'white' }}>
            {/* 网格线 */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            
            {/* 坐标轴 */}
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#666" strokeWidth="2"/>
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#666" strokeWidth="2"/>
            
            {/* 数据线 */}
            <polyline
              points={points}
              fill="none"
              stroke="#007AFF"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            
            {/* 数据点 */}
            {chartData.y.map((value, index) => {
              const x = padding + (index / (chartData.y.length - 1)) * chartWidth;
              const y = padding + ((maxValue - value) / range) * chartHeight;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="#007AFF"
                  stroke="white"
                  strokeWidth="1"
                />
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="data-viewer data-viewer-container">
      {/* 标题 */}
      <div className="data-viewer-header">
        <h2 className="data-viewer-title">
          数据查看器
        </h2>
        <div className="data-viewer-subtitle">
          {selectedNode ? selectedNode.name : '无选中节点'}
        </div>
      </div>

      {/* 标签页 */}
      <div className="data-tabs">
        <button
          className={`data-tab ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          原始数据
        </button>
        
        <button
          className={`data-tab ${activeTab === 'processed' ? 'active' : ''}`}
          onClick={() => setActiveTab('processed')}
        >
          处理结果
        </button>
        
        <button
          className={`data-tab ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          图表
        </button>
      </div>

      {/* 内容区域 */}
      <div className="data-content-area">
        {activeTab === 'raw' && renderRawData()}
        {activeTab === 'processed' && renderProcessedData()}
        {activeTab === 'chart' && renderChart()}
      </div>
    </div>
  );
};