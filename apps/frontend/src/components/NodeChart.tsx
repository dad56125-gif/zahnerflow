import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { ExecutionSnapshot } from '../types/Interfaces';

interface NodeChartProps {
  nodeIndex: number;
  nodeConfig: any;
  systemState: ExecutionSnapshot | null;
}

export const NodeChart: React.FC<NodeChartProps> = ({
  nodeIndex,
  nodeConfig,
  systemState
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  // 使用 Ref 存储历史数据，这样即使组件重渲染数据也不会丢
  const fullHistoryRef = useRef<{name: string, value: [number, number]}[]>([]);
  
  // 状态标记
  const [hasData, setHasData] = useState(false);

  const activeExecutionId = systemState?.executionId || null;
  
  // 计算当前节点状态
  const currentStepIndex = systemState?.currentStep?.index ?? -1;
  const isPending = currentStepIndex < nodeIndex;   // 还没轮到我
  const isRunning = currentStepIndex === nodeIndex && systemState?.status === 'running'; // 正在跑
  const isCompleted = currentStepIndex > nodeIndex; // 我已经跑完了 (固化状态)

  // 挂载 Hook
  const { consumeBuffer } = useMeasurementStream({
    nodeIndex,
    activeExecutionId
  });

  // 1. 初始化 ECharts
  useEffect(() => {
    if (!chartRef.current) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
      chartInstance.current.setOption({
        title: { text: nodeConfig.name, left: 'center', textStyle: { fontSize: 14 } },
        tooltip: { trigger: 'axis' },
        animation: false, // 关闭动画以提高实时性能
        grid: { top: 40, bottom: 30, left: 50, right: 20 },
        xAxis: { type: 'value', splitLine: { show: false } },
        yAxis: { type: 'value' },
        series: [{
          type: 'line',
          showSymbol: false,
          data: []
        }]
      });
    }

    const resizeHandler = () => chartInstance.current?.resize();
    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, []);

  // 2. 只有当 activeExecutionId 彻底改变（新的一轮测试）时才清空
  useEffect(() => {
    fullHistoryRef.current = [];
    setHasData(false);
    chartInstance.current?.setOption({ series: [{ data: [] }] });
  }, [activeExecutionId]);

  // 3. 数据消费循环
  useEffect(() => {
    // 从 Hook 获取新数据
    const chunk = consumeBuffer();
    
    // 如果没有新数据（因为还没轮到我，或者我已经跑完了），直接返回
    if (chunk.length === 0) return;

    if (!hasData) setHasData(true);

    // 转换数据格式
    const newPoints = chunk.map(p => ({
      name: p.t.toString(),
      value: [p.t, p.i] as [number, number]
    }));

    // 追加到历史记录
    fullHistoryRef.current.push(...newPoints);

    // 更新图表
    chartInstance.current?.setOption({
      series: [{ data: fullHistoryRef.current }]
    });
    
  }, [consumeBuffer, hasData]); // consumeBuffer 变化意味着有新 tick

  // --- 渲染逻辑 ---

  // 状态标签颜色
  const getStatusTag = () => {
    if (isPending) return <span style={{color: '#faad14'}}>⏳ 等待执行</span>;
    if (isRunning) return <span style={{color: '#52c41a', fontWeight: 'bold'}}>▶ 正在测量...</span>;
    if (isCompleted) return <span style={{color: '#1890ff'}}>✅ 已完成 (数据固化)</span>;
    return null;
  };

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>步骤 {nodeIndex + 1}: {nodeConfig.name}</strong>
        <div style={{ fontSize: 12 }}>{getStatusTag()}</div>
      </div>

      <div 
        ref={chartRef} 
        style={{ 
          height: 250, 
          width: '100%',
          // 如果是等待状态且没数据，可以给一点透明度
          opacity: (isPending && !hasData) ? 0.5 : 1 
        }} 
      />
      
      {!hasData && isPending && (
        <div style={{ textAlign: 'center', color: '#999', marginTop: -150, paddingBottom: 100 }}>
          暂无数据
        </div>
      )}
    </div>
  );
};