/**
 * FurnaceLogPanel — 操作日志面板
 *
 * 从 ConnectionPanel 中抽出的独立组件，只负责渲染日志列表
 */

import React from 'react';
import { SpacedCjkText } from '../common/SpacedCjkText';

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
}

export const FurnaceLogPanel: React.FC<FurnaceLogPanelProps> = ({ logs, onClear, title = '操作日志' }) => {
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
        {logs.length === 0 ? (
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
          </div>
        )}
      </div>
    </div>
  );
};
