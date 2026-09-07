import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNode } from '@zahnerflow/types';
import type { NodeParameters } from '../types/NodeConfiguration';
import type { RunFlowOutcome } from '../types/executionControl';
import { useUnrollPreview } from '../hooks/useUnrollPreview';
import { buildUnrollExplorerModel, buildUnrollRenderItems } from './unrollViewModel';
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

const PAGE_SIZE = 100;

/** 只浏览后端执行计划；筛选、分页和收起都不会改变执行索引。 */
export function UnrollViewModal({ isOpen, onClose, nodes, autoStartupConfig,
  canRunFromStep = false, runMetadataWarning, onRunFromStep }: UnrollViewModalProps) {
  const { previewState, preview, retry } = useUnrollPreview(isOpen, nodes, autoStartupConfig);
  const model = useMemo(() => buildUnrollExplorerModel(preview), [preview]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [jump, setJump] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildUnrollRenderItems(model, collapsed, query), [model, collapsed, query]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = selectedIndex === null ? null : model.rowByUnrolledIndex.get(selectedIndex) ?? null;
  const selectedVisible = visible.some(item => item.kind === 'row' && item.row.unrolledIndex === selectedIndex);

  useEffect(() => {
    setQuery(''); setCollapsed(new Set()); setSelectedIndex(null); setPage(0);
    setJump(''); setNotice(null); setStarting(false);
  }, [preview, isOpen]);

  useEffect(() => { listRef.current?.scrollTo?.({ top: 0 }); }, [currentPage, query, collapsed]);

  const reveal = (index: number) => {
    const row = model.rowByUnrolledIndex.get(index);
    if (!row) { setNotice('该步骤编号不存在。'); return; }
    setQuery(''); setCollapsed(new Set()); setPage(Math.floor(row.position / PAGE_SIZE));
    setSelectedIndex(index); setNotice(null);
    requestAnimationFrame(() => {
      const target = listRef.current?.querySelector<HTMLElement>(`[data-step="${index}"]`);
      target?.scrollIntoView?.({ block: 'nearest' }); target?.focus();
    });
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

  return <ModalLayer open={isOpen} onClose={onClose} id="unroll-view-modal"
    closeOnEscape={!starting} closeOnBackdrop={!starting}>
    {({ close }) => <section className="unroll-dialog" role="dialog" aria-modal="true" aria-labelledby="unroll-title">
      <header className="unroll-dialog__header">
        <UiIconSvg name="list" />
        <div><h3 id="unroll-title">执行步骤</h3><span>检查完整顺序，选择起点继续实验</span></div>
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
          <input type="search" aria-label="筛选执行步骤" placeholder="搜索名称、参数或循环路径" value={query}
            onChange={event => { setQuery(event.target.value); setPage(0); }} />
          <select aria-label="定位执行结构" value="" onChange={event => {
            const group = model.groups.find(item => item.key === event.target.value);
            if (group) reveal(model.rows[group.memberPositions[0]].unrolledIndex);
          }}><option value="">定位循环 / 工作流块</option>{model.groups.map(group =>
            <option key={group.key} value={group.key}>#{group.firstOrdinal}–{group.lastOrdinal} {group.title} · {group.meta}</option>)}</select>
          <button className="btn btn--sm" disabled={model.groups.length === 0} onClick={() => {
            setCollapsed(collapsed.size ? new Set() : new Set(model.groups.map(group => group.key))); setPage(0);
          }}>{collapsed.size ? '展开结构' : '收起结构'}</button>
          <form onSubmit={event => { event.preventDefault(); reveal(Number(jump) - 1); }}>
            <input aria-label="跳转步骤编号" type="number" min="1" max={model.rows.reduce((max, row) => Math.max(max, row.ordinal), 0)} placeholder="步骤号" value={jump} onChange={event => setJump(event.target.value)} required />
            <button className="btn btn--sm" type="submit">跳转</button>
          </form>
        </div>
        <div className="unroll-dialog__body">
          <section className="unroll-dialog__sequence" aria-label="执行序列">
            <div className="unroll-dialog__list" ref={listRef} onKeyDown={event => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const rows = visible.flatMap(item => item.kind === 'row' ? [item.row] : []);
              if (!rows.length) return;
              const index = rows.findIndex(row => row.unrolledIndex === selectedIndex);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
                : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
              event.preventDefault(); setSelectedIndex(rows[next].unrolledIndex);
              listRef.current?.querySelector<HTMLElement>(`[data-step="${rows[next].unrolledIndex}"]`)?.focus();
            }}>
              {visible.map(item => item.kind === 'collapsed' ? <button key={item.renderKey} className="unroll-row unroll-row--group" onClick={() => setCollapsed(current => {
                const next = new Set(current); next.delete(item.collapseKey); return next;
              })}><span>#{item.group.firstOrdinal}–{item.group.lastOrdinal}</span><strong>{item.group.title}</strong><span>展开 {item.group.stepCount} 步</span></button>
                : <button key={item.row.key} data-step={item.row.unrolledIndex} aria-pressed={selectedIndex === item.row.unrolledIndex}
                  className={`unroll-row ${item.row.isAutomaticBoundary ? 'unroll-row--system' : ''}`}
                  onClick={() => { setSelectedIndex(item.row.unrolledIndex); setNotice(null); }}>
                  <span className="unroll-row__ordinal">#{item.row.ordinal}</span>
                  <NodeIconSvg nodeType={item.row.advancedMeta?.parentNodeType || item.row.step.nodeType} fallback={<UiIconSvg name="workflow" />} />
                  <span className="unroll-row__copy"><strong>{item.row.advancedLabel || item.row.displayName}</strong>
                    <span>{item.row.parameterSummary === '-' ? '无额外参数' : item.row.parameterSummary}</span>
                    {(item.row.iterationLabel || item.row.blockLabel) && <small>{[item.row.iterationLabel, item.row.blockLabel].filter(Boolean).join(' · ')}</small>}
                  </span>
                  {item.row.isAutomaticBoundary && <span>系统</span>}
                </button>)}
              {items.length === 0 && <div className="unroll-dialog__state" role="status">没有匹配步骤。<button className="btn btn--sm" onClick={() => setQuery('')}>清除搜索</button></div>}
            </div>
            <nav className="unroll-dialog__pagination" aria-label="执行步骤分页">
              <span role="status">{items.length} 项 · 第 {currentPage + 1} / {pages} 页</span>
              <button className="btn btn--sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
              <button className="btn btn--sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
            </nav>
          </section>
          <aside className="unroll-dialog__detail" aria-label="所选步骤详情">
            <UnrollStepDetails row={selected} />
            {selected && !selectedVisible && <button className="btn btn--sm" onClick={() => reveal(selected.unrolledIndex)}>定位所选步骤（当前已隐藏）</button>}
          </aside>
        </div>
        <footer className="unroll-dialog__footer">
          <div>{notice && <p role="status">{notice}</p>}
            {runMetadataWarning && <p className="unroll-dialog__warning">{runMetadataWarning}</p>}
            <span>{!canRunFromStep ? '当前执行状态不可启动新流程' : selected?.isSelectable ? `从步骤 #${selected.ordinal} 开始；必要时自动完成设备启动。` : '请选择普通步骤；系统边界仅供检查。'}</span>
          </div>
          <button className="btn btn--md btn--primary" disabled={!selected?.isSelectable || !canRunFromStep || !onRunFromStep || starting}
            onClick={() => void run(close)}>{starting ? '正在启动…' : '从此步开始运行'}</button>
        </footer>
      </>}
    </section>}
  </ModalLayer>;
}
