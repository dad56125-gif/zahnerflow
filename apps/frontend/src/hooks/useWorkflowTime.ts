import { useEffect, useMemo, useState } from 'react';
import type { ExecutionSnapshot, WorkflowEtaEstimate, WorkflowNode } from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import { workflowTimeState } from '../state/workflowTimeModel';

// 只在 App 挂载一次；所有时间显示消费这份结果，不自行请求或启动计时器。
export function useWorkflowTime(
  nodes: WorkflowNode[],
  snapshot: ExecutionSnapshot | null,
  suppressPlannedEstimate: boolean,
  autoStartupConfig: Record<string, unknown>,
  temperatureRevision: string,
) {
  const [now, setNow] = useState(Date.now);
  const [result, setResult] = useState<{ key: string; estimate: WorkflowEtaEstimate | null; failed: boolean } | null>(null);
  const requestKey = useMemo(() => JSON.stringify({ nodes, autoStartupConfig }), [nodes, autoStartupConfig]);
  const canEstimate = !suppressPlannedEstimate && (!snapshot || snapshot.status === 'idle') && nodes.length > 0;
  const deviceKey = nodes.some(node => node.type === 'change_temperature' || node.type === 'workflow_block') ? temperatureRevision : '';
  const resultKey = requestKey + deviceKey;

  useEffect(() => {
    if (!canEstimate) { setResult(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const estimate = await runtimeClient.executions.estimate<WorkflowEtaEstimate>(JSON.parse(requestKey));
        if (!cancelled) setResult({ key: resultKey, estimate, failed: false });
      } catch {
        if (!cancelled) setResult({ key: resultKey, estimate: null, failed: true });
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [canEstimate, requestKey, resultKey]);

  useEffect(() => {
    setNow(Date.now());
    if (!canEstimate && (!snapshot || !['running', 'paused', 'cancelling'].includes(snapshot.status))) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot, canEstimate, result?.key]);

  const current = canEstimate && result?.key === resultKey ? result : null;
  return workflowTimeState(snapshot, current?.estimate ?? null, current?.failed ?? false, now);
}
