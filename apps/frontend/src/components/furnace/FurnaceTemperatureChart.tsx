import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import type { FurnaceSampleWithTimestamp } from '../../modules/furnace/furnaceTypes';
import { useAppStore } from '../../state/appStore';

interface TemperatureChartProps {
  data: FurnaceSampleWithTimestamp[];
  is_loading?: boolean;
  on_refresh?: () => void;
  xDomainStart?: string | number;
  xDomainEnd?: string | number;
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

const parseDomainTime = (value?: string | number): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const ts = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
};

const timeToX = (timestamp: number, minTime: number, maxTime: number, chartWidth: number): number => {
  const timeRange = maxTime - minTime;
  if (timeRange <= 0) return chartWidth;
  return ((timestamp - minTime) / timeRange) * chartWidth;
};

const generateTimeMarks = (minTime: number, maxTime: number): number[] => {
  const timeRange = maxTime - minTime;
  if (timeRange <= 0) return [minTime];
  return [0, 0.25, 0.5, 0.75, 1].map(relative => minTime + timeRange * relative);
};

const xToTime = (x: number, minTime: number, maxTime: number, chartWidth: number): number => {
  if (chartWidth <= 0) return maxTime;
  return minTime + (x / chartWidth) * (maxTime - minTime);
};

/** 数据点类型 */
interface DataPoint {
  ts: number;
  pv: number | null;
  sv: number | null;
  mv: number | null;
  segment?: number;
  segmentTime?: number;
  segmentTimeSet?: number;
}

/**
 * 查找最接近指定时间的数据点
 */
const findNearestPoint = (data: DataPoint[], targetTime: number, maxDistance: number): DataPoint | null => {
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

  return minDist <= maxDistance ? nearest : null;
};

const calculateGapThreshold = (data: DataPoint[], timeRange: number): number => {
  const deltas = data
    .slice(1)
    .map((point, index) => point.ts - data[index].ts)
    .filter(delta => Number.isFinite(delta) && delta > 0)
    .sort((a, b) => a - b);
  const medianDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
  return Math.max(5 * 60 * 1000, timeRange / 1000, medianDelta * 8);
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
  xDomainStart,
  xDomainEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const theme = useAppStore(state => state.theme);

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
    gapThreshold: number;
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
          segmentTime: (sample as any).segmentTime,
          segmentTimeSet: (sample as any).segmentTimeSet,
        };
      })
      .filter((item) => Number.isFinite(item.ts))
      .sort((a, b) => a.ts - b.ts);
  }, [data]);

  // 降采样数据（用于 Canvas 绘制，但保持完整时间范围）
  const displayData = useMemo(() => {
    return downsample(processedData, MAX_DISPLAY_POINTS);
  }, [processedData]);

  // Canvas 绘制
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 动态提取主题 CSS 变量颜色
    const getCssVariable = (varName: string, defaultValue: string) => {
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || defaultValue;
    };

    const resolveCssFontSize = (varName: string, defaultValue: string) => {
      const probe = document.createElement('span');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.fontSize = `var(${varName})`;
      document.body.appendChild(probe);
      const fontSize = window.getComputedStyle(probe).fontSize;
      probe.remove();
      return fontSize || defaultValue;
    };

    const gridColor = 'rgba(255, 255, 255, 0.1)';
    const textColor = getCssVariable('--text-secondary', 'rgba(255, 255, 255, 0.62)');
    const axisFontSize = resolveCssFontSize('--size-md', '14px');
    const axisFontFamily = getCssVariable('--font-ui', '"Oxanium", "Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif');
    const axisFont = `760 ${axisFontSize} ${axisFontFamily}`;

    // 获取设备像素比
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // 设置 Canvas 实际尺寸
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 14, right: 32, bottom: 30, left: 54 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    if (displayData.length === 0) {
      // 无数据提示
      ctx.fillStyle = textColor;
      ctx.font = `760 12px ${axisFontFamily}`;
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
    const domainStart = parseDomainTime(xDomainStart);
    const domainEnd = parseDomainTime(xDomainEnd);
    const minTime = domainStart ?? processedData[0].ts;
    const maxTime = domainEnd ?? processedData[processedData.length - 1].ts;
    const timeRange = maxTime - minTime || 1;
    const valueRange = maxValue - minValue || 1;
    const gapThreshold = Math.max(
      calculateGapThreshold(processedData, timeRange),
      (timeRange / MAX_DISPLAY_POINTS) * 2
    );

    // 绘制网格线
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // 水平网格线 (5条)
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.globalAlpha = i === 0 || i === 4 ? 0.7 : 0.45;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Y轴刻度值
      const value = maxValue - (valueRange / 4) * i;
      ctx.fillStyle = textColor;
      ctx.font = axisFont;
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(0), padding.left - 9, y + 4);
    }

    // X轴时间刻度使用查询范围的线性时间轴。
    const timeFormatter = new Intl.DateTimeFormat('zh-CN', timeRange > 24 * 60 * 60 * 1000
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const timeMarks = generateTimeMarks(minTime, maxTime);
    for (const time of timeMarks) {
      const x = padding.left + timeToX(time, minTime, maxTime, chartWidth);

      // 垂直网格线
      ctx.strokeStyle = gridColor;
      ctx.globalAlpha = time === minTime || time === maxTime ? 0.62 : 0.36;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // X轴时间标签
      ctx.fillStyle = textColor;
      ctx.font = axisFont;
      ctx.textAlign = 'center';
      ctx.fillText(timeFormatter.format(time), x, height - 7);
    }

    // 绘制折线的辅助函数
    const drawLine = (
      key: 'pv' | 'sv' | 'mv',
      color: string
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();

      let started = false;
      let previousPoint: DataPoint | null = null;
      displayData.forEach((point) => {
        const value = point[key];
        if (value === null) return;

        const x = padding.left + timeToX(point.ts, minTime, maxTime, chartWidth);
        const y = padding.top + ((maxValue - value) / valueRange) * chartHeight;

        if (!started || (previousPoint && point.ts - previousPoint.ts > gapThreshold)) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        previousPoint = point;
      });

      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // 绘制三条线
    drawLine('pv', CHART_COLORS.pv);
    drawLine('sv', CHART_COLORS.sv);
    // MV 使用不同的比例 (0-100%)
    const mvData = displayData.filter(d => d.mv !== null);
    if (mvData.length > 0) {
      ctx.strokeStyle = CHART_COLORS.mv;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 2]);
      ctx.shadowColor = CHART_COLORS.mv;
      ctx.shadowBlur = 3;
      ctx.beginPath();

      let started = false;
      let previousPoint: DataPoint | null = null;
      mvData.forEach((point) => {
        if (point.mv === null) return;
        const x = padding.left + timeToX(point.ts, minTime, maxTime, chartWidth);
        // MV 范围 0-100%，映射到图表高度
        const y = padding.top + ((100 - point.mv) / 100) * chartHeight;

        if (!started || (previousPoint && point.ts - previousPoint.ts > gapThreshold)) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        previousPoint = point;
      });

      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }

    // 存储图表参数供事件处理使用
    chartParamsRef.current = { padding, chartWidth, chartHeight, minTime, maxTime, gapThreshold };
  }, [displayData, processedData, theme, xDomainStart, xDomainEnd]);

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
    const { padding, chartWidth, minTime, maxTime, gapThreshold } = params;
    if (mouseX < padding.left || mouseX > padding.left + chartWidth) {
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    // 计算对应的时间
    const relativeX = mouseX - padding.left;
    const targetTime = xToTime(relativeX, minTime, maxTime, chartWidth);

    // 查找最近的数据点
    const nearestPoint = findNearestPoint(displayData, targetTime, gapThreshold / 2);
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
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="temperature-chart">

      {/* Canvas 图表 */}
      <div
        className="chart__main"
        ref={chartContainerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          className="chart__canvas"
          style={{ width: '100%', height: '100%' }}
        />

        {is_loading && (
          <div className="chart__loading">
            <div className="loading-spinner" />
            <span className="loading__text">数据加载中...</span>
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
              className="chart__tooltip"
              style={{ left: leftPos, top: tooltip.y - 80 }}
            >
              <div className="tooltip__time">{formatTime(tooltip.point.ts)}</div>
              <div className="tooltip__row" style={{ color: CHART_COLORS.pv }}>
                PV: {tooltip.point.pv?.toFixed(1) ?? 'N/A'}°C
              </div>
              <div className="tooltip__row" style={{ color: CHART_COLORS.sv }}>
                SV: {tooltip.point.sv?.toFixed(1) ?? 'N/A'}°C
              </div>
              <div className="tooltip__row" style={{ color: CHART_COLORS.mv }}>
                MV: {tooltip.point.mv?.toFixed(1) ?? 'N/A'}%
              </div>
              {tooltip.point.segment !== undefined && (
                <div className="tooltip__segment">
                  段 {tooltip.point.segment}: {tooltip.point.segmentTime ?? 0}min / {tooltip.point.segmentTimeSet ?? 0}min
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
