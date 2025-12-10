import React, { useState, useEffect, useRef } from 'react';
import { useCanvasStore } from '../state/canvasStore';
import { useSystemState } from '../workflow';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { RawStreamData } from '../types/Interfaces';

interface DataViewerProps {
  isVisible?: boolean;
  selectedNode: any;
  showChart?: boolean;
}

// 定义哪些节点类型支持 TIV 数据表
const MEASUREMENT_NODE_TYPES = [
  'eis_potentiostatic',
  'eis_galvanostatic',
  'ocp_measurement',
  'chronoamperometry',
  'chronopotentiometry',
  'voltage_ramp',
  'current_ramp',
  'lsv_measurement'
];

export const DataViewer: React.FC<DataViewerProps> = ({ isVisible = true, selectedNode, showChart = true }) => {
  const [activeTab, setActiveTab] = useState<'table' | 'raw' | 'processed'>('table');
  const [tableData, setTableData] = useState<RawStreamData[]>([]);

  const { nodes } = useCanvasStore();
  const systemState = useSystemState();

  // 获取节点索引和执行ID
  const nodeIndex = selectedNode ? nodes.findIndex(n => n.id === selectedNode.id) : -1;
  const activeExecutionId = systemState?.executionId || null;
  const isMeasurementNode = selectedNode && MEASUREMENT_NODE_TYPES.includes(selectedNode.type);

  // 只有测量节点才启用流 Hook
  const { getFullHistory, consumeBuffer } = useMeasurementStream({
    nodeIndex: nodeIndex >= 0 && isMeasurementNode ? nodeIndex : -1,
    activeExecutionId
  });

  // 自动切换 Tab：如果是测量节点，默认显示表格；否则显示原始数据
  useEffect(() => {
    if (isMeasurementNode) {
      setActiveTab('table');
    } else {
      setActiveTab('raw');
    }
  }, [selectedNode, isMeasurementNode]);

  // 初始化历史数据 & 监听新一轮执行
  useEffect(() => {
    if (isMeasurementNode && nodeIndex >= 0) {
      const history = getFullHistory();
      setTableData(history);
    } else {
      setTableData([]);
    }
  }, [nodeIndex, activeExecutionId, isMeasurementNode]); // 依赖项变化时重置

  // 实时更新数据
  useEffect(() => {
    if (!isMeasurementNode) return;

    // 动画帧或定时消费 Buffer
    const interval = setInterval(() => {
      const chunk = consumeBuffer();
      if (chunk.length > 0) {
        setTableData(prev => [...prev, ...chunk]);
      }
    }, 100); // 10Hz 刷新率足够表格使用

    return () => clearInterval(interval);
  }, [consumeBuffer, isMeasurementNode]);

  // 格式化数值
  const formatValue = (val: number) => {
    if (val === 0) return '0';
    if (Math.abs(val) < 0.001 || Math.abs(val) > 1000) return val.toExponential(4);
    return val.toFixed(4);
  };

  const renderTable = () => {
    if (!isMeasurementNode) {
      return (
        <div className="data-viewer-placeholder">
          <div>该节点不支持 TIV 表格数据</div>
        </div>
      );
    }

    if (tableData.length === 0) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon-sm">📝</div>
          <div>暂无测量数据</div>
          <div className="data-viewer-placeholder-subtext">运行时将实时显示数据</div>
        </div>
      );
    }

    return (
      <div className="table-viewer-container">
        <div className="data-viewer-summary">
          <div><strong>数据点数:</strong> {tableData.length}</div>
          <div><strong>最新时间:</strong> {tableData.length > 0 ? tableData[tableData.length - 1].t.toFixed(2) + 's' : '-'}</div>
        </div>
        <div className="table-scroll-area glass-inset">
          <table className="data-table">
            <thead>
              <tr>
                <th>时间 (s)</th>
                <th>电压 (V)</th>
                <th>电流 (A)</th>
              </tr>
            </thead>
            <tbody>
              {/* 为了性能，仅渲染最近 500 条 + 首部 10 条？ 或者全部渲染但需注意性能 */}
              {/* 考虑到 React 渲染列表，暂时全量渲染，如果卡顿后续可优化 */}
              {tableData.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.t.toFixed(4)}</td>
                  <td>{formatValue(row.v)}</td>
                  <td>{formatValue(row.i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 自动滚动到底部 anchor? */}
          <div style={{ float: "left", clear: "both" }} ></div>
        </div>
      </div>
    );
  };

  const renderRawData = () => {
    if (!selectedNode) return null;
    const rawData = (selectedNode.data as any).rawData || selectedNode.data.results;
    return (
      <div className="raw-data-viewer">
        <pre className="data-viewer-pre">
          {rawData ? JSON.stringify(rawData, null, 2) : '暂无原始数据'}
        </pre>
      </div>
    );
  };

  if (!isVisible && !selectedNode) return null;

  return (
    <div
      className="data-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 'var(--size-md)',
        gap: 'var(--size-md)',
        overflow: 'hidden'
      }}
    >
      {/* 标签页 - 居中显示 */}
      <div
        className="data-tabs"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 'var(--size-sm)',
          flexShrink: 0,
          background: 'var(--glass-bg)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          alignSelf: 'center'
        }}
      >
        {isMeasurementNode && (
          <button
            className={`data-tab ${activeTab === 'table' ? 'active' : ''}`}
            onClick={() => setActiveTab('table')}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: activeTab === 'table' ? 'var(--color-primary)' : 'transparent', color: activeTab === 'table' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            TIV 数据表
          </button>
        )}
        <button
          className={`data-tab ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
          style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: activeTab === 'raw' ? 'var(--color-primary)' : 'transparent', color: activeTab === 'raw' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          JSON 源数据
        </button>
      </div>

      {/* 内容区域 */}
      <div className="data-content-area" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'table' && renderTable()}
        {activeTab === 'raw' && renderRawData()}
      </div>
    </div>
  );
};

