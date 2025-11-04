# WorkflowManager API 集成文档

## 核心要点

- **API复用**: 直接使用现有workflow controller，避免重复开发
- **分页限制**: 设置50条记录，优化查询性能
- **格式转换**: 前端处理数据结构映射，保持API简洁
- **错误处理**: 支持多种响应格式解析和异常处理

## 关键API端点

### 1. 工作流列表查询
```typescript
GET /api/workflows?limit=50
```

### 2. 单个工作流查询
```typescript
GET /api/workflows/{id}
```

### 3. 项目列表查询
```typescript
GET /api/files/projects?user={username}
```

## 技术逻辑

### API响应处理策略
```typescript
// 支持三种响应格式
if (response?.items && Array.isArray(response.items)) {
  workflows = response.items;           // PaginatedResponse
} else if (Array.isArray(response)) {
  workflows = response;                // 直接数组
} else if (response?.data && Array.isArray(response.data)) {
  workflows = response.data;           // ApiResponse
}
```

### 数据转换映射
```typescript
// Workflow → WorkflowHistory
{
  id: workflow.id,
  name: workflow.name,
  project_name: workflow.individualName || workflow.ownerName,
  created_at: workflow.createdAt,
  node_count: workflow.definition?.nodes?.length,
  connection_count: workflow.definition?.edges?.length
}

// edges → connections
workflow.definition.edges.map(edge => ({
  id: edge.id,
  source_id: edge.source,
  target_id: edge.target
}))

// WorkflowNode → ElectrochemicalNode
{
  id: node.id,
  type: node.type,
  name: node.name,
  category: 'basic_measurement',
  position: node.position,
  data: { parameters: node.config?.parameters }
}
```

## 接口类型定义

### 后端响应格式

#### PaginatedResponse<Workflow>
```typescript
{
  items: Workflow[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

#### Workflow
```typescript
{
  id: string,
  name: string,
  description: string,
  ownerName?: string,
  individualName?: string,
  definition: WorkflowDefinition,
  version: number,
  createdAt: string,
  updatedAt: string
}
```

#### WorkflowDefinition
```typescript
{
  id: string,
  name: string,
  description: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  version: number
}
```

#### WorkflowNode
```typescript
{
  id: string,
  type: string,
  name: string,
  config: any,
  position: {x: number, y: number}
}
```

#### WorkflowEdge
```typescript
{
  id: string,
  source: string,
  target: string,
  type: string
}
```

### 前端转换类型

#### WorkflowHistory
```typescript
interface WorkflowHistory {
  id: string;
  name: string;
  filename: string;
  filepath: string;
  project_name: string;
  created_at: string;
  node_count?: number;
  connection_count?: number;
  loop_count?: number;
}
```

#### ElectrochemicalNode
```typescript
interface ElectrochemicalNode {
  id: string;
  type: string;
  name: string;
  category: string;
  position: {x: number; y: number};
  style: {width: number; height: number};
  status: string;
  data: NodeData;
  input: NodePort;
  output: NodePort;
}
```

## 数据结构映射表

| 后端字段 | 前端字段 | 转换逻辑 |
|---------|---------|----------|
| `workflow.id` | `workflowHistory.id` | 直接映射 |
| `workflow.name` | `workflowHistory.name` | 直接映射 |
| `workflow.individualName` | `workflowHistory.project_name` | 优先映射，fallback到ownerName |
| `workflow.createdAt` | `workflowHistory.created_at` | 直接映射 |
| `definition.nodes.length` | `workflowHistory.node_count` | 计算长度 |
| `definition.edges.length` | `workflowHistory.connection_count` | 计算长度 |
| `definition.edges` | `connections` | 数组映射，字段重命名 |
| `definition.nodes` | `ElectrochemicalNode[]` | 复杂对象转换 |

## 涉及文件

### 后端API文件
```
apps/backend/src/modules/workflow/
├── workflow.controller.ts         # API端点定义
├── workflow.service.ts           # 业务逻辑处理
└── workflow-storage.service.ts   # 数据存储服务

apps/backend/src/interfaces/
└── module-interfaces.ts          # 接口类型定义
```

### 前端集成文件
```
apps/frontend/src/components/features/workflow/
└── WorkflowManagerUI.tsx          # API调用和数据处理

apps/frontend/src/services/
├── api.ts                         # API客户端
└── hooks/useOnClickOutside.ts     # UI交互Hook
```

## 核心决策逻辑

### API选择策略
- **workflow controller**: 已有完整的CRUD接口
- **分页参数**: `limit=50` 平衡性能和功能
- **响应解析**: 支持多种格式，提高兼容性

### 数据转换原则
- **前端转换**: 保持后端API简洁，前端负责适配
- **字段映射**: 统一使用snake_case命名规范
- **默认值**: 为缺失字段提供合理默认值

### 错误处理机制
- **网络异常**: catch块捕获，显示用户友好信息
- **格式错误**: 多格式解析，fallback处理
- **数据验证**: 转换前验证必需字段存在

## 性能优化考虑

- **分页查询**: 避免一次性加载大量数据
- **数据缓存**: 前端可缓存历史列表，减少重复请求
- **按需加载**: 只在切换到历史标签时加载数据