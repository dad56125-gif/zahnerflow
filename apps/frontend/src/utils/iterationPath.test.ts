import { describe, expect, it } from 'vitest';
import type { IterationPathEntry } from '@zahnerflow/types';
import {
  compareIterationKeys,
  formatIterationPath,
  iterationPathFromKey,
  iterationPathKey,
  ROOT_ITERATION_KEY,
} from './iterationPath';

const nestedPath: IterationPathEntry[] = [
  { loopNodeId: 'outer:loop', loopStartIndex: 1, iteration: 2, totalIterations: 3 },
  { loopNodeId: 'inner,loop', loopStartIndex: 4, iteration: 1, totalIterations: 2 },
];

describe('iterationPath', () => {
  it('round-trips nested paths without delimiter collisions', () => {
    const key = iterationPathKey(nestedPath);
    expect(iterationPathFromKey(key)).toEqual(nestedPath);
  });

  it('uses one explicit root key', () => {
    expect(iterationPathKey([])).toBe(ROOT_ITERATION_KEY);
    expect(iterationPathFromKey(ROOT_ITERATION_KEY)).toEqual([]);
  });

  it('formats the backend one-based iteration value', () => {
    expect(formatIterationPath(nestedPath)).toBe('第2轮 / 第1轮');
    expect(formatIterationPath([])).toBe('-');
  });

  it('sorts nested iterations by outer then inner iteration', () => {
    const paths: IterationPathEntry[][] = [
      [{ ...nestedPath[0], iteration: 2 }, { ...nestedPath[1], iteration: 1 }],
      [{ ...nestedPath[0], iteration: 1 }, { ...nestedPath[1], iteration: 2 }],
      [{ ...nestedPath[0], iteration: 1 }, { ...nestedPath[1], iteration: 1 }],
    ];
    const keys = paths.map(iterationPathKey).sort(compareIterationKeys);
    expect(keys.map(iterationPathFromKey).map(path => path.map(entry => entry.iteration))).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });
});
