/**
 * 实验报告模块 - 报告预览 + 导出弹窗
 */

import React, { useRef, useState, useMemo } from 'react';
import { ReportData } from './types';
import { exportToPdf, generateReportHtml } from './pdfExporter';
import { buildReportData, formatDuration, formatDateTime } from './reportDataBuilder';
import { Workflow } from '../../types/Interfaces';
import './_report.css';

interface ReportGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    workflow: Workflow | null;
    execution: {
        executionId: string;
        workflowId: string;
        status: 'completed' | 'failed' | 'cancelled';
        startTime: string;
        endTime?: string;
        duration?: number;
    } | null;
    user?: string;
}

export const ReportGeneratorModal: React.FC<ReportGeneratorModalProps> = ({
    isOpen,
    onClose,
    workflow,
    execution,
    user = 'Unknown',
}) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);

    // 构建报告数据
    const reportData = useMemo<ReportData | null>(() => {
        if (!workflow || !execution) return null;
        return buildReportData(workflow, execution, [], user);
    }, [workflow, execution, user]);

    // 导出 PDF
    const handleExportPdf = async () => {
        if (!reportRef.current || !reportData) return;

        setIsExporting(true);
        try {
            await exportToPdf(reportData, reportRef.current);
        } catch (error) {
            console.error('PDF 导出失败:', error);
            alert('PDF 导出失败，请重试');
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen || !reportData) return null;

    const statusIcon = reportData.status === 'completed' ? '✅' : '❌';
    const statusText = reportData.status === 'completed' ? '成功' :
        reportData.status === 'failed' ? '失败' : '已取消';

    return (
        <div className="report-modal-overlay" onClick={onClose}>
            <div className="report-modal" onClick={e => e.stopPropagation()}>
                {/* 头部 */}
                <div className="report-modal-header">
                    <h2>实验报告预览</h2>
                    <div className="report-modal-actions">
                        <button
                            className="report-export-btn"
                            onClick={handleExportPdf}
                            disabled={isExporting}
                        >
                            {isExporting ? '导出中...' : '📄 导出 PDF'}
                        </button>
                        <button className="report-close-btn" onClick={onClose}>✕</button>
                    </div>
                </div>

                {/* 预览区域 */}
                <div className="report-modal-body">
                    <div className="report-preview" ref={reportRef}>
                        {/* 封面页 */}
                        <div className="report-cover">
                            <h1 className="report-title">实验报告</h1>
                            <div className="report-cover-divider"></div>
                            <div className="report-cover-info">
                                <p><strong>项目名称:</strong> {reportData.projectName}</p>
                                {reportData.individualName && (
                                    <p><strong>样品名称:</strong> {reportData.individualName}</p>
                                )}
                                <p><strong>工作流:</strong> {reportData.workflowName}</p>
                                <p><strong>执行时间:</strong> {formatDateTime(reportData.startTime)}</p>
                                <p><strong>操作人员:</strong> {reportData.user}</p>
                            </div>
                        </div>

                        {/* 执行摘要 */}
                        <div className="report-section">
                            <h2 className="report-section-title">执行摘要</h2>
                            <table className="report-summary-table">
                                <tbody>
                                    <tr><td>执行ID</td><td>{reportData.executionId}</td></tr>
                                    <tr><td>状态</td><td>{statusIcon} {statusText}</td></tr>
                                    <tr><td>开始时间</td><td>{formatDateTime(reportData.startTime)}</td></tr>
                                    <tr><td>结束时间</td><td>{formatDateTime(reportData.endTime)}</td></tr>
                                    <tr><td>总耗时</td><td>{formatDuration(reportData.duration)}</td></tr>
                                    <tr><td>节点总数</td><td>{reportData.nodes.length}</td></tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 节点执行明细表 */}
                        <div className="report-section">
                            <h2 className="report-section-title">节点执行明细</h2>
                            <table className="report-nodes-table">
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
                                    {reportData.nodes.map(node => (
                                        <tr key={node.index} className={`indent-level-${node.indentLevel}`}>
                                            <td>
                                                {node.indentLevel > 0 && <span className="indent-marker">└</span>}
                                                {node.index}
                                            </td>
                                            <td>{node.label}</td>
                                            <td>{node.keyParams}</td>
                                            <td>
                                                {node.status === 'success' && '✅'}
                                                {node.status === 'failed' && '❌'}
                                                {node.status === 'skipped' && '⏭️'}
                                                {node.status === 'pending' && '⏳'}
                                            </td>
                                            <td>{node.duration ? formatDuration(node.duration) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 页脚 */}
                        <div className="report-footer">
                            <p>生成时间: {formatDateTime(new Date())} | ZahnerFlow 实验报告系统</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportGeneratorModal;
