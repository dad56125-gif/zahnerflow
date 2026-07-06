/**
 * 实验记录 modal — 左侧 workflow 树 + 右侧定义/报告切换
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalLayer } from '../shared/OverlayLayer';
import { runtimeClient } from '../../runtimeClient';
import { useCanvasStore } from '../../state/canvasStore';
import { useWorkflowStore } from '../../state/currentWorkflowStore';
import { buildReportData, formatDateTime, formatDuration } from './reportDataBuilder';
import { WorkflowMapView } from './WorkflowMapView';
import { UiIconSvg } from '../shared/UiIconSvg';
import {
  STATUS_ICON_NAMES,
  NODE_TYPE_LABELS,
  type ReportData,
  type ReportNodeInfo,
  type WorkflowSummary,
  type RunSummary,
  type WorkflowDefinition,
  type WorkflowMapPayload,
} from './types';

interface ReportGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type RightPanelMode = 'definition' | 'report' | 'map';

const RECENT_RUNS_DEFAULT_LIMIT = 3;

/* ── helpers ─────────────────────────────────────────── */

function getStatusText(status: string): string {
  switch (status) {
    case 'completed':
    case 'success':
      return '成功';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'running':
      return '执行中';
    case 'skipped':
      return '已跳过';
    case 'pending':
      return '未执行';
    default:
      return '未执行';
  }
}

function StatusLabel({ status }: { status: string }) {
  const iconName = STATUS_ICON_NAMES[status];

  return (
    <>
      {iconName && <UiIconSvg name={iconName} />}
      {getStatusText(status)}
    </>
  );
}

function statusClass(status: string): string {
  return `is-status-${status || 'pending'}`;
}

function isGeneratedWorkflowName(name: string | null | undefined): boolean {
  const value = (name || '').trim();
  return /^工作流\s+\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$/.test(value);
}

function displayWorkflowName(name: string | null | undefined): string | null {
  const value = (name || '').trim();
  if (!value || isGeneratedWorkflowName(value)) return null;
  return value;
}

function WorkflowExpandArrow({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`dropdown__arrow ${expanded ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12" aria-hidden="true">
      <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function nodeOutputText(node: ReportNodeInfo): string {
  if (node.error) return node.error;
  if (node.csvPath) return node.csvPath;
  if (node.outputFile) return node.outputFile;
  if (node.resultSummary) return node.resultSummary;
  return '-';
}

type WorkflowNodeRecord = Record<string, unknown>;

function workflowNodesForCanvas(nodes: WorkflowNodeRecord[]) {
  return nodes.map((node, index) => {
    const config = {
      ...((node.config ?? node.data ?? node.parameters ?? {}) as Record<string, unknown>),
    };
    delete config.loop_id;

    return {
      id: String(node.id ?? `loaded_${index + 1}`),
      type: String(node.type ?? 'wait_delay'),
      config,
      ...(node.group && typeof node.group === 'object' ? { group: node.group } : {}),
    };
  });
}

/* ── component ───────────────────────────────────────── */

export const ReportGeneratorModal: React.FC<ReportGeneratorModalProps> = ({
  isOpen,
  onClose,
}) => {
  // ── state ──
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { setNodes, selectNode } = useCanvasStore();
  const { setDraftWorkflowName } = useWorkflowStore();

  // 左侧 workflow 列表
  const [workflowSummaries, setWorkflowSummaries] = useState<WorkflowSummary[]>([]);
  const [wfLoading, setWfLoading] = useState(false);
  const [wfError, setWfError] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // 展开的 workflow IDs
  const [expandedWorkflowIds, setExpandedWorkflowIds] = useState<Set<string>>(new Set());
  // 每个 workflow 的 runs
  const [runsByWorkflowId, setRunsByWorkflowId] = useState<Record<string, RunSummary[]>>({});
  const [runsLoading, setRunsLoading] = useState<Set<string>>(new Set());
  // 每个 workflow 的 total run count（用于"查看全部"）
  const [runTotalByWorkflowId, setRunTotalByWorkflowId] = useState<Record<string, number>>({});

  // 选中状态
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // 右侧面板
  const [rightMode, setRightMode] = useState<RightPanelMode>('definition');
  const [workflowDefinitionsById, setWorkflowDefinitionsById] = useState<Record<string, WorkflowDefinition>>({});
  const [defLoading, setDefLoading] = useState(false);
  const [defError, setDefError] = useState<string | null>(null);
  const [workflowMap, setWorkflowMap] = useState<WorkflowMapPayload | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReloadKey, setMapReloadKey] = useState(0);
  const [favoriteUpdatingIds, setFavoriteUpdatingIds] = useState<Set<string>>(new Set());
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [renamingWorkflowId, setRenamingWorkflowId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [workflowActionMessage, setWorkflowActionMessage] = useState<string | null>(null);

  const [reportRecordsByRunId, setReportRecordsByRunId] = useState<Record<string, Record<string, unknown>>>({});
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const workflowDefinition = selectedWorkflowId ? workflowDefinitionsById[selectedWorkflowId] || null : null;
  const reportRecord = selectedRunId ? reportRecordsByRunId[selectedRunId] || null : null;

  const reportData = useMemo<ReportData | null>(() => {
    if (!reportRecord) return null;
    return buildReportData(reportRecord);
  }, [reportRecord]);

  const visibleWorkflowSummaries = useMemo(() => {
    if (!showFavoritesOnly) return workflowSummaries;
    return workflowSummaries.filter((workflow) => workflow.isFavorite);
  }, [showFavoritesOnly, workflowSummaries]);

  // ── 加载 workflow 列表 ──
  const loadWorkflowSummaries = useCallback(async () => {
    setWfLoading(true);
    setWfError(null);
    try {
      const resp = await runtimeClient.workflows.summaries<{
        items: WorkflowSummary[];
        total: number;
      }>();
      setWorkflowSummaries(resp.items || []);

      // 默认选中最近执行的 workflow
      if (resp.items && resp.items.length > 0) {
        const latest = resp.items[0];
        setSelectedWorkflowId(latest.id);
        setSelectedRunId(null);
        setRightMode('definition');
      }
    } catch (err) {
      setWfError(err instanceof Error ? err.message : '加载工作流列表失败');
    } finally {
      setWfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadWorkflowSummaries();
  }, [isOpen, loadWorkflowSummaries]);

  useEffect(() => {
    if (!isOpen || visibleWorkflowSummaries.length === 0) return;
    const selectedStillVisible = selectedWorkflowId
      ? visibleWorkflowSummaries.some((workflow) => workflow.id === selectedWorkflowId)
      : false;
    if (!selectedStillVisible) {
      setSelectedWorkflowId(visibleWorkflowSummaries[0].id);
      setSelectedRunId(null);
      setRightMode('definition');
    }
  }, [isOpen, selectedWorkflowId, visibleWorkflowSummaries]);

  // ── 加载 workflow definition ──
  useEffect(() => {
    if (!isOpen || !selectedWorkflowId || selectedRunId || rightMode !== 'definition') {
      return;
    }
    if (workflowDefinitionsById[selectedWorkflowId]) return;

    let cancelled = false;
    setDefLoading(true);
    setDefError(null);

    runtimeClient.workflows
      .definition<WorkflowDefinition>(selectedWorkflowId)
      .then((data) => {
        if (!cancelled) {
          setWorkflowDefinitionsById((current) => ({ ...current, [selectedWorkflowId]: data }));
        }
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setDefError(err?.message || '加载工作流定义失败');
      })
      .finally(() => {
        if (!cancelled) setDefLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, selectedWorkflowId, selectedRunId, rightMode, workflowDefinitionsById]);

  // ── 加载 workflow map ──
  useEffect(() => {
    if (!isOpen || rightMode !== 'map') {
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    setMapError(null);

    runtimeClient.workflows
      .map<WorkflowMapPayload>({ limit: 200, min_score: 0.5, edge_limit_per_node: 8 })
      .then((payload) => {
        if (!cancelled) setWorkflowMap(payload);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setMapError(err?.message || '加载实验地图失败');
      })
      .finally(() => {
        if (!cancelled) setMapLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, rightMode, mapReloadKey]);

  // ── 加载 report ──
  useEffect(() => {
    if (!isOpen || !selectedRunId) {
      setReportError(null);
      return;
    }
    if (reportRecordsByRunId[selectedRunId]) return;

    let cancelled = false;
    setReportLoading(true);
    setReportError(null);

    runtimeClient.executions
      .getReport<Record<string, unknown>>(selectedRunId)
      .then((data) => {
        if (!cancelled) {
          if (data.error) {
            setReportError(String(data.error));
          } else {
            setReportRecordsByRunId((current) => ({ ...current, [selectedRunId]: data }));
          }
        }
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setReportError(err?.message || '加载报告数据失败');
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, selectedRunId, reportRecordsByRunId]);

  // ── 展开/收起 workflow ──
  const toggleExpand = useCallback(async (wfId: string) => {
    setExpandedWorkflowIds((prev) => {
      const next = new Set(prev);
      if (next.has(wfId)) {
        next.delete(wfId);
        return next;
      }
      next.add(wfId);

      // 首次展开时加载最近执行
      if (!runsByWorkflowId[wfId]) {
        setRunsLoading((l) => new Set(l).add(wfId));
        runtimeClient.workflows
          .executions<{ items: RunSummary[]; total: number; hasMore: boolean }>(wfId, {
            limit: RECENT_RUNS_DEFAULT_LIMIT,
          })
          .then((resp) => {
            setRunsByWorkflowId((r) => ({ ...r, [wfId]: resp.items || [] }));
            setRunTotalByWorkflowId((t) => ({ ...t, [wfId]: resp.total }));
          })
          .catch(() => {
            setRunsByWorkflowId((r) => ({ ...r, [wfId]: [] }));
          })
          .finally(() => {
            setRunsLoading((l) => {
              const next = new Set(l);
              next.delete(wfId);
              return next;
            });
          });
      }
      return next;
    });
  }, [runsByWorkflowId]);

  // ── 加载更多 runs ──
  const loadMoreRuns = useCallback(async (wfId: string) => {
    const current = runsByWorkflowId[wfId] || [];
    setRunsLoading((l) => new Set(l).add(wfId));
    try {
      const resp = await runtimeClient.workflows.executions<{ items: RunSummary[]; total: number; hasMore: boolean }>(
        wfId,
        { limit: 10, offset: current.length },
      );
      setRunsByWorkflowId((r) => {
        const existing = r[wfId] || [];
        const existingIds = new Set(existing.map((run) => run.id));
        const appended = (resp.items || []).filter((run) => !existingIds.has(run.id));
        return { ...r, [wfId]: [...existing, ...appended] };
      });
      setRunTotalByWorkflowId((t) => ({ ...t, [wfId]: resp.total }));
    } catch {
      // ignore
    } finally {
      setRunsLoading((l) => {
        const next = new Set(l);
        next.delete(wfId);
        return next;
      });
    }
  }, [runsByWorkflowId]);

  // ── 点击 workflow 主项 ──
  const handleSelectWorkflow = useCallback((wfId: string) => {
    setSelectedWorkflowId(wfId);
    setSelectedRunId(null);
    setRightMode('definition');
  }, []);

  const handleOpenMap = useCallback(() => {
    setSelectedRunId(null);
    setRightMode('map');
  }, []);

  const handleReloadMap = useCallback(() => {
    setSelectedRunId(null);
    setRightMode('map');
    setMapReloadKey((value) => value + 1);
  }, []);

  // ── 点击 run ──
  const handleSelectRun = useCallback((wfId: string, runId: string) => {
    setSelectedWorkflowId(wfId);
    setSelectedRunId(runId);
    setRightMode('report');
  }, []);

  const handleBackToDefinition = useCallback(() => {
    setSelectedRunId(null);
    setRightMode('definition');
  }, []);

  const updateWorkflowFavoriteState = useCallback((wfId: string, isFavorite: boolean) => {
    setWorkflowSummaries((items) => items.map((item) => (
      item.id === wfId ? { ...item, isFavorite } : item
    )));
    setWorkflowDefinitionsById((items) => {
      const current = items[wfId];
      return current ? { ...items, [wfId]: { ...current, isFavorite } } : items;
    });
  }, []);

  const updateWorkflowNameState = useCallback((wfId: string, name: string, updatedAt?: string) => {
    setWorkflowSummaries((items) => items.map((item) => (
      item.id === wfId ? { ...item, name, updatedAt: updatedAt || item.updatedAt } : item
    )));
    setWorkflowDefinitionsById((items) => {
      const current = items[wfId];
      return current ? { ...items, [wfId]: { ...current, name, updatedAt: updatedAt || current.updatedAt } } : items;
    });
    setWorkflowMap((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => (
        node.id === wfId ? { ...node, name, updatedAt: updatedAt || node.updatedAt } : node
      )),
    } : current);
  }, []);

  const beginRenameWorkflow = useCallback((wf: WorkflowDefinition) => {
    setRenamingWorkflowId(wf.id);
    setRenameValue(displayWorkflowName(wf.name) || wf.name || '');
    setWorkflowActionMessage(null);
  }, []);

  const cancelRenameWorkflow = useCallback(() => {
    setRenamingWorkflowId(null);
    setRenameValue('');
  }, []);

  const saveWorkflowName = useCallback(async (wfId: string) => {
    const nextName = renameValue.trim();
    if (!nextName) {
      setWorkflowActionMessage('工作流名称不能为空');
      return;
    }

    setRenameSaving(true);
    setWorkflowActionMessage(null);
    try {
      const response = await runtimeClient.workflows.updateName(wfId, nextName);
      updateWorkflowNameState(response.id, response.name, response.updatedAt);
      setRenamingWorkflowId(null);
      setRenameValue('');
      setWorkflowActionMessage('名称已更新');
    } catch (err) {
      console.error('更新工作流名称失败:', err);
      setWorkflowActionMessage(err instanceof Error ? err.message : '名称更新失败');
    } finally {
      setRenameSaving(false);
    }
  }, [renameValue, updateWorkflowNameState]);

  const handleToggleFavorite = useCallback(async (wfId: string) => {
    if (favoriteUpdatingIds.has(wfId)) return;
    setFavoriteUpdatingIds((current) => new Set(current).add(wfId));
    setWorkflowActionMessage(null);
    try {
      const response = await runtimeClient.workflows.toggleFavorite<{ id: string; isFavorite: boolean }>(wfId);
      updateWorkflowFavoriteState(wfId, Boolean(response.isFavorite));
    } catch (err) {
      console.error('切换收藏状态失败:', err);
      setWorkflowActionMessage('收藏状态更新失败');
    } finally {
      setFavoriteUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(wfId);
        return next;
      });
    }
  }, [favoriteUpdatingIds, updateWorkflowFavoriteState]);

  const handleLoadWorkflowToCanvas = useCallback(async (wfId: string) => {
    setLoadingWorkflowId(wfId);
    setWorkflowActionMessage(null);
    try {
      const workflowData = await runtimeClient.workflows.get<WorkflowDefinition>(wfId);
      const sourceNodes = workflowData.nodes || [];
      const canvasNodes = workflowNodesForCanvas(sourceNodes);
      setNodes(canvasNodes);
      selectNode(null);
      setDraftWorkflowName(displayWorkflowName(workflowData.name));
      setWorkflowActionMessage('已加载到画布');
      onClose();
    } catch (err) {
      console.error('加载历史工作流失败:', err);
      setWorkflowActionMessage(err instanceof Error ? err.message : '加载到画布失败');
    } finally {
      setLoadingWorkflowId(null);
    }
  }, [onClose, selectNode, setDraftWorkflowName, setNodes]);

  // ── 导出 ──
  const handleExportPdf = async () => {
    if (!reportRef.current || !reportData) return;
    setIsExporting(true);
    try {
      const { exportToPdf } = await import('./pdfExporter');
      await exportToPdf(reportData, reportRef.current);
    } catch (err) {
      console.error('PDF 导出失败:', err);
      alert('PDF 导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportHtml = async () => {
    if (!reportData) return;
    setIsExporting(true);
    try {
      const { exportToHtml } = await import('./pdfExporter');
      exportToHtml(reportData);
    } catch (err) {
      console.error('HTML 导出失败:', err);
      alert('HTML 导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  const renderMapPanel = () => {
    if (mapLoading) {
      return <div className="report-modal__feedback"><span className="spinner" /><span>加载实验地图中...</span></div>;
    }
    if (mapError) {
      return (
        <div className="report-modal__feedback report-modal__feedback--error">
          <span>{mapError}</span>
          <button type="button" className="btn btn--sm btn--secondary" onClick={handleReloadMap}>重试</button>
        </div>
      );
    }
    return (
      <div className="report__preview report__preview--map">
        <div className="report__cover">
          <div className="report__title-row">
            <h1 className="report__title">实验地图</h1>
            <div className="report__definition-actions">
              <button
                type="button"
                className="btn btn--sm btn--secondary"
                onClick={() => selectedWorkflowId && handleSelectWorkflow(selectedWorkflowId)}
                disabled={!selectedWorkflowId}
              >
                查看选中定义
              </button>
            </div>
          </div>
        </div>
        <section className="report__section report__section--map">
          <div className="report__map-summary">
            <span><strong>{workflowMap?.nodes.length || 0}</strong>工作流</span>
            <span><strong>{workflowMap?.edges.length || 0}</strong>相似关系</span>
            <span>点击节点查看定义</span>
          </div>
          <WorkflowMapView
            data={workflowMap}
            selectedWorkflowId={selectedWorkflowId}
            onSelectWorkflow={handleSelectWorkflow}
          />
        </section>
      </div>
    );
  };

  // ── 右侧：workflow definition 面板 ──
  const renderDefinitionPanel = () => {
    if (defLoading && !workflowDefinition) {
      return <div className="report-modal__feedback"><span className="spinner" /><span>加载工作流定义中...</span></div>;
    }
    if (defError) {
      return <div className="report-modal__feedback report-modal__feedback--error">{defError}</div>;
    }
    if (!workflowDefinition) {
      return <div className="report-modal__feedback">选择左侧工作流查看详情</div>;
    }

    const wf = workflowDefinition;
    const visibleName = displayWorkflowName(wf.name);
    const isFavoriteUpdating = favoriteUpdatingIds.has(wf.id);
    const isLoadingWorkflow = loadingWorkflowId === wf.id;
    const isRenaming = renamingWorkflowId === wf.id;
    const systemSummary = buildWorkflowSystemSummary(wf.nodes || []);

    return (
      <div className="report__preview report__preview--definition">
        <div className="report__cover">
          <div className="report__title-row">
            {isRenaming ? (
              <div className="report__rename">
                <input
                  className="input report__rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveWorkflowName(wf.id);
                    if (e.key === 'Escape') cancelRenameWorkflow();
                  }}
                  autoFocus
                  maxLength={80}
                  aria-label="工作流名称"
                />
              </div>
            ) : (
              <h1 className="report__title">{visibleName || '工作流定义'}</h1>
            )}
            <div className="report__definition-actions">
              {isRenaming ? (
                <>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => void saveWorkflowName(wf.id)}
                    disabled={renameSaving}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={cancelRenameWorkflow}
                    disabled={renameSaving}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  onClick={() => beginRenameWorkflow(wf)}
                >
                  重命名
                </button>
              )}
              <button
                type="button"
                className={`btn btn--sm btn--secondary report__favorite-btn ${wf.isFavorite ? 'is-favorited' : ''}`}
                onClick={() => void handleToggleFavorite(wf.id)}
                disabled={isFavoriteUpdating}
              >
                {wf.isFavorite ? '已收藏' : '收藏'}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--primary is-prominent"
                onClick={() => void handleLoadWorkflowToCanvas(wf.id)}
                disabled={isLoadingWorkflow}
              >
                {isLoadingWorkflow ? '加载中...' : '加载到画布'}
              </button>
            </div>
          </div>
          {workflowActionMessage && <div className="report__action-message">{workflowActionMessage}</div>}
        </div>

        <section className="report__section">
          <h2 className="report__section-title">系统摘要</h2>
          <div className="report__system-summary">
            {systemSummary.length > 0 ? systemSummary.map((item) => (
              <span key={item}>{item}</span>
            )) : <span>暂无可提取摘要</span>}
          </div>
        </section>

        <section className="report__section">
          <h2 className="report__section-title">节点流程</h2>
          <div className="report__table-scroll">
            <table className="report__nodes-table report__nodes-table--definition">
              <thead>
                <tr>
                  <th>#</th>
                  <th>节点类型</th>
                  <th>关键参数</th>
                </tr>
              </thead>
              <tbody>
                {(wf.nodes || []).map((node, idx) => {
                  const type = String(node.type ?? 'unknown');
                  const indentLevel = Number(node.indentLevel ?? node.depth ?? 0);
                  return (
                    <tr key={String(node.id ?? idx)} className={`indent-level-${indentLevel}`}>
                      <td>{idx + 1}</td>
                      <td>{NODE_TYPE_LABELS[type] ?? type}</td>
                      <td className="report__node-params">{summarizeNodeParams(type, node)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="report__section">
          <h2 className="report__section-title">执行统计</h2>
          <div className="report__stats-strip">
            <span><strong>{wf.executionCount}</strong>总执行</span>
            <span><strong>{wf.successCount}</strong>成功</span>
            <span><strong>{wf.failedCount}</strong>失败</span>
            <span><strong>{wf.cancelledCount}</strong>取消</span>
          </div>
        </section>

      </div>
    );
  };

  // ── 右侧：report 面板 ──
  const renderReportPanel = () => {
    if (reportLoading && !reportData) {
      return <div className="report-modal__feedback"><span className="spinner" /><span>加载报告数据中...</span></div>;
    }
    if (reportError) {
      return <div className="report-modal__feedback report-modal__feedback--error">{reportError}</div>;
    }
    if (!reportData) {
      return <div className="report-modal__feedback">选择左侧执行记录后预览报告</div>;
    }

    return (
      <div className="report__preview" ref={reportRef}>
        <div className="report__cover">
          <h1 className="report__title">实验报告</h1>
          <div className="report__cover-info">
            <p><strong>项目名称</strong>{reportData.projectName || '-'}</p>
            <p><strong>样品名称</strong>{reportData.individualName || '-'}</p>
            <p><strong>工作流</strong>{reportData.workflowName || '-'}</p>
            <p><strong>执行时间</strong>{formatDateTime(reportData.startTime)}</p>
            <p><strong>操作人员</strong>{reportData.user || '-'}</p>
          </div>
        </div>

        <section className="report__section">
          <h2 className="report__section-title">执行摘要</h2>
          <div className="report__summary-grid">
            <div className="report__summary-item report__summary-item--full">
              <span>状态</span>
              <strong>
                <span className={`report__status ${statusClass(reportData.status)}`}>
                  <StatusLabel status={reportData.status} />
                </span>
              </strong>
            </div>
            {reportData.error && (
              <div className="report__summary-item report__summary-item--full report__summary-item--error">
                <span>错误信息</span>
                <strong>{reportData.error}</strong>
              </div>
            )}
            <div className="report__summary-item">
              <span>开始时间</span>
              <strong>{formatDateTime(reportData.startTime)}</strong>
            </div>
            <div className="report__summary-item">
              <span>结束时间</span>
              <strong>{formatDateTime(reportData.endTime)}</strong>
            </div>
            <div className="report__summary-item">
              <span>总耗时</span>
              <strong>{formatDuration(reportData.durationSeconds)}</strong>
            </div>
            <div className="report__summary-item">
              <span>警告数</span>
              <strong>{reportData.warnings}</strong>
            </div>
            <div className="report__summary-item">
              <span>产物数</span>
              <strong>{reportData.artifacts}</strong>
            </div>
            <div className="report__summary-item">
              <span>展开步骤数</span>
              <strong>{reportData.nodes.length}</strong>
            </div>
          </div>
        </section>

        <section className="report__section">
          <h2 className="report__section-title">展开步骤明细</h2>
          <div className="report__table-scroll">
            <table className="report__nodes-table report__nodes-table--steps">
              <thead>
                <tr>
                  <th>步骤</th>
                  <th>节点</th>
                  <th>关键参数</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th>输出或错误</th>
                </tr>
              </thead>
              <tbody>
                {reportData.nodes.map((node) => (
                  <tr key={`${node.index}-${node.type}-${node.iterationLabel}`} className={`indent-level-${node.indentLevel}`}>
                    <td>
                      <span className="report__step-index">{node.index}</span>
                      <span className="report__step-meta">原节点 {node.originalIndex}</span>
                      {node.blockLabel && <span className="report__step-meta">来自 {node.blockLabel}</span>}
                      {node.iterationLabel !== '-' && <span className="report__step-meta">{node.iterationLabel}</span>}
                    </td>
                    <td>{node.label}</td>
                    <td>{node.keyParams}</td>
                    <td><span className={`report__status ${statusClass(node.status)}`}><StatusLabel status={node.status} /></span></td>
                    <td>
                      <span>{node.durationSeconds != null ? formatDuration(node.durationSeconds) : '-'}</span>
                      {node.estimatedSeconds != null && <span className="report__step-meta">估算 {formatDuration(node.estimatedSeconds)}</span>}
                    </td>
                    <td className={node.error ? 'report__node-output report__node-output--error' : 'report__node-output'}>
                      {nodeOutputText(node)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {reportData.artifactDetails.length > 0 && (
          <section className="report__section">
            <h2 className="report__section-title">测量输出</h2>
            <div className="report__artifact-list">
              {reportData.artifactDetails.map((artifact) => (
                <div className="report__artifact" key={artifact.filePath}>
                  <span className="report__artifact-type">{artifact.fileType || 'output'}</span>
                  <span className="report__artifact-path">{artifact.filePath}</span>
                  {artifact.dataPoints != null && <span className="report__artifact-meta">{artifact.dataPoints} 点</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {reportData.warningDetails.length > 0 && (
          <section className="report__section">
            <h2 className="report__section-title">警告记录</h2>
            <div className="report__warning-list">
              {reportData.warningDetails.map((warning, index) => (
                <div className="report__warning" key={`${warning.createdAt || index}-${warning.message}`}>
                  <span className="report__warning-type">{warning.type || 'warning'}</span>
                  <span>{warning.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="report__footer">
          <p>生成时间: {formatDateTime(reportData.generatedAt)} | ZAHNERFLOW 实验报告系统</p>
        </div>
      </div>
    );
  };

  // ── 左侧 sidebar ──
  const renderSidebar = () => (
    <aside className="report-history">
      {wfError && (
        <div className="report-history__error">
          <span>{wfError}</span>
          <button className="btn btn--xs btn--warning btn--rounded" onClick={() => void loadWorkflowSummaries()} disabled={wfLoading}>
            重试
          </button>
        </div>
      )}

      <div className="report-history__list">
        {wfLoading && workflowSummaries.length === 0 ? (
          <div className="report-history__feedback"><span className="spinner" /><span>加载工作流列表中...</span></div>
        ) : visibleWorkflowSummaries.length === 0 ? (
          <div className="report-history__feedback">{showFavoritesOnly ? '暂无收藏工作流' : '暂无工作流'}</div>
        ) : (
          visibleWorkflowSummaries.map((wf) => {
            const isExpanded = expandedWorkflowIds.has(wf.id);
            const isSelected = selectedWorkflowId === wf.id && !selectedRunId;
            const runs = runsByWorkflowId[wf.id] || [];
            const runsLoadingThis = runsLoading.has(wf.id);
            const runTotal = runTotalByWorkflowId[wf.id] || 0;
            const visibleName = displayWorkflowName(wf.name);
            const isFavoriteUpdating = favoriteUpdatingIds.has(wf.id);

            return (
              <div key={wf.id} className="report-history__wf-group">
                {/* workflow 主项 */}
                <button
                  type="button"
                  className={`report-history__item report-history__wf-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelectWorkflow(wf.id)}
                >
                  <span className="report-history__wf-content">
                    <span className="report-history__item-header">
                      {visibleName && <span className="report-history__item-title">{visibleName}</span>}
                      <span className="report__short-id">{wf.shortId}</span>
                    </span>
                    <span className="report-history__item-subtitle">
                      <span>{wf.nodeCount} 节点</span>
                      <span>{wf.loopCount} 循环</span>
                      <span>{wf.executionCount} 次执行</span>
                    </span>
                  </span>
                  <span className="report-history__wf-actions">
                    <span
                      className={`report-history__item-fav ${wf.isFavorite ? 'is-favorited' : ''}`}
                      onClick={(e) => { e.stopPropagation(); void handleToggleFavorite(wf.id); }}
                      aria-disabled={isFavoriteUpdating}
                      title={wf.isFavorite ? '取消收藏' : '收藏'}
                    >
                      ✦
                    </span>
                    <span className="report-history__item-expand" onClick={(e) => { e.stopPropagation(); void toggleExpand(wf.id); }}>
                      <WorkflowExpandArrow expanded={isExpanded} />
                    </span>
                  </span>
                </button>

                {/* 展开后的 runs */}
                {isExpanded && (
                  <div className="report-history__runs">
                    {runsLoadingThis && runs.length === 0 && (
                      <div className="report-history__run-loading">加载中...</div>
                    )}
                    {runs.map((run) => {
                      const isRunSelected = selectedRunId === run.id;
                      return (
                        <button
                          key={run.id}
                          type="button"
                          className={`report-history__item report-history__run-item ${isRunSelected ? 'is-selected' : ''}`}
                          onClick={() => handleSelectRun(wf.id, run.id)}
                        >
                          <span className="report-history__run-line">
                            <span>{formatDateTime(run.startedAt)}</span>
                            {run.durationMs > 0 && <span>{formatDuration(run.durationMs / 1000)}</span>}
                            <span className={`report__status ${statusClass(run.status)}`}>
                              <StatusLabel status={run.status} />
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {runTotal > RECENT_RUNS_DEFAULT_LIMIT && runs.length < runTotal && (
                      <button
                        className="btn btn--xs btn--secondary report-history__load-more"
                        onClick={() => void loadMoreRuns(wf.id)}
                        disabled={runsLoadingThis}
                      >
                        {runsLoadingThis ? '加载中...' : `查看全部 (${runTotal})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );

  // ── 主渲染 ──
  return (
    <ModalLayer
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      centered
      id="report-modal-overlay"
    >
      {({ close }) => (
        <div className="report-modal">
          <div className="report-modal__header">
            <div className="report-modal__title-group">
              <h2>实验记录</h2>
              <button
                type="button"
                className={`btn btn--xs btn--secondary report-modal__filter-btn ${showFavoritesOnly ? 'is-active' : ''}`}
                onClick={() => setShowFavoritesOnly((value) => !value)}
              >
                {showFavoritesOnly ? '全部' : '收藏'}
              </button>
              <button
                type="button"
                className={`btn btn--xs btn--secondary report-modal__filter-btn ${rightMode === 'map' ? 'is-active' : ''}`}
                onClick={rightMode === 'map' ? handleBackToDefinition : handleOpenMap}
              >
                {rightMode === 'map' ? '列表' : '地图'}
              </button>
            </div>
            <div className="report-modal__actions">
              {rightMode === 'map' && selectedWorkflowId && (
                <button className="btn btn--sm btn--secondary" onClick={handleBackToDefinition}>
                  返回工作流定义
                </button>
              )}
              {rightMode === 'report' && (
                <>
                  <button className="btn btn--sm btn--secondary" onClick={handleBackToDefinition}>
                    ← 返回工作流定义
                  </button>
                  <button className="btn btn--sm btn--secondary" onClick={handleExportHtml} disabled={isExporting || !reportData}>
                    导出 HTML
                  </button>
                  <button className="btn btn--sm btn--primary is-prominent" onClick={handleExportPdf} disabled={isExporting || !reportData}>
                    {isExporting ? '导出中...' : '导出 PDF'}
                  </button>
                </>
              )}
              <button className="btn btn--sm btn--ghost btn--icon btn--rounded" onClick={close}>
                ✕
              </button>
            </div>
          </div>

          <div className="report-modal__body">
            {renderSidebar()}
            <main className="report-modal__preview-pane">
              {rightMode === 'definition' ? renderDefinitionPanel() : rightMode === 'map' ? renderMapPanel() : renderReportPanel()}
            </main>
          </div>
        </div>
      )}
    </ModalLayer>
  );
};

// ── 节点参数摘要（定义面板用） ──
function summarizeNodeParams(type: string, node: Record<string, unknown>): string {
  const data = (node.data ?? node.parameters ?? node.config ?? {}) as Record<string, unknown>;
  if (!data || typeof data !== 'object') return '-';

  const candidates: Record<string, string[]> = {
    change_temperature: ['targetTemperature', 'temperature', 'holdTime', 'duration'],
    change_gas_flow: ['address', 'gasType', 'flowSccm', 'sccm', 'duration'],
    wait_delay: ['duration', 'seconds', 'minutes'],
    scheduled_start: ['hour', 'minute', 'nextDay'],
    loop_start: ['iterations', 'count'],
    chronoamperometry: ['voltage', 'duration'],
    chronopotentiometry: ['current', 'duration'],
    eis_potentiostatic: ['voltageBias', 'amplitude', 'startFrequency', 'endFrequency'],
    eis_galvanostatic: ['currentBias', 'amplitude', 'startFrequency', 'endFrequency'],
  };

  const keys = candidates[type] ?? Object.keys(data).slice(0, 4);
  const parts = keys
    .filter((key) => key in data)
    .map((key) => `${key}: ${data[key]}`)
    .filter(Boolean);

  return parts.length > 0 ? parts.join(' | ') : '-';
}

function buildWorkflowSystemSummary(nodes: Array<Record<string, unknown>>): string[] {
  const temperatures: string[] = [];
  const gases: string[] = [];
  const measurements: string[] = [];
  let waitSeconds = 0;
  let loopCount = 0;

  nodes.forEach((node) => {
    const type = String(node.type ?? '');
    const data = (node.data ?? node.parameters ?? node.config ?? {}) as Record<string, unknown>;

    if (type === 'change_temperature') {
      const temp = pickFirstValue(data, ['targetTemperature', 'temperature']);
      if (temp != null) temperatures.push(`${temp}℃`);
    } else if (type === 'change_gas_flow') {
      const gas = pickFirstValue(data, ['gasType', 'gas', 'name']);
      const flow = pickFirstValue(data, ['flowSccm', 'sccm', 'flow']);
      if (gas != null || flow != null) gases.push([flow != null ? `${flow} sccm` : null, gas].filter(Boolean).join(' '));
    } else if (type === 'wait_delay') {
      const duration = Number(pickFirstValue(data, ['duration', 'seconds']));
      if (Number.isFinite(duration)) waitSeconds += duration;
    } else if (type === 'loop_start') {
      loopCount += 1;
    } else if (type === 'ocp_measurement') {
      measurements.push('OCP');
    } else if (type === 'eis_potentiostatic') {
      measurements.push(`EIS ${formatFrequencyRange(data)}`.trim());
    } else if (type === 'eis_galvanostatic') {
      measurements.push(`GEIS ${formatFrequencyRange(data)}`.trim());
    } else if (type === 'chronoamperometry') {
      measurements.push('CA');
    } else if (type === 'chronopotentiometry') {
      measurements.push('CP');
    } else if (type === 'voltage_ramp') {
      measurements.push('LSV');
    } else if (type === 'current_ramp') {
      measurements.push('GSV');
    }
  });

  const summary = [
    unique(temperatures).slice(0, 3).join(' / '),
    unique(gases).slice(0, 4).join(' / '),
    unique(measurements).slice(0, 8).join(' -> '),
    waitSeconds > 0 ? `等待 ${formatCompactDuration(waitSeconds)}` : '',
    loopCount > 0 ? `${loopCount} 个循环` : '',
    `${nodes.length} 个节点`,
  ].filter(Boolean);

  return summary;
}

function pickFirstValue(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (data[key] != null && data[key] !== '') return data[key];
  }
  return undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatFrequencyRange(data: Record<string, unknown>): string {
  const high = pickFirstValue(data, ['eisUpperFrequency', 'startFrequency', 'upperFrequency']);
  const low = pickFirstValue(data, ['eisLowerFrequency', 'endFrequency', 'lowerFrequency']);
  if (high == null && low == null) return '';
  if (high != null && low != null) return `${formatFrequency(high)}-${formatFrequency(low)}`;
  return formatFrequency(high ?? low);
}

function formatFrequency(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric >= 1000) return `${Number((numeric / 1000).toFixed(3))} kHz`;
  return `${numeric} Hz`;
}

function formatCompactDuration(seconds: number): string {
  if (seconds >= 3600) return `${Number((seconds / 3600).toFixed(2))} h`;
  if (seconds >= 60) return `${Number((seconds / 60).toFixed(1))} min`;
  return `${seconds} s`;
}

export default ReportGeneratorModal;
