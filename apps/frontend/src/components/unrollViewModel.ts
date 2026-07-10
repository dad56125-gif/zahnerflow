import type {
  IterationPathEntry,
  UnrolledWorkflowStep,
  WorkflowUnrollPreview,
} from '@zahnerflow/types';
import {
  formatIterationPath,
  iterationPathKey,
  toIterationPath,
} from '../utils/iterationPath';
import {
  formatPresentationNumber,
  getNodeDisplayName,
  summarizeNodeParameters,
} from '../types/NodeConfiguration';

export type UnrollExplorerGroupKind = 'loop' | 'workflow' | 'advanced';

export interface UnrollBlockPathEntry {
  blockNodeId: string;
  blockWorkflowId: string;
  blockWorkflowName?: string;
  blockOriginalIndex?: number;
}

export interface UnrollAdvancedMeta {
  parentNodeId: string | null;
  parentNodeType: string;
  parentDisplayName: string;
  stepIndex: number | null;
  totalSteps: number | null;
  cycleIndex: number | null;
  stepValue: number | null;
  stepLabel: string;
  cycleLabel: string;
  valueLabel: string;
}

export interface UnrollExplorerRow {
  /** Position in the authoritative preview sequence. */
  position: number;
  /** Stable UI key. The backend unrolled index is always part of the key. */
  key: string;
  /** Original backend step object, kept intact for selection and execution. */
  step: UnrolledWorkflowStep;
  unrolledIndex: number;
  /** One-based display ordinal derived from the backend index, not the array position. */
  ordinal: number;
  displayName: string;
  parameterSummary: string;
  iterationPath: IterationPathEntry[];
  iterationKey: string;
  iterationLabel: string;
  blockPath: UnrollBlockPathEntry[];
  blockKey: string;
  blockLabel: string;
  advancedLabel: string;
  advancedMeta: UnrollAdvancedMeta | null;
  isAutomaticBoundary: boolean;
  isSelectable: boolean;
  searchText: string;
}

export interface UnrollExplorerGroup {
  key: string;
  identityKey: string;
  occurrence: number;
  kind: UnrollExplorerGroupKind;
  title: string;
  meta: string;
  depth: number;
  /** Exact row positions belonging to this group. Automatic boundaries are excluded. */
  memberPositions: number[];
  memberRowKeys: string[];
  firstOrdinal: number;
  lastOrdinal: number;
  stepCount: number;
}

export interface UnrollExplorerModel {
  rows: UnrollExplorerRow[];
  groups: UnrollExplorerGroup[];
  rowByUnrolledIndex: ReadonlyMap<number, UnrollExplorerRow>;
  totalSteps: number;
  selectableStepCount: number;
  automaticBoundaryCount: number;
  maxLoopDepth: number;
}

export type UnrollRenderItem =
  | { kind: 'row'; row: UnrollExplorerRow }
  | {
    kind: 'collapsed';
    group: UnrollExplorerGroup;
    collapseKey: string;
    renderKey: string;
  };

interface GroupSeed {
  identityKey: string;
  kind: UnrollExplorerGroupKind;
  title: string;
  meta: string;
  depth: number;
  memberPositions: number[];
}

const ROOT_BLOCK_KEY = 'root';

const GROUP_KIND_PRIORITY: Record<UnrollExplorerGroupKind, number> = {
  workflow: 0,
  loop: 1,
  advanced: 2,
};

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse the actual blockPath fields emitted by loop_unroller.py. */
export function toUnrollBlockPath(value: unknown): UnrollBlockPathEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const blockNodeId = optionalString(entry.blockNodeId) ?? '';
    const blockWorkflowId = optionalString(entry.blockWorkflowId) ?? '';
    if (!blockNodeId && !blockWorkflowId) return [];

    const blockWorkflowName = optionalString(entry.blockWorkflowName);
    const blockOriginalIndex = optionalInteger(entry.blockOriginalIndex);
    return [{
      blockNodeId,
      blockWorkflowId,
      ...(blockWorkflowName ? { blockWorkflowName } : {}),
      ...(blockOriginalIndex !== undefined ? { blockOriginalIndex } : {}),
    }];
  });
}

function blockPathKey(blockPath: readonly UnrollBlockPathEntry[]): string {
  if (blockPath.length === 0) return ROOT_BLOCK_KEY;
  return JSON.stringify(blockPath.map((entry) => ({
    blockNodeId: entry.blockNodeId,
    blockWorkflowId: entry.blockWorkflowId,
  })));
}

function formatBlockPath(blockPath: readonly UnrollBlockPathEntry[]): string {
  return blockPath
    .map((entry) => entry.blockWorkflowName || entry.blockWorkflowId || entry.blockNodeId || '工作流块')
    .join(' / ');
}

function buildAdvancedMeta(step: UnrolledWorkflowStep): UnrollAdvancedMeta | null {
  const parentNodeType = optionalString(step.parentNodeType);
  const parentNodeId = optionalString(step.parentNodeId) ?? null;
  if (!parentNodeType && !parentNodeId) return null;

  const resolvedParentType = parentNodeType ?? '高级节点';
  const stepIndex = optionalInteger(step.stepIndex) ?? null;
  const totalSteps = optionalInteger(step.totalSteps) ?? null;
  const cycleIndex = optionalInteger(step.cycleIndex) ?? null;
  const stepValue = optionalFiniteNumber(step.stepValue) ?? null;

  return {
    parentNodeId,
    parentNodeType: resolvedParentType,
    parentDisplayName: getNodeDisplayName(resolvedParentType),
    stepIndex,
    totalSteps,
    cycleIndex,
    stepValue,
    stepLabel: stepIndex === null
      ? ''
      : `步骤 ${stepIndex + 1}${totalSteps === null ? '' : `/${totalSteps}`}`,
    cycleLabel: cycleIndex === null ? '' : `周期 ${cycleIndex + 1}`,
    valueLabel: stepValue === null ? '' : `设定值 ${formatPresentationNumber(stepValue)}`,
  };
}

function buildRow(step: UnrolledWorkflowStep, position: number): UnrollExplorerRow {
  const iterationPath = toIterationPath(step.iterationPath);
  const normalizedBlockPath = toUnrollBlockPath(step.blockPath);
  const advancedMeta = buildAdvancedMeta(step);
  const displayName = getNodeDisplayName(step.nodeType);
  const parameterSummary = summarizeNodeParameters(step.nodeType, step.node ?? {});
  const iterationLabel = formatIterationPath(iterationPath, '');
  const blockLabel = formatBlockPath(normalizedBlockPath);
  const advancedLabel = advancedMeta
    ? [
      advancedMeta.parentDisplayName,
      advancedMeta.stepLabel,
      advancedMeta.cycleLabel,
      advancedMeta.valueLabel,
    ].filter(Boolean).join(' · ')
    : '';
  const isAutomaticBoundary = step.autoBoundary === true;
  const ordinal = step.unrolledIndex + 1;
  const key = `step:${step.unrolledIndex}:${step.nodeId}`;

  const searchText = [
    `#${ordinal}`,
    step.nodeId,
    step.nodeType,
    displayName,
    parameterSummary,
    iterationLabel,
    blockLabel,
    advancedLabel,
    isAutomaticBoundary ? '自动 系统边界' : '',
  ].filter(Boolean).join(' ').toLocaleLowerCase();

  return {
    position,
    key,
    step,
    unrolledIndex: step.unrolledIndex,
    ordinal,
    displayName,
    parameterSummary,
    iterationPath,
    iterationKey: iterationPathKey(iterationPath),
    iterationLabel,
    blockPath: normalizedBlockPath,
    blockKey: blockPathKey(normalizedBlockPath),
    blockLabel,
    advancedLabel,
    advancedMeta,
    isAutomaticBoundary,
    isSelectable: !isAutomaticBoundary,
    searchText,
  };
}

function addGroupMembership(
  seeds: Map<string, GroupSeed>,
  descriptor: Omit<GroupSeed, 'memberPositions'>,
  position: number,
): void {
  const existing = seeds.get(descriptor.identityKey);
  if (existing) {
    existing.memberPositions.push(position);
    return;
  }
  seeds.set(descriptor.identityKey, { ...descriptor, memberPositions: [position] });
}

function addRowGroupMemberships(seeds: Map<string, GroupSeed>, row: UnrollExplorerRow): void {
  if (row.isAutomaticBoundary) return;

  row.iterationPath.forEach((entry, depthIndex) => {
    const path = row.iterationPath.slice(0, depthIndex + 1);
    const identityKey = `loop:${JSON.stringify({
      blockPath: row.blockKey,
      iterationPath: iterationPathKey(path),
    })}`;
    addGroupMembership(seeds, {
      identityKey,
      kind: 'loop',
      title: `第${depthIndex + 1}层循环 · 第${entry.iteration}轮`,
      meta: `第 ${entry.iteration}/${entry.totalIterations} 轮`,
      depth: depthIndex + 1,
    }, row.position);
  });

  row.blockPath.forEach((entry, depthIndex) => {
    const path = row.blockPath.slice(0, depthIndex + 1);
    const identityKey = `workflow:${JSON.stringify({
      blockPath: blockPathKey(path),
    })}`;
    addGroupMembership(seeds, {
      identityKey,
      kind: 'workflow',
      title: entry.blockWorkflowName || entry.blockWorkflowId || entry.blockNodeId || '工作流块',
      meta: formatBlockPath(path),
      depth: depthIndex + 1,
    }, row.position);
  });

  if (row.advancedMeta) {
    const identityKey = `advanced:${JSON.stringify({
      blockPath: row.blockKey,
      iterationPath: row.iterationKey,
      parentNodeId: row.advancedMeta.parentNodeId,
      parentNodeType: row.advancedMeta.parentNodeType,
      parentOriginalIndex: row.step.originalIndex,
    })}`;
    addGroupMembership(seeds, {
      identityKey,
      kind: 'advanced',
      title: row.advancedMeta.parentDisplayName,
      meta: `展开为 ${row.displayName}`,
      depth: row.iterationPath.length + row.blockPath.length + 1,
    }, row.position);
  }
}

function splitOccurrences(memberPositions: readonly number[], rows: readonly UnrollExplorerRow[]): number[][] {
  const occurrences: number[][] = [];
  let current: number[] = [];

  memberPositions.forEach((position) => {
    const previousPosition = current[current.length - 1];
    const hasNonBoundaryGap = previousPosition !== undefined
      && rows
        .slice(previousPosition + 1, position)
        .some((row) => !row.isAutomaticBoundary);

    if (hasNonBoundaryGap) {
      occurrences.push(current);
      current = [];
    }
    current.push(position);
  });

  if (current.length > 0) occurrences.push(current);
  return occurrences;
}

function buildGroups(rows: readonly UnrollExplorerRow[]): UnrollExplorerGroup[] {
  const seeds = new Map<string, GroupSeed>();
  rows.forEach((row) => addRowGroupMemberships(seeds, row));

  const groups: UnrollExplorerGroup[] = [];
  seeds.forEach((seed) => {
    splitOccurrences(seed.memberPositions, rows).forEach((memberPositions, occurrenceIndex) => {
      const memberRows = memberPositions.map((position) => rows[position]);
      const firstRow = memberRows[0];
      const lastRow = memberRows[memberRows.length - 1];
      if (!firstRow || !lastRow) return;

      groups.push({
        key: `${seed.identityKey}:occurrence:${occurrenceIndex + 1}`,
        identityKey: seed.identityKey,
        occurrence: occurrenceIndex + 1,
        kind: seed.kind,
        title: seed.title,
        meta: seed.meta,
        depth: seed.depth,
        memberPositions: [...memberPositions],
        memberRowKeys: memberRows.map((row) => row.key),
        firstOrdinal: firstRow.ordinal,
        lastOrdinal: lastRow.ordinal,
        stepCount: memberRows.length,
      });
    });
  });

  return groups.sort((left, right) => (
    left.memberPositions[0] - right.memberPositions[0]
    || GROUP_KIND_PRIORITY[left.kind] - GROUP_KIND_PRIORITY[right.kind]
    || left.depth - right.depth
    || left.key.localeCompare(right.key)
  ));
}

function previewSummaryNumber(preview: WorkflowUnrollPreview, key: string): number | undefined {
  const value = preview.summary?.[key];
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Convert the backend preview into presentation metadata without expanding,
 * sorting, filtering, or renumbering any step.
 */
export function buildUnrollExplorerModel(preview: WorkflowUnrollPreview): UnrollExplorerModel {
  const steps = preview.steps ?? [];
  const rows = steps.map(buildRow);
  const rowByUnrolledIndex = new Map<number, UnrollExplorerRow>();
  rows.forEach((row) => rowByUnrolledIndex.set(row.unrolledIndex, row));

  const declaredTotal = previewSummaryNumber(preview, 'totalSteps')
    ?? optionalInteger(rows[0]?.step.unrolledTotal);
  const computedMaxLoopDepth = rows.reduce(
    (maximum, row) => Math.max(maximum, row.iterationPath.length),
    0,
  );

  return {
    rows,
    groups: buildGroups(rows),
    rowByUnrolledIndex,
    totalSteps: declaredTotal ?? rows.length,
    selectableStepCount: rows.filter((row) => row.isSelectable).length,
    automaticBoundaryCount: rows.filter((row) => row.isAutomaticBoundary).length,
    maxLoopDepth: previewSummaryNumber(preview, 'maxLoopDepth') ?? computedMaxLoopDepth,
  };
}

function normalizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function hasClaimedPositionBetween(
  previousPosition: number,
  position: number,
  claimedPositions: ReadonlySet<number>,
): boolean {
  for (let gapPosition = previousPosition + 1; gapPosition < position; gapPosition += 1) {
    if (claimedPositions.has(gapPosition)) return true;
  }
  return false;
}

export function filterUnrollExplorerRows(
  model: UnrollExplorerModel,
  query = '',
): UnrollExplorerRow[] {
  const tokens = normalizeSearchQuery(query);
  if (tokens.length === 0) return model.rows;

  return model.rows.filter((row) => {
    const haystack = row.searchText.toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * Build a linear render sequence. A collapsed group only claims its exact
 * members; overlapping groups are resolved workflow > loop > advanced.
 * Search intentionally exposes matching rows instead of hiding them in a
 * collapsed summary.
 */
export function buildUnrollRenderItems(
  model: UnrollExplorerModel,
  collapsedKeys: ReadonlySet<string>,
  query = '',
): UnrollRenderItem[] {
  const filteredRows = filterUnrollExplorerRows(model, query);
  if (normalizeSearchQuery(query).length > 0) {
    return filteredRows.map((row) => ({ kind: 'row' as const, row }));
  }

  const collapsedGroups = model.groups
    .filter((group) => collapsedKeys.has(group.key))
    .sort((left, right) => (
      GROUP_KIND_PRIORITY[left.kind] - GROUP_KIND_PRIORITY[right.kind]
      || left.depth - right.depth
      || right.stepCount - left.stepCount
      || left.memberPositions[0] - right.memberPositions[0]
      || left.key.localeCompare(right.key)
    ));

  const claimedPositions = new Set<number>();
  const summaryByPosition = new Map<number, Extract<UnrollRenderItem, { kind: 'collapsed' }>>();

  collapsedGroups.forEach((group) => {
    const availablePositions = group.memberPositions.filter(
      (position) => !claimedPositions.has(position),
    );
    if (availablePositions.length === 0) return;

    const fragments: number[][] = [];
    let currentFragment: number[] = [];
    availablePositions.forEach((position) => {
      const previousPosition = currentFragment[currentFragment.length - 1];
      const crossesClaimedGroup = previousPosition !== undefined
        && hasClaimedPositionBetween(previousPosition, position, claimedPositions);

      if (crossesClaimedGroup) {
        fragments.push(currentFragment);
        currentFragment = [];
      }
      currentFragment.push(position);
    });
    if (currentFragment.length > 0) fragments.push(currentFragment);

    fragments.forEach((memberPositions, fragmentIndex) => {
      const memberRows = memberPositions.map((position) => model.rows[position]);
      const firstRow = memberRows[0];
      const lastRow = memberRows[memberRows.length - 1];
      if (!firstRow || !lastRow) return;

      memberPositions.forEach((position) => claimedPositions.add(position));
      const fragmentGroup: UnrollExplorerGroup = {
        ...group,
        key: `${group.key}:fragment:${fragmentIndex + 1}`,
        memberPositions,
        memberRowKeys: memberRows.map((row) => row.key),
        firstOrdinal: firstRow.ordinal,
        lastOrdinal: lastRow.ordinal,
        stepCount: memberRows.length,
      };
      summaryByPosition.set(firstRow.position, {
        kind: 'collapsed',
        group: fragmentGroup,
        collapseKey: group.key,
        renderKey: `collapsed:${group.key}:fragment:${fragmentIndex + 1}:${firstRow.position}`,
      });
    });
  });

  const renderItems: UnrollRenderItem[] = [];
  model.rows.forEach((row) => {
    const collapsedItem = summaryByPosition.get(row.position);
    if (collapsedItem) {
      renderItems.push(collapsedItem);
    }
    if (!claimedPositions.has(row.position)) {
      renderItems.push({ kind: 'row', row });
    }
  });
  return renderItems;
}
