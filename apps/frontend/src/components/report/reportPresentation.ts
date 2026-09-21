import type { ReportData } from './types';
import { formatDuration } from './reportDataBuilder';

const STATUS_TEXT: Record<string, string> = { completed: '成功', success: '成功', failed: '失败', cancelled: '已取消', running: '执行中', paused: '已暂停', cancelling: '取消中', skipped: '已跳过', pending: '未执行' };
export function getReportStatusText(status: string): string { return STATUS_TEXT[status] || '未执行'; }

interface ReportErrorField {
  label: string;
  value: string;
  full?: boolean;
  error?: boolean;
}

export function reportErrorDetails(report: ReportData): ReportErrorField[] {
  const failedNodes = report.nodes.filter((node) => node.status === 'failed' || node.error);
  const fields: ReportErrorField[] = failedNodes.flatMap((node) => [
    { label: '出错步骤', value: `#${node.type === 'startup' ? 0 : node.index} ${node.label}` },
    { label: '关键参数', value: node.keyParams || '-' },
    { label: '实际耗时', value: node.durationSeconds != null ? formatDuration(node.durationSeconds) : '-' },
    { label: '估算耗时', value: node.estimatedSeconds != null ? formatDuration(node.estimatedSeconds) : '-' },
    { label: '错误信息', value: node.error || '执行失败，未提供错误说明', full: true, error: true },
  ]);
  if (report.error && !failedNodes.some((node) => node.error === report.error)) {
    fields.push({ label: '错误信息', value: report.error, full: true, error: true });
  }
  return fields;
}

export function statusClass(status: string): string {
  return `is-status-${status || 'pending'}`;
}
