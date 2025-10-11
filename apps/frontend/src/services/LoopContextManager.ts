import { LoopStartNode, LoopEndNode, LoopContext, LoopPair } from '../nodes/types';

export class LoopContextManager {
  private loopStack: LoopContext[] = [];
  private executionNodeNames = new Map<string, string>();
  private loopPairs = new Map<string, LoopPair>();

  enterLoop(
    startNode: LoopStartNode,
    endNode: LoopEndNode,
    level: number
  ): void {
    const loopId = startNode.data.parameters.loop_id;
    const iterations = startNode.data.parameters.loop_count;
    const variableName = startNode.data.parameters.loop_variable;
    const startValue = startNode.data.parameters.start_value;

    const context: LoopContext = {
      loopId,
      startNode,
      endNode,
      level,
      iterations,
      currentIteration: 0,
      variableName,
      variableValue: startValue
    };

    this.loopStack.push(context);

    this.loopPairs.set(loopId, {
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      loopId,
      level
    });
  }

  exitLoop(): LoopContext | null {
    const context = this.loopStack.pop();
    if (context) {
      this.clearExecutionNodeNames(context.loopId);
    }
    return context || null;
  }

  getCurrentLoop(): LoopContext | null {
    return this.loopStack.length > 0 ? this.loopStack[this.loopStack.length - 1] : null;
  }

  getAllLoops(): LoopContext[] {
    return [...this.loopStack];
  }

  getLoopLevel(loopId: string): number {
    const pair = this.loopPairs.get(loopId);
    return pair ? pair.level : -1;
  }

  isInLoop(): boolean {
    return this.loopStack.length > 0;
  }

  getLoopDepth(): number {
    return this.loopStack.length;
  }

  advanceLoop(): boolean {
    const currentLoop = this.getCurrentLoop();
    if (!currentLoop) return false;

    currentLoop.currentIteration++;
    currentLoop.variableValue += currentLoop.startNode.data.parameters.step;

    if (currentLoop.currentIteration >= currentLoop.iterations) {
      this.exitLoop();
      return false;
    }

    return true;
  }

  resetLoop(loopId: string): void {
    const context = this.loopStack.find(ctx => ctx.loopId === loopId);
    if (context) {
      context.currentIteration = 0;
      context.variableValue = context.startNode.data.parameters.start_value;
    }
  }

  getVariableValue(variableName: string): number | null {
    for (let i = this.loopStack.length - 1; i >= 0; i--) {
      const context = this.loopStack[i];
      if (context.variableName === variableName) {
        return context.variableValue;
      }
    }
    return null;
  }

  generateExecutionNodeName(originalNodeId: string, nodeName: string): string {
    const currentLoop = this.getCurrentLoop();
    if (!currentLoop) return nodeName;

    const cacheKey = `${currentLoop.loopId}_${originalNodeId}_${currentLoop.currentIteration}`;
    const cachedName = this.executionNodeNames.get(cacheKey);
    if (cachedName) return cachedName;

    const baseName = nodeName;
    const outerIterations = this.loopStack.slice(0, -1).map(ctx => ctx.currentIteration + 1);
    const currentIteration = currentLoop.currentIteration + 1;

    const suffixParts = [...outerIterations, currentIteration];
    const suffix = suffixParts.map(num => num.toString().padStart(2, '0')).join('_');

    const newName = `${baseName}_${suffix}`;
    this.executionNodeNames.set(cacheKey, newName);

    return newName;
  }

  private clearExecutionNodeNames(loopId: string): void {
    const keysToDelete: string[] = [];
    for (const [key] of this.executionNodeNames) {
      if (key.startsWith(`${loopId}_`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.executionNodeNames.delete(key));
  }

  getLoopPair(loopId: string): LoopPair | null {
    return this.loopPairs.get(loopId) || null;
  }

  getAllLoopPairs(): LoopPair[] {
    return Array.from(this.loopPairs.values());
  }

  validateLoopPair(startNode: LoopStartNode, endNode: LoopEndNode): boolean {
    return startNode.data.parameters.loop_id === endNode.data.parameters.loop_id;
  }

  validateLoopNesting(): boolean {
    const pairs = this.getAllLoopPairs();

    pairs.sort((a, b) => {
      return a.level - b.level;
    });

    for (let i = 0; i < pairs.length - 1; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const outer = pairs[i];
        const inner = pairs[j];

        if (inner.level <= outer.level) {
          return false;
        }
      }
    }

    return true;
  }

  clear(): void {
    this.loopStack = [];
    this.executionNodeNames.clear();
    this.loopPairs.clear();
  }

  getLoopStatus(): {
    activeLoops: number;
    totalIterations: number;
    currentIterations: number[];
    loopIds: string[];
  } {
    return {
      activeLoops: this.loopStack.length,
      totalIterations: this.loopStack.reduce((sum, ctx) => sum + ctx.iterations, 0),
      currentIterations: this.loopStack.map(ctx => ctx.currentIteration),
      loopIds: this.loopStack.map(ctx => ctx.loopId)
    };
  }
}

export const loopContextManager = new LoopContextManager();
