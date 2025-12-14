/**
 * useEisData Hook
 * 监听 EIS 测量完成事件，接收频率/实部/虚部数据
 * 用于 Nyquist 图一次性绘制 + 持久保存
 */
import { useEffect, useRef, useState } from 'react';
import { workflowWebSocketService } from '../workflow/websocket.service';

// EIS 数据点结构
export interface EisDataPoint {
    frequency: number;
    zReal: number;
    zImag: number;
}

// EIS 完整数据
export interface EisData {
    points: EisDataPoint[];
    pointCount: number;
    csvPath?: string;
}

// 全局 EIS 数据缓存（按 nodeIndex 存储）
const GlobalEisCache = new Map<number, EisData>();

// 全局监听器设置
let isEisListenerSetup = false;
type EisHandler = (nodeIndex: number, data: EisData) => void;
const eisListeners = new Set<EisHandler>();

const setupEisListener = () => {
    if (isEisListenerSetup) return;

    // 确保 WebSocket 已连接
    workflowWebSocketService.connect();

    workflowWebSocketService.onEisDataReady((payload) => {
        console.log('[useEisData] Received EIS data:', payload);

        if (!payload.data || payload.nodeIndex === undefined) return;

        const { frequency, z_real, z_imag, point_count, csv_path } = payload.data;

        // 转换为数据点数组
        const points: EisDataPoint[] = [];
        for (let i = 0; i < frequency.length; i++) {
            points.push({
                frequency: frequency[i],
                zReal: z_real[i],
                zImag: z_imag[i]
            });
        }

        const eisData: EisData = {
            points,
            pointCount: point_count,
            csvPath: csv_path
        };

        // 存入全局缓存
        GlobalEisCache.set(payload.nodeIndex, eisData);

        // 通知所有监听者
        eisListeners.forEach(handler => handler(payload.nodeIndex, eisData));
    });

    // 监听重置事件，清空缓存
    workflowWebSocketService.onNodesReset(() => {
        console.log('[useEisData] nodesReset, clearing EIS cache');
        GlobalEisCache.clear();
    });

    isEisListenerSetup = true;
    console.log('[useEisData] Global EIS listener initialized');
};

// 🔥 关键修复：模块加载时立即初始化全局监听器
// 这样即使 ChartModal 未打开，EIS 数据也会被缓存
setupEisListener();

// 导出清空方法
export const clearEisCache = () => {
    GlobalEisCache.clear();
};

interface UseEisDataProps {
    nodeIndex: number;
}

export const useEisData = ({ nodeIndex }: UseEisDataProps) => {
    const [eisData, setEisData] = useState<EisData | null>(() => {
        // 初始化时尝试从缓存恢复
        return GlobalEisCache.get(nodeIndex) || null;
    });

    useEffect(() => {
        setupEisListener();

        // 再次检查缓存（可能在 setup 期间数据已到达）
        const cached = GlobalEisCache.get(nodeIndex);
        if (cached && !eisData) {
            setEisData(cached);
        }

        const handler: EisHandler = (idx, data) => {
            if (idx === nodeIndex) {
                setEisData(data);
            }
        };

        eisListeners.add(handler);
        return () => { eisListeners.delete(handler); };
    }, [nodeIndex]);

    return { eisData };
};
