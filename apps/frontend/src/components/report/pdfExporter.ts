import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { formatDateTime, formatDuration } from './reportDataBuilder';
import { STATUS_ICONS, type ReportData } from './types';

function formatFileDate(primaryIsoString: string, fallbackIsoString?: string): string {
  const date = new Date(primaryIsoString);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  if (fallbackIsoString) {
    const fallbackDate = new Date(fallbackIsoString);
    if (!Number.isNaN(fallbackDate.getTime())) {
      return fallbackDate.toISOString().slice(0, 10).replace(/-/g, '');
    }
  }

  const now = new Date();
  if (!Number.isNaN(now.getTime())) {
    return now.toISOString().slice(0, 10).replace(/-/g, '');
  }

  return 'unknown';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanFilePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || '未命名工作流';
}

function getStatusText(status: string): string {
  switch (status) {
    case 'completed':
      return '成功';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'running':
      return '执行中';
    default:
      return '待处理';
  }
}

export async function exportToPdf(reportData: ReportData, containerElement: HTMLElement): Promise<void> {
  const canvas = await html2canvas(containerElement, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/png');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth - 20;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;

  let heightLeft = imageHeight;
  let position = 10;

  pdf.addImage(imgData, 'PNG', 10, position, imageWidth, imageHeight);
  heightLeft -= pageHeight - 20;

  while (heightLeft > 0) {
    position = heightLeft - imageHeight + 10;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 10, position, imageWidth, imageHeight);
    heightLeft -= pageHeight - 20;
  }

  pdf.save(`实验报告_${cleanFilePart(reportData.workflowName)}_${formatFileDate(reportData.startTime, reportData.generatedAt)}.pdf`);
}

export function generateReportHtml(reportData: ReportData): string {
  const statusText = getStatusText(reportData.status);
  const artifactRows = reportData.artifactDetails
    .map((artifact) => `
      <tr>
        <td>${escapeHtml(artifact.fileType || 'output')}</td>
        <td>${escapeHtml(artifact.filePath)}</td>
        <td>${artifact.dataPoints != null ? escapeHtml(artifact.dataPoints) : '-'}</td>
      </tr>
    `)
    .join('');
  const warningRows = reportData.warningDetails
    .map((warning) => `
      <tr>
        <td>${escapeHtml(warning.type || 'warning')}</td>
        <td>${escapeHtml(warning.message)}</td>
      </tr>
    `)
    .join('');

  return `
    <div class="report-container">
      <div class="report-cover">
        <h1 class="report-title">实验报告</h1>
        <div class="report-cover-divider"></div>
        <div class="report-cover-info">
          <p><strong>项目名称:</strong> ${escapeHtml(reportData.projectName || '-')}</p>
          <p><strong>样品名称:</strong> ${escapeHtml(reportData.individualName || '-')}</p>
          <p><strong>工作流:</strong> ${escapeHtml(reportData.workflowName || '-')}</p>
          <p><strong>执行时间:</strong> ${formatDateTime(reportData.startTime)}</p>
          <p><strong>操作人员:</strong> ${escapeHtml(reportData.user || '-')}</p>
        </div>
      </div>
      <div class="report-section">
        <h2 class="report-section-title">执行摘要</h2>
        <table class="report-summary-table">
          <tbody>
            <tr><td>状态</td><td>${STATUS_ICONS[reportData.status] || ''} ${statusText}</td></tr>
            <tr><td>开始时间</td><td>${formatDateTime(reportData.startTime)}</td></tr>
            <tr><td>结束时间</td><td>${formatDateTime(reportData.endTime)}</td></tr>
            <tr><td>总耗时</td><td>${formatDuration(reportData.durationSeconds)}</td></tr>
            <tr><td>警告数</td><td>${reportData.warnings}</td></tr>
            <tr><td>产物数</td><td>${reportData.artifacts}</td></tr>
            <tr><td>展开步骤数</td><td>${reportData.nodes.length}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="report-section">
        <h2 class="report-section-title">展开步骤明细</h2>
        <table class="report-nodes-table">
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
            ${reportData.nodes
              .map(
                (node) => `
                  <tr class="indent-level-${node.indentLevel}">
                    <td>${node.index}<br><small>原节点 ${node.originalIndex}${node.iterationLabel !== '-' ? ` / ${escapeHtml(node.iterationLabel)}` : ''}</small></td>
                    <td>${escapeHtml(node.label)}</td>
                    <td>${escapeHtml(node.keyParams)}</td>
                    <td>${STATUS_ICONS[node.status] || ''} ${getStatusText(node.status)}</td>
                    <td>${node.durationSeconds ? formatDuration(node.durationSeconds) : '-'}</td>
                    <td>${escapeHtml(node.error || node.csvPath || node.outputFile || node.resultSummary || '-')}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${artifactRows ? `
      <div class="report-section">
        <h2 class="report-section-title">测量输出</h2>
        <table>
          <thead><tr><th>类型</th><th>路径</th><th>数据点</th></tr></thead>
          <tbody>${artifactRows}</tbody>
        </table>
      </div>
      ` : ''}
      ${warningRows ? `
      <div class="report-section">
        <h2 class="report-section-title">警告记录</h2>
        <table>
          <thead><tr><th>类型</th><th>内容</th></tr></thead>
          <tbody>${warningRows}</tbody>
        </table>
      </div>
      ` : ''}
      <div class="report-footer">
        <p>生成时间: ${formatDateTime(reportData.generatedAt)} | ZahnerFlow 实验报告系统</p>
      </div>
    </div>
  `;
}

export function exportToHtml(reportData: ReportData): void {
  const body = generateReportHtml(reportData);
  const page = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>实验报告_${escapeHtml(reportData.workflowName)}</title>
  <style>
    body {
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      background: #f3f4f6;
      margin: 0;
      padding: 32px;
      color: #111827;
    }
    .report-container {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
      padding: 48px;
    }
    .report-cover {
      text-align: center;
      padding-bottom: 40px;
      border-bottom: 1px solid #e5e7eb;
    }
    .report-title {
      margin: 0 0 16px;
      font-size: 40px;
    }
    .report-cover-divider {
      width: 96px;
      height: 4px;
      margin: 0 auto 24px;
      background: linear-gradient(90deg, #0f766e, #0891b2);
      border-radius: 999px;
    }
    .report-cover-info {
      display: inline-block;
      text-align: left;
      line-height: 1.9;
    }
    .report-section {
      margin-top: 40px;
    }
    .report-section-title {
      font-size: 24px;
      margin: 0 0 16px;
      color: #0f766e;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 12px 16px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f9fafb;
    }
    small {
      color: #6b7280;
      line-height: 1.6;
    }
    .indent-level-1 td:first-child { padding-left: 32px; }
    .indent-level-2 td:first-child { padding-left: 48px; }
    .report-footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
    }
  </style>
</head>
<body>${body}</body>
</html>
  `;

  const blob = new Blob([page], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `实验报告_${cleanFilePart(reportData.workflowName)}_${formatFileDate(reportData.startTime, reportData.generatedAt)}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
