import React from 'react';

export interface DeviceDiagnostics {
  mode?: string | null;
  profile?: string | null;
  lastCommand?: string | null;
  lastError?: string | null;
  lastScanRange?: string | null;
  lastSuccessfulAddress?: number | string | null;
}

export interface CommandLogEntry {
  timestamp: string;
  direction: string;
  data: string;
  connection_id?: string | null;
  connectionId?: string | null;
  error?: string | null;
}

interface DeviceDiagnosticsPanelProps {
  diagnostics?: DeviceDiagnostics | null;
  commandLogs?: CommandLogEntry[];
  onRefreshLogs?: () => void;
  onClearLogs?: () => void;
}

const labelMode = (mode?: string | null) => {
  if (mode === 'simulator') return '模拟器';
  if (mode === 'real') return '真实设备';
  if (mode === 'disconnected') return '未连接';
  return mode || '-';
};

export const DeviceDiagnosticsPanel: React.FC<DeviceDiagnosticsPanelProps> = ({
  diagnostics,
  commandLogs = [],
  onRefreshLogs,
  onClearLogs,
}) => {
  const rows = [
    ['模式', labelMode(diagnostics?.mode)],
    ['模拟场景', diagnostics?.profile || '-'],
    ['最后命令', diagnostics?.lastCommand || '-'],
    ['最后错误', diagnostics?.lastError || '-'],
    ['扫描范围', diagnostics?.lastScanRange || '-'],
    ['最后发现地址', diagnostics?.lastSuccessfulAddress ?? '-'],
  ];

  return (
    <div className="console">
      <div className="console__header">
        <h4>设备诊断</h4>
        <div className="console__controls">
          {onRefreshLogs && (
            <button className="btn btn--sm btn--secondary" onClick={onRefreshLogs}>
              刷新
            </button>
          )}
          {onClearLogs && (
            <button className="btn btn--sm btn--secondary" onClick={onClearLogs}>
              清空
            </button>
          )}
        </div>
      </div>
      <div className="console__content">
        <div className="log-list">
          {rows.map(([label, value]) => (
            <div key={label} className={`console__log ${label === '最后错误' && value !== '-' ? 'error' : 'info'}`}>
              <span className="log-timestamp">{label}</span>
              <span className="log-message">{String(value)}</span>
            </div>
          ))}
        </div>
        <div className="log-list">
          {commandLogs.length === 0 ? (
            <div className="console__log info">
              <span className="log-message">暂无命令记录</span>
            </div>
          ) : (
            commandLogs.slice(0, 20).map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={`console__log ${log.error ? 'error' : 'info'}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">
                  [{log.direction}] {log.data}
                  {log.error ? ` - ${log.error}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
