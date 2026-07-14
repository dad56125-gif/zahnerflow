import { describe, expect, it } from 'vitest';
import { calculateDisplayedRuntimeSeconds } from './runtimeDisplay';

const state = (overrides: Record<string, unknown> = {}) => ({
  connectionStatus: 'connected',
  executionStatus: 'running',
  accumulatedRunSeconds: 120,
  currentRunStartedAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
  ...overrides,
});

describe('calculateDisplayedRuntimeSeconds', () => {
  it('derives a running display from the backend baseline only', () => {
    expect(calculateDisplayedRuntimeSeconds(state() as never, Date.parse('2026-07-14T00:01:30.000Z'))).toBe(210);
  });

  it('does not continue a paused or stopped business clock', () => {
    const now = Date.parse('2026-07-14T01:00:00.000Z');
    expect(calculateDisplayedRuntimeSeconds(state({ executionStatus: 'paused' }) as never, now)).toBe(120);
    expect(calculateDisplayedRuntimeSeconds(state({ executionStatus: 'stopped' }) as never, now)).toBe(120);
  });

  it('returns zero without a backend runtime snapshot', () => {
    expect(calculateDisplayedRuntimeSeconds(null, Date.now())).toBe(0);
  });
});
