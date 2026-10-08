import React, { useState } from 'react';
import type { RuntimeDiagnosticBundle } from '@zahnerflow/types';
import { runtimeRequest } from '../../runtimeClient';

interface DiagnosticExportButtonProps {
  executionId?: string | null;
  label?: string;
}

export const DiagnosticExportButton: React.FC<DiagnosticExportButtonProps> = ({
  executionId, label = '导出诊断日志',
}) => {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const exportDiagnostics = async () => {
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      const bundle = await runtimeRequest<RuntimeDiagnosticBundle>(
        'GET', '/api/runtime/diagnostics', undefined,
        executionId ? { executionId } : undefined,
      );
      const file = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      const identity = executionId ? executionId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'runtime';
      anchor.download = `ZahnerFlow-diagnostics-${identity}-${bundle.exportedAt.replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('诊断文件已生成');
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? `导出失败：${error.message}` : '诊断日志导出失败');
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="diagnostic-export">
      <button type="button" className="btn btn--sm btn--secondary" onClick={() => void exportDiagnostics()} disabled={pending}>
        {pending ? '正在导出…' : label}
      </button>
      {message && <span className={`diagnostic-export__feedback${failed ? ' diagnostic-export__feedback--error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</span>}
    </span>
  );
};
