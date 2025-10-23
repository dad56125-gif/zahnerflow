/**
 * 日志管理Hook
 */

import { useState, useCallback } from 'react';
import { LogEntry, OperationLog, CommLog } from '../../../types/devices';

export interface FurnaceLogsData {
  logs: LogEntry[];
}

export interface FurnaceLogsControls {
  addLog: (log: LogEntry) => void;
  addOperationLog: (level: 'success' | 'info' | 'warning' | 'error', message: string) => void;
  addCommLogs: (commLogs: CommLog[]) => void;
  clearLogs: () => void;
  resetLogs: () => void;
}

export function useFurnaceLogs(maxLogs: number = 500): [FurnaceLogsData, FurnaceLogsControls] {
  const [state, setState] = useState<FurnaceLogsData>({
    logs: [],
  });

  const addLog = useCallback((log: LogEntry) => {
    setState(prev => ({
      logs: [...prev.logs, log].slice(-maxLogs)
    }));
  }, [maxLogs]);

  const addOperationLog = useCallback((
    level: 'success' | 'info' | 'warning' | 'error',
    message: string
  ): void => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry: LogEntry = {
      id: Date.now().toString(),
      timestamp,
      type: 'operation',
      data: {
        timestamp,
        level,
        message
      } as OperationLog
    };

    setState(prev => ({
      logs: [...prev.logs, logEntry].slice(-maxLogs)
    }));
  }, [maxLogs]);

  const addCommLogs = useCallback((commLogs: CommLog[]) => {
    const commLogEntries: LogEntry[] = commLogs.map((log: CommLog) => ({
      id: `comm_${log.timestamp}_${Math.random()}`,
      timestamp: log.timestamp,
      type: 'comm',
      data: log
    }));

    setState(prev => ({
      logs: [...prev.logs, ...commLogEntries]
        .filter((log: LogEntry) => log.type === 'operation' || log.type === 'comm')
        .slice(-maxLogs)
    }));
  }, [maxLogs]);

  const clearLogs = useCallback(() => {
    setState({ logs: [] });
  }, []);

  const resetLogs = useCallback(() => {
    setState({ logs: [] });
  }, []);

  const controls: FurnaceLogsControls = {
    addLog,
    addOperationLog,
    addCommLogs,
    clearLogs,
    resetLogs,
  };

  return [state, controls];
}