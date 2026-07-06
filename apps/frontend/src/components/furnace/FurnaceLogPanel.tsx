/**
 * FurnaceLogPanel — 操作日志面板
 *
 * 从 ConnectionPanel 中抽出的独立组件，只负责渲染日志列表
 */

import React from 'react';
import { SpacedCjkText } from '../common/SpacedCjkText';
import type { DeviceDiagnostics } from '../common/DeviceDiagnosticsPanel';

interface LogEntry {
  id: string | number;
  type: string;
  timestamp: string;
  message: string;
}

interface FurnaceLogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  title?: string;
  diagnostics?: DeviceDiagnostics | null;
  showDiagnostics?: boolean;
}

const labelMode = (mode?: string | null) => {
  if (mode === 'simulator') return '模拟器';
  if (mode === 'real') return '真实设备';
  if (mode === 'disconnected') return '未连接';
  return mode || '-';
};

export const FurnaceLogPanel: React.FC<FurnaceLogPanelProps> = ({
  logs,
  onClear,
  title = '操作日志',
  diagnostics,
  showDiagnostics = false,
}) => {
  const diagnosticRows = showDiagnostics ? [
    ['模式', labelMode(diagnostics?.mode)],
    ['模拟场景', diagnostics?.profile || '-'],
    ['最后错误', diagnostics?.lastError || '-'],
    ['扫描范围', diagnostics?.lastScanRange || '-'],
    ['最后发现地址', diagnostics?.lastSuccessfulAddress ?? '-'],
  ] : [];
  const hasExtraLogs = diagnosticRows.length > 0;
  const hasAnyLogs = logs.length > 0 || hasExtraLogs;

  return (
    <div className="console">
      <div className="console__header">
        <h4><SpacedCjkText text={title} /></h4>
        <div className="console__controls">
          <button
            onClick={onClear}
            className="btn btn--sm btn--secondary"
            title="清空日志"
          >
            <SpacedCjkText text="清空" />
          </button>
        </div>
      </div>
      <div className="console__content">
        {!hasAnyLogs ? (
          <div className="console__log info">
            <span className="log-message"><SpacedCjkText text="暂无操作记录" /></span>
          </div>
        ) : (
          <div className="log-list">
            {logs.map((log) => (
              <div key={log.id} className={`console__log ${log.type}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">
                  {log.type === 'success' && '✓ '}
                  {log.type === 'error' && '✗ '}
                  {log.type === 'warning' && '⚠ '}
                  {log.message}
                </span>
              </div>
            ))}
            {diagnosticRows.map(([label, value]) => (
              <div key={`diagnostic-${label}`} className={`console__log ${label === '最后错误' && value !== '-' ? 'error' : 'info'}`}>
                <span className="log-timestamp">{label}</span>
                <span className="log-message">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
