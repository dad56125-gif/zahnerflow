# 选择任意起始点开始运行 - 功能设计备忘

> 状态：待实现（后续考虑）

## 需求背景

用户需要能够从工作流的**任意步骤**开始执行，特别是：
- 工作流中断后，从断点恢复
- 调试循环逻辑时，从循环的**特定迭代**开始

## 核心挑战

循环场景：如果用户想从"循环1 的第2次迭代的 NodeB"开始，需要：
1. 展开循环生成完整的执行步骤列表
2. 用户从列表中选择具体的起始点
3. 后端从该步骤开始执行

## 推荐方案

### 前端：步骤选择器

弹窗显示展开后的步骤列表，每项包含迭代信息：

```
[1] startup
[2] NodeA (循环1 第1次)
[3] NodeB (循环1 第1次)
[4] NodeA (循环1 第2次)  ← 用户可选择
...
```

使用 `loopUnroller.unrollLoops()` 生成列表。

### 后端：支持 startUnrolledIndex

```typescript
POST /api/execution/run
{
  workflowId: "xxx",
  nodes: [...],
  startUnrolledIndex: 4  // 从展开后的第4步开始
}
```

## 涉及文件

| 文件 | 改动 |
|------|-----|
| `[NEW] StepSelector.tsx` | 步骤选择器组件 |
| `Toolbar.tsx` | 添加"选择起点"按钮 |
| `executionStateBridge.ts` | 支持 startUnrolledIndex |
| `execution.service.ts` | 后端从指定索引开始执行 |

## 依赖

- `loopUnroller.ts` - 已实现 ✅
