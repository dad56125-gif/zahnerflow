import { useCallback, useEffect, useState } from 'react';
import type { WorkflowNode, WorkstationType } from '@zahnerflow/types';
import { runtimeClient, type RuntimeError } from '../runtimeClient';
import { useUser } from '../components/shared/userContextState';
import { useAppStore } from '../state/appStore';
import { useExecutionStore } from '../state/executionStateBridge';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import type { NodeParameters } from '../types/NodeConfiguration';
import type { RunFlowOptions, RunFlowOutcome } from '../types/executionControl';

const RUN_METADATA_CONFIRM_MS = 5000;
type MissingRunMetadataDetails = {
  code?: string;
  missingFields?: string[];
  message?: string;
};

type RunMetadataWarning = {
  message: string;
  expiresAt: number;
};

const RUN_METADATA_FIELD_LABELS: Record<string, string> = {
  ownerName: '用户',
  projectName: '项目名称',
  individualName: '样品名称',
};

function isMissingRunMetadataError(error: unknown): error is RuntimeError & { details: MissingRunMetadataDetails } {
  const details = error && typeof error === 'object' && 'details' in error
    ? (error as RuntimeError).details
    : undefined;
  return Boolean(details && typeof details === 'object' && (details as MissingRunMetadataDetails).code === 'MISSING_RUN_METADATA');
}

function runMetadataWarningMessage(details: MissingRunMetadataDetails): string {
  const fields = Array.isArray(details.missingFields) ? details.missingFields : [];
  const missingText = fields
    .map((field) => RUN_METADATA_FIELD_LABELS[field])
    .filter(Boolean)
    .join('、');
  return missingText
    ? `缺少${missingText}，请填写后再运行。`
    : details.message || '运行信息不完整，请填写后再运行。';
}


interface WorkflowExecutionOptions {
  nodes: WorkflowNode[];
  nodeFingerprint: string;
  executionActive: boolean;
  selectedWorkstation: WorkstationType | null;
  zahnerAutoStartupConfig: NodeParameters;
}

/** 启动校验和请求反馈；执行事实仍由后端和 execution store 持有。 */
export function useWorkflowExecution({ nodes, nodeFingerprint, executionActive, selectedWorkstation, zahnerAutoStartupConfig }: WorkflowExecutionOptions) {
  const { currentUser, filePathConfig } = useUser();
  const startExecution = useExecutionStore(state => state.startExecution);
  const resetExecution = useExecutionStore(state => state.resetExecution);
  const setNotificationPanelOpen = useAppStore(state => state.setNotificationPanelOpen);
  const [blockedWorkflowBlockIds, setBlockedWorkflowBlockIds] = useState<string[]>([]);
  const [runMetadataWarning, setRunMetadataWarning] = useState<RunMetadataWarning | null>(null);
  const workflowBlockRunBlocked = blockedWorkflowBlockIds.length > 0 || nodes.some(node =>
    node.type === 'workflow_block' && !String(node.config?.workflowId || '').trim()
  );
  useEffect(() => {
    const workflowIds = Array.from(new Set(
      nodes
        .filter((node) => node.type === 'workflow_block')
        .map((node) => String(node.config?.workflowId || '').trim())
        .filter(Boolean)
    ));

    if (workflowIds.length === 0) {
      setBlockedWorkflowBlockIds([]);
      return;
    }

    let cancelled = false;
    Promise.all(
      workflowIds.map((workflowId) =>
        runtimeClient.workflows
          .definition<{ id: string; nodes?: WorkflowNode[] }>(workflowId)
          .then((definition) => ({
            workflowId,
            blocked: (definition.nodes || []).some((child) => child.type === 'workflow_block'),
          }))
          .catch(() => ({ workflowId, blocked: true }))
      )
    ).then((results) => {
      if (!cancelled) {
        setBlockedWorkflowBlockIds(results.filter((result) => result.blocked).map((result) => result.workflowId));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nodeFingerprint, nodes]);

  useEffect(() => {
    if (!runMetadataWarning) return;
    const timeout = window.setTimeout(() => {
      setRunMetadataWarning(null);
    }, Math.max(0, runMetadataWarning.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [runMetadataWarning]);

  useEffect(() => {
    setRunMetadataWarning(null);
  }, [nodeFingerprint, currentUser, filePathConfig.projectName, filePathConfig.individualName]);

  // --- 执行控制逻辑 ---
  const runFlow = useCallback(async (options: RunFlowOptions = {}): Promise<RunFlowOutcome> => {
    if (nodes.length === 0 || executionActive || !selectedWorkstation || workflowBlockRunBlocked) {
      setNotificationPanelOpen(true);
      return 'blocked';
    }
    try {
      const workflowStore = useWorkflowStore.getState();

      // 后端按节点 fingerprint 归档，前端只传当前名称建议。
      const draftName = workflowStore.draftWorkflowName;
      const workflowName = draftName?.trim() || `工作流_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;

      if (!draftName) {
        workflowStore.setDraftWorkflowName(workflowName);
      }

      const forceStartWithMissingRunMetadata = !!runMetadataWarning && Date.now() < runMetadataWarning.expiresAt;

      await startExecution({
        nodes,
        ownerName: currentUser || undefined,
        workflowName,
        workstationType: selectedWorkstation,
        autoStartupConfig: zahnerAutoStartupConfig,
        pathConfig: filePathConfig,
        startFromUnrolledIndex: options.startFromUnrolledIndex ?? 0,
        forceStartWithMissingRunMetadata,
      });
      setRunMetadataWarning(null);
      return 'started';
    } catch (error) {
      if (isMissingRunMetadataError(error)) {
        setRunMetadataWarning({
          message: runMetadataWarningMessage(error.details),
          expiresAt: Date.now() + RUN_METADATA_CONFIRM_MS,
        });
        return 'confirmation-required';
      }
      console.error('工作流执行失败:', error);
      setNotificationPanelOpen(true);
      return 'failed';
    }
  }, [
    currentUser,
    filePathConfig,
    executionActive,
    nodes,
    runMetadataWarning,
    selectedWorkstation,
    setNotificationPanelOpen,
    startExecution,
    workflowBlockRunBlocked,
    zahnerAutoStartupConfig,
  ]);


  const resetRun = async () => {
    setRunMetadataWarning(null);
    return resetExecution();
  };
  return { runFlow, resetRun, runMetadataWarning, workflowBlockRunBlocked };
}
