import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '../state/canvasStore';
import { useSystemState } from '../workflow';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { useEisData, EisDataPoint } from '../hooks/useEisData';
import { RawStreamData } from '../types/Interfaces';

interface DataViewerProps {
  isVisible?: boolean;
  selectedNode: any;
  showChart?: boolean;
}

// IVT 测量节点类型（流式数据）
const IVT_NODE_TYPES = [
  'ocp_measurement',
  'chronoamperometry',
  'chronopotentiometry',
  'voltage_ramp',
  'current_ramp',
  // 高级测量节点（使用合并的 IVT 数据）
  'galvanostatic_switching',
  'potentiostatic_switching',
  'galvanostatic_step_ramp',
  'potentiostatic_step_ramp'
];

// EIS 测量节点类型（一次性数据）
const EIS_NODE_TYPES = [
  'eis_potentiostatic',
  'eis_galvanostatic'
];

// 所有支持数据表的节点类型
const MEASUREMENT_NODE_TYPES = [...IVT_NODE_TYPES, ...EIS_NODE_TYPES];

export const DataViewer: React.FC<DataViewerProps> = ({ isVisible = true, selectedNode, showChart = true }) => {
  const [tableData, setTableData] = useState<RawStreamData[]>([]);

  const { nodes } = useCanvasStore();
  const systemState = useSystemState();

  // 获取节点索引和执行ID
  const nodeIndex = selectedNode ? nodes.findIndex(n => n.id === selectedNode.id) : -1;
  const activeExecutionId = systemState?.executionId || null;

  const isMeasurementNode = selectedNode && MEASUREMENT_NODE_TYPES.includes(selectedNode.type);
  const isEisNode = selectedNode && EIS_NODE_TYPES.includes(selectedNode.type);
  const isIvtNode = selectedNode && IVT_NODE_TYPES.includes(selectedNode.type);

  // IVT 流式数据 Hook（仅 IVT 节点启用）
  const { getFullHistory, consumeBuffer } = useMeasurementStream({
    nodeIndex: nodeIndex >= 0 && isIvtNode ? nodeIndex : -1,
    activeExecutionId
  });

  // EIS 数据 Hook（仅 EIS 节点启用）
  const { eisData } = useEisData({
    nodeIndex: nodeIndex >= 0 && isEisNode ? nodeIndex : -1
  });

  // IVT: 初始化历史数据 & 监听新一轮执行
  useEffect(() => {
    if (isIvtNode && nodeIndex >= 0) {
      const history = getFullHistory();
      setTableData(history);
    } else {
      setTableData([]);
    }
  }, [nodeIndex, activeExecutionId, isIvtNode]);

  // IVT: 实时更新数据
  useEffect(() => {
    if (!isIvtNode) return;

    const interval = setInterval(() => {
      const chunk = consumeBuffer();
      if (chunk.length > 0) {
        setTableData(prev => [...prev, ...chunk]);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [consumeBuffer, isIvtNode]);

  // 格式化数值
  const formatValue = (val: number) => {
    if (val === 0) return '0';
    if (Math.abs(val) < 0.001 || Math.abs(val) > 1000) return val.toExponential(4);
    return val.toFixed(4);
  };

  // 渲染 IVT 表格
  const renderIvtTable = () => {
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
      <div className="table-viewer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="data-viewer-summary">
          <div><strong>数据点数:</strong> {tableData.length}</div>
          <div><strong>最新时间:</strong> {tableData.length > 0 ? tableData[tableData.length - 1].t.toFixed(2) + 's' : '-'}</div>
        </div>
        <div className="table-scroll-area glass-inset" style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>时间 (s)</th>
                <th>电压 (V)</th>
                <th>电流 (A)</th>
              </tr>
            </thead>
            <tbody>
              {[...tableData].reverse().map((row, idx) => (
                <tr key={tableData.length - 1 - idx}>
                  <td>{row.t.toFixed(4)}</td>
                  <td>{formatValue(row.v)}</td>
                  <td>{formatValue(row.i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 渲染 EIS 表格
  const renderEisTable = () => {
    if (!eisData || eisData.points.length === 0) {
      return (
        <div className="data-viewer-placeholder">
          <div className="data-viewer-placeholder-icon-sm">�</div>
          <div>暂无 EIS 数据</div>
          <div className="data-viewer-placeholder-subtext">EIS 测量完成后将显示阻抗数据</div>
        </div>
      );
    }

    return (
      <div className="table-viewer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="data-viewer-summary">
          <div><strong>数据点数:</strong> {eisData.pointCount}</div>
          <div><strong>频率范围:</strong> {eisData.points[eisData.points.length - 1]?.frequency.toExponential(2)} - {eisData.points[0]?.frequency.toExponential(2)} Hz</div>
        </div>
        <div className="table-scroll-area glass-inset" style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>频率 (Hz)</th>
                <th>Z' (Ω)</th>
                <th>-Z'' (Ω)</th>
              </tr>
            </thead>
            <tbody>
              {eisData.points.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.frequency.toExponential(3)}</td>
                  <td>{formatValue(row.zReal)}</td>
                  <td>{formatValue(-row.zImag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (!isVisible && !selectedNode) return null;

  // 如果不是测量节点，显示占位提示
  if (!isMeasurementNode) {
    return (
      <div className="data-viewer" style={{ padding: 'var(--size-md)' }}>
        <div className="data-viewer-placeholder">
          <div>该节点不支持数据表格</div>
        </div>
      </div>
    );
  }

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
      {/* 内容区域 - 根据节点类型显示不同的表格 */}
      <div className="data-content-area" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isEisNode ? renderEisTable() : renderIvtTable()}
      </div>
    </div>
  );
};

