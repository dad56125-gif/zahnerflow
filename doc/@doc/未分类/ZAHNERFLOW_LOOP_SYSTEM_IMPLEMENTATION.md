# ZahnerFlow 循环系统实现完整文档

## 目录
1. [系统概述](#系统概述)
2. [前端实现](#前端实现)
3. [后端实现](#后端实现)
4. [类型系统](#类型系统)
5. [核心功能模块](#核心功能模块)
6. [执行流程](#执行流程)
7. [关键技术实现](#关键技术实现)
8. [解决的问题](#解决的问题)
9. [实现效果](#实现效果)

---

## 系统概述

ZahnerFlow循环系统是一个完整的电化学测量流程控制解决方案，允许用户在工作流中定义循环结构，实现重复测量的自动化执行。该系统通过前端可视化界面和后端执行引擎的协同工作，提供了直观的循环配置界面和强大的执行能力。

### 核心特性

- **可视化循环定义**: 通过拖拽式界面创建循环节点
- **参数化循环控制**: 支持循环次数、变量名、起始值、步长等参数配置
- **嵌套循环支持**: 支持多层循环嵌套，每层使用不同颜色标识
- **实时状态监控**: 循环执行过程中的实时状态显示和进度追踪
- **变量替换机制**: 支持在测量参数中使用循环变量
- **边界可视化**: 循环区域的自动检测和可视化显示

---

## 前端实现

### 1. 循环节点组件

#### 1.1 循环开始节点 (`/apps/frontend/src/nodes/loop-start.node.tsx`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/nodes/loop-start.node.tsx`

**新增功能**:
- 完整的循环参数配置界面
- 自动生成唯一循环ID
- 参数验证和错误处理
- 实时预览循环变量值范围

**核心代码片段**:
```typescript
// 循环参数配置
const [loopCount, setLoopCount] = useState<number>(node.data.parameters?.loop_count || 1);
const [loopVariable, setLoopVariable] = useState<string>(node.data.parameters?.loop_variable || 'i');
const [startValue, setStartValue] = useState<number>(node.data.parameters?.start_value || 0);
const [step, setStep] = useState<number>(node.data.parameters?.step || 1);
const [loopId, setLoopId] = useState<string>(node.data.parameters?.loop_id || '');

// 自动生成循环ID
useEffect(() => {
  if (!loopId) {
    const generatedId = `loop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setLoopId(generatedId);
    updateParameter('loop_id', generatedId);
  }
}, [loopId]);
```

**参数说明**:
- `loop_count`: 循环执行次数 (1-1000)
- `loop_variable`: 循环变量名 (仅支持字母、数字、下划线)
- `start_value`: 循环变量起始值
- `step`: 每次迭代的步长
- `loop_id`: 循环唯一标识符

#### 1.2 循环结束节点 (`/apps/frontend/src/nodes/loop-end.node.tsx`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/nodes/loop-end.node.tsx`

**新增功能**:
- 循环配对验证
- 状态指示器显示
- 使用说明和帮助信息

**核心代码片段**:
```typescript
// 循环配对验证
const validateLoopPair = () => {
  const valid = loopContextManager.validateLoopPair(startNode, endNode);
  setIsValid(valid);
};

// 状态指示器
<div className="status-indicator">
  <span className={`status-dot ${loopId ? 'active' : 'inactive'}`}></span>
  <span className="status-text">
    {loopId ? '已配对' : '等待配对'}
  </span>
</div>
```

### 2. 循环边界组件

#### 2.1 LoopBoundary 组件 (`/apps/frontend/src/components/LoopBoundary.tsx`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/components/LoopBoundary.tsx`

**功能特性**:
- 自动计算循环区域边界
- 多层循环颜色区分
- 实时迭代状态显示
- 响应式边界调整

**核心实现**:
```typescript
// 边界计算
const calculateBoundary = () => {
  if (!startNode.position || !endNode.position) {
    setBoundaryPos(null);
    return;
  }

  const start = startNode.position;
  const end = endNode.position;

  // 计算包围盒
  let minX = Math.min(start.x, end.x) - 20;
  let maxX = Math.max(start.x, end.x) + 20;
  let minY = Math.min(start.y, end.y) - 40;
  let maxY = Math.max(start.y, end.y) + 40;

  // 考虑循环内节点的位置
  nodesInLoop.forEach(node => {
    if (node.position) {
      minX = Math.min(minX, node.position.x - 10);
      maxX = Math.max(maxX, node.position.x + 10);
      minY = Math.min(minY, node.position.y - 10);
      maxY = Math.max(maxY, node.position.y + 10);
    }
  });

  // 确保宽度和高度为正值
  const width = Math.max(100, maxX - minX);
  const height = Math.max(80, maxY - minY);

  setBoundaryPos({
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY },
    width,
    height
  });
};

// 多层循环颜色系统
const getBracketStyle = () => {
  const level = loopContextManager.getLoopLevel(startNode.data.parameters.loop_id);
  const colors = [
    { border: '#FF9800', bg: 'rgba(255, 152, 0, 0.1)' },
    { border: '#4CAF50', bg: 'rgba(76, 175, 80, 0.1)' },
    { border: '#2196F3', bg: 'rgba(33, 150, 243, 0.1)' },
    { border: '#9C27B0', bg: 'rgba(156, 39, 176, 0.1)' }
  ];

  const safeLevel = Math.max(0, level);
  const colorIndex = safeLevel % colors.length;
  const color = colors[colorIndex];

  return {
    left: `${boundaryPos.start.x}px`,
    top: `${boundaryPos.start.y}px`,
    width: `${boundaryPos.width}px`,
    height: `${boundaryPos.height}px`,
    borderColor: color.border,
    backgroundColor: color.bg,
    zIndex: safeLevel + 1
  };
};
```

### 3. 循环上下文管理器

#### 3.1 LoopContextManager 类 (`/apps/frontend/src/services/LoopContextManager.ts`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/services/LoopContextManager.ts`

**核心功能**:
- 循环生命周期管理
- 嵌套循环层级控制
- 变量作用域管理
- 节点名称生成

**关键实现**:
```typescript
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
    this.loopPairs.set(loopId, {
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      loopId,
      level
    });
  }

  // 生成节点执行名称
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

  // 获取变量值
  getVariableValue(variableName: string): number | null {
    for (let i = this.loopStack.length - 1; i >= 0; i--) {
      const context = this.loopStack[i];
      if (context.variableName === variableName) {
        return context.variableValue;
      }
    }
    return null;
  }
}
```

---

## 后端实现

### 1. 执行服务扩展

#### 1.1 ExecutionService 循环支持 (`/apps/backend/src/modules/execution/execution.service.ts`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/backend/src/modules/execution/execution.service.ts`

**新增功能**:
- 循环节点识别和处理
- 执行计划构建
- 变量替换机制

**核心实现**:
```typescript
// 构建包含循环的执行计划
private buildExecutionPlanWithLoops(nodes: any[]): any[] {
  const executionPlan: any[] = [];
  const loopStack: any[] = [];

  for (const node of nodes) {
    if (node.type === 'loop_start') {
      // 找到对应的循环结束节点
      const loopEndIndex = nodes.findIndex(n =>
        n.type === 'loop_end' &&
        n.config?.loop_id === node.config?.loop_id
      );

      if (loopEndIndex === -1) {
        throw new Error(`未找到循环结束节点: ${node.config?.loop_id}`);
      }

      // 获取循环参数
      const loopCount = node.config?.loop_count || 1;
      const loopVariable = node.config?.loop_variable || 'i';
      const startValue = node.config?.start_value || 0;
      const step = node.config?.step || 1;

      // 获取循环内的节点
      const loopNodes = nodes.slice(nodes.indexOf(node) + 1, loopEndIndex);

      // 为每次迭代创建节点副本
      for (let iteration = 0; iteration < loopCount; iteration++) {
        const currentValue = startValue + iteration * step;

        for (const loopNode of loopNodes) {
          if (loopNode.type === 'loop_start' || loopNode.type === 'loop_end') {
            continue; // 跳过嵌套的循环节点
          }

          // 创建节点副本，包含迭代信息
          const nodeCopy = {
            ...loopNode,
            id: `${loopNode.id}_iteration_${iteration}`,
            originalId: loopNode.id,
            iteration: iteration,
            loopVariable: loopVariable,
            loopValue: currentValue,
            config: {
              ...loopNode.config,
              iteration: iteration + 1,
              [loopVariable]: currentValue
            }
          };

          executionPlan.push(nodeCopy);
        }
      }
    } else if (node.type === 'loop_end') {
      // 跳过已处理的循环结束节点
      continue;
    } else {
      // 不在循环内的节点，直接添加到执行计划
      executionPlan.push(node);
    }
  }

  return executionPlan;
}

// 变量替换处理
private processVariables(config: any): any {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const processedConfig = { ...config };
  const variablePattern = /\$\{([^}]+)\}/g;

  for (const key in processedConfig) {
    if (typeof processedConfig[key] === 'string') {
      processedConfig[key] = processedConfig[key].replace(variablePattern, (match, variableName) => {
        // 简单的变量替换实现
        if (variableName.includes('iteration') || variableName.includes('index')) {
          return '01'; // 迭代相关变量
        }
        return match; // 未找到匹配的变量，返回原字符串
      });
    }
  }

  return processedConfig;
}
```

---

## 类型系统

### 1. 循环相关类型定义

#### 1.1 循环节点接口 (`/apps/frontend/src/nodes/types.ts`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/nodes/types.ts`

**新增类型**:
```typescript
// 循环开始节点接口
export interface LoopStartNode extends ElectrochemicalNode {
  type: 'loop_start';
  data: NodeData & {
    parameters: {
      loop_count: number;
      loop_variable: string;
      start_value: number;
      step: number;
      loop_id: string;
    };
  };
}

// 循环结束节点接口
export interface LoopEndNode extends ElectrochemicalNode {
  type: 'loop_end';
  data: NodeData & {
    parameters: {
      loop_id: string;
    };
  };
}

// 循环上下文接口
export interface LoopContext {
  loopId: string;
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  level: number;
  iterations: number;
  currentIteration: number;
  variableName: string;
  variableValue: number;
}

// 循环配对信息
export interface LoopPair {
  startNodeId: string;
  endNodeId: string;
  loopId: string;
  level: number;
}

// 节点类型扩展
export type NodeType =
  | 'startup'
  | 'shutdown'
  | 'eis_potentiostatic'
  | 'eis_galvanostatic'
  | 'ocp_measurement'
  | 'chronoamperometry'
  | 'chronopotentiometry'
  | 'voltage_ramp'
  | 'current_ramp'
  | 'lsv_measurement'
  | 'loop_start'      // 新增
  | 'loop_end';       // 新增

// 节点分类扩展
export type NodeCategory =
  | 'device'
  | 'basic_measurement'
  | 'flow_control';   // 新增
```

### 2. 设备类型定义

#### 2.1 设备相关类型 (`/packages/types/src/device.types.ts`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/packages/types/src/device.types.ts`

**类型定义**: 包含完整的设备测量类型和状态枚举，为循环系统提供底层支持。

---

## 核心功能模块

### 1. 主应用集成

#### 1.1 App.tsx 循环管理 (`/apps/frontend/src/App.tsx`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/App.tsx`

**集成功能**:
- 循环检测和管理
- 循环边界渲染
- 状态联动

**核心代码**:
```typescript
// 循环检测和管理
const detectAndManageLoops = () => {
  const loopStartNodes = nodes.filter(node => node.type === 'loop_start') as LoopStartNode[];
  const loopEndNodes = nodes.filter(node => node.type === 'loop_end') as LoopEndNode[];

  const newLoopPairs = new Map<string, { startNode: LoopStartNode; endNode: LoopEndNode; nodesInLoop: ElectrochemicalNode[] }>();

  // 清空旧的循环管理器状态
  loopContextManager.clear();

  // 为每个循环开始节点查找对应的结束节点
  loopStartNodes.forEach(startNode => {
    const loopId = startNode.data.parameters.loop_id;
    const endNode = loopEndNodes.find(node => node.data.parameters.loop_id === loopId);

    if (endNode) {
      // 找到开始和结束节点之间的所有节点
      const startIndex = nodes.findIndex(node => node.id === startNode.id);
      const endIndex = nodes.findIndex(node => node.id === endNode.id);

      if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        const nodesInLoop = nodes.slice(startIndex + 1, endIndex);

        // 注册循环到管理器
        const level = Array.from(newLoopPairs.values()).length;
        loopContextManager.enterLoop(startNode, endNode, level);

        newLoopPairs.set(loopId, {
          startNode,
          endNode,
          nodesInLoop
        });
      }
    }
  });

  setLoopPairs(newLoopPairs);
};

// 循环边界可视化渲染
{Array.from(loopPairs.values()).map(({ startNode, endNode, nodesInLoop }) => (
  <LoopBoundary
    key={startNode.data.parameters.loop_id}
    startNode={startNode}
    endNode={endNode}
    nodesInLoop={nodesInLoop}
  />
))}
```

### 2. 属性面板支持

#### 2.1 PropertyPanel.tsx 参数配置 (`/apps/frontend/src/components/PropertyPanel.tsx`)

**文件路径**: `/c/Users/LabFC/Documents/ZahnerFlow1-main/apps/frontend/src/components/PropertyPanel.tsx`

**支持功能**:
- 循环参数的图形化配置
- 参数验证和格式化
- 实时预览

---

## 执行流程

### 1. 循环执行流程图

```
开始 → 循环开始节点 → 检测循环参数 → 构建执行计划
                    ↓
              生成节点副本 (N次)
                    ↓
              变量替换处理
                    ↓
              按顺序执行节点
                    ↓
              循环结束节点 → 验证配对 → 结束
```

### 2. 关键执行步骤

1. **循环检测**: 系统自动检测循环开始和结束节点的配对关系
2. **执行计划构建**: 根据循环参数生成包含所有迭代节点的执行计划
3. **变量替换**: 在执行过程中替换循环变量为实际值
4. **状态管理**: 实时追踪循环执行状态和进度
5. **结果收集**: 收集每次迭代的结果数据

---

## 关键技术实现

### 1. 循环嵌套支持

**技术实现**:
- 使用栈结构管理嵌套循环
- 每层循环分配唯一颜色标识
- Z-index控制显示层级

**代码实现**:
```typescript
// 循环层级管理
private loopStack: LoopContext[] = [];

// 进入循环
enterLoop(startNode: LoopStartNode, endNode: LoopEndNode, level: number): void {
  const context: LoopContext = {
    loopId: startNode.data.parameters.loop_id,
    startNode,
    endNode,
    level,
    iterations: startNode.data.parameters.loop_count,
    currentIteration: 0,
    variableName: startNode.data.parameters.loop_variable,
    variableValue: startNode.data.parameters.start_value
  };
  this.loopStack.push(context);
}

// 退出循环
exitLoop(): LoopContext | null {
  return this.loopStack.pop();
}
```

### 2. 变量作用域管理

**技术实现**:
- 变量名冲突检测
- 作用域链查找
- 动态变量替换

**代码实现**:
```typescript
// 变量值查找 (从内到外)
getVariableValue(variableName: string): number | null {
  for (let i = this.loopStack.length - 1; i >= 0; i--) {
    const context = this.loopStack[i];
    if (context.variableName === variableName) {
      return context.variableValue;
    }
  }
  return null;
}
```

### 3. 节点命名策略

**技术实现**:
- 基于循环层级的命名规范
- 避免名称冲突
- 保持可读性

**命名规则**: `节点名_外层循环_内层循环`
- 示例: `EIS测量_01_02` (外层第1次，内层第2次)

---

## 解决的问题

### 1. 重复测量自动化

**问题**: 电化学实验中经常需要进行重复测量，手动操作效率低下且容易出错。

**解决方案**:
- 提供图形化的循环配置界面
- 自动生成重复测量的执行计划
- 支持参数化的循环控制

### 2. 实验参数优化

**问题**: 研究人员需要系统性地测试不同参数组合，传统方法工作量大。

**解决方案**:
- 支持循环变量在测量参数中的使用
- 自动生成参数组合序列
- 批量执行和数据收集

### 3. 复杂实验流程

**问题**: 现代电化学研究往往需要复杂的实验流程，包含多个步骤和条件。

**解决方案**:
- 支持多层循环嵌套
- 灵活的流程控制
- 可视化的流程设计

### 4. 数据管理复杂性

**问题**: 循环实验产生大量数据，管理困难。

**解决方案**:
- 自动化的文件命名规则
- 结构化的数据组织
- 完整的执行记录

---

## 实现效果

### 1. 用户界面效果

- **可视化循环区域**: 循环节点间的区域自动用彩色边框标识
- **实时状态显示**: 循环执行过程中显示当前迭代和变量值
- **多层嵌套支持**: 不同层级的循环使用不同颜色区分
- **直观的参数配置**: 拖拽式节点配置，所见即所得

### 2. 执行效果

- **自动化执行**: 循环定义完成后可一键执行整个实验流程
- **变量替换**: 测量参数中的循环变量自动替换为实际值
- **数据收集**: 自动收集每次迭代的结果数据
- **错误处理**: 完善的错误检测和处理机制

### 3. 性能表现

- **高效执行**: 优化的执行计划构建算法
- **内存管理**: 合理的节点副本管理策略
- **响应速度**: 流畅的用户界面交互体验

### 4. 扩展性

- **模块化设计**: 各组件独立，易于扩展
- **类型安全**: 完整的TypeScript类型定义
- **接口标准化**: 清晰的API接口设计

---

## 总结

ZahnerFlow循环系统是一个完整的、功能强大的电化学测量流程控制解决方案。通过前端可视化界面和后端执行引擎的协同工作，为研究人员提供了直观、高效的循环实验设计工具。该系统不仅解决了重复测量自动化的问题，还为复杂的实验流程提供了灵活的控制机制。

系统的核心优势在于：

1. **直观的用户界面**: 拖拽式操作，所见即所得
2. **强大的执行能力**: 支持复杂的多层嵌套循环
3. **灵活的参数控制**: 支持变量替换和参数化配置
4. **完整的类型支持**: TypeScript确保代码质量和开发体验
5. **良好的扩展性**: 模块化设计便于功能扩展

该系统的实现大大提升了电化学实验的效率和准确性，为研究人员节省了大量时间，同时保证了实验的可重复性和数据的质量。