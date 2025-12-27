/**
 * 循环展开器 (Loop Unroller) - 共享模块
 * 
 * 将带有嵌套循环的工作流节点列表"展开"为实际执行步骤列表。
 * 
 * 用途：
 *   - 后端：按展开后的步骤顺序执行节点
 *   - 前端 ProgressBar：准确计算进度 (当前步骤 / 总步骤数)
 *   - 时间估算器：计算真实执行时间
 *   - 总结报告：统计实际执行次数
 *   - 断点续运行：定位到具体的迭代轮次
 * 
 * @module loopUnroller
 */

// =============================================================================
// 类型定义 (独立定义，不依赖具体项目的 Interfaces)
// =============================================================================

/**
 * 简化的节点类型（仅包含展开所需的字段）
 */
export interface SimpleNode {
    id: string;
    type: string;
    config?: Record<string, any>;
}

/**
 * 展开后的单个执行步骤
 */
export interface UnrolledStep {
    /** 原始节点 ID */
    nodeId: string;
    /** 节点类型 */
    nodeType: string;
    /** 在原始 nodes[] 数组中的索引位置 */
    originalIndex: number;
    /** 
     * 迭代路径 (数组形式，支持嵌套循环)
     * 
     * 示例：
     *   - [] 表示不在任何循环内
     *   - [2] 表示在第一层循环的第3轮 (0-based)
     *   - [1, 0] 表示在外层第2轮、内层第1轮
     */
    iterationPath: number[];
    /** 
     * 循环上下文栈 (记录所在的循环边界节点索引)
     * 
     * 示例：
     *   - [] 表示不在任何循环内
     *   - [0] 表示在 nodes[0] 开始的循环内
     *   - [0, 3] 表示在 nodes[0] 开始的循环内的 nodes[3] 开始的子循环内
     */
    loopContextStack: number[];
    /**
     * 循环深度 (0 = 不在循环内, 1 = 一层循环, ...)
     */
    loopDepth: number;
}

/**
 * 展开结果统计
 */
export interface UnrollSummary {
    /** 展开后的总步骤数 */
    totalSteps: number;
    /** 原始物理节点数 (不含 loop_start/loop_end) */
    physicalNodeCount: number;
    /** 最大嵌套深度 */
    maxLoopDepth: number;
    /** 循环信息列表 */
    loops: Array<{
        startIndex: number;
        endIndex: number;
        iterationCount: number;
        depth: number;
    }>;
}

/**
 * 完整的展开结果
 */
export interface UnrollResult {
    /** 展开后的步骤列表 */
    steps: UnrolledStep[];
    /** 统计摘要 */
    summary: UnrollSummary;
}

// =============================================================================
// 核心实现
// =============================================================================

/**
 * 查找匹配的 loop_end 节点索引 (支持嵌套循环)
 * 
 * @param nodes 节点列表
 * @param loopStartIdx loop_start 节点的索引
 * @returns loop_end 节点的索引，如果未找到返回 -1
 */
export function findMatchingLoopEnd(nodes: SimpleNode[], loopStartIdx: number): number {
    let depth = 0;
    for (let i = loopStartIdx; i < nodes.length; i++) {
        if (nodes[i].type === 'loop_start') depth++;
        if (nodes[i].type === 'loop_end') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * 递归展开循环
 * 
 * @param nodes 原始节点列表
 * @param startIdx 开始索引 (包含)
 * @param endIdx 结束索引 (不包含)
 * @param iterationPath 当前迭代路径
 * @param loopContextStack 当前循环上下文栈
 * @returns 展开后的步骤列表
 */
function unrollRecursive(
    nodes: SimpleNode[],
    startIdx: number,
    endIdx: number,
    iterationPath: number[],
    loopContextStack: number[]
): UnrolledStep[] {
    const steps: UnrolledStep[] = [];
    let i = startIdx;

    while (i < endIdx) {
        const node = nodes[i];

        // 情况 1：遇到 loop_start，递归展开循环体
        if (node.type === 'loop_start') {
            const loopCount = node.config?.loop_count ?? 1;
            const loopEndIdx = findMatchingLoopEnd(nodes, i);

            if (loopEndIdx === -1) {
                // 未找到匹配的 loop_end，静默跳过
                // 这在用户编辑工作流时是正常的（刚添加 loop_start，还没添加 loop_end）
                i++;
                continue;
            }

            // 对循环体执行 loopCount 次递归展开
            for (let iter = 0; iter < loopCount; iter++) {
                const childSteps = unrollRecursive(
                    nodes,
                    i + 1,            // 跳过 loop_start
                    loopEndIdx,       // 到 loop_end 之前
                    [...iterationPath, iter],
                    [...loopContextStack, i]
                );
                steps.push(...childSteps);
            }

            // 跳到 loop_end 之后
            i = loopEndIdx + 1;
        }
        // 情况 2：遇到 loop_end，直接跳过 (理论上不会走到这里)
        else if (node.type === 'loop_end') {
            i++;
        }
        // 情况 3：普通节点，添加到步骤列表
        else {
            steps.push({
                nodeId: node.id,
                nodeType: node.type,
                originalIndex: i,
                iterationPath: [...iterationPath],
                loopContextStack: [...loopContextStack],
                loopDepth: iterationPath.length
            });
            i++;
        }
    }

    return steps;
}

/**
 * 主函数：将工作流节点列表展开为执行步骤列表
 * 
 * @param nodes 原始工作流节点列表
 * @returns 展开结果 (包含步骤列表和统计摘要)
 * 
 * @example
 * ```typescript
 * const nodes = [
 *   { id: 'n1', type: 'loop_start', config: { loop_count: 3 } },
 *   { id: 'n2', type: 'eis_potentiostatic', config: {} },
 *   { id: 'n3', type: 'loop_end', config: {} }
 * ];
 * 
 * const result = unrollLoops(nodes);
 * console.log(result.summary.totalSteps); // 3
 * console.log(result.steps[0].iterationPath); // [0]
 * console.log(result.steps[1].iterationPath); // [1]
 * console.log(result.steps[2].iterationPath); // [2]
 * ```
 */
export function unrollLoops(nodes: SimpleNode[]): UnrollResult {
    // 执行递归展开
    const steps = unrollRecursive(nodes, 0, nodes.length, [], []);

    // 统计物理节点数 (排除 loop_start/loop_end)
    const physicalNodeCount = nodes.filter(
        n => n.type !== 'loop_start' && n.type !== 'loop_end'
    ).length;

    // 统计最大嵌套深度
    const maxLoopDepth = steps.reduce(
        (max, step) => Math.max(max, step.loopDepth),
        0
    );

    // 收集循环信息
    const loops: UnrollSummary['loops'] = [];
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'loop_start') {
            const endIdx = findMatchingLoopEnd(nodes, i);
            if (endIdx !== -1) {
                // 计算当前循环的嵌套深度
                let depth = 0;
                for (let j = 0; j < i; j++) {
                    if (nodes[j].type === 'loop_start') depth++;
                    if (nodes[j].type === 'loop_end') depth--;
                }
                loops.push({
                    startIndex: i,
                    endIndex: endIdx,
                    iterationCount: nodes[i].config?.loop_count ?? 1,
                    depth
                });
            }
        }
    }

    return {
        steps,
        summary: {
            totalSteps: steps.length,
            physicalNodeCount,
            maxLoopDepth,
            loops
        }
    };
}

// =============================================================================
// 辅助工具函数
// =============================================================================

/**
 * 根据展开后的步骤索引，获取对应的原始节点信息
 * 
 * @param result 展开结果
 * @param stepIndex 展开后的步骤索引 (0-based)
 * @returns 步骤信息，如果索引越界返回 undefined
 */
export function getStepAt(result: UnrollResult, stepIndex: number): UnrolledStep | undefined {
    return result.steps[stepIndex];
}

/**
 * 查找原始节点在展开后出现的所有步骤索引
 * 
 * @param result 展开结果
 * @param originalIndex 原始节点索引
 * @returns 该节点在展开后对应的所有步骤索引
 */
export function findStepsByOriginalIndex(result: UnrollResult, originalIndex: number): number[] {
    return result.steps
        .map((step, idx) => step.originalIndex === originalIndex ? idx : -1)
        .filter(idx => idx !== -1);
}

/**
 * 格式化迭代路径为可读字符串
 * 
 * @param iterationPath 迭代路径数组
 * @returns 格式化字符串，如 "1-2-3" 表示第1轮→第2轮→第3轮 (1-based 显示)
 */
export function formatIterationPath(iterationPath: number[]): string {
    if (iterationPath.length === 0) return '-';
    return iterationPath.map(i => i + 1).join('-');
}

/**
 * 计算工作流的进度百分比
 * 
 * @param result 展开结果
 * @param currentStepIndex 当前执行到的步骤索引 (展开后的索引)
 * @returns 进度百分比 (0-100)
 */
export function calculateProgress(result: UnrollResult, currentStepIndex: number): number {
    if (result.summary.totalSteps === 0) return 0;
    return Math.min(100, (currentStepIndex / result.summary.totalSteps) * 100);
}
