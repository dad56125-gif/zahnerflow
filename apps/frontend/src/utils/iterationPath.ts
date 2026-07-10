import type { IterationPathEntry } from '@zahnerflow/types';

export const ROOT_ITERATION_KEY = 'root';

export function toIterationPath(value: unknown): IterationPathEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is IterationPathEntry => (
    entry != null
    && typeof entry === 'object'
    && typeof entry.loopNodeId === 'string'
    && Number.isInteger(entry.loopStartIndex)
    && Number.isInteger(entry.iteration)
    && Number.isInteger(entry.totalIterations)
  ));
}

export function iterationPathKey(iterationPath: readonly IterationPathEntry[] = []): string {
  if (iterationPath.length === 0) return ROOT_ITERATION_KEY;

  return JSON.stringify(iterationPath.map((entry) => ({
    loopNodeId: entry.loopNodeId,
    loopStartIndex: entry.loopStartIndex,
    iteration: entry.iteration,
    totalIterations: entry.totalIterations,
  })));
}

export function iterationPathFromKey(key: string): IterationPathEntry[] {
  if (!key || key === ROOT_ITERATION_KEY) return [];

  try {
    const parsed = JSON.parse(key);
    return toIterationPath(parsed);
  } catch {
    return [];
  }
}

export function compareIterationPaths(
  left: readonly IterationPathEntry[],
  right: readonly IterationPathEntry[],
): number {
  const depth = Math.min(left.length, right.length);
  for (let index = 0; index < depth; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    const loopOrder = leftEntry.loopStartIndex - rightEntry.loopStartIndex;
    if (loopOrder !== 0) return loopOrder;

    const iterationOrder = leftEntry.iteration - rightEntry.iteration;
    if (iterationOrder !== 0) return iterationOrder;
  }

  return left.length - right.length;
}

export function compareIterationKeys(left: string, right: string): number {
  return compareIterationPaths(iterationPathFromKey(left), iterationPathFromKey(right));
}

export function formatIterationPath(
  iterationPath: readonly IterationPathEntry[] = [],
  emptyLabel = '-',
): string {
  if (iterationPath.length === 0) return emptyLabel;
  return iterationPath.map((entry) => `第${entry.iteration}轮`).join(' / ');
}

export function formatIterationKey(key: string, emptyLabel = '-'): string {
  return formatIterationPath(iterationPathFromKey(key), emptyLabel);
}
