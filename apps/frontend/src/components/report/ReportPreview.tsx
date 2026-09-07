import { forwardRef } from 'react';
import type { ReportData } from './types';
import { formatDateTime, formatDuration } from './reportDataBuilder';
import { StatusLabel } from './ReportStatus';
import { statusClass } from './reportPresentation';
import { nodeOutputText } from './reportPresentation';

export const ReportPreview = forwardRef<HTMLDivElement, { reportData: ReportData }>(function ReportPreview({ reportData }, ref) {
  return (
      <div className="report__preview" ref={ref}>
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
});
