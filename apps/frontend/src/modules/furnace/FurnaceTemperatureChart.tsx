import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import type { FurnaceSampleWithTimestamp } from './furnaceTypes';

interface TemperatureChartProps {
  data: FurnaceSampleWithTimestamp[];
  is_loading?: boolean;
  on_refresh?: () => void;
}

// 图表颜色配置
const CHART_COLORS = {
  pv: '#ef4444', // 红色 - 实际温度
  sv: '#3b82f6', // 蓝色 - 设定温度
  mv: '#10b981', // 绿色 - 输出功率
  grid: 'rgba(255, 255, 255, 0.08)',
  text: 'rgba(255, 255, 255, 0.7)',
};

// 最大显示点数
const MAX_DISPLAY_POINTS = 200;

// 降采样处理
const downsample = <T,>(data: T[], maxPoints: number): T[] => {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
};

// 格式化数值
const formatValue = (value: number | null, fractionDigits = 1): string => {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return value.toFixed(fractionDigits);
};

// Log 时间轴映射：近期数据占更大空间
const LOG_K = 10;  // 控制曲线程度，k 越大近期越密集

/**
 * 将时间戳映射到 X 坐标（Log 映射）
 * @param timestamp 时间戳
 * @param minTime 最小时间
 * @param maxTime 最大时间
 * @param chartWidth 图表宽度
 * @returns X 坐标
 */
const timeToLogX = (timestamp: number, minTime: number, maxTime: number, chartWidth: number): number => {
  const timeRange = maxTime - minTime;
  if (timeRange <= 0) return chartWidth;

  // 计算相对位置（0 = 最旧，1 = 最新）
  const relativePos = (timestamp - minTime) / timeRange;

  // Log 映射：近期数据占更大空间
  // 使用 1 - log(1 + (1 - relativePos) * k) / log(1 + k) 的形式
  const logPos = 1 - Math.log(1 + (1 - relativePos) * LOG_K) / Math.log(1 + LOG_K);

  return logPos * chartWidth;
};

/**
 * 生成非均匀时间刻度
 * @param minTime 最小时间
 * @param maxTime 最大时间
 * @returns 刻度时间点数组
 */
const generateLogTimeMarks = (minTime: number, maxTime: number): number[] => {
  const marks: number[] = [maxTime]; // 最新时间
  const timeRange = maxTime - minTime;

  // 定义相对刻度位置（从最新往前）
  const relativeMarks = [0, 0.1, 0.3, 0.6, 1.0]; // 对应 0%, 10%, 30%, 60%, 100% 的时间范围

  for (const rel of relativeMarks) {
    if (rel > 0) {
      marks.push(maxTime - timeRange * rel);
    }
  }

  return marks.filter(t => t >= minTime).sort((a, b) => a - b);
};

/**
 * 反向 Log 映射：从 X 坐标计算时间戳
 */
const logXToTime = (x: number, minTime: number, maxTime: number, chartWidth: number): number => {
  if (chartWidth <= 0) return maxTime;
  const logPos = x / chartWidth;
  // 反向 Log 映射
  const relativePos = 1 - (Math.pow(1 + LOG_K, 1 - logPos) - 1) / LOG_K;
  return minTime + relativePos * (maxTime - minTime);
};

/** 数据点类型 */
interface DataPoint {
  ts: number;
  pv: number | null;
  sv: number | null;
  mv: number | null;
  segment?: number;
  segment_time?: number;
  segment_time_set?: number;
}

/**
 * 查找最接近指定时间的数据点
 */
const findNearestPoint = (data: DataPoint[], targetTime: number): DataPoint | null => {
  if (data.length === 0) return null;

  let nearest = data[0];
  let minDist = Math.abs(data[0].ts - targetTime);

  for (const point of data) {
    const dist = Math.abs(point.ts - targetTime);
    if (dist < minDist) {
      minDist = dist;
      nearest = point;
    }
  }

  return nearest;
};

/** Tooltip 状态类型 */
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  point: DataPoint | null;
}

export const TemperatureChart: React.FC<TemperatureChartProps> = ({
  data,
  is_loading = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Tooltip 状态
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    point: null,
  });

  // 存储图表参数供事件处理使用
  const chartParamsRef = useRef<{
    padding: { top: number; right: number; bottom: number; left: number };
    chartWidth: number;
    chartHeight: number;
    minTime: number;
    maxTime: number;
  } | null>(null);
  // 处理完整数据（用于计算时间范围）
  const processedData = useMemo(() => {
    return data
      .map((sample) => {
        const ts = typeof sample.timestamp === 'number'
          ? sample.timestamp
          : Date.parse(sample.timestamp as any);
        return {
          ts: Number.isFinite(ts) ? ts : Date.now(),
          pv: typeof sample.temperature === 'number' && Number.isFinite(sample.temperature)
            ? sample.temperature : null,
          sv: typeof sample.sv === 'number' && Number.isFinite(sample.sv)
            ? sample.sv : null,
          mv: typeof sample.mv === 'number' && Number.isFinite(sample.mv)
            ? sample.mv : null,
          segment: sample.segment,
          segment_time: (sample as any).segment_time,
          segment_time_set: (sample as any).segment_time_set,
        };
      })
      .filter((item) => Number.isFinite(item.ts))
      .sort((a, b) => a.ts - b.ts);
  }, [data]);

  // 降采样数据（用于 Canvas 绘制，但保持完整时间范围）
  const displayData = useMemo(() => {
    return downsample(processedData, MAX_DISPLAY_POINTS);
  }, [processedData]);

  // 最新数据点（使用完整数据）
  const latestSample = processedData[processedData.length - 1];

  // Canvas 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 获取设备像素比
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // 设置 Canvas 实际尺寸
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 10, right: 40, bottom: 25, left: 45 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    if (displayData.length === 0) {
      // 无数据提示
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', width / 2, height / 2);
      return;
    }

    // 计算数据范围（使用完整数据确保时间范围正确）
    const allValues = processedData
      .flatMap(d => [d.pv, d.sv])
      .filter((v): v is number => v !== null);

    const minValue = allValues.length > 0 ? Math.min(...allValues) - 5 : 0;
    const maxValue = allValues.length > 0 ? Math.max(...allValues) + 5 : 100;
    // 时间范围基于完整数据
    const minTime = processedData[0].ts;
    const maxTime = processedData[processedData.length - 1].ts;
    const timeRange = maxTime - minTime || 1;
    const valueRange = maxValue - minValue || 1;

    // 绘制网格线
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;

    // 水平网格线 (5条)
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y轴刻度值
      const value = maxValue - (valueRange / 4) * i;
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(0), padding.left - 5, y + 3);
    }

    // X轴时间刻度（Log 非均匀刻度）
    const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const timeMarks = generateLogTimeMarks(minTime, maxTime);
    for (const time of timeMarks) {
      const x = padding.left + timeToLogX(time, minTime, maxTime, chartWidth);

      // 垂直网格线
      ctx.strokeStyle = CHART_COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      // X轴时间标签
      ctx.fillStyle = CHART_COLORS.text;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(timeFormatter.format(time), x, height - 5);
    }

    // 绘制折线的辅助函数
    const drawLine = (
      key: 'pv' | 'sv' | 'mv',
      color: string
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      let started = false;
      displayData.forEach((point) => {
        const value = point[key];
        if (value === null) return;

        const x = padding.left + timeToLogX(point.ts, minTime, maxTime, chartWidth);
        const y = padding.top + ((maxValue - value) / valueRange) * chartHeight;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    };

    // 绘制三条线
    drawLine('pv', CHART_COLORS.pv);
    drawLine('sv', CHART_COLORS.sv);
    // MV 使用不同的比例 (0-100%)
    const mvData = displayData.filter(d => d.mv !== null);
    if (mvData.length > 0) {
      ctx.strokeStyle = CHART_COLORS.mv;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();

      let started = false;
      mvData.forEach((point) => {
        if (point.mv === null) return;
        const x = padding.left + timeToLogX(point.ts, minTime, maxTime, chartWidth);
        // MV 范围 0-100%，映射到图表高度
        const y = padding.top + ((100 - point.mv) / 100) * chartHeight;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 存储图表参数供事件处理使用
    chartParamsRef.current = { padding, chartWidth, chartHeight, minTime, maxTime };
  }, [displayData, processedData]);

  // 鼠标移动事件处理
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = chartContainerRef.current;
    const params = chartParamsRef.current;
    if (!container || !params || displayData.length === 0) {
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 检查是否在图表区域内
    const { padding, chartWidth, minTime, maxTime } = params;
    if (mouseX < padding.left || mouseX > padding.left + chartWidth) {
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    // 计算对应的时间
    const relativeX = mouseX - padding.left;
    const targetTime = logXToTime(relativeX, minTime, maxTime, chartWidth);

    // 查找最近的数据点
    const nearestPoint = findNearestPoint(displayData, targetTime);
    if (nearestPoint) {
      setTooltip({
        visible: true,
        x: mouseX,
        y: mouseY,
        point: nearestPoint,
      });
    }
  }, [displayData]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  // 时间格式化
  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="temperature-chart">

      {/* Canvas 图表 */}
      <div
        className="chart-main"
        ref={chartContainerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="chart-canvas"
          style={{ width: '100%', height: '100%' }}
        />

        {is_loading && (
          <div className="chart-loading">
            <div className="loading-spinner" />
            <span className="loading-text">数据加载中...</span>
          </div>
        )}

        {/* Tooltip */}
        {tooltip.visible && tooltip.point && (() => {
          const containerWidth = chartContainerRef.current?.clientWidth ?? 0;
          const tooltipWidth = 150; // 估算 tooltip 宽度
          const isNearRight = tooltip.x + tooltipWidth + 20 > containerWidth;
          const leftPos = isNearRight ? tooltip.x - tooltipWidth - 10 : tooltip.x + 10;
          return (
            <div
              className="chart-tooltip"
              style={{ left: leftPos, top: tooltip.y - 80 }}
            >
              <div className="tooltip-time">{formatTime(tooltip.point.ts)}</div>
              <div className="tooltip-row" style={{ color: CHART_COLORS.pv }}>
                PV: {tooltip.point.pv?.toFixed(1) ?? 'N/A'}°C
              </div>
              <div className="tooltip-row" style={{ color: CHART_COLORS.sv }}>
                SV: {tooltip.point.sv?.toFixed(1) ?? 'N/A'}°C
              </div>
              <div className="tooltip-row" style={{ color: CHART_COLORS.mv }}>
                MV: {tooltip.point.mv?.toFixed(1) ?? 'N/A'}%
              </div>
              {tooltip.point.segment !== undefined && (
                <div className="tooltip-segment">
                  段 {tooltip.point.segment}: {tooltip.point.segment_time ?? 0}min / {tooltip.point.segment_time_set ?? 0}min
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default TemperatureChart;
