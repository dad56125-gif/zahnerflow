import { LoopStartNode, LoopEndNode, LoopContext, LoopPair } from '../nodes/types';

export class LoopContextManager {
  private loopStack: LoopContext[] = [];
  private executionNodeNames = new Map<string, string>();
  private loopPairs = new Map<string, LoopPair>();

  // 进入循环
  enterLoop(
    startNode: LoopStartNode,
    endNode: LoopEndNode,
    level: number
  ): void {
    const loopId = startNode.data.parameters.loop_id;
    const iterations = startNode.data.parameters.loop_count;
    const variableName = startNode.data.parameters.loop_variable;
    const startValue = startNode.data.parameters.start_value;
    const step = startNode.data.parameters.step;

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

    // 记录循环配对信息
    this.loopPairs.set(loopId, {
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      loopId,
      level
    });
  }

  // 退出循环
  exitLoop(): LoopContext | null {
    const context = this.loopStack.pop();
    if (context) {
      // 清理执行节点名称映射
      this.clearExecutionNodeNames(context.loopId);
    }
    return context;
  }

  // 获取当前循环上下文
  getCurrentLoop(): LoopContext | null {
    return this.loopStack.length > 0 ? this.loopStack[this.loopStack.length - 1] : null;
  }

  // 获取所有循环上下文
  getAllLoops(): LoopContext[] {
    return [...this.loopStack];
  }

  // 获取循环层级
  getLoopLevel(loopId: string): number {
    const pair = this.loopPairs.get(loopId);
    return pair ? pair.level : -1;
  }

  // 检查是否在循环内
  isInLoop(): boolean {
    return this.loopStack.length > 0;
  }

  // 获取循环深度
  getLoopDepth(): number {
    return this.loopStack.length;
  }

  // 推进循环迭代
  advanceLoop(): boolean {
    const currentLoop = this.getCurrentLoop();
    if (!currentLoop) return false;

    currentLoop.currentIteration++;
    currentLoop.variableValue += currentLoop.startNode.data.parameters.step;

    // 检查是否完成所有迭代
    if (currentLoop.currentIteration >= currentLoop.iterations) {
      this.exitLoop();
      return false;
    }

    return true;
  }

  // 重置循环状态
  resetLoop(loopId: string): void {
    const context = this.loopStack.find(ctx => ctx.loopId === loopId);
    if (context) {
      context.currentIteration = 0;
      context.variableValue = context.startNode.data.parameters.start_value;
    }
  }

  // 获取变量值
  getVariableValue(variableName: string): number | null {
    // 从最内层循环向外查找
    for (let i = this.loopStack.length - 1; i >= 0; i--) {
      const context = this.loopStack[i];
      if (context.variableName === variableName) {
        return context.variableValue;
      }
    }
    return null;
  }

  // 生成节点执行名称
  generateExecutionNodeName(originalNodeId: string, nodeName: string): string {
    const currentLoop = this.getCurrentLoop();
    if (!currentLoop) return nodeName;

    // 检查是否已经生成过名称
    const cacheKey = `${currentLoop.loopId}_${originalNodeId}_${currentLoop.currentIteration}`;
    const cachedName = this.executionNodeNames.get(cacheKey);
    if (cachedName) return cachedName;

    // 生成新的节点名称：原名称_外层循环_内层循环
    const baseName = nodeName;
    const outerIterations = this.loopStack.slice(0, -1).map(ctx => ctx.currentIteration + 1);
    const currentIteration = currentLoop.currentIteration + 1;

    // 构建后缀：从最外层到最内层
    const suffixParts = [...outerIterations, currentIteration];
    const suffix = suffixParts.map(num => num.toString().padStart(2, '0')).join('_');

    const newName = `${baseName}_${suffix}`;
    this.executionNodeNames.set(cacheKey, newName);

    return newName;
  }

  // 清理特定循环的执行节点名称
  private clearExecutionNodeNames(loopId: string): void {
    const keysToDelete: string[] = [];
    for (const [key] of this.executionNodeNames) {
      if (key.startsWith(`${loopId}_`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.executionNodeNames.delete(key));
  }

  // 获取循环配对信息
  getLoopPair(loopId: string): LoopPair | null {
    return this.loopPairs.get(loopId) || null;
  }

  // 获取所有循环配对
  getAllLoopPairs(): LoopPair[] {
    return Array.from(this.loopPairs.values());
  }

  // 验证循环配对
  validateLoopPair(startNode: LoopStartNode, endNode: LoopEndNode): boolean {
    return startNode.data.parameters.loop_id === endNode.data.parameters.loop_id;
  }

  // 检查循环嵌套是否有效
  validateLoopNesting(): boolean {
    const pairs = this.getAllLoopPairs();

    // 按照开始节点位置排序
    pairs.sort((a, b) => {
      // 这里需要根据实际的节点位置信息排序
      // 暂时按照添加顺序排序
      return a.level - b.level;
    });

    // 检查嵌套关系
    for (let i = 0; i < pairs.length - 1; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const outer = pairs[i];
        const inner = pairs[j];

        // 如果内层循环的level大于外层，说明嵌套正确
        if (inner.level <= outer.level) {
          // 检查是否有交叉嵌套
          // 这里需要更复杂的位置检查逻辑
          return false;
        }
      }
    }

    return true;
  }

  // 清空所有循环状态
  clear(): void {
    this.loopStack = [];
    this.executionNodeNames.clear();
    this.loopPairs.clear();
  }

  // 获取循环状态信息
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

// 导出单例实例
export const loopContextManager = new LoopContextManager();