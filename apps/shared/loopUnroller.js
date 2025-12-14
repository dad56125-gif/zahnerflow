"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMatchingLoopEnd = findMatchingLoopEnd;
exports.unrollLoops = unrollLoops;
exports.getStepAt = getStepAt;
exports.findStepsByOriginalIndex = findStepsByOriginalIndex;
exports.formatIterationPath = formatIterationPath;
exports.calculateProgress = calculateProgress;
function findMatchingLoopEnd(nodes, loopStartIdx) {
    let depth = 0;
    for (let i = loopStartIdx; i < nodes.length; i++) {
        if (nodes[i].type === 'loop_start')
            depth++;
        if (nodes[i].type === 'loop_end') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
function unrollRecursive(nodes, startIdx, endIdx, iterationPath, loopContextStack) {
    const steps = [];
    let i = startIdx;
    while (i < endIdx) {
        const node = nodes[i];
        if (node.type === 'loop_start') {
            const loopCount = node.config?.loop_count ?? 1;
            const loopEndIdx = findMatchingLoopEnd(nodes, i);
            if (loopEndIdx === -1) {
                console.warn(`[loopUnroller] 未找到索引 ${i} 的 loop_start 对应的 loop_end`);
                i++;
                continue;
            }
            for (let iter = 0; iter < loopCount; iter++) {
                const childSteps = unrollRecursive(nodes, i + 1, loopEndIdx, [...iterationPath, iter], [...loopContextStack, i]);
                steps.push(...childSteps);
            }
            i = loopEndIdx + 1;
        }
        else if (node.type === 'loop_end') {
            i++;
        }
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
function unrollLoops(nodes) {
    const steps = unrollRecursive(nodes, 0, nodes.length, [], []);
    const physicalNodeCount = nodes.filter(n => n.type !== 'loop_start' && n.type !== 'loop_end').length;
    const maxLoopDepth = steps.reduce((max, step) => Math.max(max, step.loopDepth), 0);
    const loops = [];
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'loop_start') {
            const endIdx = findMatchingLoopEnd(nodes, i);
            if (endIdx !== -1) {
                let depth = 0;
                for (let j = 0; j < i; j++) {
                    if (nodes[j].type === 'loop_start')
                        depth++;
                    if (nodes[j].type === 'loop_end')
                        depth--;
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
function getStepAt(result, stepIndex) {
    return result.steps[stepIndex];
}
function findStepsByOriginalIndex(result, originalIndex) {
    return result.steps
        .map((step, idx) => step.originalIndex === originalIndex ? idx : -1)
        .filter(idx => idx !== -1);
}
function formatIterationPath(iterationPath) {
    if (iterationPath.length === 0)
        return '-';
    return iterationPath.map(i => i + 1).join('-');
}
function calculateProgress(result, currentStepIndex) {
    if (result.summary.totalSteps === 0)
        return 0;
    return Math.min(100, (currentStepIndex / result.summary.totalSteps) * 100);
}
//# sourceMappingURL=loopUnroller.js.map