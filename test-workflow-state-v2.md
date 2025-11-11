# 工作流状态管理测试验证 v2.0

## 修复的关键问题

### 🎯 运行后状态更新修复

**问题**: 点击运行后，长期工作流已经创建，但 WorkflowIdDisplay 仍显示临时工作流名称

**根本原因**: App.tsx 中的运行逻辑无法区分临时工作流和历史工作流，导致临时工作流永远不会转换为持久化工作流

**修复方案**:
1. 通过 `currentWorkflow.id.startsWith('temp-workflow-')` 区分临时工作流
2. 临时工作流运行时创建新的持久化工作流
3. 保留临时工作流的名称作为新工作流的基础名称

## 修复的关键代码

### App.tsx 运行逻辑修复

```typescript
// 修复前
if (currentWorkflow) {
  // 总是执行历史工作流逻辑
} else {
  // 创建新工作流（永远执行不到）
}

// 修复后
if (currentWorkflow && !currentWorkflow.id.startsWith('temp-workflow-')) {
  // 只有历史工作流才直接执行
  console.log(`执行历史工作流 "${currentWorkflow.name}" (ID: ${currentWorkflow.id})`);
  await stateLinkageManager.startExecution(currentWorkflow.id, nodes);
} else {
  // 临时工作流或新工作流：创建持久化工作流
  const workflowDefinition = {
    id: `temp_workflow_${Date.now()}`,
    name: currentWorkflow?.name || `电化学工作流${new Date().toLocaleString()}`,
    // ...其他配置
  };

  const createdWorkflow = await workflowService.createWorkflow(workflowDefinition);

  // 更新为持久化工作流状态
  const { setCurrentWorkflow } = useWorkflowStore.getState();
  setCurrentWorkflow(createdWorkflow);

  await stateLinkageManager.startExecution(createdWorkflow.id, nodes);
}
```

## 完整状态流转图 v2.0

```
页面初始化 → 未选择工作流
    ↓
添加第一个节点 → 创建临时工作流 (temp-workflow-${Date.now()}) → 显示"临时工作流"
    ↓
选择历史工作流 → 显示历史工作流名称/ID
    ↓
点击运行（临时工作流）→ 创建持久化工作流 → 更新显示为正式工作流名称/ID
    ↓
点击运行（历史工作流）→ 直接执行，显示不变
    ↓
清除画布 → 清除工作流状态 → 返回"未选择工作流"
```

## 测试场景验证

### 场景1: 临时工作流 → 持久化工作流
1. **初始状态**: 页面刷新显示 "未选择工作流"
2. **添加节点**: 显示 "临时工作流" (currentWorkflow.id 以 'temp-workflow-' 开头)
3. **点击运行**:
   - 检测到临时工作流 (ID以 'temp-workflow-' 开头)
   - 调用 `workflowService.createWorkflow()` 创建持久化工作流
   - 更新 `setCurrentWorkflow(createdWorkflow)`
   - **预期结果**: WorkflowIdDisplay 显示新创建的持久化工作流名称

### 场景2: 历史工作流直接执行
1. **加载历史工作流**: 从 WorkflowManagerUI 选择已保存的工作流
2. **检查状态**: currentWorkflow.id 不以 'temp-workflow-' 开头
3. **点击运行**:
   - 检测到历史工作流
   - 直接调用 `stateLinkageManager.startExecution(currentWorkflow.id, nodes)`
   - **预期结果**: WorkflowIdDisplay 显示不变，仍为历史工作流名称

### 场景3: 临时工作流名称保持
1. **创建临时工作流**: 添加第一个节点
2. **点击运行**:
   - 使用 `currentWorkflow?.name` 作为新工作流名称
   - **预期结果**: 如果临时工作流有自定义名称，会保持到持久化工作流

## 验证成功的标准

1. **状态转换正确**: 临时工作流能够正确转换为持久化工作流
2. **名称保持**: 用户编辑的临时工作流名称能够传递到持久化工作流
3. **历史工作流不受影响**: 已保存的历史工作流执行逻辑保持不变
4. **用户体验**: 点击运行后，WorkflowIdDisplay 立即更新为正确的持久化工作流信息
5. **无重复执行**: 不会出现同时执行临时工作流和持久化工作流的情况

## 技术要点

- **临时工作流识别**: 使用 `id.startsWith('temp-workflow-')` 进行可靠识别
- **名称继承**: 通过 `currentWorkflow?.name` 保持用户编辑的名称
- **状态同步**: 使用 `setCurrentWorkflow()` 确保 UI 立即更新
- **类型安全**: TypeScript 编译通过，确保代码质量

## 调试信息

运行时检查控制台日志：
- `执行历史工作流 "XXX" (ID: XXX)` - 表示执行历史工作流
- `创建并执行新工作流 "XXX" (ID: XXX)` - 表示创建并执行持久化工作流
- 检查 Network 面板中是否有 `POST /workflows` 请求，确认持久化工作流创建