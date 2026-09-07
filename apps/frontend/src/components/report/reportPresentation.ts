import type { ReportNodeInfo } from './types';

const STATUS_TEXT: Record<string, string> = { completed: '成功', success: '成功', failed: '失败', cancelled: '已取消', running: '执行中', paused: '已暂停', cancelling: '取消中', skipped: '已跳过', pending: '未执行' };
export function getReportStatusText(status: string): string { return STATUS_TEXT[status] || '未执行'; }

export function nodeOutputText(node: ReportNodeInfo): string {
  if (node.error) return node.error;
  if (node.csvPath) return node.csvPath;
  if (node.outputFile) return node.outputFile;
  if (node.resultSummary) return node.resultSummary;
  return '-';
}


export function statusClass(status: string): string {
  return `is-status-${status || 'pending'}`;
}
