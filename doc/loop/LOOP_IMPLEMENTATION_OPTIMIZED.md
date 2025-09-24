# ZahnerFlow 循环实现优化方案 (基于用户需求)

## 设计原则

基于用户新的具体需求，重新设计循环实现方案：
- **循环节点分离**：循环开始节点和循环结束节点明确区分
- **视觉显示**：使用中括号[]表示循环边界，长度自动调整
- **命名系统**：循环内节点使用 eis_01_01 格式后缀，不影响原有节点

## 总体架构

### 1. 核心概念

- **循环开始节点 (loop_start)**：定义循环参数，标记循环开始
- **循环结束节点 (loop_end)**：标记循环结束，与开始节点配对
- **循环区域**：可视化显示为[]包围的区域
- **节点后缀系统**：自动为循环内节点添加层级后缀

### 2. 循环配对机制

- 使用唯一的循环ID进行配对
- 支持多层嵌套循环的自动层级识别
- 循环边界自动检测和可视化

## 实现细节

### 1. 节点定义扩展

在 `src/nodes/types.ts` 中添加新的节点类型：

```json
{
  "node_categories": [
    {
      "id": "flow_control",
      "name": "流程控制",
      "description": "工作流控制节点",
      "color": "#FF9800",
      "icon": "flow"
    }
  ],
  "node_types": {
    "flow_control": [
      {
        "id": "loop_start",
        "name": "循环开始",
        "description": "定义循环参数和开始位置",
        "category": "flow_control",
        "icon": "loop_start",
        "inputs": [{"name": "input", "type": "flow"}],
        "outputs": [{"name": "output", "type": "flow"}],
        "parameters": {
          "loop_count": {
            "type": "number",
            "default": 1,
            "required": false,
            "description": "循环次数"
          },
          "loop_variable": {
            "type": "string",
            "default": "i",
            "required": false,
            "description": "循环变量名"
          },
          "start_value": {
            "type": "number",
            "default": 0,
            "required": false,
            "description": "起始值"
          },
          "step": {
            "type": "number",
            "default": 1,
            "required": false,
            "description": "步长"
          },
          "loop_id": {
            "type": "string",
            "required": true,
            "description": "循环唯一标识符"
          }
        }
      },
      {
        "id": "loop_end",
        "name": "循环结束",
        "description": "标记循环结束位置",
        "category": "flow_control",
        "icon": "loop_end",
        "inputs": [{"name": "input", "type": "flow"}],
        "outputs": [{"name": "output", "type": "flow"}],
        "parameters": {
          "loop_id": {
            "type": "string",
            "required": true,
            "description": "对应的循环开始节点的ID"
          }
        }
      }
    ]
  }
}
```

### 2. 节点后缀命名系统

#### 2.1 后缀格式规则

- 格式：`_外层索引_内层索引`
- 外层循环从01开始编号
- 内层循环从01开始编号
- 示例：eis_01_01（第一层循环第一次迭代中的节点）

#### 2.2 实现方案

```typescript
// 节点后缀管理器
class NodeSuffixManager {
  private loopStack: Array<{loopId: string, iteration: number}> = [];

  // 进入循环时调用
  enterLoop(loopId: string): void {
    this.loopStack.push({loopId, iteration: 0});
  }

  // 迭代时调用
  incrementIteration(): void {
    if (this.loopStack.length > 0) {
      this.loopStack[this.loopStack.length - 1].iteration++;
    }
  }

  // 退出循环时调用
  exitLoop(): void {
    this.loopStack.pop();
  }

  // 生成节点后缀
  generateSuffix(): string {
    return this.loopStack
      .map(item => String(item.iteration + 1).padStart(2, '0'))
      .join('_');
  }

  // 获取完整节点名（包含后缀）
  getNodeName(baseName: string): string {
    const suffix = this.generateSuffix();
    return suffix ? `${baseName}_${suffix}` : baseName;
  }
}
```

### 3. UI渲染实现

#### 3.1 中括号可视化

```typescript
// 循环区域渲染组件
const LoopBoundaryRenderer: React.FC<{
  startNode: Position;
  endNode: Position;
  loopLevel: number;
}> = ({ startNode, endNode, loopLevel }) => {
  // 计算中括号的位置和大小
  const bracketWidth = Math.abs(endNode.x - startNode.x) + 100;
  const bracketHeight = Math.abs(endNode.y - startNode.y) + 100;

  // 根据循环层级调整样式
  const bracketStyle = {
    left: Math.min(startNode.x, endNode.x) - 50,
    top: Math.min(startNode.y, endNode.y) - 50,
    width: bracketWidth,
    height: bracketHeight,
    borderWidth: 2 + loopLevel, // 外层循环边框更粗
    opacity: 0.3 + (loopLevel * 0.1)
  };

  return (
    <div className="loop-boundary" style={bracketStyle}>
      <div className="bracket-left">[</div>
      <div className="bracket-right">]</div>
    </div>
  );
};
```

#### 3.2 循环层级检测算法

```typescript
// 检测循环嵌套层级
function detectLoopLevels(nodes: Node[], edges: Edge[]): Map<string, number> {
  const loopLevels = new Map<string, number>();
  const visited = new Set<string>();

  // 查找所有循环开始节点
  const loopStartNodes = nodes.filter(n => n.type === 'loop_start');

  // 对每个循环开始节点进行DFS，确定其嵌套层级
  loopStartNodes.forEach(startNode => {
    if (!visited.has(startNode.id)) {
      const level = calculateLoopLevel(startNode, nodes, edges, visited);
      loopLevels.set(startNode.id, level);
    }
  });

  return loopLevels;
}

function calculateLoopLevel(
  node: Node,
  nodes: Node[],
  edges: Edge[],
  visited: Set<string>,
  currentLevel: number = 0
): number {
  visited.add(node.id);

  // 查找包含当前节点的其他循环
  const parentLoops = nodes.filter(n =>
    n.type === 'loop_start' &&
    n.id !== node.id &&
    isNodeInsideLoop(node, n, nodes, edges)
  );

  // 递归计算父循环的层级
  let maxParentLevel = 0;
  parentLoops.forEach(parentLoop => {
    if (!visited.has(parentLoop.id)) {
      const parentLevel = calculateLoopLevel(parentLoop, nodes, edges, visited);
      maxParentLevel = Math.max(maxParentLevel, parentLevel);
    }
  });

  return maxParentLevel + 1;
}
```

### 4. 执行逻辑优化

#### 4.1 循环执行流程

```typescript
// 扩展执行服务
class ExecutionService {
  private nodeSuffixManager = new NodeSuffixManager();
  private loopContexts = new Map<string, LoopContext>();

  async executeWorkflow(workflow: Workflow): Promise<void> {
    // 1. 构建循环映射
    const loopPairs = this.buildLoopPairs(workflow.nodes, workflow.edges);

    // 2. 检测循环嵌套
    const loopHierarchy = this.detectLoopHierarchy(workflow.nodes, workflow.edges);

    // 3. 执行工作流
    await this.executeNodes(workflow, loopPairs, loopHierarchy);
  }

  private async executeLoop(
    startNode: Node,
    endNode: Node,
    loopLevel: number,
    workflow: Workflow
  ): Promise<void> {
    const loopParams = startNode.parameters;
    const loopId = loopParams.loop_id;

    // 初始化循环上下文
    this.nodeSuffixManager.enterLoop(loopId);

    // 执行循环
    for (let i = loopParams.start_value; i < loopParams.loop_count; i += loopParams.step) {
      this.nodeSuffixManager.incrementIteration();

      // 设置循环变量
      this.setLoopVariable(loopParams.loop_variable, i);

      // 获取循环内的所有节点
      const innerNodes = this.getNodesInLoop(startNode, endNode, workflow);

      // 为每个节点生成带后缀的名称
      const nodesWithSuffix = innerNodes.map(node => ({
        ...node,
        executedName: this.nodeSuffixManager.getNodeName(node.name)
      }));

      // 执行循环内的节点
      await this.executeNodesInLoop(nodesWithSuffix, workflow);
    }

    // 退出循环
    this.nodeSuffixManager.exitLoop();
  }
}
```

#### 4.2 节点名称管理

```typescript
// 执行时的节点名称管理
class ExecutionNodeManager {
  private originalNames = new Map<string, string>();
  private suffixMap = new Map<string, string>();

  // 保存原始节点名称
  saveOriginalNames(nodes: Node[]): void {
    nodes.forEach(node => {
      this.originalNames.set(node.id, node.name);
    });
  }

  // 应用后缀到节点名称
  applySuffix(nodeId: string, suffix: string): string {
    const originalName = this.originalNames.get(nodeId);
    if (!originalName) return '';

    const newName = suffix ? `${originalName}_${suffix}` : originalName;
    this.suffixMap.set(nodeId, newName);
    return newName;
  }

  // 获取执行时的节点名称
  getExecutionName(nodeId: string): string {
    return this.suffixMap.get(nodeId) || this.originalNames.get(nodeId) || '';
  }

  // 恢复原始名称
  restoreOriginalNames(): void {
    this.suffixMap.clear();
  }
}
```

### 5. 配对机制实现

#### 5.1 循环配对检测

```typescript
// 循环配对管理器
class LoopPairManager {
  private loopPairs = new Map<string, string>(); // startId -> endId

  // 构建循环配对
  buildLoopPairs(nodes: Node[], edges: Edge[]): Map<string, string> {
    const startNodes = nodes.filter(n => n.type === 'loop_start');
    const endNodes = nodes.filter(n => n.type === 'loop_end');

    startNodes.forEach(startNode => {
      const loopId = startNode.parameters.loop_id;
      const matchingEnd = endNodes.find(n =>
        n.parameters.loop_id === loopId
      );

      if (matchingEnd) {
        this.loopPairs.set(startNode.id, matchingEnd.id);
      } else {
        throw new Error(`未找到循环开始节点 ${startNode.id} 的配对结束节点`);
      }
    });

    return this.loopPairs;
  }

  // 验证循环配对
  validateLoopPairs(): void {
    const endNodeIds = new Set(this.loopPairs.values());
    const startNodeIds = new Set(this.loopPairs.keys());

    // 检查是否有未配对的结束节点
    endNodes.forEach(endNode => {
      if (!startNodeIds.has(endNode.id)) {
        throw new Error(`循环结束节点 ${endNode.id} 没有对应的开始节点`);
      }
    });
  }

  // 获取循环的结束节点
  getLoopEnd(startNodeId: string): string | undefined {
    return this.loopPairs.get(startNodeId);
  }
}
```

### 6. 嵌套循环处理

#### 6.1 嵌套检测算法

```typescript
// 嵌套循环检测
function detectNestedLoops(nodes: Node[], edges: Edge[]): NestedLoopInfo[] {
  const loopStarts = nodes.filter(n => n.type === 'loop_start');
  const nestedLoops: NestedLoopInfo[] = [];

  loopStarts.forEach(outerLoop => {
    const innerLoops = loopStarts.filter(innerLoop =>
      innerLoop.id !== outerLoop.id &&
      isLoopInsideLoop(innerLoop, outerLoop, nodes, edges)
    );

    if (innerLoops.length > 0) {
      nestedLoops.push({
        outerLoop: outerLoop.id,
        innerLoops: innerLoops.map(l => l.id)
      });
    }
  });

  return nestedLoops;
}

// 判断循环是否在另一个循环内部
function isLoopInsideLoop(
  innerStart: Node,
  outerStart: Node,
  nodes: Node[],
  edges: Edge[]
): boolean {
  const innerEnd = nodes.find(n =>
    n.type === 'loop_end' &&
    n.parameters.loop_id === innerStart.parameters.loop_id
  );

  const outerEnd = nodes.find(n =>
    n.type === 'loop_end' &&
    n.parameters.loop_id === outerStart.parameters.loop_id
  );

  if (!innerEnd || !outerEnd) return false;

  // 检查内部循环的所有节点是否都在外部循环内
  const innerNodes = getNodesInLoop(innerStart, innerEnd, nodes, edges);

  return innerNodes.every(node =>
    isNodeInsideLoop(node, outerStart, outerEnd, edges)
  );
}
```

### 7. 使用示例

#### 7.1 基本循环

```
[启动设备] → [循环开始(loop_id=loop1, loop_count=3)] → [EIS测量] → [循环结束(loop_id=loop1)] → [停止设备]
```

执行时的节点名称：
- 第1次：eis_01
- 第2次：eis_02
- 第3次：eis_03

#### 7.2 嵌套循环

```
[启动设备] → [循环开始(loop_id=outer, loop_count=2)] →
              [循环开始(loop_id=inner, loop_count=3)] → [EIS测量] → [循环结束(loop_id=inner)] →
              [循环结束(loop_id=outer)] → [停止设备]
```

执行时的节点名称：
- 外层第1次，内层第1次：eis_01_01
- 外层第1次，内层第2次：eis_01_02
- 外层第1次，内层第3次：eis_01_03
- 外层第2次，内层第1次：eis_02_01
- 外层第2次，内层第2次：eis_02_02
- 外层第2次，内层第3次：eis_02_03

### 8. 实现步骤

1. **第一步**：更新节点定义，添加loop_start和loop_end节点
2. **第二步**：实现节点后缀命名系统
3. **第三步**：开发循环配对检测机制
4. **第四步**：实现中括号可视化渲染
5. **第五步**：优化执行逻辑支持嵌套循环
6. **第六步**：添加循环层级检测算法
7. **第七步**：测试和调试

### 9. 注意事项

1. **循环ID唯一性**：确保每个循环有唯一的loop_id
2. **配对验证**：在执行前验证所有循环都有正确的配对
3. **性能优化**：大量节点时优化循环检测算法
4. **用户体验**：提供清晰的循环边界视觉反馈
5. **错误处理**：处理循环嵌套错误和配对失败的情况

### 10. 优势总结

1. **清晰的结构**：循环开始和结束明确分离
2. **直观的视觉**：中括号显示让循环范围一目了然
3. **灵活的命名**：后缀系统不影响原有节点名称
4. **强大的嵌套**：支持多层嵌套循环
5. **易于扩展**：为未来功能预留接口

这个优化方案完全满足用户的新需求，提供了清晰的循环结构、直观的视觉显示和灵活的命名系统。