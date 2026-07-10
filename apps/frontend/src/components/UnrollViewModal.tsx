import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { WorkflowNode, WorkflowUnrollPreview } from '@zahnerflow/types';
import { runtimeClient } from '../runtimeClient';
import type { RunFlowOutcome } from '../types/executionControl';
import {
    buildUnrollExplorerModel,
    buildUnrollRenderItems,
    type UnrollExplorerGroup,
    type UnrollExplorerGroupKind,
    type UnrollExplorerRow,
    type UnrollRenderItem,
} from './unrollViewModel';
import { ModalLayer } from './shared/OverlayLayer';
import { NodeIconSvg } from './NodeIconSvg';
import { UiIconSvg } from './shared/UiIconSvg';

interface UnrollViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: WorkflowNode[];
    autoStartupConfig?: Record<string, any>;
    canRunFromStep?: boolean;
    runMetadataWarning?: string | null;
    onRunFromStep?: (startFromUnrolledIndex: number) => Promise<RunFlowOutcome>;
}

type PreviewState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; preview: WorkflowUnrollPreview }
    | { status: 'error'; message: string };

const EMPTY_PREVIEW: WorkflowUnrollPreview = {
    nodeCount: 0,
    steps: [],
    summary: {},
};

const GROUP_LABELS: Record<UnrollExplorerGroupKind, string> = {
    loop: '循环轮次',
    workflow: '工作流块',
    advanced: '高级步骤',
};

function errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = String(error.message || '').trim();
        if (message) return message;
    }
    return '展开预览失败，请检查工作流配置后重试';
}

function GroupIcon({ kind }: { kind: UnrollExplorerGroupKind }) {
    if (kind === 'loop') return <UiIconSvg name="loop" />;
    if (kind === 'workflow') return <UiIconSvg name="workflow" />;
    return <UiIconSvg name="activity" />;
}

function rowTitle(row: UnrollExplorerRow): string {
    return row.advancedLabel || row.displayName;
}

/**
 * 后端 ExecutionPlan 的只读步骤浏览器。组件只管理请求、展示和选择，
 * 不在前端重新展开、排序或推导执行索引。
 */
export const UnrollViewModal: React.FC<UnrollViewModalProps> = ({
    isOpen,
    onClose,
    nodes,
    autoStartupConfig,
    canRunFromStep = false,
    runMetadataWarning,
    onRunFromStep,
}) => {
    const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });
    const [retryVersion, setRetryVersion] = useState(0);
    const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
    const [selectedUnrolledIndex, setSelectedUnrolledIndex] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [runNotice, setRunNotice] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    const sequenceRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setSelectedUnrolledIndex(null);
        setCollapsedKeys(new Set());
        setQuery('');
        setRunNotice(null);
        setIsStarting(false);

        if (nodes.length === 0) {
            setPreviewState({ status: 'success', preview: EMPTY_PREVIEW });
            return;
        }

        let active = true;
        setPreviewState({ status: 'loading' });

        runtimeClient.executions
            .unrollPreview({
                nodes,
                autoStartupConfig: autoStartupConfig || {},
            })
            .then((preview) => {
                if (active && requestIdRef.current === requestId) {
                    setPreviewState({ status: 'success', preview });
                }
            })
            .catch((error) => {
                if (active && requestIdRef.current === requestId) {
                    setPreviewState({ status: 'error', message: errorMessage(error) });
                }
            });

        return () => {
            active = false;
        };
    }, [autoStartupConfig, isOpen, nodes, retryVersion]);

    const preview = previewState.status === 'success' ? previewState.preview : EMPTY_PREVIEW;
    const model = useMemo(() => buildUnrollExplorerModel(preview), [preview]);
    const renderItems = useMemo(
        () => buildUnrollRenderItems(model, collapsedKeys, query),
        [collapsedKeys, model, query],
    );
    const selectedRow = selectedUnrolledIndex === null
        ? null
        : model.rowByUnrolledIndex.get(selectedUnrolledIndex) || null;

    const groupsByKind = useMemo(() => {
        const grouped: Record<UnrollExplorerGroupKind, UnrollExplorerGroup[]> = {
            loop: [],
            workflow: [],
            advanced: [],
        };
        model.groups.forEach((group) => grouped[group.kind].push(group));
        return grouped;
    }, [model.groups]);

    const selectedIsVisible = selectedRow
        ? renderItems.some((item) => item.kind === 'row' && item.row.key === selectedRow.key)
        : false;
    const selectedIsFiltered = selectedRow
        ? Boolean(query.trim()) && !selectedIsVisible
        : false;
    const selectedIsCollapsed = selectedRow
        ? !query.trim() && !selectedIsVisible
        : false;

    const toggleGroup = (key: string) => {
        setCollapsedKeys((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const scrollToRow = (unrolledIndex: number) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const target = sequenceRef.current?.querySelector<HTMLElement>(
                    `[data-unrolled-index="${unrolledIndex}"]`,
                );
                target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                target?.focus({ preventScroll: true });
            });
        });
    };

    const navigateToGroup = (group: UnrollExplorerGroup) => {
        const firstPosition = group.memberPositions[0];
        const firstRow = model.rows[firstPosition];
        if (!firstRow) return;

        setCollapsedKeys((current) => {
            const next = new Set(current);
            model.groups.forEach((candidate) => {
                if (candidate.memberRowKeys.includes(firstRow.key)) {
                    next.delete(candidate.key);
                }
            });
            return next;
        });
        setQuery('');
        setSelectedUnrolledIndex(firstRow.unrolledIndex);
        scrollToRow(firstRow.unrolledIndex);
    };

    const showFullSequence = () => {
        setQuery('');
        setCollapsedKeys(new Set());
        sequenceRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const runFromSelected = async (close: () => void) => {
        if (!selectedRow || !selectedRow.isSelectable || !canRunFromStep || !onRunFromStep || isStarting) {
            return;
        }

        setIsStarting(true);
        setRunNotice(null);
        try {
            const outcome = await onRunFromStep(selectedRow.unrolledIndex);
            if (outcome === 'started') {
                close();
                return;
            }
            if (outcome === 'confirmation-required') {
                setRunNotice('运行信息尚不完整，请核对下方提示后再次确认；所选起点已保留。');
            } else if (outcome === 'blocked') {
                setRunNotice('当前状态不允许启动，请检查设备、工作站和工作流状态。');
            } else {
                setRunNotice('启动未完成，请检查通知与后端状态后重试；所选起点已保留。');
            }
        } catch (error) {
            setRunNotice(errorMessage(error));
        } finally {
            setIsStarting(false);
        }
    };

    const renderOutlineGroup = (group: UnrollExplorerGroup) => {
        const collapsed = collapsedKeys.has(group.key);
        return (
            <div
                className={`unroll-outline-item ${collapsed ? 'is-collapsed' : ''}`}
                key={group.key}
            >
                <button
                    type="button"
                    className="unroll-outline-item__main"
                    onClick={() => navigateToGroup(group)}
                    title={`定位到${group.title}`}
                >
                    <span className={`unroll-outline-item__icon unroll-outline-item__icon--${group.kind}`}>
                        <GroupIcon kind={group.kind} />
                    </span>
                    <span className="unroll-outline-item__copy">
                        <span className="unroll-outline-item__title">{group.title}</span>
                        <span className="unroll-outline-item__meta">
                            {group.meta} · {group.stepCount} 步
                        </span>
                    </span>
                </button>
                <button
                    type="button"
                    className="unroll-outline-item__toggle"
                    onClick={() => toggleGroup(group.key)}
                    aria-label={`${collapsed ? '展开' : '收起'}${group.title}`}
                    aria-expanded={!collapsed}
                >
                    {collapsed ? '+' : '−'}
                </button>
            </div>
        );
    };

    const renderStepRow = (row: UnrollExplorerRow) => {
        if (row.isAutomaticBoundary) {
            const isStartup = row.step.nodeType === 'startup';
            return (
                <div
                    key={row.key}
                    className={`unroll-sequence-boundary unroll-sequence-boundary--${isStartup ? 'startup' : 'shutdown'}`}
                    data-unrolled-index={row.unrolledIndex}
                    role="note"
                >
                    <span className="unroll-sequence-boundary__ordinal">#{row.ordinal}</span>
                    <span className="unroll-sequence-boundary__rail" aria-hidden="true" />
                    <span className="unroll-sequence-boundary__icon">
                        <NodeIconSvg nodeType={row.step.nodeType} fallback={<UiIconSvg name="settings" />} />
                    </span>
                    <span className="unroll-sequence-boundary__copy">
                        <strong>{isStartup ? '自动启动测量程序' : '自动停止测量程序'}</strong>
                        <span>系统边界 · 纳入真实执行序号，不可作为手动起点</span>
                    </span>
                    <span className="unroll-sequence-boundary__badge">系统</span>
                </div>
            );
        }

        const selected = selectedUnrolledIndex === row.unrolledIndex;
        const iconNodeType = row.advancedMeta?.parentNodeType || row.step.nodeType;
        return (
            <button
                key={row.key}
                type="button"
                id={`unroll-step-${row.unrolledIndex}`}
                className={`unroll-sequence-row ${selected ? 'is-selected' : ''}`}
                data-unrolled-index={row.unrolledIndex}
                onClick={() => {
                    setSelectedUnrolledIndex(row.unrolledIndex);
                    setRunNotice(null);
                }}
                aria-pressed={selected}
            >
                <span className="unroll-sequence-row__ordinal">#{row.ordinal}</span>
                <span className="unroll-sequence-row__rail" aria-hidden="true" />
                <span className="unroll-sequence-row__icon">
                    <NodeIconSvg nodeType={iconNodeType} fallback={<UiIconSvg name="workflow" />} />
                </span>
                <span className="unroll-sequence-row__content">
                    <span className="unroll-sequence-row__headline">
                        <strong>{rowTitle(row)}</strong>
                        {row.advancedMeta && (
                            <span className="unroll-sequence-row__actual">实际执行：{row.displayName}</span>
                        )}
                    </span>
                    <span className="unroll-sequence-row__summary">
                        {row.parameterSummary === '-' ? '无额外参数' : row.parameterSummary}
                    </span>
                    {(row.iterationLabel || row.blockLabel || row.advancedMeta) && (
                        <span className="unroll-sequence-row__context">
                            {row.iterationLabel && <span className="is-loop">{row.iterationLabel}</span>}
                            {row.blockLabel && <span className="is-workflow">{row.blockLabel}</span>}
                            {row.advancedMeta?.stepLabel && <span className="is-advanced">{row.advancedMeta.stepLabel}</span>}
                        </span>
                    )}
                </span>
                <span className="unroll-sequence-row__select">选择</span>
            </button>
        );
    };

    const renderCollapsedGroup = (
        item: Extract<UnrollRenderItem, { kind: 'collapsed' }>,
    ) => {
        const { collapseKey, group, renderKey } = item;
        return (
        <button
            key={renderKey}
            type="button"
            className={`unroll-collapsed-group unroll-collapsed-group--${group.kind}`}
            onClick={() => toggleGroup(collapseKey)}
            aria-label={`展开${group.title}`}
        >
            <span className="unroll-collapsed-group__range">
                #{group.firstOrdinal}{group.lastOrdinal !== group.firstOrdinal ? `–${group.lastOrdinal}` : ''}
            </span>
            <span className="unroll-collapsed-group__icon"><GroupIcon kind={group.kind} /></span>
            <span className="unroll-collapsed-group__copy">
                <strong>{group.title}</strong>
                <span>{group.meta} · 已收起 {group.stepCount} 步</span>
            </span>
            <span className="unroll-collapsed-group__action">展开</span>
        </button>
        );
    };

    const renderSuccessBody = (close: () => void) => {
        if (model.totalSteps === 0) {
            return (
                <div className="unroll-state unroll-state--empty">
                    <span className="unroll-state__icon"><UiIconSvg name="inbox" /></span>
                    <strong>{nodes.length === 0 ? '当前画布还没有节点' : '当前配置没有可执行步骤'}</strong>
                    <span>{nodes.length === 0 ? '添加节点后即可查看真实执行序列。' : '请检查循环次数、高级节点周期或工作流块内容。'}</span>
                </div>
            );
        }

        return (
            <div className="unroll-explorer">
                <aside className="unroll-explorer__outline" aria-label="展开结构导航">
                    <div className="unroll-panel-heading">
                        <span className="unroll-panel-heading__eyebrow">结构导航</span>
                        <strong>执行上下文</strong>
                    </div>
                    <button type="button" className="unroll-outline-all" onClick={showFullSequence}>
                        <span className="unroll-outline-all__icon"><UiIconSvg name="list" /></span>
                        <span>
                            <strong>完整执行序列</strong>
                            <small>{model.totalSteps} 个计划步骤</small>
                        </span>
                    </button>
                    <div className="unroll-outline-scroll">
                        {(Object.keys(GROUP_LABELS) as UnrollExplorerGroupKind[]).map((kind) => {
                            const groups = groupsByKind[kind];
                            if (groups.length === 0) return null;
                            return (
                                <section className="unroll-outline-section" key={kind}>
                                    <div className="unroll-outline-section__heading">
                                        <span>{GROUP_LABELS[kind]}</span>
                                        <span>{groups.length}</span>
                                    </div>
                                    {groups.map(renderOutlineGroup)}
                                </section>
                            );
                        })}
                    </div>
                </aside>

                <section className="unroll-explorer__sequence" aria-label="真实执行序列">
                    <div className="unroll-sequence-toolbar">
                        <label className="unroll-search">
                            <span className="unroll-search__label">筛选步骤</span>
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="名称、参数、循环或工作流块"
                                autoFocus
                            />
                        </label>
                        <div className="unroll-sequence-toolbar__actions">
                            <span>{query.trim() ? `${renderItems.length} 项匹配` : `${model.totalSteps} 项`}</span>
                            <button
                                type="button"
                                className="btn btn--xs unroll-reset-button"
                                onClick={showFullSequence}
                                disabled={collapsedKeys.size === 0 && !query.trim()}
                            >
                                全部展开
                            </button>
                        </div>
                    </div>
                    <div className="unroll-sequence-list" ref={sequenceRef}>
                        {renderItems.length > 0 ? renderItems.map((item) => (
                            item.kind === 'row' ? renderStepRow(item.row) : renderCollapsedGroup(item)
                        )) : (
                            <div className="unroll-sequence-no-results" role="status">
                                没有匹配“{query.trim()}”的执行步骤
                            </div>
                        )}
                    </div>
                </section>

                <aside className="unroll-explorer__detail" aria-label="所选步骤详情">
                    <div className="unroll-panel-heading">
                        <span className="unroll-panel-heading__eyebrow">步骤检查器</span>
                        <strong>{selectedRow ? `计划 #${selectedRow.ordinal}` : '尚未选择步骤'}</strong>
                    </div>
                    {selectedRow ? (
                        <div className="unroll-detail">
                            <div className="unroll-detail__identity">
                                <span className="unroll-detail__icon">
                                    <NodeIconSvg
                                        nodeType={selectedRow.advancedMeta?.parentNodeType || selectedRow.step.nodeType}
                                        fallback={<UiIconSvg name="workflow" />}
                                    />
                                </span>
                                <span>
                                    <strong>{rowTitle(selectedRow)}</strong>
                                    <small>真实索引 {selectedRow.unrolledIndex} · 共 {model.totalSteps} 步</small>
                                </span>
                            </div>

                            {(selectedIsCollapsed || selectedIsFiltered) && (
                                <div className="unroll-detail__visibility" role="status">
                                    此步骤仍保持选中，但当前被{selectedIsFiltered ? '筛选条件隐藏' : '收起的结构隐藏'}。
                                </div>
                            )}

                            <dl className="unroll-detail__facts">
                                {selectedRow.advancedMeta && (
                                    <>
                                        <dt>高级节点</dt>
                                        <dd>{selectedRow.advancedMeta.parentDisplayName}</dd>
                                        <dt>内部位置</dt>
                                        <dd>
                                            {[selectedRow.advancedMeta.stepLabel, selectedRow.advancedMeta.cycleLabel, selectedRow.advancedMeta.valueLabel]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </dd>
                                        <dt>实际步骤</dt>
                                        <dd>{selectedRow.displayName}</dd>
                                    </>
                                )}
                                <dt>画布来源</dt>
                                <dd>节点 #{selectedRow.step.originalIndex + 1}</dd>
                                {selectedRow.iterationLabel && (
                                    <>
                                        <dt>循环路径</dt>
                                        <dd>{selectedRow.iterationLabel}</dd>
                                    </>
                                )}
                                {selectedRow.blockLabel && (
                                    <>
                                        <dt>工作流块</dt>
                                        <dd>{selectedRow.blockLabel}</dd>
                                    </>
                                )}
                                <dt>参数摘要</dt>
                                <dd>{selectedRow.parameterSummary === '-' ? '无额外参数' : selectedRow.parameterSummary}</dd>
                            </dl>

                            <div className="unroll-detail__start-note">
                                <span className="unroll-detail__start-note-icon"><UiIconSvg name="info" /></span>
                                <span>将从计划 #{selectedRow.ordinal} 继续。若后续仍有测量，后端会在需要时先补执行自动启动边界。</span>
                            </div>

                            {runMetadataWarning && (
                                <div className="unroll-detail__warning" role="alert">
                                    <span><UiIconSvg name="warning" /></span>
                                    <span>{runMetadataWarning}</span>
                                </div>
                            )}
                            {runNotice && (
                                <div className="unroll-detail__notice" role="status" aria-live="polite">
                                    {runNotice}
                                </div>
                            )}

                            <div className="unroll-detail__actions">
                                <button
                                    type="button"
                                    className="btn btn--md btn--primary"
                                    disabled={!canRunFromStep || !onRunFromStep || isStarting}
                                    onClick={() => void runFromSelected(close)}
                                >
                                    {isStarting
                                        ? '正在启动…'
                                        : runMetadataWarning
                                            ? '确认并从此步运行'
                                            : '从此步开始运行'}
                                </button>
                                {!canRunFromStep && (
                                    <span className="unroll-detail__disabled-reason">当前执行状态不可启动新流程</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="unroll-detail-placeholder">
                            <span><UiIconSvg name="skip" /></span>
                            <strong>选择一个普通步骤</strong>
                            <p>这里会显示它在真实执行计划中的位置、循环上下文和参数。系统自动边界不可作为手动起点。</p>
                        </div>
                    )}
                </aside>
            </div>
        );
    };

    return (
        <ModalLayer
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            id="unroll-view-modal"
            closeOnBackdrop={!isStarting}
            closeOnEscape={!isStarting}
        >
            {({ close }) => (
                <div
                    className="modal__content unroll-view-modal workspace-device-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="unroll-view-title"
                >
                    <div className="modal__header unroll-view-modal__header">
                        <div className="unroll-view-modal__title">
                            <span>执行计划</span>
                            <h3 id="unroll-view-title">展开所有执行步骤</h3>
                            <p>{previewState.status === 'success' ? `由 ${preview.nodeCount} 个画布节点生成` : '正在读取后端执行计划'}</p>
                        </div>
                        <div className="unroll-summary" aria-label="展开摘要">
                            <span className="unroll-badge unroll-badge--indigo">
                                计划 {previewState.status === 'success' ? model.totalSteps : '—'}
                            </span>
                            <span className="unroll-badge unroll-badge--success">
                                可选 {previewState.status === 'success' ? model.selectableStepCount : '—'}
                            </span>
                            {model.automaticBoundaryCount > 0 && (
                                <span className="unroll-badge unroll-badge--system">
                                    系统 {model.automaticBoundaryCount}
                                </span>
                            )}
                            {model.maxLoopDepth > 0 && (
                                <span className="unroll-badge unroll-badge--warning">
                                    嵌套 {model.maxLoopDepth} 层
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close"
                            onClick={close}
                            aria-label="关闭展开步骤"
                            disabled={isStarting}
                        >
                            <UiIconSvg name="close" />
                        </button>
                    </div>

                    <div className="modal__body unroll-view-body">
                        {previewState.status === 'loading' && (
                            <div className="unroll-state unroll-state--loading" role="status" aria-live="polite">
                                <span className="unroll-state__spinner" aria-hidden="true" />
                                <strong>正在生成真实执行计划</strong>
                                <span>循环、工作流块、高级节点与系统边界都由后端统一展开。</span>
                            </div>
                        )}
                        {previewState.status === 'error' && (
                            <div className="unroll-state unroll-state--error" role="alert">
                                <span className="unroll-state__icon"><UiIconSvg name="error" /></span>
                                <strong>无法生成展开预览</strong>
                                <span>{previewState.message}</span>
                                <button
                                    type="button"
                                    className="btn btn--sm btn--secondary"
                                    onClick={() => setRetryVersion((value) => value + 1)}
                                >
                                    重新加载
                                </button>
                            </div>
                        )}
                        {previewState.status === 'success' && renderSuccessBody(close)}
                    </div>
                </div>
            )}
        </ModalLayer>
    );
};
