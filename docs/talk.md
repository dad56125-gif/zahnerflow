# ZAHNERFLOW 前端重构架构规范 (The Definition)

## 1. 核心数据结构 (Core Data Structure)

### 1.1 WorkflowNode 定义
```typescript
interface WorkflowNode {
  id: string;  // 持久化身份标识
  type: string;  // 节点类型
  data: {
    parameters: Record<string, any>;  // 业务参数
  };
}
```

**严格禁止字段**:
- ❌ `position` (后端不需要)
- ❌ `label` (无意义)
- ❌ `next_node_id` (指针无意义)
- ❌ `edges` (无显式连线)
- ❌ `version` (无版本兼容，向后端看齐)

### 1.2 WorkflowDefinition 定义
```typescript
interface WorkflowDefinition {
  id?: string;  // 可选，由后端生成
  name?: string;
  description?: string;
  nodes: WorkflowNode[];  // 线性有序数组
}
```

**核心原则**: **索引 (Index) 即执行顺序**
- 数组索引 0 为起始节点
- 数组索引 1 为第二步
- 以此类推

## 2. 必须删除的文件 (To Be Deleted)

### 2.1 违背单一数据源
- `services/stores/workflowParameterStore.ts`
  - 原因：为了"历史ID指向旧参数"与"画布新参数"的冲突而产生复杂中间层
  - 违背后端主导ID原则
  - 违背单一数据源原则

### 2.2 过时的执行服务
- `services/workflowExecutionService.ts`
  - 原因：复杂的参数同步逻辑已过时
  - "前端参数同步到后端"模式被废弃

### 2.3 无用的同步工具
- `services/workflowSyncUtil.ts`
  - 原因：不再需要计算Diff
  - 后端直接接收完整nodes数组

### 2.4 前端IO处理
- WorkflowManager.ts 中的 `exportWorkflow`
- WorkflowManager.ts 中的 `importWorkflow`
- WorkflowManager.ts 中的 `convertToCSV`
- WorkflowManager.ts 中的 `parseFromCSV`
- 原因：**前端不处理IO**，所有导入导出由后端完成

### 2.5 未实现/无用功能
- WorkflowManager.ts 中的 `regenerateIds`
- WorkflowManager.ts 中的 `createWorkflowTemplate`
- 原因：未实现或在新架构下无用

## 3. 必须重写的文件 (To Be Rewritten)

### 3.1 WorkflowManager.ts
**保留的方法**:
```typescript
class WorkflowManager {
  // 仅保留：创建空工作流
  static createEmpty(): WorkflowDefinition {
    return { nodes: [] };  // 不预设ID
  }

  // 仅保留：验证工作流配置
  static validateWorkflowConfig(config: Partial<WorkflowDefinition>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    // 基础验证逻辑
  }
}
```

**必须删除的方法**:
- ❌ `exportWorkflow` (前端不处理导出)
- ❌ `importWorkflow` (前端不处理导入)
- ❌ `convertToCSV` (CSV格式废弃)
- ❌ `parseFromCSV` (CSV解析废弃)
- ❌ `regenerateIds` (ID由后端生成)
- ❌ `createWorkflowTemplate` (模板功能废弃)
- ❌ `upgradeWorkflowVersion` (版本兼容废弃)
- ❌ `compareWorkflows` (比较功能废弃)

### 3.2 workflowStore.ts
**必须删除的逻辑**:
- ❌ 所有与 ParameterStore 同步的代码
- ❌ `generateTemporaryWorkflowId` 调用
- ❌ `isTemporaryWorkflow` 判断

**保留的职责**:
- ✅ 当前工作流状态管理
- ✅ 工作流列表缓存
- ✅ 工作流CRUD操作

### 3.3 executionStore.ts
**重构核心**: 基于索引而非节点ID

**旧的 Store 结构 (淘汰)**:
```typescript
// 错误的：基于节点ID映射
interface ExecutionState {
  nodeStatuses: Map<string, string>;  // nodeId -> status
  nodeResults: Map<string, any>;      // nodeId -> result
  currentNodeId: string | null;
}
```

**新的 Store 结构**:
```typescript
// 正确的：基于数组索引
interface ExecutionState {
  nodeStatuses: string[];  // index -> status (O(1)访问)
  nodeResults: any[];      // index -> result (O(1)访问)
  currentNodeIndex: number | null;
}

// WebSocket 更新逻辑
onExecutionUpdate({ i, s, d }) => {
  nodeStatuses[i] = s;  // 直接索引赋值，无查找
  if (d) nodeResults[i] = d;
}
```

## 4. 交互逻辑 (Interaction Logic)

### 4.1 按钮策略：三钮分离

#### 另存为 (Save As)
```typescript
// 创建新工作流
POST /api/workflows
Body: { nodes: [...], name: "..." }

// 后端响应
{ id: "wf_123", nodes: [...] }

// 前端更新 Store
setCurrentWorkflow({ id: "wf_123", nodes: [...] });
```

#### 更新 (Update / Save)
```typescript
// 更新现有工作流
PUT /api/workflows/:id
Body: { nodes: [...] }

// 前提：必须有 workflowId
if (!currentWorkflow.id) throw new Error('Must Save As first');
```

#### 运行 (Run)
**核心原则**: **兼具数据传输与指令触发功能**

```typescript
// 请求结构
POST /api/executions
Body: {
  workflowId?: string,  // 可选，可能为 null (新工作流)
  nodes: WorkflowNode[]  // 必须，当前画布数据
}

// 后端处理逻辑
if (workflowId == null) {
  // 1. 创建新记录
  const newWorkflow = await db.workflows.create({ nodes });
  // 2. 启动执行
  const execution = await startExecution(newWorkflow.id, nodes);
  // 3. 返回 workflowId
  return { workflowId: newWorkflow.id, executionId: execution.id };
} else {
  // 1. 使用接收到的 nodes 数据
  // 2. 启动执行
  const execution = await startExecution(workflowId, nodes);
  // 3. 返回原 workflowId
  return { workflowId: workflowId, executionId: execution.id };
}

// 前端处理
const result = await executionService.run(workflowId, nodes);
if (!currentWorkflow.id) {
  // 副作用：首次运行后确立身份
  setCurrentWorkflow({ id: result.workflowId, nodes });
}
```

**为什么不能依赖隐式保存**:
- 用户可能只想运行不想保存
- "运行" 是高频操作，不应强制保存
- 确保所见即所跑

### 4.2 运行与创建的关系

| 场景 | 前端 workflowId | 后端行为 | 前端更新 |
|------|----------------|----------|----------|
| 新工作流 | `null` | 创建记录 → 生成ID → 执行 | 接收ID并更新Store |
| 现有工作流 | `"wf_123"` | 使用接收nodes → 执行 | 无需更新ID |

## 5. 视图与拖拽逻辑 (View & Drag)

### 5.1 自动布局 (Auto-Drawing)

**原则**: Store 不存储坐标，渲染时计算

```typescript
// 渲染逻辑
function renderWorkflow(nodes: WorkflowNode[]) {
  return nodes.map((node, index) => {
    // 根据索引计算坐标
    const position = calculatePosition(index);

    return (
      <WorkflowNode
        key={index}  // 使用索引作为key
        node={node}
        position={position}
        status={executionStore.nodeStatuses[index]}  // 直接索引访问
      />
    );
  });
}

// 布局算法示例
function calculatePosition(index: number) {
  const row = Math.floor(index / 3);  // 每行3个节点
  const col = index % 3;
  return {
    x: 100 + col * 250,  // 水平间距250px
    y: 100 + row * 150   // 垂直间距150px
  };
}
```

**连线生成**:
```typescript
// 自动连接线
function generateConnections(nodes: WorkflowNode[]) {
  const connections = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    connections.push({
      id: `conn_${i}`,
      source: i,      // 源节点索引
      target: i + 1   // 目标节点索引
    });
  }

  return connections;
}
```

### 5.2 拖拽即排序 (Drag is Reorder)

**新逻辑**: 拖拽的本质是**改变数组索引**

```typescript
// 拖拽前
nodes = [A, B, C, D, E];
//          0  1  2  3  4

// 将节点 D (索引 3) 移到索引 1
function moveNode(nodes: WorkflowNode[], fromIndex: number, toIndex: number) {
  const newNodes = [...nodes];
  const [movedNode] = newNodes.splice(fromIndex, 1);
  newNodes.splice(toIndex, 0, movedNode);
  return newNodes;
}

// 拖拽后
nodes = [A, D, B, C, E];
//          0  1  2  3  4
```

**限制条件**:
- 定义阶段：允许拖拽排序
- 运行阶段：**UI锁定，禁止拖拽**
  - 原因：执行期间节点顺序不可变
  - 实现：`isRunning && disableDrag`

## 6. 交通层设计 (Traffic Layer)

### 6.1 API 设计

#### 保存/更新 (Update)
```typescript
PUT /api/workflows/:id
Body: {
  nodes: WorkflowNode[]
}

// 前提：workflowId 必须存在
// 返回：更新后的 Workflow 对象
```

#### 运行 (Run)
```typescript
POST /api/executions
Body: {
  workflowId?: string,  // 可选，null 表示新工作流
  nodes: WorkflowNode[]  // 必须，当前画布完整数据
}

// 响应
{
  workflowId: string,   // 后端生成或原ID
  executionId: string,  // 执行ID
  status: string,
  startTime: Date
}
```

#### 停止 (Stop)
```typescript
POST /api/executions/stop
Body: {
  workflowId: string  // 必须
}
```

### 6.2 WebSocket 协议

**协议格式**:
```typescript
// 服务端推送
interface ExecutionUpdate {
  i: number;  // 节点索引 (Index)，不是 nodeId
  s: string;  // 状态: 'run' | 'ok' | 'err' | 'cancelled'
  d?: any;    // 可选数据
}

// 示例
{ "i": 3, "s": "run" }           // 第4个节点开始运行
{ "i": 3, "s": "ok", "d": {} }   // 第4个节点完成
{ "i": 3, "s": "err" }           // 第4个节点出错
```

**循环/跳转处理**:
```typescript
// 如果节点再次变为 run，直接覆盖之前的 ok 状态
// 无需额外的重置信号

// 前端处理逻辑
onExecutionUpdate({ i, s, d }) {
  // 直接赋值，覆盖旧状态
  this.nodeStatuses[i] = s;
  if (d) this.nodeResults[i] = d;
}
```

## 7. 核心原则总结

### 7.1 数据流原则
- **后端主导**: ID 生成、持久化、版本控制由后端负责
- **单一数据源**: 参数不经过中间层，直接传输
- **所见即所跑**: 运行接口携带当前完整数据，不依赖隐式保存

### 7.2 性能原则
- **O(1) 状态访问**: 使用数组索引，避免 Map 查找
- **无冗余数据**: 不存储坐标、连线、版本号
- **最小化协议**: WebSocket 仅传输必要字段

### 7.3 职责分离原则
- **运行时锁定**: 执行期间禁止拖拽修改顺序
- **三钮分离**: Save As / Update / Run 职责清晰
- **层次清晰**: Store(MV) → View(V) → API(C)

### 7.4 架构真理
```
索引即顺序
数组即真理
后端即权威
```

---

**版本**: 1.0.0
**生效日期**: 2025-12-03
**维护者**: 总代理 (Total Agent)
