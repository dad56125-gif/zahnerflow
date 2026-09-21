import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNode } from '@zahnerflow/types';
import type { NodeParameters } from '../types/NodeConfiguration';
import type { RunFlowOutcome } from '../types/executionControl';
import { useUnrollPreview } from '../hooks/useUnrollPreview';
import {
  buildUnrollColumnTree,
  buildUnrollExplorerModel,
  filterUnrollExplorerRows,
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

function columnLabel(columnIndex: number, selectedPath: readonly string[], tree: ReturnType<typeof buildUnrollColumnTree>): string {
  if (columnIndex === 0) return '执行计划';
  const parent = tree.nodeByKey.get(selectedPath[columnIndex - 1]);
  return parent?.title ?? `第 ${columnIndex + 1} 层`;
}

function groupIcon(node: Extract<UnrollColumnNode, { kind: 'group' }>) {
  return node.groupKind === 'loop' ? 'loop' : node.groupKind === 'advanced' ? 'data' : 'workflow';
}

function groupOrdinal(node: Extract<UnrollColumnNode, { kind: 'group' }>): string {
  const first = node.firstPosition + 1;
  const last = node.lastPosition + 1;
  return first === last ? `#${first}` : `#${first}–#${last}`;
}

/** 只浏览后端执行计划；分栏路径和搜索不会改变执行索引。 */
export function UnrollViewModal({ isOpen, onClose, nodes, autoStartupConfig,
  canRunFromStep = false, runMetadataWarning, onRunFromStep }: UnrollViewModalProps) {
  const { previewState, preview, retry } = useUnrollPreview(isOpen, nodes, autoStartupConfig);
  const model = useMemo(() => buildUnrollExplorerModel(preview), [preview]);
  const tree = useMemo(() => buildUnrollColumnTree(model), [model]);
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [jump, setJump] = useState('');
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

  const searchItems = useMemo(() => filterUnrollExplorerRows(model, query).flatMap((row) => {
    const node = tree.nodeByKey.get(row.key);
    return node?.kind === 'step' ? [node] : [];
  }), [model, query, tree]);

  useEffect(() => {
    setQuery(''); setSelectedPath([]); setSelectedIndex(null);
    setJump(''); setNotice(null); setStarting(false);
  }, [preview, isOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      [columnsRef.current, finderRef.current].forEach((element) => {
        element?.scrollTo?.({ left: element.scrollWidth, behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedPath, selectedIndex]);

  const reveal = (index: number) => {
    const row = model.rowByUnrolledIndex.get(index);
    if (!row) { setNotice('该步骤编号不存在。'); return; }
    const path = tree.pathByRowKey.get(row.key);
    if (!path) { setNotice('无法定位该步骤。'); return; }
    setQuery(''); setSelectedPath([...path]); setSelectedIndex(index); setNotice(null);
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-step="${index}"]`);
      target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); target?.focus();
    });
  };

  const chooseNode = (node: UnrollColumnNode, columnIndex: number) => {
    const path = [...selectedPath.slice(0, columnIndex), node.key];
    setSelectedPath(path); setNotice(null);
    if (node.kind === 'step') setSelectedIndex(node.row.unrolledIndex);
    else setSelectedIndex(null);
  };

  const locateSearchResult = (node: Extract<UnrollColumnNode, { kind: 'step' }>) => {
    const path = tree.pathByRowKey.get(node.row.key);
    if (!path) return;
    setQuery(''); setSelectedPath([...path]); setSelectedIndex(node.row.unrolledIndex); setNotice(null);
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
    closeOnEscape={!starting} closeOnBackdrop={!starting} blur>
    {({ close }) => <section className="unroll-dialog" role="dialog" aria-modal="true" aria-labelledby="unroll-title">
      <header className="unroll-dialog__header">
        <UiIconSvg name="list" />
        <div><h3 id="unroll-title">执行步骤</h3><span>逐层浏览执行结构，选择最终步骤作为起点</span></div>
        {previewState.status === 'success' && <span className="unroll-dialog__summary">
          {preview.nodeCount} 个节点 · {model.totalSteps} 步 · {model.automaticBoundaryCount} 个系统边界
        </span>}
        <button className="btn btn--sm btn--ghost btn--icon btn--rounded" aria-label="关闭展开步骤" onClick={close} disabled={starting}><UiIconSvg name="close" /></button>
      </header>
      {previewState.status === 'loading' && <div className="unroll-dialog__state" role="status">正在生成执行计划…</div>}
      {previewState.status === 'error' && <div className="unroll-dialog__state" role="alert">
        <strong>无法生成执行计划</strong><p>{previewState.message}</p><button className="btn btn--sm" onClick={retry}>重新加载</button>
      </div>}
      {previewState.status === 'success' && model.totalSteps === 0 && <div className="unroll-dialog__state">当前没有可执行步骤。请添加节点或检查循环配置。</div>}
      {previewState.status === 'success' && model.totalSteps > 0 && <>
        <div className="unroll-dialog__toolbar">
          <div className="unroll-dialog__search"><UiIconSvg name="list" /><input type="search" aria-label="筛选执行步骤"
            placeholder="搜索步骤、参数或路径" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <form onSubmit={(event) => { event.preventDefault(); reveal(Number(jump) - 1); }}>
            <input aria-label="跳转步骤编号" type="number" min="1" max={model.rows.reduce((max, row) => Math.max(max, row.ordinal), 0)}
              placeholder="步骤号" value={jump} onChange={(event) => setJump(event.target.value)} required />
            <button className="btn btn--sm" type="submit">定位</button>
          </form>
        </div>
        <div className="unroll-finder" ref={finderRef}>
          <div className="unroll-finder__columns" ref={columnsRef} aria-label="执行步骤分栏">
            {query.trim() ? <section className="unroll-finder__column unroll-finder__column--search">
              <header><strong>搜索结果</strong><span>{searchItems.length} 项</span></header>
              <div className="unroll-finder__items">
                {searchItems.map((node) => renderStep(node, selectedIndex === node.row.unrolledIndex, () => locateSearchResult(node)))}
                {searchItems.length === 0 && <div className="unroll-dialog__state">没有匹配步骤。</div>}
              </div>
            </section> : columns.map((items, columnIndex) => <section className="unroll-finder__column" key={`column:${columnIndex}:${selectedPath[columnIndex - 1] ?? 'root'}`}>
              <header><strong>{columnLabel(columnIndex, selectedPath, tree)}</strong><span>{items.length} 项</span></header>
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
              <span>{!canRunFromStep ? '当前执行状态不可启动新流程' : selected.isSelectable
                ? `从步骤 #${selected.ordinal} 开始；必要时自动完成设备启动。` : '系统边界仅供检查，不能作为起点。'}</span>
              <button className="btn btn--md btn--primary" disabled={!selected.isSelectable || !canRunFromStep || !onRunFromStep || starting}
                onClick={() => void run(close)}>{starting ? '正在启动…' : '从此步开始运行'}</button>
            </div>
          </aside>}
        </div>
        {!selected && (notice || runMetadataWarning) && <div className="unroll-dialog__notice" role="status">
          {notice || runMetadataWarning}
        </div>}
      </>}
    </section>}
  </ModalLayer>;
}
