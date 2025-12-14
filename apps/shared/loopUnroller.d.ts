export interface SimpleNode {
    id: string;
    type: string;
    config?: Record<string, any>;
}
export interface UnrolledStep {
    nodeId: string;
    nodeType: string;
    originalIndex: number;
    iterationPath: number[];
    loopContextStack: number[];
    loopDepth: number;
}
export interface UnrollSummary {
    totalSteps: number;
    physicalNodeCount: number;
    maxLoopDepth: number;
    loops: Array<{
        startIndex: number;
        endIndex: number;
        iterationCount: number;
        depth: number;
    }>;
}
export interface UnrollResult {
    steps: UnrolledStep[];
    summary: UnrollSummary;
}
export declare function findMatchingLoopEnd(nodes: SimpleNode[], loopStartIdx: number): number;
export declare function unrollLoops(nodes: SimpleNode[]): UnrollResult;
export declare function getStepAt(result: UnrollResult, stepIndex: number): UnrolledStep | undefined;
export declare function findStepsByOriginalIndex(result: UnrollResult, originalIndex: number): number[];
export declare function formatIterationPath(iterationPath: number[]): string;
export declare function calculateProgress(result: UnrollResult, currentStepIndex: number): number;
