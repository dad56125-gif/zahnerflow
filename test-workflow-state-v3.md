# 工作流状态管理测试验证 v3.0

## 最新修复：未命名工作流显示问题

### 🎯 问题描述
**现象**: 临时工作流运行后转换为持久化工作流，但未命名的工作流错误地显示了"临时工作流"名称，而不是显示工作流ID

**根本原因**: App.tsx 创建持久化工作流时，总是设置了一个name字段：
```typescript
// 修复前：总是设置name
name: currentWorkflow?.name || `电化学工作流${new Date().toLocaleString()}`
```

**修复方案** ([`App.tsx:114-116`](apps/frontend/src/App.tsx#L114-L116)):
```typescript
// 修复后：智能判断是否设置name
name: (currentWorkflow?.name && currentWorkflow.name !== '临时工作流')
  ? currentWorkflow.name
  : undefined, // 对于未命名或默认临时工作流，不设置name
```

### 🔧 逻辑说明

现在的工作流名称处理逻辑：

1. **用户自定义名称**: 如果临时工作流有用户编辑的名称（不是"临时工作流"），保持该名称
2. **默认临时工作流**: 如果是默认的"临时工作流"名称，不设置name字段
3. **显示逻辑**: WorkflowIdDisplay 使用 `{currentWorkflow.name || currentWorkflow.id}`
   - 当name为undefined时，自动显示ID
   - 当有用户自定义名称时，显示该名称

## 完整状态流转图 v3.0

```
页面初始化 → 未选择工作流
    ↓
添加第一个节点 → 创建临时工作流 (name: '临时工作流') → 显示"临时工作流"
    ↓
用户编辑名称 → 临时工作流 (name: '用户自定义名称') → 显示"用户自定义名称"
    ↓
点击运行（默认临时）→ 创建持久化工作流 (name: undefined) → **显示工作流ID**
    ↓
点击运行（用户命名）→ 创建持久化工作流 (name: '用户自定义名称') → **显示"用户自定义名称"**
    ↓
选择历史工作流 → 显示历史工作流名称/ID
    ↓
清除画布 → 清除工作流状态 → 返回"未选择工作流"
```

## 测试场景验证

### 场景1: 默认临时工作流 → 显示ID
1. **初始状态**: 页面刷新显示 "未选择工作流"
2. **添加节点**: 显示 "临时工作流" (默认名称)
3. **点击运行**:
   - 检测到临时工作流，name为 '临时工作流'
   - 创建持久化工作流，不设置name字段
   - **预期结果**: WorkflowIdDisplay 显示后端生成的工作流ID

### 场景2: 用户自定义名称 → 保持名称
1. **初始状态**: 添加节点显示 "临时工作流"
2. **用户编辑**: 双击编辑为 "我的实验001"
3. **点击运行**:
   - 检测到临时工作流，name为 '我的实验001'
   - 创建持久化工作流，设置name为 '我的实验001'
   - **预期结果**: WorkflowIdDisplay 显示 "我的实验001"

### 场景3: 历史工作流不变
1. **加载历史工作流**: 从WorkflowManagerUI选择已保存的工作流
2. **点击运行**:
   - 检测到历史工作流
   - 直接执行，不创建新工作流
   - **预期结果**: WorkflowIdDisplay 显示保持不变

## 核心代码修复

### 1. App.tsx - 智能名称处理
```typescript
// 对于临时工作流，智能决定是否设置name
name: (currentWorkflow?.name && currentWorkflow.name !== '临时工作流')
  ? currentWorkflow.name  // 保留用户自定义名称
  : undefined,           // 默认临时工作流不设置名称，让显示逻辑使用ID
```

### 2. WorkflowIdDisplay.tsx - 显示逻辑
```typescript
// 优先显示名称，无名称时显示ID
<span className="display-text">
  {currentWorkflow.name || currentWorkflow.id}
</span>
```

## 验证成功标准

1. **默认临时工作流**: 运行后显示工作流ID，不是"临时工作流"
2. **用户自定义名称**: 运行后保持用户编辑的名称
3. **历史工作流**: 显示逻辑保持不变
4. **编辑功能**: 双击编辑功能对ID显示的工作流仍然有效

## 技术要点

- **undefined vs 空字符串**: 使用undefined而不是空字符串，让OR运算符正确工作
- **默认值过滤**: 特别检查 `'临时工作流'` 这个默认值
- **后端兼容**: 后端应该能处理name为undefined的情况
- **TypeScript安全**: 编译通过，确保类型安全

## 调试信息

检查以下关键点：
1. **Network请求**: 查看POST /workflows请求中的name字段
2. **响应数据**: 确认后端返回的工作流对象的name字段
3. **控制台日志**: 检查创建工作流的日志输出
4. **组件状态**: 在React DevTools中查看currentWorkflow的name值