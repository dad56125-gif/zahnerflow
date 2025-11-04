# 工作流Edges存储问题

## 问题描述

项目存在严重的架构缺陷：虽然完整定义了工作流连接关系(Edges)的接口，但数据库层面完全没有实现edges的存储功能，导致工作流的节点连接关系完全丢失。

### 具体表现
- 前后端都定义了`WorkflowEdge`接口，但数据库schema缺失edge表
- 所有工作流的`edges`数组都是空数组`"edges": []`
- `upsertWorkflow`方法只处理nodes，完全忽略edges
- 实际上是一个"节点列表"系统而非真正的图形化工作流

## 解决方案核心要点

### 1. 数据库Schema扩展
- 添加`edge`表定义到`DbJson`类型
- 实现edges的持久化存储逻辑
- 建立edge与workflow、node的关联关系

### 2. 存储逻辑完善
- 扩展`upsertWorkflow`方法处理edges存储
- 实现edges的CRUD操作
- 保证数据一致性和完整性

### 3. 前后端接口统一
- 统一前后端WorkflowEdge接口定义
- 确保数据传输格式一致
- 实现完整的双向数据同步

## 设计思路

### 分层数据模型
```typescript
// 工作流层级
workflow -> definition -> { nodes, edges }

// 节点连接层级
edge -> { source_node, target_node, connection_type }

// 数据库扁平化存储
edge_table -> { id, workflow_id, source_node_id, target_node_id, edge_type }
```

### 存储策略
- 保持现有的扁平化JSON存储架构
- 新增edge表与其他表并列存储
- 使用字符串ID建立关联关系

### 数据完整性保证
- 外键约束：source_node和target_node必须存在于node表
- 级联删除：删除workflow时同时删除相关edges
- 循环检测：防止创建循环依赖的连接

## 关键决策

### 1. 保持现有架构兼容性
- 不改变现有的node、node_param表结构
- 扩展而非重构现有存储系统
- 向后兼容现有工作流数据

### 2. 简化edge数据结构
- 只存储核心连接信息：source、target、type
- 复杂属性通过JSON字段存储
- 避免过度设计导致的复杂性

### 3. 统一接口定义
- 使用`@zahnerflow/types`作为唯一数据源
- 移除`module-interfaces.ts`中的重复定义
- 确保前后端类型完全一致

## 技术逻辑

### Edge ID生成策略
```typescript
// 格式：edge_${timestamp}_${randomString}
// 示例：edge_1703123456789_abc123
function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
```

### 数据转换流程
```typescript
// 前端数据 -> 数据库存储
WorkflowDefinition.edges[] -> edge_table rows

// 数据库存储 -> 前端数据
edge_table rows -> WorkflowDefinition.edges[]
```

### 验证逻辑
- 源节点和目标节点必须存在
- 不允许自连接
- 检测循环依赖
- 验证edge类型有效性

## 涉及修改的文件范围

### 核心文件
- `apps/backend/src/db/db.service.ts` - 数据库schema和存储逻辑
- `apps/backend/src/modules/workflow/workflow.service.ts` - 工作流CRUD操作
- `packages/types/src/api.types.ts` - 统一接口定义

### 移除重复定义
- `apps/backend/src/interfaces/module-interfaces.ts` - 删除重复的接口定义

### 前端适配
- `apps/frontend/src/services/workflowService.ts` - API调用适配
- `apps/frontend/src/components/Canvas.tsx` - 画布组件适配

### 测试文件
- `apps/backend/test/*.test.ts` - 添加edge相关测试用例

## 定义的接口类型

### 统一的WorkflowEdge接口
```typescript
export interface WorkflowEdge {
  id: string;
  source: string;          // 源节点ID
  target: string;          // 目标节点ID
  type: string;            // 连接类型：'default' | 'conditional' | 'loop'
  data?: {                 // 连接属性
    condition?: string;     // 条件表达式
    label?: string;         // 连接线标签
    style?: any;           // 样式配置
  };
}
```

### 扩展的数据库接口
```typescript
interface DbJson {
  workflow: Array<{...}>;
  node: Array<{...}>;
  node_param: Array<{...}>;
  edge: Array<{            // 新增edge表
    id: string;
    workflow_id: string;    // 关联工作流
    source_node_id: string; // 源节点
    target_node_id: string; // 目标节点
    edge_type: string;      // 连接类型
    edge_data: string | null; // JSON格式的附加数据
    created_at: string;
    updated_at: string;
  }>;
}
```

## 数据结构定义

### Edge表结构
```typescript
interface EdgeRow {
  id: string;                    // 唯一标识
  workflow_id: string;           // 所属工作流
  source_node_id: string;        // 源节点ID
  target_node_id: string;        // 目标节点ID
  edge_type: string;             // 连接类型
  edge_data: string | null;      // JSON格式的扩展数据
  created_at: string;            // 创建时间
  updated_at: string;            // 更新时间
}
```

### WorkflowDefinition扩展
```typescript
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];         // 现在被实际使用
  parameters?: Record<string, any>;
  ownerName?: string;
  individualName?: string;
}
```

### Edge验证规则
```typescript
interface EdgeValidationRule {
  sourceExists: boolean;         // 源节点存在
  targetExists: boolean;         // 目标节点存在
  noSelfConnection: boolean;     // 不允许自连接
  noCycle: boolean;              // 不允许循环依赖
  validType: boolean;            // 连接类型有效
}
```