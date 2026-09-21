import type { ReportData } from './types';
import { formatDuration } from './reportDataBuilder';

const STATUS_TEXT: Record<string, string> = { completed: '成功', success: '成功', failed: '失败', cancelled: '已取消', running: '执行中', paused: '已暂停', cancelling: '取消中', skipped: '已跳过', pending: '未执行' };
export function getReportStatusText(status: string): string { return STATUS_TEXT[status] || '未执行'; }

export function reportErrorDetails(report: ReportData): string[] {
  const failedNodes = report.nodes.filter((node) => node.status === 'failed' || node.error);
  const details = failedNodes.map((node) =>
    [
      `#${node.type === 'startup' ? 0 : node.index} ${node.label}：${node.error || '执行失败，未提供错误说明'}`,
      `关键参数：${node.keyParams || '-'}`,
      `耗时：${node.durationSeconds != null ? formatDuration(node.durationSeconds) : '-'}（估算 ${node.estimatedSeconds != null ? formatDuration(node.estimatedSeconds) : '-'}）`,
    ].join('\n'),
  );
  if (report.error && !failedNodes.some((node) => node.error === report.error)) {
    details.push(report.error);
  }
  return details;
}

export function statusClass(status: string): string {
  return `is-status-${status || 'pending'}`;
}
