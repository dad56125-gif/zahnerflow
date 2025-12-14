import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { useEisData } from '../hooks/useEisData';
import { ExecutionSnapshot } from '../types/Interfaces';

interface NodeChartProps {
  nodeIndex: number;
  nodeConfig: any;
  systemState: ExecutionSnapshot | null;
  nodeType?: string;  // 新增：节点类型
}

// EIS 节点类型
const EIS_NODE_TYPES = ['eis_potentiostatic', 'eis_galvanostatic'];

export const NodeChart: React.FC<NodeChartProps> = ({
  nodeIndex,
  nodeConfig,
  systemState,
  nodeType
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // 判断是否为 EIS 节点
  const isEisNode = nodeType ? EIS_NODE_TYPES.includes(nodeType) : false;

  // IVT 数据（非 EIS 节点使用）
  const historyRef = useRef<{
    voltage: [number, number][];
    current: [number, number][];
  }>({ voltage: [], current: [] });

  const [hasData, setHasData] = useState(false);
  const activeExecutionId = systemState?.executionId || null;

  const currentStepIndex = systemState?.currentStep?.index ?? -1;
  const isPending = currentStepIndex < nodeIndex;
  const isRunning = currentStepIndex === nodeIndex && systemState?.status === 'running';

  // IVT 流式数据 Hook
  const { consumeBuffer, getFullHistory } = useMeasurementStream({
    nodeIndex,
    activeExecutionId
  });

  // EIS 数据 Hook
  const { eisData } = useEisData({ nodeIndex });

  const formatPrecision = (value: number) => {
    if (value === 0) return '0';
    if (Math.abs(value) < 0.001 || Math.abs(value) > 1000) {
      return value.toExponential(1);
    }
    return value.toFixed(2);
  };

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 根据节点类型选择图表配置
    const option = isEisNode ? getEisChartOption() : getIvtChartOption();
    chartInstance.current.setOption(option, true);

    // IVT 历史数据恢复
    if (!isEisNode) {
      const history = getFullHistory();
      if (history.length > 0) {
        setHasData(true);
        const vData = history.map(p => [p.t, p.v] as [number, number]);
        const iData = history.map(p => [p.t, p.i] as [number, number]);
        historyRef.current = { voltage: vData, current: iData };
        chartInstance.current.setOption({
          series: [{ data: vData }, { data: iData }]
        });
      }
    }

    const resizeHandler = () => chartInstance.current?.resize();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, [isEisNode]);

  // IVT 图表配置
  const getIvtChartOption = () => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#777',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: any[]) => {
        if (!params.length) return '';
        const t = params[0].value[0];
        let html = `T: ${parseFloat(t).toFixed(2)}s<br/>`;
        params.forEach(p => {
          const unit = p.seriesName === 'Voltage' ? 'V' : 'A';
          html += `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:8px;height:8px;background-color:${p.color};"></span>`;
          html += `${p.seriesName}: ${formatPrecision(p.value[1])}${unit}<br/>`;
        });
        return html;
      }
    },
    animation: false,
    grid: { top: 35, bottom: 25, left: 5, right: 5, containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { show: false },
      axisLabel: { color: '#888', fontSize: 10 },
      axisLine: { lineStyle: { color: '#444' } }
    },
    yAxis: [
      {
        type: 'value',
        name: 'V',
        position: 'left',
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#40a9ff' } },
        axisLabel: { color: '#40a9ff', fontSize: 10, formatter: formatPrecision, margin: 4 },
        nameTextStyle: { color: '#40a9ff', fontWeight: 'bold', align: 'left', padding: [0, 0, 0, -5] },
        splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(64, 169, 255, 0.15)' } }
      },
      {
        type: 'value',
        name: 'A',
        position: 'right',
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#fa8c16' } },
        axisLabel: { color: '#fa8c16', fontSize: 10, formatter: formatPrecision, margin: 4 },
        nameTextStyle: { color: '#fa8c16', fontWeight: 'bold', align: 'right', padding: [0, 0, 0, 5] },
        splitLine: { show: false }
      }
    ],
    series: [
      { name: 'Voltage', type: 'line', yAxisIndex: 0, showSymbol: false, itemStyle: { color: '#40a9ff' }, data: [] },
      { name: 'Current', type: 'line', yAxisIndex: 1, showSymbol: false, itemStyle: { color: '#fa8c16' }, data: [] }
    ]
  });

  // EIS Nyquist 图表配置
  const getEisChartOption = () => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderColor: '#777',
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params: any) => {
        if (!params.data) return '';
        const [zReal, zImag, freq] = params.data;
        return `f: ${freq.toExponential(2)} Hz<br/>Z': ${zReal.toExponential(3)} Ω<br/>-Z'': ${(-zImag).toExponential(3)} Ω`;
      }
    },
    animation: false,
    grid: { top: 40, bottom: 35, left: 10, right: 10, containLabel: true },
    xAxis: {
      type: 'value',
      name: "Z' (Ω)",
      nameLocation: 'center',
      nameGap: 25,
      nameTextStyle: { color: '#52c41a', fontWeight: 'bold' },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(82, 196, 26, 0.15)' } },
      axisLabel: { color: '#52c41a', fontSize: 10, formatter: formatPrecision },
      axisLine: { lineStyle: { color: '#52c41a' } }
    },
    yAxis: {
      type: 'value',
      name: "-Z'' (Ω)",
      nameLocation: 'center',
      nameGap: 35,
      nameTextStyle: { color: '#52c41a', fontWeight: 'bold' },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(82, 196, 26, 0.15)' } },
      axisLabel: { color: '#52c41a', fontSize: 10, formatter: formatPrecision },
      axisLine: { show: true, lineStyle: { color: '#52c41a' } }
    },
    series: [{
      name: 'Nyquist',
      type: 'scatter',
      symbolSize: 6,
      itemStyle: { color: '#52c41a' },
      data: []
    }]
  });

  // IVT 数据流式更新
  useEffect(() => {
    if (isEisNode) return;  // EIS 节点不使用流式更新

    const chunk = consumeBuffer();
    if (chunk.length === 0) return;
    if (!hasData) setHasData(true);
    const newV = chunk.map(p => [p.t, p.v] as [number, number]);
    const newI = chunk.map(p => [p.t, p.i] as [number, number]);
    historyRef.current.voltage.push(...newV);
    historyRef.current.current.push(...newI);
    chartInstance.current?.setOption({
      series: [
        { data: historyRef.current.voltage },
        { data: historyRef.current.current }
      ]
    });
  }, [consumeBuffer, hasData, isEisNode]);

  // EIS 数据一次性绘制
  useEffect(() => {
    if (!isEisNode || !eisData || !chartInstance.current) return;

    console.log(`[NodeChart] Rendering Nyquist plot: ${eisData.pointCount} points`);
    setHasData(true);

    // Nyquist 图数据格式: [Z', -Z'', frequency]
    const nyquistData = eisData.points.map(p => [p.zReal, -p.zImag, p.frequency]);

    chartInstance.current.setOption({
      series: [{ data: nyquistData }]
    });
  }, [eisData, isEisNode]);

  // IVT 清理逻辑（新运行时重置）
  useEffect(() => {
    if (isEisNode) return;  // EIS 不需要此逻辑
    if (!activeExecutionId) return;  // 运行结束时保留图表

    console.log(`[NodeChart] New run, resetting IVT chart (Node ${nodeIndex})`);
    historyRef.current = { voltage: [], current: [] };
    setHasData(false);
    chartInstance.current?.setOption({ series: [{ data: [] }, { data: [] }] });
  }, [activeExecutionId, isEisNode]);

  const getStatusTag = () => {
    if (isPending) return <span style={{ color: '#faad14' }}>⏳ 等待</span>;
    if (isRunning) return <span style={{ color: '#52c41a', fontWeight: 'bold' }}>▶ 测量中</span>;
    if (currentStepIndex > nodeIndex) return <span style={{ color: '#1890ff' }}>✅ 完成</span>;
    return null;
  };

  const getChartTypeLabel = () => {
    return isEisNode ? 'Nyquist' : 'I-V-T';
  };

  return (
    <div
      className="glass"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        padding: '10px 8px',
        marginBottom: 12,
        background: 'rgba(255, 255, 255, 0.02)',
        color: '#eee',
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
        <strong style={{ color: '#fff', fontSize: '13px' }}>
          步骤{nodeIndex + 1}: {nodeConfig.name}
          <span style={{ marginLeft: 8, fontSize: '11px', color: isEisNode ? '#52c41a' : '#40a9ff', fontWeight: 'normal' }}>
            [{getChartTypeLabel()}]
          </span>
        </strong>
        <div style={{ fontSize: 12 }}>{getStatusTag()}</div>
      </div>

      <div
        ref={chartRef}
        style={{
          height: 220,
          width: '100%',
          opacity: (isPending && !hasData) ? 0.5 : 1
        }}
      />

      {!hasData && isPending && (
        <div style={{
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.3)',
          position: 'absolute',
          top: '55%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          fontSize: '12px'
        }}>
          {isEisNode ? '等待 EIS 数据...' : '等待数据...'}
        </div>
      )}
    </div>
  );
};
