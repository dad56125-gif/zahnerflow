import { describe, expect, it, vi } from 'vitest';
import type { ExecutionSnapshot } from '@zahnerflow/types';

vi.mock('../runtimeClient', () => ({
  runtimeClient: {},
  runtimeSocket: {
    connectSocket: vi.fn(),
    on: vi.fn(),
  },
}));

import {
  deriveExecutionUiState,
  deriveNodeExecutionUiPhase,
} from './executionStateBridge';

const snapshot = (
  status: ExecutionSnapshot['status'],
  currentIndex: number | null = null,
): ExecutionSnapshot => ({
  status,
  timestamp: '2026-07-10T00:00:00Z',
  currentStep: currentIndex == null ? null : { index: currentIndex, total: 3 },
});

describe('execution UI selectors', () => {
  it('keeps cancelling active and terminal outcomes distinct', () => {
    expect(deriveExecutionUiState(snapshot('cancelling')).isActive).toBe(true);
    expect(deriveExecutionUiState(snapshot('cancelled')).label).toBe('已取消');
    expect(deriveExecutionUiState(snapshot('failed')).label).toBe('执行失败');
  });

  it('derives per-node state from recorded status before index fallback', () => {
    const running = snapshot('paused', 1);

    expect(deriveNodeExecutionUiPhase('running', 1, running)).toBe('paused');
    expect(deriveNodeExecutionUiPhase('failed', 0, running)).toBe('failed');
    expect(deriveNodeExecutionUiPhase(undefined, 0, running)).toBe('completed');
    expect(deriveNodeExecutionUiPhase(undefined, 2, running)).toBe('pending');
  });
});
