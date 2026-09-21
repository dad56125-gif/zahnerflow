import { forwardRef } from 'react';
import type { ReportData } from './types';
import { formatDateTime, formatDuration } from './reportDataBuilder';
import { StatusLabel } from './ReportStatus';
import { statusClass } from './reportPresentation';
import { reportErrorDetails } from './reportPresentation';

export const ReportPreview = forwardRef<HTMLDivElement, { reportData: ReportData }>(function ReportPreview({ reportData }, ref) {
  const errors = reportErrorDetails(reportData);
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
            {errors.length > 0 && (
              <div className="report__summary-item report__summary-item--full report__summary-item--error">
                <span>错误信息</span>
                <strong>{errors.map((error, index) => <div key={index}>{error}</div>)}</strong>
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
