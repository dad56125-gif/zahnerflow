# 循环节点系统设计文档

**创建日期**: 2025-10-29
**版本**: 1.0
**作者**: Claude Code

## 1. 概述

循环节点系统是ZAHNERFLOW工作流编辑器的核心功能之一，负责检测、管理和可视化工作流中的循环结构。系统通过识别成对的`loop_start`和`loop_end`节点，自动生成可视化的循环边界，并提供实时的状态反馈和控制接口。

### 1.1 设计目标

- **可视化清晰**：通过四角括号直观显示循环范围
- **状态感知**：实时反映循环的执行状态
- **交互友好**：提供悬停控制和状态查看
- **层级支持**：支持最多4层嵌套循环
- **类型安全**：确保TypeScript类型完整性

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     循环节点系统                          │
├─────────────────────────────────────────────────────────┤
│  检测层 (LoopDetector)                                    │
│  ├─ 扫描工作流节点                                       │
│  ├─ 识别loop_start/loop_end配对                          │
│  └─ 生成LoopInfo数据结构                                │
├─────────────────────────────────────────────────────────┤
│  数据层 (LoopContextManager)                             │
│  ├─ 管理循环执行状态                                     │
│  ├─ 跟踪迭代进度                                         │
│  └─ 处理循环事件                                         │
├─────────────────────────────────────────────────────────┤
│  渲染层 (LoopBoundary)                                   │
│  ├─ 计算循环边界位置                                     │
│  ├─ 渲染四角括号样式                                     │
│  └─ 应用状态动画                                         │
├─────────────────────────────────────────────────────────┤
│  交互层 (LoopVisualizer)                                 │
│  ├─ 集成控制面板                                         │
│  ├─ 处理用户交互                                         │
│  └─ 协调各层通信                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心组件关系

```
WorkflowCanvas
    │
    ├─ LoopDetector → 生成LoopInfo[]
    │
    ├─ LoopVisualizer
    │   ├─ 使用LoopInfo
    │   ├─ 适配节点格式
    │   └─ 渲染LoopBoundary
    │           └─ 使用LoopContextManager
    └─ LoopContextManager → 管理状态
```

## 3. 核心组件详解

### 3.1 LoopDetector（循环检测器）

**职责**：识别工作流中的循环结构

**关键属性**：
- `loops`: LoopInfo[] - 检测到的循环列表
- `nodeMap`: Map<string, ElectrochemicalNode> - 节点映射

**核心方法**：
```typescript
detectLoops(nodes: ElectrochemicalNode[]): LoopInfo[]
private findLoopPairs(nodes: ElectrochemicalNode[]): Map<string, LoopPair>
private validateLoopStructure(startNode, endNode, nodes): boolean
```

**检测逻辑**：
1. 遍历所有节点，筛选出loop_start和loop_end
2. 通过loop_id匹配成对节点
3. 验证节点间是否存在有效路径
4. 生成包含节点列表的LoopInfo

### 3.2 LoopBoundary（循环边界渲染器）

**职责**：渲染循环的视觉边界

**关键属性**：
```typescript
interface LoopBoundaryProps {
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  nodesInLoop: any[];
}
```

**核心算法**：
```typescript
const calculateBoundary = () => {
  // 1. 获取起始和结束节点位置
  // 2. 计算所有循环内节点的包围盒
  // 3. 添加边距（上下20px，左右40px）
  // 4. 生成边界坐标
}
```

**渲染元素**：
- 四个角的括号（bracket-corner）
- 循环信息标签（loop-id, iteration, variable）
- 状态样式类（running, paused, error, completed）

### 3.3 LoopContextManager（循环上下文管理器）

**职责**：管理循环执行状态和数据

**核心功能**：
```typescript
// 循环栈管理
enterLoop(startNode, endNode, level): void
exitLoop(): LoopContext | null
getCurrentLoop(): LoopContext | null

// 事件处理
addEventListener(loopId, events, handler): void
removeEventListener(loopId, events, handler): void

// 数据管理
accumulateData(loopId, data: LoopData): void
exportLoopData(loopId, format: string): string
```

### 3.4 LoopVisualizer（循环可视化器）

**职责**：整合所有功能，提供统一接口

**关键功能**：
- 节点格式适配（adaptNodeToLoopNode）
- 状态管理和事件处理
- 控制面板集成
- 悬停交互

## 4. 数据流设计

### 4.1 初始化流程

```
1. Canvas加载节点
    ↓
2. LoopDetector扫描节点
    ↓
3. 生成LoopInfo数组
    ↓
4. LoopVisualizer为每个循环创建可视化
    ↓
5. LoopBoundary渲染边界
```

### 4.2 执行时流程

```
1. 循环开始执行
    ↓
2. LoopContextManager更新状态
    ↓
3. 发布执行事件
    ↓
4. LoopBoundary接收事件更新样式
    ↓
5. 用户看到实时状态变化
```

### 4.3 交互流程

```
1. 鼠标悬停循环区域
    ↓
2. LoopVisualizer显示控制面板
    ↓
3. 用户点击控制按钮
    ↓
4. 调用LoopContextManager方法
    ↓
5. 更新循环执行状态
```

## 5. 类型系统设计

### 5.1 核心类型定义

```typescript
// 循环信息
interface LoopInfo {
  id: string;
  startNodeId: string;
  endNodeId: string;
  nodeIds: string[];
  iterationCount: number;
  parameters: {
    loop_variable?: string;
    start_value?: number;
    step?: number;
    delay_ms?: number;
    break_condition?: any;
    continue_condition?: any;
    data_accumulation?: string;
    export_format?: string;
  };
}

// 循环执行上下文
interface LoopExecutionContext {
  loopId: string;
  state: LoopExecutionState;
  currentIteration: number;
  totalIterations: number;
  startTime: number;
  elapsedTime: number;
  accumulatedData: LoopData[];
  progress: number;
}

// 循环节点类型
interface LoopStartNode extends ElectrochemicalNode {
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
```

### 5.2 类型适配策略

由于系统中存在不同的节点格式，需要适配机制：

```typescript
const adaptNodeToLoopNode = (node, type): LoopStartNode | LoopEndNode => {
  // 补全必需字段
  // 确保类型安全
  // 返回正确的节点类型
}
```

## 6. 样式系统

### 6.1 CSS类命名规范

```css
.bracket-container          /* 边界容器 */
.bracket-corner            /* 括号角落 */
├─ .top-left              /* 左上角 */
├─ .top-right             /* 右上角 */
├─ .bottom-left           /* 左下角 */
└─ .bottom-right          /* 右下角 */

/* 层级颜色 */
.level-0                  /* 第1层：橙色 */
.level-1                  /* 第2层：绿色 */
.level-2                  /* 第3层：蓝色 */
.level-3                  /* 第4层：紫色 */

/* 状态样式 */
.running                  /* 运行中：脉动动画 */
.paused                   /* 暂停：黄色边框 */
.error                    /* 错误：红色摇晃动画 */
.completed                /* 完成：蓝色边框 */
```

### 6.2 动画效果

```css
/* 运行状态脉动 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 错误状态摇晃 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
```

## 7. 性能优化

### 7.1 渲染优化

- **使用React.memo**：避免不必要的重渲染
- **useMemo缓存计算**：边界位置和节点适配
- **事件委托**：减少事件监听器数量

### 7.2 状态管理优化

- **发布-订阅模式**：精确更新相关组件
- **批量状态更新**：减少重渲染次数
- **懒加载**：按需加载控制面板

## 8. 扩展性设计

### 8.1 支持更多循环类型

- 并行循环（多个起始节点）
- 条件循环（动态判断条件）
- 嵌套循环（已支持4层）

### 8.2 增强功能

- 循环性能分析
- 数据可视化图表
- 循环模板系统
- 断点调试功能

## 9. 测试策略

### 9.1 单元测试

- LoopDetector的检测逻辑
- LoopBoundary的边界计算
- LoopContextManager的状态管理

### 9.2 集成测试

- 完整的循环创建流程
- 状态同步正确性
- 用户交互响应

### 9.3 视觉回归测试

- 不同层级的颜色正确性
- 动画效果一致性
- 响应式布局适配

## 10. 最佳实践

### 10.1 开发规范

1. **类型安全优先**：确保所有TypeScript类型定义正确
2. **组件解耦**：每个组件职责单一，通过props通信
3. **状态集中管理**：使用LoopContextManager统一管理状态
4. **样式模块化**：使用CSS类而非内联样式

### 10.2 维护指南

1. **添加新功能**：先更新类型定义，再实现逻辑
2. **修改样式**：优先修改CSS文件，保持类命名规范
3. **性能优化**：使用React DevTools分析渲染性能
4. **调试技巧**：开启事件日志查看循环执行流程

## 11. 已知问题与解决方案

### 11.1 类型不匹配问题

**问题**：节点格式转换时缺少必需字段
**解决方案**：实现adaptNodeToLoopNode函数，补全所有必需字段

### 11.2 嵌套循环层级限制

**问题**：当前只支持4层嵌套
**解决方案**：扩展颜色数组，动态生成层级样式

### 11.3 性能优化空间

**问题**：大量循环时可能影响渲染性能
**解决方案**：实现虚拟滚动，只渲染可视区域内的循环

## 12. 版本历史

- **v1.0 (2025-10-29)**：基础循环边界可视化功能
  - 实现四角括号边界
  - 支持状态动画
  - 基础控制面板
  - 嵌套循环支持

## 13. 相关文档

- [LoopBoundary使用指南](../LoopBoundary/README.md)
- [节点类型定义](../../apps/frontend/src/nodes/types.ts)
- [样式系统说明](../../apps/frontend/src/styles/components/_loop-boundary.css)

---

**文档维护**：如有修改或补充，请更新版本历史和文档日期。