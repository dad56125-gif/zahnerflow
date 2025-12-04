# 临时ID生成检查报告

## 违宪代码发现 ❌

根据 docs/talk.md 宪法第2.2条和第4.1条，前端不应生成任何 `temp_` 前缀的ID。

### 发现的违宪代码：

#### 1. App.tsx (2处)
- **Line 109**: `currentWorkflow.id.startsWith('temp-workflow-')`
  - 用途：判断是否为临时工作流
  - 违宪原因：前端不应识别临时ID
  
- **Line 116**: `id: \`temp_workflow_${Date.now()}\``
  - 用途：生成临时工作流ID
  - 违宪原因：ID生成是后端权威，前端不应生成

#### 2. canvasStore.ts (1处)
- **Line 90**: `id: \`temp-workflow-${Date.now()}\``
  - 用途：首次添加节点时创建临时工作流
  - 违宪原因：违背"后端即权威"原则

#### 3. stores/index.ts (1处)
- **Line 76**: `id.startsWith('temp-workflow-')`
  - 用途：拦截临时工作流的API调用
  - 违宪原因：前端不应有特殊逻辑处理临时ID

## 架构宪法违反条款

### talk.md 第2.2条 - 必须删除
```
- `WorkflowManager.ts` 中的 `regenerateIds`
- `WorkflowManager.ts` 中的 `createWorkflowTemplate`  
- 原因：ID由后端生成，前端不生成
```

### talk.md 第4.1条 - Run = Create if Null
```typescript
POST /api/executions
Body: {
  workflowId?: string,  // 可选，null表示新工作流
  nodes: WorkflowNode[]  // 必须，当前画布完整数据
}
```

**核心原则**: **后端即权威** - ID生成、持久化、版本控制由后端负责

## 正确做法

### 模式：Create if Null
```typescript
// 前端不应生成任何temp_ ID
// 新工作流：workflowId = null
// 现有工作流：workflowId = "wf_123"

const handleRun = async () => {
  const workflowId = currentWorkflow?.id || null;
  const result = await executionService.run(workflowId, nodes);
  
  // Create if Null: 首次运行后确立身份
  if (!currentWorkflow.id) {
    setCurrentWorkflow({ id: result.workflowId, nodes });
  }
};
```

## 整改要求

必须删除所有 `temp_` 相关代码：
1. ❌ 删除 App.tsx 中的临时ID生成 (Line 116)
2. ❌ 删除 App.tsx 中的临时ID检查 (Line 109)
3. ❌ 删除 canvasStore.ts 中的临时ID生成 (Line 90)
4. ❌ 删除 stores/index.ts 中的临时ID拦截逻辑 (Line 76)

实现 Run = Create if Null 模式，让后端负责所有ID生成。
