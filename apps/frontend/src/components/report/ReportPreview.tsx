import { ReportMeasurementChart } from './ReportMeasurementChart';
import { groupReportCharts } from './reportCharts';
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
          <h2 className="report__section-title report__section-title--summary">执行摘要</h2>
          <div className="report__summary-grid">
            <div className="report__summary-item report__summary-item--full">
              <span>状态</span>
              <strong>
                <span className={`report__status ${statusClass(reportData.status)}`}>
                  <StatusLabel status={reportData.status} />
                </span>
              </strong>
            </div>
            {errors.map((field, index) => (
              <div key={index} className={`report__summary-item${field.full ? ' report__summary-item--full' : ''}${field.error ? ' report__summary-item--error' : ''}`}>
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
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

        {reportData.charts.length > 0 && (
          <section className="report__section report__section--charts">
            <h2 className="report__section-title">测量曲线</h2>
            {groupReportCharts(reportData.charts).map((group) => (
              <div className="report__chart-group" key={group.title}>
                <h3>{group.title}</h3>
                {group.charts.map((chart) => (
              <figure className="report__chart-card" key={chart.key}>
                <figcaption>{chart.title}</figcaption>
                {chart.option && <ReportMeasurementChart chart={chart} />}
                {chart.error ? <p>{chart.error}</p> : <p>{chart.pointCount} 个数据点</p>}
              </figure>
                ))}
              </div>
            ))}
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

</div>
    );
});
