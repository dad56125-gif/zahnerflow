/**
 * 工作流历史记录 Hook
 * 从 WorkflowManagerUI.tsx 提取的数据加载和操作逻辑
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../shared/api';
import { useCanvasStore } from '../state/canvasStore';
import { useWorkflowStore } from '../workflow';

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
    is_favorite?: boolean;
}

interface UseWorkflowHistoryOptions {
    currentUser: string | null;
    selectedProject: string;
    activeTab: 'history' | 'favorites';
}

export const useWorkflowHistory = (options: UseWorkflowHistoryOptions) => {
    const { currentUser, selectedProject, activeTab } = options;

    const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [projects, setProjects] = useState<string[]>([]);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 20;

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
    // reset: 是否重置列表（搜索条件变化或初始加载时为true，加载更多时为false）
    const loadWorkflowHistory = useCallback(async (reset = true) => {
        // 如果是加载更多且正在加载中或没有更多数据，则跳过
        if (!reset && (loadingHistory || !hasMore)) return;

        setLoadingHistory(true);
        if (reset) {
            setHistoryError('');
            setPage(1);
            setHasMore(true);
            setWorkflowHistory([]); // 可选：清空列表以显示骨架屏，或保留以避免闪烁
        }

        try {
            const currentPage = reset ? 1 : page + 1;

            // 构建查询参数
            let url = `/workflows?page=${currentPage}&limit=${PAGE_SIZE}`;
            if (selectedProject) {
                url += `&project=${encodeURIComponent(selectedProject)}`;
            }
            if (activeTab === 'favorites') {
                url += `&favorites=true`;
            }

            const response: any = await api.get(url);

            // 处理分页响应结构 { items: [], pagination: {...} }
            let workflows = [];
            let hasNextPage = false;

            if (response?.items && Array.isArray(response.items)) {
                workflows = response.items;
                hasNextPage = response.pagination?.hasNext || false;
            } else if (response?.data && Array.isArray(response.data)) {
                // 兼容旧格式或无分页格式（如果后端未完全更新）
                workflows = response.data;
                hasNextPage = false;
            } else if (Array.isArray(response)) {
                workflows = response;
                hasNextPage = false;
            } else {
                setHistoryError('无法解析工作流数据格式');
                return;
            }

            const formattedWorkflows = workflows.map((workflow: any) => {
                return {
                    id: workflow.id,
                    name: workflow.name,
                    filename: `${workflow.id}.json`,
                    filepath: `/api/workflows/${workflow.id}`,
                    project_name: workflow.ownerName || '默认项目',
                    created_at: workflow.createdAt,
                    node_count: workflow.nodeCount || 0,
                    connection_count: Math.max(0, (workflow.nodeCount || 0) - 1),
                    loop_count: workflow.loopCount || 0,
                    is_favorite: workflow.isFavorite || false
                };
            });

            // 后端已经按时间排序，无需前端重排

            if (reset) {
                setWorkflowHistory(formattedWorkflows);
            } else {
                setWorkflowHistory(prev => [...prev, ...formattedWorkflows]);
            }

            setHasMore(hasNextPage);
            setPage(currentPage);

            if (reset && formattedWorkflows.length === 0) {
                setHistoryError('没有找到匹配的工作流');
            }
        } catch (error) {
            console.error('Failed to load workflow history:', error);
            setHistoryError('网络错误，无法加载历史工作流');
            if (reset) setWorkflowHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    }, [selectedProject, page, loadingHistory, hasMore, activeTab]); // 注意依赖项 updated

    // 加载特定历史工作流
    const loadHistoryWorkflow = useCallback(async (workflow: WorkflowHistory) => {
        try {
            const response = await api.get(`/workflows/${workflow.id}`);
            const workflowData = response as any;

            if (!workflowData) {
                throw new Error(`找不到工作流 "${workflow.name}"`);
            }

            // 后端返回的工作流数据中，节点直接在 workflowData.nodes 上
            // 不需要通过 definition 访问
            const sourceNodes = workflowData.nodes || [];

            const convertedNodes = sourceNodes.map((node: any) => {
                // 节点的 config 字段直接使用
                let config: Record<string, any> = node.config || {};

                // 清理不需要的字段
                if ('loop_id' in config) {
                    delete config.loop_id;
                }

                return {
                    id: node.id,
                    type: node.type,
                    config: config,
                };
            });

            setNodes(convertedNodes);
            setCurrentWorkflow({
                id: workflowData.id || workflow.id,
                name: workflowData.name || workflow.name,
                nodes: convertedNodes,
                ownerName: workflowData.ownerName || workflowData.individualName || workflow.project_name || '默认项目',
                project_name: workflowData.individualName || workflowData.ownerName || workflow.project_name,
            });

            console.log(`历史工作流 "${workflow.name}" 加载成功，共 ${convertedNodes.length} 个节点`);

        } catch (error) {
            console.error('加载历史工作流失败:', error);
            alert(`加载工作流 "${workflow.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }, [setNodes, setCurrentWorkflow]);

    // 删除历史工作流
    const deleteHistoryWorkflow = useCallback(async (workflow: WorkflowHistory) => {
        try {
            // ✅ 调用后端 API 执行真删除
            await api.delete(`/workflows/${workflow.id}`);

            setWorkflowHistory(prev => prev.filter(item => item.id !== workflow.id));
            setDeletingItemId(null);
            console.log(`历史工作流 "${workflow.name}" 已成功删除`);
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

    // 切换收藏状态
    const toggleFavorite = useCallback(async (workflow: WorkflowHistory) => {
        try {
            const response: any = await api.post(`/workflows/${workflow.id}/favorite`);
            const isFavorite = response.isFavorite ?? response.data?.isFavorite ?? !workflow.is_favorite;
            // 更新本地状态
            setWorkflowHistory(prev => prev.map(item =>
                item.id === workflow.id
                    ? { ...item, is_favorite: isFavorite }
                    : item
            ));
            console.log(`工作流 "${workflow.name}" 收藏状态: ${isFavorite ? '已收藏' : '取消收藏'}`);
        } catch (error) {
            console.error('切换收藏状态失败:', error);
        }
    }, []);


    // 自动加载
    useEffect(() => {
        if (currentUser) {
            loadProjects();
        }
    }, [currentUser, loadProjects]);

    useEffect(() => {
        if (activeTab === 'history' || activeTab === 'favorites') {
            loadWorkflowHistory(true);
        }
    }, [activeTab, selectedProject]); // 移除 loadWorkflowHistory 以避免死循环，因为 loadWorkflowHistory 依赖 page 等状态

    // 计算收藏的工作流列表
    const favoriteWorkflows = workflowHistory.filter(item => item.is_favorite);

    return {
        // 状态
        workflowHistory,
        favoriteWorkflows,
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
        toggleFavorite,
        hasMore,
        page
    };
};
