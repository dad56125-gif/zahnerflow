# WorkflowManager 工作流管理模块

## 核心要点

- **统一工作流管理**: 提供导出、导入、模板和历史记录的完整解决方案
- **真实历史查询**: 基于现有 `/api/workflows` 接口查询历史工作流
- **点击外部关闭**: 修复useOnClickOutside Hook功能缺失问题
- **数据格式转换**: 处理后端Workflow接口到前端ElectrochemicalNode的转换

## 设计思路

1. **单一职责**: WorkflowManagerUI作为容器组件，整合各功能模块
2. **状态管理**: 使用Zustand CanvasStore管理工作流状态
3. **API集成**: 直接使用现有workflow controller，避免重复实现
4. **用户体验**: 支持项目筛选、实时统计和错误处理

## 关键决策

- **API选择**: 使用 `/api/workflows?limit=50` 而非新建files接口
- **数据转换**: 在前端处理edges→connections的格式映射
- **分页策略**: 设置50条记录限制，平衡性能与功能需求
- **错误边界**: 完善的错误处理和用户反馈机制

## 技术逻辑

### 数据流向
```
后端Workflow → 前端API → 数据转换 → CanvasStore → UI渲染
```

### 核心转换逻辑
```typescript
// 节点转换
workflow.definition.nodes → ElectrochemicalNode
workflow.definition.edges → {source_id, target_id}
```

### 状态管理
- 使用 `useCanvasStore` 管理nodes和connections
- 通过 `setNodes`/`setConnections` 更新画布状态
- 支持实时数据统计和UI同步

## 涉及文件范围

### 前端文件
```
apps/frontend/src/components/features/workflow/
├── WorkflowManagerUI.tsx          # 主界面组件
├── WorkflowManager.ts             # 核心业务逻辑
├── WorkflowExporter.tsx           # 导出功能
├── WorkflowImporter.tsx           # 导入功能
└── index.ts                       # 统一导出

apps/frontend/src/components/
├── Canvas.tsx                     # Canvas组件，修复onClose传递

apps/frontend/src/services/
├── hooks/useOnClickOutside.ts     # 外部点击Hook
└── api.ts                         # API客户端

apps/frontend/src/
├── contexts/UserContext.tsx       # 用户上下文
└── types/nodes.ts                 # 节点类型定义
```

### 后端文件
```
apps/backend/src/modules/workflow/
├── workflow.controller.ts         # 工作流API控制器
├── workflow.service.ts           # 工作流业务逻辑
└── workflow-storage.service.ts   # 存储服务

apps/backend/src/interfaces/
└── module-interfaces.ts          # Workflow接口定义
```

## 定义接口类型

### WorkflowHistory
```typescript
interface WorkflowHistory {
  id: string;
  name: string;
  filename: string;
  filepath: string;
  project_name: string;
  created_at: string;
  file_size?: number;
  node_count?: number;
  connection_count?: number;
  loop_count?: number;
}
```

### WorkflowManagerUIProps
```typescript
interface WorkflowManagerUIProps {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;            // 点击外部关闭回调
}
```

### WorkflowData
```typescript
interface WorkflowData {
  version: string;
  metadata: WorkflowMetadata;
  nodes: ElectrochemicalNode[];
  connections: Array<{id: string; sourceId: string; targetId: string;}>;
  loops: LoopInfo[];
  settings: WorkflowSettings;
  timestamp: number;
}
```

## 数据结构定义

### 后端Workflow (现有)
```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  ownerName?: string;
  individualName?: string;
  definition: WorkflowDefinition;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  ownerName?: string;
  individualName?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
}
```

### 前端ElectrochemicalNode
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

## 核心功能映射

| 功能 | 后端API | 前端组件 | 数据转换 |
|------|---------|----------|----------|
| 历史列表 | `/api/workflows?limit=50` | WorkflowManagerUI | PaginatedResponse → WorkflowHistory[] |
| 加载工作流 | `/api/workflows/{id}` | loadHistoryWorkflow | Workflow → ElectrochemicalNode[] |
| 项目筛选 | `/api/files/projects` | loadProjects | string[] → UI下拉选项 |
| 点击关闭 | useOnClickOutside Hook | Canvas.tsx | 传递onClose回调 |