# 前端 Workflow/Node 类型重构

**日期**: 2025-12-10

## 概述

本次重构简化了前端 `Workflow` 和 `WorkflowNode` 类型定义，遵循"前端只负责显示和传递工作流"的原则。

## 类型定义变更

### WorkflowNode（简化版）
```typescript
interface WorkflowNode {
  id: string;
  type: NodeType;
  config: Record<string, any>;
}
```

### Workflow（简化版）
```typescript
interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  ownerName?: string;      // 可选
  project_name?: string;   // 可选
}
```

**移除的字段**：
- `workstation` - 前端 UI 使用本地状态管理
- `position/style/status/data/input/output` - 视图层属性，由布局系统动态计算
- `createdAt/updatedAt` - 后端管理的时间戳
- `definition` - 冗余嵌套结构

## 修改的文件

| 文件 | 变更 |
|------|------|
| `src/types/Interfaces.ts` | 简化 Workflow 接口 |
| `src/App.tsx` | 重构为 AppContent 内部组件，使用 useUser 获取用户数据 |
| `src/workflow/WorkflowManagerUI.tsx` | 移除违规字段，简化节点转换 |
| `src/workflow/WorkflowManager.ts` | 补全 createEmpty 返回值 |
| `src/canvas/LoopBoundary.tsx` | 使用 DisplayNode 类型 |
| `src/canvas/useNodeChangeDetection.ts` | 使用通用 NodeLike 接口 |

## 架构改进

### 数据层与视图层分离

```
WorkflowNode (数据层)          DisplayNode (视图层)
├── id                         ├── id
├── type                       ├── type
└── config                     ├── position    ← 布局计算
                               ├── style       ← 布局计算
                               └── layoutMeta  ← 布局计算
```

- `useUnifiedLayout` 负责将 `WorkflowNode[]` 转换为 `DisplayNode[]`
- 渲染组件（NodeRenderer、LoopBoundary）使用 `DisplayNode`

## 用户上下文集成

`App.tsx` 现在从 `useUser()` 获取用户数据：
- `currentUser` → `Workflow.ownerName`
- `filePathConfig.project_name` → `Workflow.project_name`
