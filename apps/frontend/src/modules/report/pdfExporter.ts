/**
 * 实验报告模块 - PDF 导出逻辑
 * 使用 jsPDF + html2canvas 生成 PDF
 * 
 * ⚠️ 迁移说明：未来可替换为调用后端 Python API
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ReportData, STATUS_ICONS } from './types';
import { formatDuration, formatDateTime } from './reportDataBuilder';

/**
 * 导出报告为 PDF
 * @param reportData 报告数据
 * @param containerElement 报告预览 DOM 元素
 */
export async function exportToPdf(
    reportData: ReportData,
    containerElement: HTMLElement
): Promise<void> {
    // 1. 将 HTML 转为 Canvas
    const canvas = await html2canvas(containerElement, {
        scale: 2, // 提高清晰度
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
    });

    // 2. 创建 PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth - 20; // 左右边距 10mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // 3. 处理分页
    let heightLeft = imgHeight;
    let position = 10; // 上边距 10mm

    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight - 20;

    while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - 20;
    }

    // 4. 保存文件
    const fileName = `实验报告_${reportData.workflowName}_${formatFileDate(reportData.startTime)}.pdf`;
    pdf.save(fileName);
}

/**
 * 格式化文件名日期
 */
function formatFileDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 生成报告 HTML 内容（用于渲染预览）
 */
export function generateReportHtml(reportData: ReportData): string {
    const statusIcon = reportData.status === 'completed' ? '✅' : '❌';
    const statusText = reportData.status === 'completed' ? '成功' :
        reportData.status === 'failed' ? '失败' : '已取消';

    return `
    <div class="report-container">
      <!-- 封面页 -->
      <div class="report-cover">
        <h1 class="report-title">实验报告</h1>
        <div class="report-cover-divider"></div>
        <div class="report-cover-info">
          <p><strong>项目名称:</strong> ${reportData.projectName}</p>
          ${reportData.individualName ? `<p><strong>样品名称:</strong> ${reportData.individualName}</p>` : ''}
          <p><strong>工作流:</strong> ${reportData.workflowName}</p>
          <p><strong>执行时间:</strong> ${formatDateTime(reportData.startTime)}</p>
          <p><strong>操作人员:</strong> ${reportData.user}</p>
        </div>
      </div>

      <!-- 执行摘要 -->
      <div class="report-section">
        <h2 class="report-section-title">执行摘要</h2>
        <table class="report-summary-table">
          <tbody>
            <tr><td>执行ID</td><td>${reportData.executionId}</td></tr>
            <tr><td>状态</td><td>${statusIcon} ${statusText}</td></tr>
            <tr><td>开始时间</td><td>${formatDateTime(reportData.startTime)}</td></tr>
            <tr><td>结束时间</td><td>${formatDateTime(reportData.endTime)}</td></tr>
            <tr><td>总耗时</td><td>${formatDuration(reportData.duration)}</td></tr>
            <tr><td>节点总数</td><td>${reportData.nodes.length}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 节点执行明细表 -->
      <div class="report-section">
        <h2 class="report-section-title">节点执行明细</h2>
        <table class="report-nodes-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>节点类型</th>
              <th>关键参数</th>
              <th>状态</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.nodes.map(node => `
              <tr class="indent-level-${node.indentLevel}">
                <td>${node.indentLevel > 0 ? '└ ' : ''}${node.index}</td>
                <td>${node.label}</td>
                <td>${node.keyParams}</td>
                <td>${STATUS_ICONS[node.status] || ''}</td>
                <td>${node.duration ? formatDuration(node.duration) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- 页脚 -->
      <div class="report-footer">
        <p>生成时间: ${formatDateTime(new Date())} | ZahnerFlow 实验报告系统</p>
      </div>
    </div>
  `;
}
