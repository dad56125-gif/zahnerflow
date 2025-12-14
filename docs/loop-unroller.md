# 循环展开器 (Loop Unroller)

## 概述

`loopUnroller.ts` 是一个工具模块，用于将带有嵌套循环的工作流节点列表**展开**为实际执行步骤列表。

**核心问题**：工作流中 `loop_start` / `loop_end` 定义的循环在执行时会重复运行循环体内的节点，但原始节点列表无法直接反映"实际会执行多少步"。

**解决方案**：在需要计算真实执行步骤数的场景（进度条、时间估算、报告等），调用 `unrollLoops()` 函数获取展开后的步骤列表。

---

## 核心概念

### 设计视图 vs 执行视图

| 视图 | 含义 | 用途 |
|------|-----|-----|
| **设计视图** | 用户编辑的 `nodes[]` 数组 | 画布渲染、保存/加载工作流 |
| **执行视图** | 展开后的 `UnrolledStep[]` | 进度计算、时间估算、报告统计 |

### 示例

```
原始节点 (7 个):
[0] loop_start (3次)
  [1] NodeA
  [2] loop_start (2次)  ← 嵌套循环
    [3] NodeB
  [4] loop_end
  [5] NodeC
[6] loop_end

展开后 (12 步):
Step 0: NodeA (轮次: 1)
Step 1: NodeB (轮次: 1-1)
Step 2: NodeB (轮次: 1-2)
Step 3: NodeC (轮次: 1)
Step 4: NodeA (轮次: 2)
Step 5: NodeB (轮次: 2-1)
Step 6: NodeB (轮次: 2-2)
Step 7: NodeC (轮次: 2)
Step 8: NodeA (轮次: 3)
Step 9: NodeB (轮次: 3-1)
Step 10: NodeB (轮次: 3-2)
Step 11: NodeC (轮次: 3)
```

---

## API 参考

### 主函数

#### `unrollLoops(nodes: WorkflowNode[]): UnrollResult`

将工作流节点列表展开为执行步骤列表。

```typescript
import { unrollLoops } from '../shared/loopUnroller';

const nodes = [...]; // 从 canvasStore 获取
const result = unrollLoops(nodes);

console.log(result.summary.totalSteps);  // 总步骤数
console.log(result.steps);               // 步骤详情数组
```

### 返回类型

```typescript
interface UnrollResult {
  steps: UnrolledStep[];    // 展开后的步骤列表
  summary: UnrollSummary;   // 统计摘要
}

interface UnrolledStep {
  nodeId: string;           // 原始节点 ID
  nodeType: string;         // 节点类型
  originalIndex: number;    // 在 nodes[] 中的索引
  iterationPath: number[];  // 迭代路径 [外层轮次, 内层轮次, ...]
  loopContextStack: number[]; // 所在循环的 loop_start 索引栈
  loopDepth: number;        // 嵌套深度 (0=不在循环内)
}

interface UnrollSummary {
  totalSteps: number;       // 总步骤数
  physicalNodeCount: number;// 物理节点数 (排除循环边界)
  maxLoopDepth: number;     // 最大嵌套深度
  loops: Array<{...}>;      // 循环信息列表
}
```

### 辅助函数

| 函数 | 用途 |
|------|-----|
| `calculateProgress(result, stepIndex)` | 计算进度百分比 (0-100) |
| `formatIterationPath(path)` | 格式化迭代路径为 "1-2-3" 形式 |
| `getStepAt(result, stepIndex)` | 获取指定索引的步骤信息 |
| `findStepsByOriginalIndex(result, origIndex)` | 查找某节点在展开后的所有步骤索引 |

---

## 使用场景

### 1. ProgressBar 进度计算

```typescript
// ProgressBar.tsx
import { unrollLoops, calculateProgress } from '../shared/loopUnroller';

const nodes = useCanvasStore(state => state.nodes);
const result = useMemo(() => unrollLoops(nodes), [nodes]);

// 假设后端传来当前执行到第 5 步 (展开后的索引)
const progress = calculateProgress(result, currentUnrolledStepIndex);
```

### 2. 时间估算

```typescript
// timelineCalculator.ts
import { unrollLoops } from '../shared/loopUnroller';

export function estimateTotalSeconds(nodes: WorkflowNode[]): number {
  const result = unrollLoops(nodes);
  return result.steps.reduce((sum, step) => {
    return sum + estimateNodeDuration(step.nodeType, nodes[step.originalIndex].config);
  }, 0);
}
```

### 3. 执行报告

```typescript
// 生成报告时
const result = unrollLoops(nodes);

// 按节点分组统计执行次数
const executionCounts = new Map<string, number>();
result.steps.forEach(step => {
  const count = executionCounts.get(step.nodeId) || 0;
  executionCounts.set(step.nodeId, count + 1);
});
```

---

## 注意事项

1. **性能**：`unrollLoops` 会遍历所有节点并递归展开循环，建议使用 `useMemo` 缓存结果
2. **最大深度**：支持最多 5 层嵌套循环（与系统设计一致）
3. **边界情况**：如果 `loop_start` 没有匹配的 `loop_end`，该循环会被跳过并打印警告

---

## 文件位置

```
apps/
├── shared/
│   └── loopUnroller.ts   ← 共享模块 (单一真理源)
├── backend/
│   └── 通过 @shared/loopUnroller 导入
└── frontend/
    └── src/shared/loopUnroller.ts (重导出 @shared/loopUnroller)
```

## TypeScript 配置

前后端 `tsconfig.json` 都配置了 `@shared/*` 路径映射：

```json
{
  "paths": {
    "@shared/*": ["../shared/*"]
  },
  "include": ["src", "../shared"]
}
```

## 后端集成

后端 `execution.service.ts` 的 `executeNodes` 函数现在使用 `unrollLoops` 展开循环：

```typescript
const { steps } = unrollLoops(nodes);
for (let unrolledIdx = 0; unrolledIdx < steps.length; unrolledIdx++) {
  // currentStep 包含 unrolledIndex, unrolledTotal, iterationPath
}
```

## 前端集成

- **ProgressBar**: 优先使用 `currentStep.unrolledIndex / currentStep.unrolledTotal` 计算进度
- **timelineCalculator**: 使用 `unrollLoops` 展开后计算真实执行时间
