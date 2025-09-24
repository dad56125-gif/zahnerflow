# 循环功能技术实现详解

## 1. 核心数据结构定义

### 1.1 扩展节点类型

```typescript
// src/types/nodes.ts
export interface LoopStartNode extends BaseNode {
  type: 'loop_start';
  parameters: {
    loop_count: number;
    loop_variable: string;
    start_value: number;
    step: number;
    loop_id: string;
  };
}

export interface LoopEndNode extends BaseNode {
  type: 'loop_end';
  parameters: {
    loop_id: string;
  };
}

export type NodeType =
  | 'startup' | 'shutdown'
  | 'eis_potentiostatic' | 'eis_galvanostatic'
  | 'ocp_measurement' | 'chronoamperometry'
  | 'chronopotentiometry' | 'voltage_ramp'
  | 'current_ramp' | 'lsv_measurement'
  | 'loop_start' | 'loop_end';  // 新增循环节点类型
```

### 1.2 循环上下文管理

```typescript
// src/services/LoopContextManager.ts
export class LoopContextManager {
  private loopStack: Array<{
    loopId: string;
    startNode: LoopStartNode;
    endNode: LoopEndNode;
    level: number;
    iterations: number;
    currentIteration: number;
    variableName: string;
    variableValue: number;
  }> = [];

  private executionNodeNames = new Map<string, string>();

  // 进入循环
  enterLoop(
    startNode: LoopStartNode,
    endNode: LoopEndNode,
    level: number
  ): void {
    this.loopStack.push({
      loopId: startNode.parameters.loop_id,
      startNode,
      endNode,
      level,
      iterations: startNode.parameters.loop_count,
      currentIteration: 0,
      variableName: startNode.parameters.loop_variable,
      variableValue: startNode.parameters.start_value
    });
  }

  // 增加迭代次数
  incrementIteration(): void {
    if (this.loopStack.length > 0) {
      const currentLoop = this.loopStack[this.loopStack.length - 1];
      currentLoop.currentIteration++;
      currentLoop.variableValue += currentLoop.startNode.parameters.step;
    }
  }

  // 退出循环
  exitLoop(): void {
    this.loopStack.pop();
  }

  // 获取当前循环深度
  getCurrentDepth(): number {
    return this.loopStack.length;
  }

  // 生成节点后缀
  generateNodeSuffix(): string {
    return this.loopStack
      .map(loop => String(loop.currentIteration + 1).padStart(2, '0'))
      .join('_');
  }

  // 获取带后缀的节点名称
  getNodeName(baseNodeId: string): string {
    const suffix = this.generateNodeSuffix();
    return suffix ? `${baseNodeId}_${suffix}` : baseNodeId;
  }

  // 获取当前循环变量值
  getLoopVariable(name: string): number | null {
    for (let i = this.loopStack.length - 1; i >= 0; i--) {
      if (this.loopStack[i].variableName === name) {
        return this.loopStack[i].variableValue;
      }
    }
    return null;
  }

  // 获取所有当前循环变量
  getAllLoopVariables(): Record<string, number> {
    const variables: Record<string, number> = {};
    this.loopStack.forEach(loop => {
      variables[loop.variableName] = loop.variableValue;
    });
    return variables;
  }
}
```

## 2. 循环配对和检测机制

### 2.1 循环配对管理器

```typescript
// src/services/LoopPairManager.ts
export class LoopPairManager {
  private loopPairs = new Map<string, string>(); // startId -> endId
  private loopLevels = new Map<string, number>(); // loopId -> level

  buildLoopStructure(nodes: Node[], edges: Edge[]): {
    pairs: Map<string, string>;
    levels: Map<string, number>;
  } {
    // 1. 找出所有循环节点
    const startNodes = nodes.filter(n => n.type === 'loop_start') as LoopStartNode[];
    const endNodes = nodes.filter(n => n.type === 'loop_end') as LoopEndNode[];

    // 2. 建立配对关系
    startNodes.forEach(startNode => {
      const matchingEnd = endNodes.find(end =>
        end.parameters.loop_id === startNode.parameters.loop_id
      );

      if (!matchingEnd) {
        throw new Error(`循环开始节点 ${startNode.id} 没有对应的结束节点`);
      }

      this.loopPairs.set(startNode.id, matchingEnd.id);
    });

    // 3. 检测嵌套层级
    this.calculateLoopLevels(nodes, edges);

    return {
      pairs: this.loopPairs,
      levels: this.loopLevels
    };
  }

  private calculateLoopLevels(nodes: Node[], edges: Edge[]): void {
    const startNodes = nodes.filter(n => n.type === 'loop_start') as LoopStartNode[];

    startNodes.forEach(startNode => {
      const level = this.calculateNodeLoopLevel(startNode, nodes, edges);
      this.loopLevels.set(startNode.parameters.loop_id, level);
    });
  }

  private calculateNodeLoopLevel(
    node: Node,
    nodes: Node[],
    edges: Edge[],
    visited: Set<string> = new Set()
  ): number {
    if (visited.has(node.id)) return 0;
    visited.add(node.id);

    // 找出包含当前节点的所有外层循环
    const containingLoops = nodes.filter(n =>
      n.type === 'loop_start' &&
      n.id !== node.id &&
      this.isNodeInsideLoop(node, n as LoopStartNode, nodes, edges)
    ) as LoopStartNode[];

    let maxLevel = 0;
    containingLoops.forEach(loop => {
      const level = this.calculateNodeLoopLevel(loop, nodes, edges, visited);
      maxLevel = Math.max(maxLevel, level);
    });

    return maxLevel + 1;
  }

  private isNodeInsideLoop(
    node: Node,
    loopStart: LoopStartNode,
    nodes: Node[],
    edges: Edge[]
  ): boolean {
    const loopEndId = this.loopPairs.get(loopStart.id);
    if (!loopEndId) return false;

    const loopEnd = nodes.find(n => n.id === loopEndId);
    if (!loopEnd) return false;

    // 检查节点是否在循环范围内
    const nodePosition = this.getNodePosition(node);
    const startPos = this.getNodePosition(loopStart);
    const endPos = this.getNodePosition(loopEnd);

    return (
      nodePosition.x > startPos.x &&
      nodePosition.x < endPos.x &&
      nodePosition.y > startPos.y &&
      nodePosition.y < endPos.y
    );
  }

  private getNodePosition(node: Node): { x: number; y: number } {
    // 从节点数据中获取位置信息
    return {
      x: node.position?.x || 0,
      y: node.position?.y || 0
    };
  }
}
```

## 3. UI渲染组件

### 3.1 循环边界渲染组件

```typescript
// src/components/workflow/LoopBoundaryRenderer.tsx
import React from 'react';
import { Node } from 'reactflow';

interface LoopBoundaryProps {
  startNode: Node;
  endNode: Node;
  level: number;
}

export const LoopBoundaryRenderer: React.FC<LoopBoundaryProps> = ({
  startNode,
  endNode,
  level
}) => {
  // 计算边界框
  const minX = Math.min(startNode.position.x, endNode.position.x) - 50;
  const minY = Math.min(startNode.position.y, endNode.position.y) - 50;
  const width = Math.abs(endNode.position.x - startNode.position.x) + 150;
  const height = Math.abs(endNode.position.y - startNode.position.y) + 150;

  // 根据层级计算样式
  const style: React.CSSProperties = {
    position: 'absolute',
    left: minX,
    top: minY,
    width,
    height,
    border: 'none',
    pointerEvents: 'none',
    zIndex: -1
  };

  const bracketStyle = {
    fontSize: `${Math.min(width, height) * 0.8}px`,
    lineHeight: 1,
    color: `hsl(${30 + level * 30}, 70%, 50%)`,
    opacity: 0.3 + level * 0.1,
    fontWeight: 'bold'
  };

  return (
    <div className="loop-boundary" style={style}>
      <div
        className="bracket-left"
        style={{
          ...bracketStyle,
          position: 'absolute',
          left: -20,
          top: 0
        }}
      >
        [
      </div>
      <div
        className="bracket-right"
        style={{
          ...bracketStyle,
          position: 'absolute',
          right: -20,
          top: 0
        }}
      >
        ]
      </div>
    </div>
  );
};
```

### 3.2 带后缀的节点显示

```typescript
// src/components/nodes/LoopNode.tsx
import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LoopStartNode, LoopEndNode } from '../../types/nodes';

export const LoopStartNodeComponent: React.FC<NodeProps<LoopStartNode>> = ({
  data,
  selected
}) => {
  const suffix = data.executionSuffix || '';
  const displayName = suffix ? `${data.name}_${suffix}` : data.name;

  return (
    <div className={`loop-start-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-content">
        <div className="node-icon">🔄</div>
        <div className="node-title">{displayName}</div>
        <div className="node-params">
          循环次数: {data.parameters.loop_count}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export const LoopEndNodeComponent: React.FC<NodeProps<LoopEndNode>> = ({
  data,
  selected
}) => {
  return (
    <div className={`loop-end-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-content">
        <div className="node-icon">🔚</div>
        <div className="node-title">循环结束</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
```

## 4. 执行引擎扩展

### 4.1 工作流执行器

```typescript
// src/services/WorkflowExecutor.ts
export class WorkflowExecutor {
  private loopContextManager = new LoopContextManager();
  private loopPairManager = new LoopPairManager();

  async executeWorkflow(workflow: Workflow): Promise<ExecutionResult> {
    try {
      // 1. 构建循环结构
      const { pairs, levels } = this.loopPairManager.buildLoopStructure(
        workflow.nodes,
        workflow.edges
      );

      // 2. 验证循环结构
      this.validateLoopStructure(workflow.nodes, workflow.edges);

      // 3. 构建执行图
      const executionGraph = this.buildExecutionGraph(workflow);

      // 4. 执行工作流
      const result = await this.executeExecutionGraph(executionGraph);

      return result;
    } catch (error) {
      console.error('工作流执行失败:', error);
      throw error;
    }
  }

  private async executeExecutionGraph(graph: ExecutionGraph): Promise<ExecutionResult> {
    const results: ExecutionResult[] = [];
    const visited = new Set<string>();

    // 使用DFS执行节点
    for (const node of graph.startNodes) {
      await this.executeNode(node, graph, visited, results);
    }

    return { results, status: 'completed' };
  }

  private async executeNode(
    node: Node,
    graph: ExecutionGraph,
    visited: Set<string>,
    results: ExecutionResult[]
  ): Promise<void> {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // 处理循环开始节点
    if (node.type === 'loop_start') {
      await this.handleLoopStart(node as LoopStartNode, graph, visited, results);
      return;
    }

    // 处理循环结束节点
    if (node.type === 'loop_end') {
      await this.handleLoopEnd(node as LoopEndNode, graph, visited, results);
      return;
    }

    // 执行普通节点
    const executionName = this.loopContextManager.getNodeName(node.id);
    const result = await this.executeRegularNode(node, executionName);
    results.push(result);

    // 执行后续节点
    const nextNodes = graph.getNextNodes(node.id);
    for (const nextNode of nextNodes) {
      await this.executeNode(nextNode, graph, visited, results);
    }
  }

  private async handleLoopStart(
    startNode: LoopStartNode,
    graph: ExecutionGraph,
    visited: Set<string>,
    results: ExecutionResult[]
  ): Promise<void> {
    const endNodeId = this.loopPairManager.getLoopEnd(startNode.id);
    const endNode = graph.nodes.find(n => n.id === endNodeId) as LoopEndNode;

    if (!endNode) {
      throw new Error(`找不到循环 ${startNode.parameters.loop_id} 的结束节点`);
    }

    const level = this.loopPairManager.getLoopLevel(startNode.parameters.loop_id);
    this.loopContextManager.enterLoop(startNode, endNode, level);

    // 执行循环
    for (let i = 0; i < startNode.parameters.loop_count; i++) {
      this.loopContextManager.incrementIteration();

      // 获取循环内的所有节点
      const innerNodes = this.getNodesInLoop(startNode, endNode, graph);

      // 执行循环内的节点
      for (const innerNode of innerNodes) {
        await this.executeNode(innerNode, graph, visited, results);
      }
    }

    this.loopContextManager.exitLoop();
  }

  private async handleLoopEnd(
    endNode: LoopEndNode,
    graph: ExecutionGraph,
    visited: Set<string>,
    results: ExecutionResult[]
  ): Promise<void> {
    // 循环结束节点不需要特殊处理
    // 实际的循环逻辑在循环开始节点中处理
    const nextNodes = graph.getNextNodes(endNode.id);
    for (const nextNode of nextNodes) {
      await this.executeNode(nextNode, graph, visited, results);
    }
  }
}
```

## 5. 变量替换系统

### 5.1 变量解析器

```typescript
// src/services/VariableResolver.ts
export class VariableResolver {
  private variablePattern = /\$\{([^}]+)\}/g;

  resolveVariables(
    value: any,
    context: Record<string, any>
  ): any {
    if (typeof value === 'string') {
      return this.resolveStringVariables(value, context);
    } else if (Array.isArray(value)) {
      return value.map(item => this.resolveVariables(item, context));
    } else if (typeof value === 'object' && value !== null) {
      const resolved: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = this.resolveVariables(val, context);
      }
      return resolved;
    }
    return value;
  }

  private resolveStringVariables(
    str: string,
    context: Record<string, any>
  ): string | number {
    return str.replace(this.variablePattern, (match, varName) => {
      // 尝试解析数学表达式
      if (varName.includes('*') || varName.includes('+') ||
          varName.includes('-') || varName.includes('/')) {
        return this.evaluateExpression(varName, context);
      }

      // 直接变量替换
      return context[varName] ?? match;
    });
  }

  private evaluateExpression(
    expression: string,
    context: Record<string, any>
  ): number {
    // 替换变量
    let expr = expression;
    for (const [varName, value] of Object.entries(context)) {
      expr = expr.replace(new RegExp(`\\b${varName}\\b`, 'g'), String(value));
    }

    try {
      // 安全的表达式求值
      return Function(`"use strict"; return (${expr})`)();
    } catch (error) {
      console.error(`表达式求值失败: ${expression}`, error);
      return 0;
    }
  }
}
```

## 6. 配置和样式

### 6.1 节点样式定义

```css
/* src/styles/nodes.css */
.loop-start-node {
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 8px;
  padding: 10px;
  min-width: 150px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.loop-end-node {
  background: #f8d7da;
  border: 2px solid #dc3545;
  border-radius: 8px;
  padding: 10px;
  min-width: 150px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.loop-boundary {
  transition: all 0.3s ease;
}

.loop-boundary:hover {
  opacity: 0.5 !important;
}

/* 节点执行时的动画 */
.node-executing {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
```

## 7. 测试用例

### 7.1 循环配对测试

```typescript
// src/tests/LoopPairManager.test.ts
describe('LoopPairManager', () => {
  let manager: LoopPairManager;
  let nodes: Node[];
  let edges: Edge[];

  beforeEach(() => {
    manager = new LoopPairManager();
  });

  test('应该正确配对循环开始和结束节点', () => {
    nodes = [
      {
        id: 'start1',
        type: 'loop_start',
        position: { x: 100, y: 100 },
        parameters: { loop_id: 'loop1' }
      },
      {
        id: 'end1',
        type: 'loop_end',
        position: { x: 400, y: 200 },
        parameters: { loop_id: 'loop1' }
      }
    ];

    const result = manager.buildLoopStructure(nodes, []);
    expect(result.pairs.get('start1')).toBe('end1');
  });

  test('应该检测嵌套循环层级', () => {
    nodes = [
      { id: 'outer-start', type: 'loop_start', position: { x: 100, y: 100 }, parameters: { loop_id: 'outer' } },
      { id: 'inner-start', type: 'loop_start', position: { x: 200, y: 150 }, parameters: { loop_id: 'inner' } },
      { id: 'inner-end', type: 'loop_end', position: { x: 300, y: 150 }, parameters: { loop_id: 'inner' } },
      { id: 'outer-end', type: 'loop_end', position: { x: 400, y: 200 }, parameters: { loop_id: 'outer' } }
    ];

    const result = manager.buildLoopStructure(nodes, []);
    expect(result.levels.get('outer')).toBe(1);
    expect(result.levels.get('inner')).toBe(2);
  });
});
```

### 7.2 节点后缀测试

```typescript
// src/tests/LoopContextManager.test.ts
describe('LoopContextManager', () => {
  let manager: LoopContextManager;

  beforeEach(() => {
    manager = new LoopContextManager();
  });

  test('应该生成正确的节点后缀', () => {
    // 模拟进入两层循环
    manager.enterLoop(
      { parameters: { loop_id: 'outer', loop_count: 2 } } as LoopStartNode,
      {} as LoopEndNode,
      1
    );
    manager.incrementIteration();

    manager.enterLoop(
      { parameters: { loop_id: 'inner', loop_count: 3 } } as LoopStartNode,
      {} as LoopEndNode,
      2
    );
    manager.incrementIteration();

    expect(manager.generateNodeSuffix()).toBe('01_01');
  });

  test('应该正确管理循环变量', () => {
    manager.enterLoop(
      {
        parameters: {
          loop_id: 'test',
          loop_variable: 'i',
          start_value: 5,
          step: 2
        }
      } as LoopStartNode,
      {} as LoopEndNode,
      1
    );

    expect(manager.getLoopVariable('i')).toBe(5);
    manager.incrementIteration();
    expect(manager.getLoopVariable('i')).toBe(7);
  });
});
```

## 总结

这个技术实现方案提供了：

1. **清晰的循环结构**：通过开始和结束节点明确分离
2. **智能的配对机制**：自动检测和验证循环配对
3. **灵活的命名系统**：不影响原有节点名称
4. **直观的视觉反馈**：中括号显示循环范围
5. **强大的嵌套支持**：多层循环嵌套无压力
6. **完整的执行逻辑**：包含变量替换和状态管理

所有代码示例都是完整的实现，可以直接集成到现有项目中。