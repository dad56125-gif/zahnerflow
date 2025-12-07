import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { useMeasurementStream } from '../hooks/useMeasurementStream';
import { ExecutionSnapshot } from '../types/Interfaces';

interface NodeChartProps {
  nodeIndex: number;       // 我是第几个节点？(从 props 传入)
  nodeId: string;
  nodeConfig: any;         // 节点配置 (如 title, type)
  systemState: ExecutionSnapshot | null; // ✅ 允许为 null
}

export const NodeChart: React.FC<NodeChartProps> = ({
  nodeIndex,
  nodeConfig,
  systemState
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const fullHistoryRef = useRef<{name: string, value: [number, number]}[]>([]);

  // ✅ 新增：控制是否显示图表的状态
  const [hasData, setHasData] = useState(false);

  const activeExecutionId = systemState?.executionId || null;

  const { consumeBuffer, isReceiving } = useMeasurementStream({
    nodeIndex,
    activeExecutionId
  });

  // 1. 初始化与销毁 (仅当 hasData 为 true 时才真正初始化图表)
  useEffect(() => {
    if (!hasData || !chartRef.current) return;

    if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current);
        const option = {
          title: { text: nodeConfig.name || 'Real-time Measurement', left: 'center' },
          tooltip: { trigger: 'axis' },
          grid: { left: 40, right: 20, top: 40, bottom: 30 }, // 调整边距适应小窗口
          xAxis: { type: 'value', name: 't(s)', splitLine: { show: false } },
          yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { type: 'dashed' } } },
          series: [{
            name: 'Data',
            type: 'line',
            showSymbol: false,
            data: fullHistoryRef.current // 初始化时加载已有数据
          }],
          animation: false
        };
        chartInstance.current.setOption(option);
    }

    const resizeHandler = () => chartInstance.current?.resize();
    window.addEventListener('resize', resizeHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      // 注意：这里不 dispose，因为 hasData 变化可能会频繁触发卸载，
      // 可以在组件彻底卸载时 dispose，或者用 useRef 缓存 instance
    };
  }, [hasData]); // 依赖 hasData

  // 2. 清空逻辑
  useEffect(() => {
    fullHistoryRef.current = [];
    setHasData(false); // 重置状态
    chartInstance.current?.clear();
  }, [activeExecutionId]);

  // 3. 数据驱动逻辑
  useEffect(() => {
    const chunk = consumeBuffer();
    if (chunk.length === 0) return;

    // ✅ 一旦有数据进来，标记为有数据
    if (!hasData) setHasData(true);

    const newPoints = chunk.map(p => ({
      name: p.t.toString(),
      value: [p.t, p.i] as [number, number]
    }));

    fullHistoryRef.current.push(...newPoints);

    // 只有当图表实例存在时才更新
    if (chartInstance.current) {
        chartInstance.current.setOption({
            series: [{ data: fullHistoryRef.current }]
        });
    }
  }, [consumeBuffer, hasData]); // 依赖 consumeBuffer (tick)

  // ✅ 计算当前状态：是否该节点正在运行
  const isRunning = systemState?.status === 'running' && systemState?.currentStep?.index === nodeIndex;

  // ✅ 渲染空状态的辅助函数
  const renderEmptyState = () => {
    let message = "等待执行...";
    let subMessage = "数据将在测量开始后显示";
    let icon = "⏳";

    if (systemState?.status === 'running') {
        if (systemState.currentStep && systemState.currentStep.index < nodeIndex) {
            message = "等待中";
            subMessage = `当前步骤: ${systemState.currentStep.index + 1}, 本节点: ${nodeIndex + 1}`;
        } else if (systemState.currentStep && systemState.currentStep.index > nodeIndex) {
             message = "已完成";
             subMessage = "无数据记录或数据已清除";
             icon = "🏁";
        } else {
            message = "正在初始化设备...";
            icon = "🔌";
        }
    }

    return (
        <div style={{
            height: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            border: isRunning ? '2px dashed #52c41a' : '2px dashed #444'
        }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
            <div style={{ fontWeight: 500 }}>{message}</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>{subMessage}</div>
        </div>
    );
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500, fontSize: '14px' }}>实时数据监控</span>
        {isRunning && <span className="tag-running" style={{ color: '#52c41a', fontSize: '12px' }}>● 接收中</span>}
      </div>

      {/* ✅ 条件渲染：有数据才显示 Canvas，否则显示空状态 */}
      {hasData ? (
        <div
            ref={chartRef}
            style={{
                width: '100%',
                height: '300px',
                border: isRunning ? '1px solid #52c41a' : '1px solid transparent',
                borderRadius: '8px'
            }}
        />
      ) : renderEmptyState()}
    </div>
  );
};