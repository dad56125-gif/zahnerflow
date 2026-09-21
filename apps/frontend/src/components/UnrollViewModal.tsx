import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNode } from '@zahnerflow/types';
import type { NodeParameters } from '../types/NodeConfiguration';
import type { RunFlowOutcome } from '../types/executionControl';
import { useUnrollPreview } from '../hooks/useUnrollPreview';
import {
  buildUnrollColumnTree,
  buildUnrollExplorerModel,
  type UnrollColumnNode,
} from './unrollViewModel';
import { UnrollStepDetails } from './UnrollStepDetails';
import { ModalLayer } from './shared/OverlayLayer';
import { UiIconSvg } from './shared/UiIconSvg';
import { NodeIconSvg } from './NodeIconSvg';

interface UnrollViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: WorkflowNode[];
  autoStartupConfig?: NodeParameters;
  canRunFromStep?: boolean;
  runMetadataWarning?: string | null;
  onRunFromStep?: (index: number) => Promise<RunFlowOutcome>;
}

function groupIcon(node: Extract<UnrollColumnNode, { kind: 'group' }>) {
  return node.groupKind === 'loop' ? 'loop' : node.groupKind === 'advanced' ? 'data' : 'workflow';
}

function groupOrdinal(node: Extract<UnrollColumnNode, { kind: 'group' }>): string {
  const first = node.firstPosition + 1;
  const last = node.lastPosition + 1;
  return first === last ? `#${first}` : `#${first}–#${last}`;
}

/** 只浏览后端执行计划；分栏路径和编号定位不会改变执行索引。 */
export function UnrollViewModal({ isOpen, onClose, nodes, autoStartupConfig,
  canRunFromStep = false, runMetadataWarning, onRunFromStep }: UnrollViewModalProps) {
  const { previewState, preview, retry } = useUnrollPreview(isOpen, nodes, autoStartupConfig);
  const model = useMemo(() => buildUnrollExplorerModel(preview), [preview]);
  const tree = useMemo(() => buildUnrollColumnTree(model), [model]);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const finderRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const selected = selectedIndex === null ? null : model.rowByUnrolledIndex.get(selectedIndex) ?? null;

  const columns = useMemo(() => {
    const result: UnrollColumnNode[][] = [tree.items];
    let items = tree.items;
    for (const key of selectedPath) {
      const node = items.find((item) => item.key === key);
      if (!node || node.kind !== 'group') break;
      items = node.children;
      result.push(items);
    }
    return result;
  }, [selectedPath, tree]);

  useEffect(() => {
    setSelectedPath([]); setSelectedIndex(null);
    setNotice(null); setStarting(false);
  }, [preview, isOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      [columnsRef.current, finderRef.current].forEach((element) => {
        element?.scrollTo?.({ left: element.scrollWidth, behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedPath, selectedIndex]);

  const chooseNode = (node: UnrollColumnNode, columnIndex: number) => {
    const path = [...selectedPath.slice(0, columnIndex), node.key];
    setSelectedPath(path); setNotice(null);
    if (node.kind === 'step') setSelectedIndex(node.row.unrolledIndex);
    else setSelectedIndex(null);
  };

  const run = async (close: () => void) => {
    if (!selected?.isSelectable || !canRunFromStep || !onRunFromStep || starting) return;
    setStarting(true); setNotice(null);
    try {
      const outcome = await onRunFromStep(selected.unrolledIndex);
      if (outcome === 'started') close();
      else setNotice(outcome === 'confirmation-required'
        ? '运行信息不完整。请核对提示，并在 5 秒内再次确认启动；所选步骤已保留。'
        : '未能启动，请检查通知中的原因。所选步骤已保留。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '启动失败，请重试。'); }
    finally { setStarting(false); }
  };

  const renderStep = (node: Extract<UnrollColumnNode, { kind: 'step' }>, active: boolean, onClick: () => void) => (
    <button key={node.key} data-step={node.row.unrolledIndex} aria-pressed={active}
      className={`unroll-finder__item unroll-finder__item--step ${node.row.isAutomaticBoundary ? 'is-system' : ''}`}
      onClick={onClick}>
      <span className="unroll-finder__ordinal">#{node.row.ordinal}</span>
      <NodeIconSvg nodeType={node.row.advancedMeta?.parentNodeType || node.row.step.nodeType} fallback={<UiIconSvg name="workflow" />} />
      <span className="unroll-finder__item-copy"><strong>{node.title}</strong><small>{node.meta}</small></span>
      {node.row.isAutomaticBoundary && <span className="unroll-finder__badge">系统</span>}
    </button>
  );

  return <ModalLayer open={isOpen} onClose={onClose} id="unroll-view-modal"
    closeOnEscape={!starting} closeOnBackdrop={!starting}>
    {({ close }) => <section className="modal__content unroll-dialog" role="dialog" aria-modal="true" aria-labelledby="unroll-title">
      <header className="modal__header unroll-dialog__header">
        <h3 id="unroll-title">执行步骤展开</h3>
        <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" aria-label="关闭展开步骤" onClick={close} disabled={starting}><UiIconSvg name="close" /></button>
      </header>
      <div className="modal__body unroll-dialog__body">
      {previewState.status === 'loading' && <div className="unroll-dialog__state" role="status">正在生成执行计划…</div>}
      {previewState.status === 'error' && <div className="unroll-dialog__state" role="alert">
        <strong>无法生成执行计划</strong><p>{previewState.message}</p><button className="btn btn--sm" onClick={retry}>重新加载</button>
      </div>}
      {previewState.status === 'success' && model.totalSteps === 0 && <div className="unroll-dialog__state">当前没有可执行步骤。请添加节点或检查循环配置。</div>}
      {previewState.status === 'success' && model.totalSteps > 0 && <>
        <div className="unroll-finder" ref={finderRef}>
          <div className="unroll-finder__columns" ref={columnsRef} aria-label="执行步骤分栏">
            {columns.map((items, columnIndex) => <section className="unroll-finder__column" key={`column:${columnIndex}:${selectedPath[columnIndex - 1] ?? 'root'}`}>
              <div className="unroll-finder__items">
                {items.map((node) => node.kind === 'group' ? <button key={node.key}
                  aria-pressed={selectedPath[columnIndex] === node.key}
                  className="unroll-finder__item unroll-finder__item--group" onClick={() => chooseNode(node, columnIndex)}>
                  <span className="unroll-finder__ordinal">{groupOrdinal(node)}</span>
                  <UiIconSvg name={groupIcon(node)} />
                  <span className="unroll-finder__item-copy"><strong>{node.title}</strong><small>{node.meta}</small></span>
                  <span className="unroll-finder__disclosure" aria-hidden="true">›</span>
                </button> : renderStep(node, selectedPath[columnIndex] === node.key, () => chooseNode(node, columnIndex)))}
              </div>
            </section>)}
          </div>
          {selected && <aside className="unroll-finder__preview" aria-label="所选步骤详情">
            <div className="unroll-finder__preview-body"><UnrollStepDetails row={selected} /></div>
            <div className="unroll-finder__preview-actions">
              {notice && <p role="status">{notice}</p>}
              {runMetadataWarning && <p className="unroll-dialog__warning">{runMetadataWarning}</p>}
              <button className="btn btn--md btn--primary" disabled={!selected.isSelectable || !canRunFromStep || !onRunFromStep || starting}
                onClick={() => void run(close)}>{starting ? '正在启动…' : '从此步开始运行'}</button>
            </div>
          </aside>}
        </div>
        {!selected && (notice || runMetadataWarning) && <div className="unroll-dialog__notice" role="status">
          {notice || runMetadataWarning}
        </div>}
      </>}
      </div>
    </section>}
  </ModalLayer>;
}
