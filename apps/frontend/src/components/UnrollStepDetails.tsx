import type { UnrollExplorerRow } from './unrollViewModel';

export function UnrollStepDetails({ row }: { row: UnrollExplorerRow | null }) {
  if (!row) return <div className="unroll-dialog__state"><strong>选择步骤查看详情</strong><p>从左向右逐层打开执行结构，最终步骤会在最右侧显示完整信息。</p></div>;
  return <>
    <h4>步骤 #{row.ordinal} · {row.advancedLabel || row.displayName}</h4>
    <dl>
      <div className="property-group"><dt>画布来源</dt><dd>节点 #{row.step.originalIndex + 1}</dd></div>
      <div className="property-group"><dt>实际执行</dt><dd>{row.displayName}</dd></div>
      {row.iterationLabel && <><div className="property-group"><dt>循环路径</dt><dd>{row.iterationLabel}</dd></div></>}
      {row.blockLabel && <><div className="property-group"><dt>工作流块</dt><dd>{row.blockLabel}</dd></div></>}
      {row.advancedMeta && <><div className="property-group"><dt>内部位置</dt><dd>{[row.advancedMeta.stepLabel, row.advancedMeta.cycleLabel, row.advancedMeta.valueLabel].filter(Boolean).join(' · ')}</dd></div></>}
      <div className="property-group"><dt>参数</dt><dd>{row.parameterSummary === '-' ? '无额外参数' : row.parameterSummary}</dd></div>
    </dl>
  </>;
}
