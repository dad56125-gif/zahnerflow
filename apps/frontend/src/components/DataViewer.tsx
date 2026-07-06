import React, { useState, useEffect } from 'react';
import { useCanvasStore } from '../state/canvasStore';
import { useSystemState } from '../state/executionStateBridge';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { useEisData, EisDataPoint } from '../hooks/useEisData';
import type { RawStreamData } from '@zahnerflow/types';
import { DataTable, TableColumn } from './shared/DataTable';
import { UiIconSvg } from './shared/UiIconSvg';

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
  const [viewMode, setViewMode] = useState<'table' | 'health'>('table');

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

  // 格式化数值（科学数据通用）
  const formatSci = (val: number) => {
    if (val === 0) return '0';
    if (Math.abs(val) < 0.001 || Math.abs(val) > 1000) return val.toExponential(4);
    return val.toFixed(4);
  };

  // IVT 列定义
  const ivtColumns: TableColumn<RawStreamData>[] = [
    { key: 't', title: '时间 (s)', format: (v: number) => v.toFixed(4) },
    { key: 'v', title: '电压 (V)', format: formatSci },
    { key: 'i', title: '电流 (A)', format: formatSci },
  ];

  // EIS 列定义
  const eisColumns: TableColumn<EisDataPoint>[] = [
    { key: 'frequency', title: '频率 (Hz)', format: (v: number) => v.toExponential(3) },
    { key: 'zReal', title: "Z' (Ω)", format: formatSci },
    { key: 'zImag', title: "-Z'' (Ω)", format: (v: number) => formatSci(-v) },
  ];

  // 渲染 IVT 表格
  const renderIvtTable = () => (
    <div className="table-viewer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="data-viewer__summary">
        <div><strong>数据点数:</strong> {tableData.length}</div>
        <div><strong>最新时间:</strong> {tableData.length > 0 ? tableData[tableData.length - 1].t.toFixed(2) + 's' : '-'}</div>
      </div>
      <div className="table-scroll-area glass-inset" style={{ flex: 1, overflow: 'auto' }}>
        <DataTable
          columns={ivtColumns}
          data={[...tableData].reverse()}
          rowKey={(_row, idx) => String(tableData.length - 1 - idx)}
          size="small"
          emptyText="暂无测量数据"
        />
      </div>
    </div>
  );

  // 渲染 EIS 表格
  const renderEisTable = () => (
    <div className="table-viewer-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="data-viewer__summary">
        <div><strong>数据点数:</strong> {eisData?.pointCount ?? 0}</div>
        <div><strong>频率范围:</strong> {eisData?.points[eisData.points.length - 1]?.frequency.toExponential(2)} - {eisData?.points[0]?.frequency.toExponential(2)} Hz</div>
      </div>
      <div className="table-scroll-area glass-inset" style={{ flex: 1, overflow: 'auto' }}>
        <DataTable
          columns={eisColumns}
          data={eisData?.points ?? []}
          size="small"
          emptyText="暂无 EIS 数据"
        />
      </div>
    </div>
  );

  // 渲染电池健康状态
  const renderHealthStatus = () => {
    const healthData = selectedNode?.data?.results?.battery_health || selectedNode?.config?.battery_health || selectedNode?.data?.battery_health;

    if (!healthData) {
      return (
        <div className="data-viewer__placeholder">
          <div className="data-viewer__placeholder-icon data-viewer__placeholder-icon--sm">
            <UiIconSvg name="battery" />
          </div>
          <div>暂无健康分析数据</div>
          <div className="data-viewer__placeholder-subtext">测量完成后将显示电池健康状况</div>
        </div>
      );
    }

    return (
      <div className="health-status-container glass-inset" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className={`health-badge ${healthData.status}`} style={{
          padding: '12px 24px',
          borderRadius: '12px',
          backgroundColor: healthData.status === 'healthy' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 152, 0, 0.2)',
          border: `1px solid ${healthData.status === 'healthy' ? '#4caf50' : '#ff9800'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '1.2rem',
          fontWeight: 'bold'
        }}>
          <span className="health-icon">
            <UiIconSvg name={healthData.status === 'healthy' ? 'check' : 'warning'} />
          </span>
          <span className="health-text" style={{ color: healthData.status === 'healthy' ? '#81c784' : '#ffb74d' }}>
            {healthData.status === 'healthy' ? '电池状况良好' : '电池异常 (需关注)'}
          </span>
        </div>

        <div className="health-metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="health-metric-card glass" style={{ padding: '15px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <div className="metric-label" style={{ fontSize: '0.8rem', opacity: 0.6 }}>平均电压</div>
            <div className="metric-value" style={{ fontSize: '1.4rem', fontWeight: 600 }}>{healthData.avgVoltage.toFixed(4)} V</div>
          </div>
          <div className="health-metric-card glass" style={{ padding: '15px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)' }}>
            <div className="metric-label" style={{ fontSize: '0.8rem', opacity: 0.6 }}>电压偏差</div>
            <div className="metric-value" style={{ fontSize: '1.4rem', fontWeight: 600 }}>{healthData.deviation.toFixed(2)}%</div>
          </div>
        </div>

        {healthData.issues && healthData.issues.length > 0 && (
          <div className="health-issues-section" style={{ marginTop: '10px' }}>
            <div className="issues-title" style={{ fontWeight: 'bold', marginBottom: '10px', color: '#ffb74d' }}>发现的问题:</div>
            <ul className="issues-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {healthData.issues.map((issue: string, idx: number) => (
                <li key={idx} className="issue-item" style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  borderLeft: '3px solid #ff9800'
                }}>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (!isVisible && !selectedNode) return null;

  // 如果不是测量节点，显示占位提示
  if (!isMeasurementNode) {
    return (
      <div className="data-viewer" style={{ padding: 'var(--size-md)' }}>
        <div className="data-viewer__placeholder">
          <div>该节点不支持数据表格</div>
        </div>
      </div>
    );
  }

  const isHealthMode = selectedNode?.config?.check_battery_health;

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
      {/* 数据栏 Tab 切换 (仅在健康检测模式下显示) */}
      {isHealthMode && (
        <div className="data-viewer__tabs">
          <button
            className={`btn btn--sm glass ${viewMode === 'table' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setViewMode('table')}
          >
            数据表格
          </button>
          <button
            className={`btn btn--sm glass ${viewMode === 'health' ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => setViewMode('health')}
          >
            健康状态
          </button>
        </div>
      )}

      {/* 内容区域 - 根据节点类型显示不同的表格 */}
      <div className="data-content-area" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {viewMode === 'health' && isHealthMode ? renderHealthStatus() : (isEisNode ? renderEisTable() : renderIvtTable())}
      </div>
    </div>
  );
};
