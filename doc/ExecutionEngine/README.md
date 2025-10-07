# 执行引擎模块 (ExecutionEngine)

## 设计原则 (Design Principles)

- **状态驱动**: 后端作为状态机核心，定义状态流转规则和业务逻辑
- **前后端分离**: 前端只负责展示和操作，通过API调用后端服务
- **类型约束**: 使用@packages/types确保前后端接口一致性
- **事件驱动**: 基于事件总线实现模块间通信和状态同步
- **模块化设计**: 清晰的职责分离，便于维护和扩展

## 对外接口 (Public API)

### 执行服务接口
- `WorkflowService` - 工作流核心业务逻辑服务
- `WorkflowStorageService` - 工作流数据持久化服务
- `ExecutionService` - 工作流执行引擎服务

### HTTP API接口
- `POST /api/workflow` - 创建工作流
- `GET /api/workflow/:id` - 获取工作流详情
- `PUT /api/workflow/:id` - 更新工作流
- `POST /api/workflow/:id/start` - 启动工作流执行
- `POST /api/workflow/:id/stop` - 停止工作流执行

### 状态管理接口
- `getWorkflowStatus(id: string)` - 获取工作流状态
- `updateNodeStatus(workflowId: string, nodeId: string, status: NodeStatus)` - 更新节点状态
- `getExecutionHistory(workflowId: string)` - 获取执行历史

## 主要功能列表 (Key Functions)

1. **工作流管理**
   - 工作流创建与编辑
   - 工作流版本控制
   - 工作流模板管理

2. **执行引擎**
   - 节点执行调度
   - 并行执行控制
   - 依赖关系管理

3. **状态管理**
   - 工作流状态跟踪
   - 节点状态同步
   - 执行历史记录

4. **错误处理**
   - 异常捕获与恢复
   - 错误状态传播
   - 重试机制

## 核心数据模型 (Core Data Model)

### 工作流模型
```typescript
interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  status: 'draft' | 'active' | 'paused' | 'completed' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
```

### 节点模型
```typescript
interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  parameters: Record<string, any>;
  position: { x: number; y: number };
  status: 'idle' | 'running' | 'completed' | 'error' | 'skipped';
}
```

### 执行记录模型
```typescript
interface ExecutionRecord {
  id: string;
  workflowId: string;
  nodeId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'error';
  result?: any;
  error?: string;
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **NestJS**: 后端框架
- **TypeScript**: 类型系统
- **pnpm**: 包管理器

### 内部依赖
- **EventBus**: 事件总线模块
- **StateManagement**: 状态管理模块
- **NotificationSystem**: 通知系统模块
- **DeviceControl**: 设备控制模块

## 典型端到端工作流程 (Typical Workflow)

1. **工作流创建流程**
   ```
   前端创建节点 → 后端验证参数 → 保存工作流 → 返回工作流ID
   ```

2. **工作流执行流程**
   ```
   启动执行请求 → 节点依赖分析 → 顺序执行节点 → 状态实时更新 → 完成通知
   ```

3. **状态同步流程**
   ```
   节点状态变更 → 发布状态事件 → EventBus分发 → 前端接收更新 → UI状态同步
   ```

4. **错误处理流程**
   ```
   节点执行异常 → 捕获错误 → 更新工作流状态 → 错误事件通知 → 用户确认处理
   ```