import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  UnrolledWorkflowStep,
  WorkflowNode,
  WorkflowUnrollPreview,
} from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import { UnrollViewModal } from './UnrollViewModal';

vi.mock('../runtimeClient', () => ({
  runtimeClient: {
    executions: {
      unrollPreview: vi.fn(),
    },
  },
}));

const unrollPreviewMock = vi.mocked(runtimeClient.executions.unrollPreview);

const waitNode: WorkflowNode = {
  id: 'wait-node',
  type: 'wait_delay',
  config: { duration: 5 },
};

function step(
  nodeId: string,
  nodeType: string,
  unrolledIndex: number,
  overrides: Partial<UnrolledWorkflowStep> = {},
): UnrolledWorkflowStep {
  return {
    nodeId,
    nodeType,
    originalIndex: 0,
    sourceIndex: 0,
    unrolledIndex,
    unrolledTotal: 3,
    iterationPath: [],
    blockPath: [],
    node: { id: nodeId, type: nodeType, config: {} },
    ...overrides,
  };
}

function preview(steps: UnrolledWorkflowStep[]): WorkflowUnrollPreview {
  return {
    nodeCount: 1,
    steps,
    summary: { totalSteps: steps.length, maxLoopDepth: 0 },
  };
}

describe('UnrollViewModal', () => {
  beforeEach(() => {
    unrollPreviewMock.mockReset();
  });

  it('keeps system boundaries visible and preserves the selected backend index across confirmation', async () => {
    unrollPreviewMock.mockResolvedValue(preview([
      step('__auto_startup', 'startup', 0, { autoBoundary: true }),
      step('wait-node', 'wait_delay', 1, { node: waitNode }),
      step('__auto_shutdown', 'shutdown', 2, { autoBoundary: true }),
    ]));
    const onRunFromStep = vi.fn()
      .mockResolvedValueOnce('confirmation-required')
      .mockResolvedValueOnce('started');
    const onClose = vi.fn();
    const nodes = [waitNode];

    const { rerender } = render(
      <UnrollViewModal
        isOpen
        onClose={onClose}
        nodes={nodes}
        canRunFromStep
        onRunFromStep={onRunFromStep}
      />,
    );

    expect(await screen.findByRole('dialog', { name: '展开所有执行步骤' })).toBeInTheDocument();
    expect(await screen.findByText('自动启动测量程序')).toBeInTheDocument();
    expect(screen.getByText('自动停止测量程序')).toBeInTheDocument();
    expect(screen.getByText('计划 3')).toBeInTheDocument();
    expect(screen.getByText('可选 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /等待/ }));
    fireEvent.click(screen.getByRole('button', { name: '从此步开始运行' }));

    await waitFor(() => expect(onRunFromStep).toHaveBeenCalledWith(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/所选起点已保留/)).toBeInTheDocument();

    rerender(
      <UnrollViewModal
        isOpen
        onClose={onClose}
        nodes={nodes}
        canRunFromStep
        runMetadataWarning="缺少项目名称"
        onRunFromStep={onRunFromStep}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认并从此步运行' }));

    await waitFor(() => expect(onRunFromStep).toHaveBeenLastCalledWith(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('leaves loading immediately when the workflow becomes empty and ignores the old response', async () => {
    let resolveOldRequest: ((value: WorkflowUnrollPreview) => void) | undefined;
    unrollPreviewMock.mockImplementationOnce(() => new Promise<WorkflowUnrollPreview>((resolve) => {
      resolveOldRequest = resolve;
    }));

    const { rerender } = render(
      <UnrollViewModal isOpen onClose={() => undefined} nodes={[waitNode]} />,
    );
    expect(await screen.findByText('正在生成真实执行计划')).toBeInTheDocument();

    rerender(<UnrollViewModal isOpen onClose={() => undefined} nodes={[]} />);
    expect(await screen.findByText('当前画布还没有节点')).toBeInTheDocument();
    expect(screen.queryByText('正在生成真实执行计划')).not.toBeInTheDocument();

    resolveOldRequest?.(preview([step('wait-node', 'wait_delay', 0, { node: waitNode })]));
    await Promise.resolve();
    expect(screen.getByText('当前画布还没有节点')).toBeInTheDocument();
    expect(screen.queryByText('完整执行序列')).not.toBeInTheDocument();
  });

  it('shows planning errors as alerts and retries without closing the modal', async () => {
    unrollPreviewMock
      .mockRejectedValueOnce(new Error('工作流块引用不存在'))
      .mockResolvedValueOnce(preview([step('wait-node', 'wait_delay', 0, { node: waitNode })]));
    const onClose = vi.fn();

    render(<UnrollViewModal isOpen onClose={onClose} nodes={[waitNode]} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('工作流块引用不存在');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByText('完整执行序列')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(unrollPreviewMock).toHaveBeenCalledTimes(2);
  });
});
