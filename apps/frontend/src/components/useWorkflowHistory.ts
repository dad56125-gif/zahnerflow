/**
 * 工作流历史记录 Hook
 * 从 WorkflowManagerUI.tsx 提取的数据加载和操作逻辑
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../shared/api';
import { useCanvasStore } from '@/canvas/canvasStore';
import { useWorkflowStore } from '@/workflow';

// 工作流历史记录接口
export interface WorkflowHistory {
    id: string;
    name: string;
    filename: string;
    filepath: string;
    project_name: string;
    created_at: string;
    file_size?: number;
    node_count?: number;
    connection_count?: number;
    loop_count?: number;
}

interface UseWorkflowHistoryOptions {
    currentUser: string | null;
    selectedProject: string;
    activeTab: 'templates' | 'history';
}

export const useWorkflowHistory = (options: UseWorkflowHistoryOptions) => {
    const { currentUser, selectedProject, activeTab } = options;

    const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [projects, setProjects] = useState<string[]>([]);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

    const { setNodes } = useCanvasStore();
    const { setCurrentWorkflow } = useWorkflowStore();

    // 加载项目列表
    const loadProjects = useCallback(async () => {
        if (!currentUser) return;
        try {
            const response: any = await api.get(`/files/projects?user=${currentUser}`);
            if (response?.success) {
                const list = Array.isArray(response.projects)
                    ? (response.projects as string[])
                    : (Array.isArray(response.data) ? (response.data as string[]) : []);
                setProjects(list);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }, [currentUser]);

    // 加载历史工作流列表
    const loadWorkflowHistory = useCallback(async () => {
        setLoadingHistory(true);
        setHistoryError('');

        try {
            const response: any = await api.get('/workflows?limit=50');

            let workflows = [];
            if (response?.items && Array.isArray(response.items)) {
                workflows = response.items;
            } else if (Array.isArray(response)) {
                workflows = response;
            } else if (response?.data && Array.isArray(response.data)) {
                workflows = response.data;
            } else {
                setHistoryError('无法解析工作流数据格式');
                setWorkflowHistory([]);
                return;
            }

            const formattedWorkflows = workflows.map((workflow: any) => ({
                id: workflow.id,
                name: workflow.name,
                filename: `${workflow.id}.json`,
                filepath: `/api/workflows/${workflow.id}`,
                project_name: workflow.individualName || workflow.ownerName || '默认项目',
                created_at: workflow.createdAt,
                node_count: workflow.definition?.nodes?.length || 0,
                connection_count: workflow.definition?.edges?.length || 0,
                loop_count: Math.floor((workflow.definition?.nodes?.length || 0) / 2)
            }));

            const sortedWorkflows = formattedWorkflows.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            const filteredWorkflows = selectedProject
                ? sortedWorkflows.filter(w => w.project_name === selectedProject)
                : sortedWorkflows;

            setWorkflowHistory(filteredWorkflows);

            if (filteredWorkflows.length === 0) {
                setHistoryError('没有找到匹配的工作流');
            }
        } catch (error) {
            console.error('Failed to load workflow history:', error);
            setHistoryError('网络错误，无法加载历史工作流');
            setWorkflowHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    }, [selectedProject]);

    // 加载特定历史工作流
    const loadHistoryWorkflow = useCallback(async (workflow: WorkflowHistory) => {
        try {
            const response = await api.get(`/workflows/${workflow.id}`);
            let workflowData = response;

            if (!workflowData) {
                throw new Error(`找不到工作流 "${workflow.name}"`);
            }

            const workflowDefinition = (workflowData as any)?.data?.definition || (workflowData as any)?.definition || {};

            const convertedNodes = workflowDefinition.nodes?.map((node: any) => {
                const isOldVersion = !node.data;
                let parameters: Record<string, any> = {};
                if (isOldVersion) {
                    parameters = node.config?.parameters || {};
                } else {
                    parameters = node.data?.parameters || node.config?.parameters || {};
                }

                if ('loop_id' in parameters) {
                    delete parameters.loop_id;
                }

                return {
                    id: node.id,
                    type: node.type,
                    config: parameters,
                };
            }) || [];

            setNodes(convertedNodes);
            setCurrentWorkflow({
                id: workflow.id,
                name: workflow.name,
                nodes: convertedNodes,
                ownerName: workflow.project_name || '默认项目',
                project_name: workflow.project_name,
            });

            console.log(`历史工作流 "${workflow.name}" 加载成功`);

        } catch (error) {
            console.error('加载历史工作流失败:', error);
            alert(`加载工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [setNodes, setCurrentWorkflow]);

    // 删除历史工作流
    const deleteHistoryWorkflow = useCallback(async (workflow: WorkflowHistory) => {
        try {
            setWorkflowHistory(prev => prev.filter(item => item.id !== workflow.id));
            setDeletingItemId(null);
            console.log(`历史工作流 "${workflow.name}" 已从列表中移除`);
        } catch (error) {
            console.error('删除历史工作流失败:', error);
            setDeletingItemId(null);
            alert(`删除工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, []);

    // 显示/取消删除确认
    const showDeleteConfirm = useCallback((workflow: WorkflowHistory) => {
        setDeletingItemId(workflow.id);
    }, []);

    const cancelDelete = useCallback(() => {
        setDeletingItemId(null);
    }, []);

    // 自动加载
    useEffect(() => {
        if (currentUser) {
            loadProjects();
        }
    }, [currentUser, loadProjects]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadWorkflowHistory();
        }
    }, [activeTab, selectedProject, loadWorkflowHistory]);

    return {
        // 状态
        workflowHistory,
        loadingHistory,
        historyError,
        projects,
        deletingItemId,
        // 操作
        loadWorkflowHistory,
        loadHistoryWorkflow,
        deleteHistoryWorkflow,
        showDeleteConfirm,
        cancelDelete,
    };
};
