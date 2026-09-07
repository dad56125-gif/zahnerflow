import type { UnrollExplorerRow } from './unrollViewModel';

export function UnrollStepDetails({ row }: { row: UnrollExplorerRow | null }) {
  if (!row) return <div className="unroll-dialog__state"><strong>选择步骤查看详情</strong><p>支持搜索、结构定位和步骤编号跳转。列表内可用方向键切换。</p></div>;
  return <>
    <h4>步骤 #{row.ordinal} · {row.advancedLabel || row.displayName}</h4>
    <dl>
      <dt>画布来源</dt><dd>节点 #{row.step.originalIndex + 1}</dd>
      <dt>实际执行</dt><dd>{row.displayName}</dd>
      {row.iterationLabel && <><dt>循环路径</dt><dd>{row.iterationLabel}</dd></>}
      {row.blockLabel && <><dt>工作流块</dt><dd>{row.blockLabel}</dd></>}
      {row.advancedMeta && <><dt>内部位置</dt><dd>{[row.advancedMeta.stepLabel, row.advancedMeta.cycleLabel, row.advancedMeta.valueLabel].filter(Boolean).join(' · ')}</dd></>}
      <dt>参数</dt><dd>{row.parameterSummary === '-' ? '无额外参数' : row.parameterSummary}</dd>
    </dl>
    {row.isAutomaticBoundary && <p>系统自动边界不能作为手动起点。</p>}
    <details><summary>完整步骤参数</summary><pre>{JSON.stringify(row.step.node?.parameters ?? {}, null, 2)}</pre></details>
  </>;
}

