import { describe, expect, it } from 'vitest';
import type {
  IterationPathEntry,
  UnrolledWorkflowStep,
  WorkflowUnrollPreview,
} from '@zahnerflow/types';
import { iterationPathKey } from '../utils/iterationPath';
import {
  buildUnrollExplorerModel,
  buildUnrollRenderItems,
  type UnrollExplorerGroup,
} from './unrollViewModel';

function step(
  nodeId: string,
  nodeType: string,
  unrolledIndex: number,
  overrides: Partial<UnrolledWorkflowStep> = {},
): UnrolledWorkflowStep {
  return {
    nodeId,
    nodeType,
    originalIndex: unrolledIndex,
    sourceIndex: unrolledIndex,
    unrolledIndex,
    unrolledTotal: 20,
    iterationPath: [],
    blockPath: [],
    node: { id: nodeId, type: nodeType, config: {} },
    ...overrides,
  };
}

function preview(steps: UnrolledWorkflowStep[], summary: Record<string, unknown> = {}): WorkflowUnrollPreview {
  return {
    nodeCount: steps.length,
    steps,
    summary,
  };
}

const nestedIterationPath: IterationPathEntry[] = [
  {
    loopNodeId: 'outer:loop',
    loopStartIndex: 1,
    iteration: 2,
    totalIterations: 3,
  },
  {
    loopNodeId: 'inner,loop',
    loopStartIndex: 4,
    iteration: 1,
    totalIterations: 2,
  },
];

describe('buildUnrollExplorerModel', () => {
  it('keeps automatic startup and shutdown rows with the backend sequence and numbering', () => {
    const backendSteps = [
      step('__auto_startup', 'startup', 5, { autoBoundary: true, unrolledTotal: 13 }),
      step('measure', 'chronoamperometry', 9, { unrolledTotal: 13 }),
      step('__auto_shutdown', 'shutdown', 12, { autoBoundary: true, unrolledTotal: 13 }),
    ];

    const model = buildUnrollExplorerModel(preview(backendSteps, { totalSteps: 13 }));

    expect(model.rows.map((row) => row.step)).toEqual(backendSteps);
    expect(model.rows.map((row) => row.unrolledIndex)).toEqual([5, 9, 12]);
    expect(model.rows.map((row) => row.ordinal)).toEqual([6, 10, 13]);
    expect(model.rows.map((row) => row.isAutomaticBoundary)).toEqual([true, false, true]);
    expect(model.rows.map((row) => row.isSelectable)).toEqual([false, true, false]);
    expect(model.automaticBoundaryCount).toBe(2);
    expect(model.selectableStepCount).toBe(1);
    expect(model.totalSteps).toBe(13);
    expect(model.rowByUnrolledIndex.get(9)?.step).toBe(backendSteps[1]);
  });

  it('uses the complete structured identity for nested loop groups', () => {
    const model = buildUnrollExplorerModel(preview([
      step('nested-measure', 'chronoamperometry', 0, {
        iterationPath: nestedIterationPath,
        loopDepth: 2,
        unrolledTotal: 1,
      }),
    ]));

    expect(model.rows[0].iterationKey).toBe(iterationPathKey(nestedIterationPath));
    expect(model.maxLoopDepth).toBe(2);
    const loopGroups = model.groups.filter((group) => group.kind === 'loop');
    expect(loopGroups).toHaveLength(2);
    expect(JSON.parse(loopGroups[0].identityKey.slice('loop:'.length))).toMatchObject({
      iterationPath: iterationPathKey(nestedIterationPath.slice(0, 1)),
    });
    expect(JSON.parse(loopGroups[1].identityKey.slice('loop:'.length))).toMatchObject({
      iterationPath: iterationPathKey(nestedIterationPath),
    });
    expect(loopGroups.map((group) => group.memberPositions)).toEqual([[0], [0]]);
  });

  it('does not merge or hide child-loop rows from two block occurrences across a wait row', () => {
    const sharedIteration: IterationPathEntry[] = [{
      loopNodeId: 'child-loop',
      loopStartIndex: 0,
      iteration: 1,
      totalIterations: 2,
    }];
    const blockA = [{
      blockNodeId: 'block-a',
      blockWorkflowId: 'wf-child',
      blockWorkflowName: '子流程',
      blockOriginalIndex: 0,
    }];
    const blockB = [{
      blockNodeId: 'block-b',
      blockWorkflowId: 'wf-child',
      blockWorkflowName: '子流程',
      blockOriginalIndex: 2,
    }];
    const model = buildUnrollExplorerModel(preview([
      step('child-a', 'chronoamperometry', 0, {
        iterationPath: sharedIteration,
        blockPath: blockA,
      }),
      step('wait', 'wait_delay', 1),
      step('child-b', 'chronoamperometry', 2, {
        iterationPath: sharedIteration,
        blockPath: blockB,
      }),
    ]));

    const loopGroups = model.groups.filter((group) => group.kind === 'loop');
    expect(loopGroups).toHaveLength(2);
    expect(loopGroups.map((group) => group.memberPositions)).toEqual([[0], [2]]);
    expect(loopGroups[0].key).not.toBe(loopGroups[1].key);

    const items = buildUnrollRenderItems(model, new Set([loopGroups[0].key]));
    expect(items.map((item) => item.kind === 'row' ? item.row.step.nodeId : item.group.kind)).toEqual([
      'loop',
      'wait',
      'child-b',
    ]);
  });

  it('keeps one workflow block group across loops that are internal to the block', () => {
    const blockPath = [{
      blockNodeId: 'block-with-loop',
      blockWorkflowId: 'wf-with-loop',
      blockWorkflowName: '含循环子流程',
      blockOriginalIndex: 0,
    }];
    const firstIteration: IterationPathEntry[] = [{
      loopNodeId: 'inner-loop',
      loopStartIndex: 1,
      iteration: 1,
      totalIterations: 2,
    }];
    const secondIteration: IterationPathEntry[] = [{
      ...firstIteration[0],
      iteration: 2,
    }];
    const model = buildUnrollExplorerModel(preview([
      step('before-loop', 'wait_delay', 0, { blockPath }),
      step('loop-first', 'chronoamperometry', 1, { blockPath, iterationPath: firstIteration }),
      step('loop-second', 'chronoamperometry', 2, { blockPath, iterationPath: secondIteration }),
      step('after-loop', 'wait_delay', 3, { blockPath }),
    ]));

    const workflowGroups = model.groups.filter((group) => group.kind === 'workflow');
    expect(workflowGroups).toHaveLength(1);
    expect(workflowGroups[0].memberPositions).toEqual([0, 1, 2, 3]);

    const items = buildUnrollRenderItems(model, new Set([workflowGroups[0].key]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'collapsed',
      group: { kind: 'workflow', stepCount: 4, firstOrdinal: 1, lastOrdinal: 4 },
    });
  });

  it('separates identical advanced parent ids by their full block identity', () => {
    const advancedOverrides: Partial<UnrolledWorkflowStep> = {
      parentNodeId: 'advanced-shared',
      parentNodeType: 'potentiostatic_step_ramp',
      stepIndex: 0,
      totalSteps: 2,
      stepValue: 0.1,
    };
    const model = buildUnrollExplorerModel(preview([
      step('advanced-a', 'chronoamperometry', 0, {
        ...advancedOverrides,
        blockPath: [{
          blockNodeId: 'block-a',
          blockWorkflowId: 'wf-child',
          blockWorkflowName: '子流程',
          blockOriginalIndex: 0,
        }],
      }),
      step('advanced-b', 'chronoamperometry', 1, {
        ...advancedOverrides,
        blockPath: [{
          blockNodeId: 'block-b',
          blockWorkflowId: 'wf-child',
          blockWorkflowName: '子流程',
          blockOriginalIndex: 1,
        }],
      }),
    ]));

    const advancedGroups = model.groups.filter((group) => group.kind === 'advanced');
    expect(advancedGroups).toHaveLength(2);
    expect(advancedGroups[0].key).not.toBe(advancedGroups[1].key);
    expect(advancedGroups.map((group) => group.memberPositions)).toEqual([[0], [1]]);
  });

  it('exposes advanced parent, step, cycle, and value display metadata', () => {
    const model = buildUnrollExplorerModel(preview([
      step('switch-phase', 'chronoamperometry', 0, {
        parentNodeId: 'switch-parent',
        parentNodeType: 'potentiostatic_switching',
        stepIndex: 3,
        totalSteps: 8,
        cycleIndex: 1,
        stepValue: 0.125,
        node: {
          id: 'switch-phase',
          type: 'chronoamperometry',
          config: { polarizationVoltage: 0.125, measurementDuration: 5 },
        },
      }),
    ]));

    const row = model.rows[0];
    expect(row.advancedMeta).toMatchObject({
      parentNodeId: 'switch-parent',
      parentNodeType: 'potentiostatic_switching',
      stepIndex: 3,
      totalSteps: 8,
      cycleIndex: 1,
      stepValue: 0.125,
      stepLabel: '步骤 4/8',
      cycleLabel: '周期 2',
      valueLabel: '设定值 0.125',
    });
    expect(row.advancedLabel).toContain('步骤 4/8');
    expect(row.advancedLabel).toContain('周期 2');
    expect(row.advancedLabel).toContain('设定值 0.125');
    expect(row.parameterSummary).toContain('极化电压: 0.125');
  });

  it('formats floating-point parameter artifacts for human-readable summaries', () => {
    const model = buildUnrollExplorerModel(preview([
      step('rounded-step', 'chronoamperometry', 0, {
        node: {
          id: 'rounded-step',
          type: 'chronoamperometry',
          config: { polarizationVoltage: 0.30000000000000004, measurementDuration: 30 },
        },
      }),
    ]));

    expect(model.rows[0].parameterSummary).toContain('极化电压: 0.3');
    expect(model.rows[0].parameterSummary).not.toContain('0.30000000000000004');
  });

  it('preserves small scientific values while removing floating-point noise', () => {
    const model = buildUnrollExplorerModel(preview([
      step('small-value', 'chronoamperometry', 0, {
        parentNodeId: 'small-parent',
        parentNodeType: 'potentiostatic_step_ramp',
        stepIndex: 0,
        totalSteps: 1,
        stepValue: 1e-7,
        node: {
          id: 'small-value',
          type: 'chronoamperometry',
          config: { polarizationVoltage: 1e-7, measurementDuration: 30 },
        },
      }),
    ]));

    expect(model.rows[0].advancedMeta?.valueLabel).toBe('设定值 1e-7');
    expect(model.rows[0].parameterSummary).toContain('极化电压: 1e-7');
  });

  it('prefers a workflow summary over overlapping loop and advanced groups without changing step identity', () => {
    const iterationPath: IterationPathEntry[] = [{
      loopNodeId: 'loop',
      loopStartIndex: 0,
      iteration: 1,
      totalIterations: 2,
    }];
    const blockPath = [{
      blockNodeId: 'block',
      blockWorkflowId: 'wf-child',
      blockWorkflowName: '子流程',
      blockOriginalIndex: 0,
    }];
    const memberOne = step('member-1', 'chronoamperometry', 1, {
      iterationPath,
      blockPath,
      parentNodeId: 'advanced',
      parentNodeType: 'potentiostatic_step_ramp',
      stepIndex: 0,
      totalSteps: 2,
      stepValue: 0,
    });
    const memberTwo = step('member-2', 'chronoamperometry', 2, {
      iterationPath,
      blockPath,
      parentNodeId: 'advanced',
      parentNodeType: 'potentiostatic_step_ramp',
      stepIndex: 1,
      totalSteps: 2,
      stepValue: 0.1,
    });
    const model = buildUnrollExplorerModel(preview([
      step('__auto_startup', 'startup', 0, { autoBoundary: true }),
      memberOne,
      memberTwo,
      step('__auto_shutdown', 'shutdown', 3, { autoBoundary: true }),
    ], { totalSteps: 4, maxLoopDepth: 1 }));
    const collapsedKeys = new Set(model.groups.map((group) => group.key));

    const items = buildUnrollRenderItems(model, collapsedKeys);

    expect(items.map((item) => item.kind)).toEqual(['row', 'collapsed', 'row']);
    expect(items[0]).toMatchObject({ kind: 'row', row: { unrolledIndex: 0, isAutomaticBoundary: true } });
    expect(items[1]).toMatchObject({ kind: 'collapsed', group: { kind: 'workflow', memberPositions: [1, 2] } });
    expect(items[2]).toMatchObject({ kind: 'row', row: { unrolledIndex: 3, isAutomaticBoundary: true } });
    expect(model.rows[1].step).toBe(memberOne);
    expect(model.rows[2].step).toBe(memberTwo);
    expect(model.rows[1].key).toContain(':1:');
    expect(model.rows[2].key).toContain(':2:');
  });

  it('collapses every unclaimed fragment when groups partially overlap', () => {
    const model = buildUnrollExplorerModel(preview([
      step('first', 'wait_delay', 0),
      step('shared', 'wait_delay', 1),
      step('last', 'wait_delay', 2),
    ]));
    const workflowGroup: UnrollExplorerGroup = {
      key: 'workflow-group',
      identityKey: 'workflow-group',
      occurrence: 1,
      kind: 'workflow',
      title: '工作流块',
      meta: '工作流块',
      depth: 1,
      memberPositions: [0, 1],
      memberRowKeys: [model.rows[0].key, model.rows[1].key],
      firstOrdinal: 1,
      lastOrdinal: 2,
      stepCount: 2,
    };
    const loopGroup: UnrollExplorerGroup = {
      key: 'loop-group',
      identityKey: 'loop-group',
      occurrence: 1,
      kind: 'loop',
      title: '循环',
      meta: '循环',
      depth: 1,
      memberPositions: [1, 2],
      memberRowKeys: [model.rows[1].key, model.rows[2].key],
      firstOrdinal: 2,
      lastOrdinal: 3,
      stepCount: 2,
    };
    const overlappingModel = {
      ...model,
      groups: [workflowGroup, loopGroup],
    };

    const items = buildUnrollRenderItems(
      overlappingModel,
      new Set([workflowGroup.key, loopGroup.key]),
    );

    expect(items.map((item) => item.kind)).toEqual(['collapsed', 'collapsed']);
    expect(items.map((item) => item.kind === 'collapsed' ? {
      kind: item.group.kind,
      members: item.group.memberPositions,
      collapseKey: item.collapseKey,
    } : null)).toEqual([
      { kind: 'workflow', members: [0, 1], collapseKey: workflowGroup.key },
      { kind: 'loop', members: [2], collapseKey: loopGroup.key },
    ]);
  });

  it('splits one repeated identity around a non-member but treats automatic boundaries as transparent', () => {
    const iterationPath: IterationPathEntry[] = [{
      loopNodeId: 'loop',
      loopStartIndex: 0,
      iteration: 1,
      totalIterations: 2,
    }];
    const model = buildUnrollExplorerModel(preview([
      step('member-1', 'wait_delay', 0, { iterationPath }),
      step('__boundary', 'startup', 1, { autoBoundary: true }),
      step('member-2', 'wait_delay', 2, { iterationPath }),
      step('outside', 'wait_delay', 3),
      step('member-3', 'wait_delay', 4, { iterationPath }),
    ]));

    const loopGroups = model.groups.filter((group) => group.kind === 'loop');
    expect(loopGroups.map((group) => group.memberPositions)).toEqual([[0, 2], [4]]);
    expect(loopGroups.map((group) => group.occurrence)).toEqual([1, 2]);

    const items = buildUnrollRenderItems(model, new Set([loopGroups[0].key]));
    expect(items.map((item) => item.kind === 'row' ? item.row.step.nodeId : item.group.kind)).toEqual([
      'loop',
      '__boundary',
      'outside',
      'member-3',
    ]);
  });
});
