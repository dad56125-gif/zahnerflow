/**
 * 实验报告模块 - 类型定义
 * 设计为与生成器无关的中间格式，方便后续迁移到 Python 生成
 */

export interface ReportData {
    // 封面信息
    projectName: string;
    individualName: string;
    workflowName: string;
    user: string;

    // 执行摘要
    executionId: string;
    status: 'completed' | 'failed' | 'cancelled';
    startTime: Date;
    endTime: Date;
    duration: number; // 秒

    // 节点明细
    nodes: ReportNodeInfo[];
}

export interface ReportNodeInfo {
    index: number;
    type: string;
    label: string;
    keyParams: string;
    status: 'success' | 'failed' | 'skipped' | 'pending';
    duration?: number; // 秒
    indentLevel: number; // 0=普通, 1=循环内, 2=嵌套循环内
}

/** 节点类型中文映射 */
export const NODE_TYPE_LABELS: Record<string, string> = {
    startup: '启动程序',
    shutdown: '关闭程序',
    loop_start: '循环开始',
    loop_end: '循环结束',
    wait_delay: '延时',
    ocp_measurement: 'OCP测量',
    eis_potentiostatic: '恒电位EIS',
    eis_galvanostatic: '恒电流EIS',
    chronoamperometry: '计时电流法',
    chronopotentiometry: '计时电位法',
    voltage_ramp: '电压扫描',
    current_ramp: '电流扫描',
    change_temperature: '温度控制',
    change_gas_flow: '气体流量控制',
};

/** 状态图标映射 */
export const STATUS_ICONS: Record<string, string> = {
    success: '✅',
    failed: '❌',
    skipped: '⏭️',
    pending: '⏳',
};
