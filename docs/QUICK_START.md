# ZAHNERFLOW 重构快速指引

## 📋 文档清单

已完成所有重构协议文档，共5个核心文件：

### 1️⃣ docs/talk.md (核心宪法)
**作用**: 所有代理必须遵守的架构规范
- 核心数据结构定义 (WorkflowNode, WorkflowDefinition)
- 必须删除的文件清单
- 必须重写的文件规范
- 交互逻辑详情 (三钮分离、Run = Create if Null)
- 视图与拖拽逻辑 (自动布局、拖拽即排序)
- WebSocket协议 ({i, s, d}格式)

**重要性**: ⭐⭐⭐⭐⭐ (绝对不能违背)

----

### 2️⃣ docs/Todo_Phase_1.json (第一阶段任务)
**目标**: 删除违背架构的文件和代码

**主要任务**:
1. 删除 `workflowParameterStore.ts` (216行)
2. 删除 `workflowExecutionService.ts` (838行)
3. 删除 `workflowSyncUtil.ts` (962行)
4. 清理 `workflowStore.ts` 中的ParameterStore依赖
5. 删除 `workflowService.ts` 的IO方法
6. 扫描并清理残留引用

**预期效果**: 删除2,000+行冗余代码

**命令**: `npm run agent:phase 1`

----

### 3️⃣ docs/Todo_Phase_2.json (第二阶段任务)
**目标**: 重写核心管理器，实现索引架构

**主要任务**:
1. 重构 `WorkflowManager.ts` (1,700行 → 100行)
   - 删除: export/import/CSV/版本控制/regenerateIds
   - 保留: createEmpty, validate
2. 重构 `executionStore.ts` (基于索引)
   - `Map<string, string>` → `string[]`
   - `currentNodeId` → `currentNodeIndex`
   - WebSocket使用直接索引赋值
3. 简化 `workflowService.ts` - 添加runWorkflow方法
4. 更新类型定义 - 移除禁止字段

**预期效果**: 代码量减少1,600+行，实现O(1)状态访问

**命令**: `npm run agent:phase 2`

----

### 4️⃣ docs/Todo_Phase_3.json (第三阶段任务)
**目标**: 更新UI组件，实现最终验证

**主要任务**:
1. 更新 `WorkflowManagerUI.tsx` - 移除ParameterStore依赖
2. 更新 `WorkflowIdDisplay.tsx` - 简化显示逻辑
3. 更新画布组件 - 实现自动布局和拖拽排序
   - `calculateNodePosition(index)` - 根据索引计算坐标
   - `handleNodeDrag` - 拖拽时重新排序数组
4. 更新主控制按钮 - 实现三钮分离
   - Save As: POST /api/workflows
   - Update: PUT /api/workflows/:id
   - Run: POST /api/executions (Create if Null)
5. 最终验证 - TypeScript编译检查

**预期效果**: 完成所有UI适配，通过质量门禁

**命令**: `npm run agent:phase 3`

----

### 5️⃣ docs/REFACTORING_PROTOCOL.md (完整协议)
**作用**: 三级代理执行协议的完整说明文档
- 角色定义 (总代理/主代理/子代理)
- 工作流循环 (The Loop)
- 任务清单结构详解
- 执行指南和命令
- 质量门禁 (Quality Gates)
- 熔断条件
- 成果度量

**重要性**: ⭐⭐⭐⭐ (执行指引)

----

## 🚀 使用流程

### 步骤 1: 审阅核心宪法
```bash
code docs/talk.md
```
**必须**: 所有代理都必须完全理解并遵守此文档

### 步骤 2: 执行Phase 1 (删除冗余)
```bash
# 启动总代理，执行第一阶段
npm run agent:phase 1

# 预期结果:
# - 删除3个文件 (~2,000行)
# - 清理所有ParameterStore引用
# - Todo_Phase_1.json中所有任务标记为completed: true
```

### 步骤 3: 执行Phase 2 (重写核心)
```bash
# 启动总代理，执行第二阶段
npm run agent:phase 2

# 预期结果:
# - WorkflowManager.ts 精简90%
# - executionStore改用数组索引
# - 所有类型定义符合规范
# - Todo_Phase_2.json中所有任务标记为completed: true
```

### 步骤 4: 执行Phase 3 (UI更新)
```bash
# 启动总代理，执行第三阶段
npm run agent:phase 3

# 预期结果:
# - 自动布局功能实现
# - 拖拽排序功能实现
# - 三钮分离逻辑正确
# - TypeScript编译通过
# - 总代码量减少70%
# - Todo_Phase_3.json中所有任务标记为completed: true
```

----

## 📊 预期成果

### 代码量减少 71%

| 组件 | 重构前 | 重构后 | 减少 |
|------|--------|--------|------|
| workflowParameterStore.ts | 216行 | 0行 (删除) | -216 |
| workflowExecutionService.ts | 838行 | 0行 (删除) | -838 |
| workflowSyncUtil.ts | 962行 | 0行 (删除) | -962 |
| **WorkflowManager.ts** | **1,774行** | **~100行** | **-1,674** |
| executionStore.ts | 171行 | ~80行 | -91 |
| workflowStore.ts | 58行 | ~40行 | -18 |
| WorkflowManagerUI.tsx | 499行 | ~200行 | -299 |
| WorkflowIdDisplay.tsx | 109行 | ~50行 | -59 |
| 其他文件 | ~1,000行 | ~500行 | -500 |
| **总计** | **~5,600行** | **~1,000行** | **-4,600行 (-71%)** |

### 架构质量提升

| 指标 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| **数据流清晰度** | 复杂(多中间层) | 简单(直接传输) | ✅ 5x |
| **状态访问性能** | O(log n) Map查找 | O(1) 数组访问 | ✅ 10x+ |
| **Store数量** | 3个 (含ParameterStore) | 2个 | ✅ -33% |
| **代码复杂度** | 高 (3500行) | 低 (1000行) | ✅ -71% |
| **职责分离** | 混乱 (Run/Save混合) | 清晰 (三钮分离) | ✅ 明确 |
| **编译时安全** | ❌ (临时ID绕过) | ✅ (严格类型) | ✅ 安全 |
| **架构真理** | 模糊 | **索引即顺序** | ✅ 清晰 |

----

## 🎯 核心原则

### 1. 索引即顺序 (Index is Order)
```typescript
// ✅ 正确: 数组索引定义执行顺序
nodes = [A, B, C, D];
//        0  1  2  3
// A → B → C → D

// ❌ 错误: 需要额外的edges或next_node_id
nodes = [
  { id: 'A', next: 'B' },
  { id: 'B', next: 'C' },  // 冗余，易出错
];
```

### 2. 数组即真理 (Array is Truth)
```typescript
// ✅ 正确: 单一数据源
interface WorkflowDefinition {
  nodes: WorkflowNode[];  // 仅一个数组
}

// ❌ 错误: 多个数组需同步
interface WorkflowDefinition {
  nodes: Node[];
  edges: Edge[];       // 需要与nodes同步
  positions: Position[];  // 需要与nodes同步
}
```

### 3. 后端即权威 (Backend is Authority)
```typescript
// ✅ 正确: ID由后端生成
POST /api/executions
Body: { workflowId: null, nodes: [...] }

// 响应: { workflowId: "wf_123", ... }

// ❌ 错误: 前端生成临时ID
const tempId = generateTemporaryWorkflowId();
// 违背单一数据源
```

### 4. 所见即所跑 (What You See Is What Runs)
```typescript
// ✅ 正确: Run按钮携带当前数据
const handleRun = () => {
  runWorkflow(workflowId, nodes);  // nodes是当前画布数据
};

// ❌ 错误: Run前必须先Save
const handleRun = async () => {
  await saveWorkflow();  // 多余的Save操作
  await runWorkflow(workflowId);
};
```

### 5. O(1)状态访问
```typescript
// ✅ 正确: 基于索引的数组访问
status = nodeStatuses[index];  // O(1)

// ❌ 错误: 基于ID的Map查找
status = nodeStatuses.get(nodeId);  // O(log n)
```

----

## ⚠️ 熔断条件 (Circuit Breakers)

以下情况**必须立即停止**重构:

1. ❌ TypeScript编译出现任何错误
2. ❌ 发现了对`temp_`前缀的依赖
3. ❌ 发现了对ParameterStore的残留引用
4. ❌ 新增的代码违背talk.md原则
5. ❌ 功能测试失败 (执行流程无法正常工作)

**行动**: 回滚到上一个稳定状态，重新审查设计

----

## 📌 关键文件路径

```
docs/
├── 📜 talk.md                    # 架构宪法 (必须完全遵守)
├── 📋 Todo_Phase_1.json          # 第一阶段: 删除冗余
├── 📋 Todo_Phase_2.json          # 第二阶段: 重写核心
├── 📋 Todo_Phase_3.json          # 第三阶段: UI更新
├── 📖 REFACTORING_PROTOCOL.md    # 完整协议说明
└── 📖 QUICK_START.md             # 本文档 (快速指引)

重构目标文件:
services/
├── stores/
│   ├── workflowStore.ts          # 需要简化
│   └── executionStore.ts         # 需要重构 (基于索引)
└── workflowService.ts            # 需要简化

components/features/workflow/
├── WorkflowManager.ts            # 需要重写 (精简90%)
├── WorkflowManagerUI.tsx         # 需要更新
└── WorkflowIdDisplay.tsx         # 需要简化
```

----

## 🎓 学习资源

### 推荐阅读顺序

1. **第一步**: 阅读 `talk.md` (理解新架构)
   - 重点: 核心数据结构、交互逻辑、WebSocket协议

2. **第二步**: 阅读 `REFACTORING_PROTOCOL.md` (理解执行流程)
   - 重点: 三级代理协议、质量门禁、熔断条件

3. **第三步**: 查看 `Todo_Phase_*.json` (理解具体任务)
   - 按Phase顺序查看，了解每个阶段的目标

### 核心概念

| 概念 | 解释 | 重要性 |
|------|------|--------|
| **索引即顺序** | 数组索引定义执行顺序，无需显式指针 | ⭐⭐⭐⭐⭐ |
| **后端即权威** | ID、持久化由后端主导，前端不生成临时ID | ⭐⭐⭐⭐⭐ |
| **单一数据源** | 参数直接传输，不经过复杂中间层 | ⭐⭐⭐⭐⭐ |
| **三钮分离** | Save As / Update / Run职责清晰分离 | ⭐⭐⭐⭐ |
| **O(1)访问** | 数组直接索引，无Map查找开销 | ⭐⭐⭐⭐ |
| **运行时锁定** | 执行期间禁止拖拽，确保一致性 | ⭐⭐⭐ |

----

## 🏆 成功标准

### 代码层面
- [ ] 总代码量减少70% (从3,500行到1,000行)
- [ ] 删除3个违背架构的文件
- [ ] 所有类型定义符合talk.md规范
- [ ] TypeScript编译零错误

### 架构层面
- [ ] 单一数据源原则得到贯彻
- [ ] 状态访问实现O(1)复杂度
- [ ] 三钮分离交互逻辑正常
- [ ] Run按钮支持Create if Null

### 功能层面
- [ ] 工作流可正常创建、运行、保存
- [ ] WebSocket消息格式正确 ({i, s, d})
- [ ] 拖拽排序功能正常
- [ ] 自动布局功能正常

----

## 📞 问题反馈

如遇到以下情况:
1. 任务无法完成 (违反talk.md)
2. TypeScript编译错误
3. 功能测试失败
4. 对架构规范有疑问

**行动**: 查看 `REFACTORING_PROTOCOL.md` 中的熔断条件和质量门禁章节

----

**文档版本**: 1.0.0
**最后更新**: 2025-12-03
**维护者**: 总代理 (Total Agent)
