import React from 'react';
import { renderCjkText } from '../common/SpacedCjkText';

type DashboardTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export interface DeviceDashboardPanelProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  density?: 'default' | 'compact';
}

export const DeviceDashboardPanel: React.FC<DeviceDashboardPanelProps> = ({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  density = 'default',
}) => (
  <section className={`device-dashboard ${density === 'compact' ? 'device-dashboard--compact' : ''}`}>
    <div className="device-dashboard__header">
      <div className="device-dashboard__heading">
        {eyebrow && <span className="device-dashboard__eyebrow">{eyebrow}</span>}
        <h4 className="device-dashboard__title">{renderCjkText(title)}</h4>
        {subtitle && <span className="device-dashboard__subtitle">{renderCjkText(subtitle)}</span>}
      </div>
      {actions && <div className="device-dashboard__actions">{actions}</div>}
    </div>
    <div className="device-dashboard__body">{children}</div>
  </section>
);

export interface DeviceMetricTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  meta?: React.ReactNode;
  tone?: DashboardTone;
  progressPercent?: number;
}

export const DeviceMetricTile: React.FC<DeviceMetricTileProps> = ({
  label,
  value,
  unit,
  meta,
  tone = 'neutral',
  progressPercent,
}) => (
  <div className={`device-dashboard__metric device-dashboard__metric--${tone}`}>
    <span className="device-dashboard__metric-label">{renderCjkText(label)}</span>
    <span className="device-dashboard__metric-value">
      {value}
      {unit && <span className="device-dashboard__metric-unit">{unit}</span>}
    </span>
    {meta && <span className="device-dashboard__metric-meta">{renderCjkText(meta)}</span>}
    {progressPercent !== undefined && (
      <progress
        className="device-dashboard__metric-progress"
        value={clampPercent(progressPercent)}
        max={100}
      />
    )}
  </div>
);

export interface DeviceMetricGridProps {
  children: React.ReactNode;
  columns?: 'auto' | 'three' | 'four';
}

export const DeviceMetricGrid: React.FC<DeviceMetricGridProps> = ({ children, columns = 'auto' }) => (
  <div className={`device-dashboard__metric-grid device-dashboard__metric-grid--${columns}`}>
    {children}
  </div>
);

export interface DeviceChartTileProps {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}

export const DeviceChartTile: React.FC<DeviceChartTileProps> = ({
  title,
  subtitle,
  legend,
  children,
}) => (
  <div className="device-dashboard__chart-tile">
    <div className="device-dashboard__chart-head">
      <div className="device-dashboard__chart-title-group">
        <span className="device-dashboard__chart-title">{renderCjkText(title)}</span>
        {subtitle && <span className="device-dashboard__chart-subtitle">{renderCjkText(subtitle)}</span>}
      </div>
      {legend && <div className="device-dashboard__chart-legend">{legend}</div>}
    </div>
    <div className="device-dashboard__chart-body">{children}</div>
  </div>
);

export interface DeviceStatusItem {
  label: string;
  value: React.ReactNode;
  tone?: DashboardTone;
}

export interface DeviceStatusRailProps {
  items: DeviceStatusItem[];
}

export const DeviceStatusRail: React.FC<DeviceStatusRailProps> = ({ items }) => (
  <div className="device-dashboard__status-rail">
    {items.map((item) => (
      <div key={item.label} className={`device-dashboard__status-item device-dashboard__status-item--${item.tone || 'neutral'}`}>
        <span className="device-dashboard__status-label">{renderCjkText(item.label)}</span>
        <span className="device-dashboard__status-value">{renderCjkText(item.value)}</span>
      </div>
    ))}
  </div>
);

export interface DeviceLinearGaugeProps {
  label: string;
  value: React.ReactNode;
  percent: number;
  tone?: DashboardTone;
}

export const DeviceLinearGauge: React.FC<DeviceLinearGaugeProps> = ({
  label,
  value,
  percent,
  tone = 'primary',
}) => {
  const clampedPercent = clampPercent(percent);
  return (
    <div
      className={`device-dashboard__gauge device-dashboard__gauge--${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampedPercent)}
    >
      <div className="device-dashboard__gauge-header">
        <span className="device-dashboard__gauge-label">{renderCjkText(label)}</span>
        <span className="device-dashboard__gauge-value">{renderCjkText(value)}</span>
      </div>
      <progress className="device-dashboard__gauge-progress" value={clampedPercent} max={100} />
    </div>
  );
};
