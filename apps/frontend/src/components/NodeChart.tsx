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
  
  const historyRef = useRef<{
    voltage: [number, number][];
    current: [number, number][];
  }>({ voltage: [], current: [] });
  
  const [hasData, setHasData] = useState(false);
  const activeExecutionId = systemState?.executionId || null;

  const currentStepIndex = systemState?.currentStep?.index ?? -1;
  const isPending = currentStepIndex < nodeIndex;
  const isRunning = currentStepIndex === nodeIndex && systemState?.status === 'running';

  const { consumeBuffer, getFullHistory } = useMeasurementStream({
    nodeIndex,
    activeExecutionId
  });

  const formatPrecision = (value: number) => {
    if (value === 0) return '0';
    if (Math.abs(value) < 0.001 || Math.abs(value) > 1000) {
      return value.toExponential(1); // 科学计数法保留1位小数，节省空间
    }
    return value.toFixed(2); // 常规数值保留2位小数
  };

  useEffect(() => {
    if (!chartRef.current) return;
    
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);

      const option = {
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
              const color = p.color;
              html += `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:8px;height:8px;background-color:${color};"></span>`;
              html += `${p.seriesName}: ${formatPrecision(p.value[1])}${unit}<br/>`;
            });
            return html;
          }
        },
        animation: false,
        
        // 🔥 修复点 1：Grid 调整
        grid: { 
          top: 35,     // 顶部增加空间，防止 V/A 单位遮挡数值
          bottom: 25, 
          left: 5,     // 保持紧凑
          right: 5,
          containLabel: true // 保持自动计算，确保文字显示全
        },

        xAxis: { 
          type: 'value', 
          splitLine: { show: false },
          axisLabel: { color: '#888', fontSize: 10 },
          axisLine: { lineStyle: { color: '#444' } } // 底部轴线颜色变深一点
        },

        yAxis: [
          {
            type: 'value',
            name: 'V', 
            position: 'left',
            scale: true,
            // 🔥 修复点 2：显示左侧轴线
            axisLine: { 
              show: true,  // ✅ 开启轴线
              lineStyle: { color: '#40a9ff' } // 蓝色轴线
            },
            axisLabel: { 
              color: '#40a9ff', 
              fontSize: 10, 
              formatter: formatPrecision,
              margin: 4 // 文字离线的距离
            },
            nameTextStyle: { 
              color: '#40a9ff', 
              fontWeight: 'bold',
              align: 'left', // 单位名称靠左对齐
              padding: [0, 0, 0, -5] 
            },
            splitLine: { show: true, lineStyle: { type: 'dashed', color: 'rgba(64, 169, 255, 0.15)' } }
          },
          {
            type: 'value',
            name: 'A',
            position: 'right',
            scale: true,
            // 🔥 修复点 3：显示右侧轴线
            axisLine: { 
              show: true,  // ✅ 开启轴线
              lineStyle: { color: '#fa8c16' } // 橙色轴线
            },
            axisLabel: { 
              color: '#fa8c16', 
              fontSize: 10, 
              formatter: formatPrecision,
              margin: 4
            },
            nameTextStyle: { 
              color: '#fa8c16', 
              fontWeight: 'bold',
              align: 'right', // 单位名称靠右对齐
              padding: [0, 0, 0, 5] 
            },
            splitLine: { show: false }
          }
        ],

        series: [
          {
            name: 'Voltage',
            type: 'line',
            yAxisIndex: 0,
            showSymbol: false,
            itemStyle: { color: '#40a9ff' },
            data: []
          },
          {
            name: 'Current',
            type: 'line',
            yAxisIndex: 1,
            showSymbol: false,
            itemStyle: { color: '#fa8c16' },
            data: []
          }
        ]
      };
      
      chartInstance.current.setOption(option);
    }

    // ... (历史数据恢复代码保持不变)
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

    const resizeHandler = () => chartInstance.current?.resize();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // ... (useEffects 保持不变) ...
  useEffect(() => {
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
  }, [consumeBuffer, hasData]);

  // --- 3. 清理逻辑 (核心修改) ---
  useEffect(() => {
    // 🔥 核心修改：如果不判断，executionId 变成 null (停止) 时图表会被清空。
    // 我们加上这个判断：只有当 activeExecutionId 存在（说明开始了新的一轮）时，才清空画布。
    if (!activeExecutionId) {
      // ID 为 null，说明流程结束或重置。
      // 我们什么都不做，让图表保持最后一帧的样子 (固化显示)。
      return;
    }

    // 只有当确认为"新的一轮运行"时，才重置本地图表
    console.log(`[NodeChart] 新运行开始，重置图表 (Node ${nodeIndex})`);
    historyRef.current = { voltage: [], current: [] };
    setHasData(false);
    chartInstance.current?.setOption({ series: [{ data: [] }, { data: [] }] });

  }, [activeExecutionId]); // 依赖项不变

  const getStatusTag = () => {
    if (isPending) return <span style={{color: '#faad14'}}>⏳ 等待</span>;
    if (isRunning) return <span style={{color: '#52c41a', fontWeight: 'bold'}}>▶ 测量中</span>;
    if (currentStepIndex > nodeIndex) return <span style={{color: '#1890ff'}}>✅ 完成</span>;
    return null;
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
        <strong style={{ color: '#fff', fontSize: '13px' }}>步骤{nodeIndex + 1}: {nodeConfig.name}</strong>
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
          等待数据...
        </div>
      )}
    </div>
  );
};