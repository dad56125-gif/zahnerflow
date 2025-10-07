# StateManagement - 状态管理模块

## 设计原则 (Design Principles)

- **KISS原则**: 使用统一的NodeStatus枚举管理所有状态，避免多套状态系统
- **后端状态机**: 后端负责状态管理、验证和转换，前端负责状态显示和用户操作传递
- **增强现有代码**: 不是重新创建，而是增强现有的StateLinkageManager和ExecutionService
- **渐进式改进**: 保持现有API和接口不变，逐步增强功能
- **状态转换验证**: 严格的状态转换规则，确保状态一致性

## 对外接口 (Public API)

### IStateMachineService (后端)
```typescript
interface IStateMachineService {
  // 状态管理
  setNodeState(nodeId: string, status: NodeStatus): Promise<void>;
  getNodeState(nodeId: string): Promise<NodeStatus>;
  getAllNodeStates(): Promise<Map<string, NodeStatus>>;

  // 执行管理
  startExecution(workflowId: string): Promise<void>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;

  // 状态查询
  isNodeCompleted(nodeId: string): Promise<boolean>;
  isNodeRunning(nodeId: string): Promise<boolean>;
  getExecutionProgress(executionId: string): Promise<number>;
  getExecutionStatus(executionId: string): Promise<NodeStatus>;
}
```

### IStateManager (前端)
```typescript
interface IStateManager {
  // 状态获取
  getNodeState(nodeId: string): NodeStatus;
  getExecutionStatus(executionId: string): NodeStatus;

  // 操作传递
  startExecution(workflowId: string): Promise<void>;
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;

  // 状态订阅
  subscribeToNodeChanges(callback: (nodeId: string, status: NodeStatus) => void): () => void;
  subscribeToExecutionChanges(callback: (executionId: string, status: NodeStatus) => void): () => void;
}
```

## 主要功能列表 (Key Functions)

- **统一状态定义**: 使用NodeStatus枚举管理节点、执行、工作流和设备状态
- **状态转换验证**: 严格的状态转换规则验证，防止非法状态转换
- **状态同步机制**: 通过WebSocket实现前后端状态实时同步
- **状态订阅系统**: 支持多个组件订阅状态变化事件
- **执行状态管理**: 完整的工作流执行生命周期状态管理
- **错误恢复**: 状态同步失败时的自动恢复机制
- **通知集成**: 与通知系统深度集成，状态变化触发相应通知

## 核心数据模型 (Core Data Model)

### NodeStatus枚举
```typescript
export enum NodeStatus {
  READY = 'ready',           // 初始状态，等待执行
  RUNNING = 'running',       // 正在执行
  COMPLETED = 'completed',   // 执行成功完成
  FAILED = 'failed',        // 执行失败
  PAUSED = 'paused',        // 执行被暂停
  CANCELLED = 'cancelled',   // 执行被取消
  PENDING = 'pending'        // 等待前置条件完成
}
```

### 状态转换规则
- READY → RUNNING, CANCELLED
- RUNNING → COMPLETED, FAILED, PAUSED
- PAUSED → RUNNING, CANCELLED
- COMPLETED/FAILED/CANCELLED → 终态，不允许转换
- PENDING → READY, RUNNING

### NodeStatusUpdate接口
```typescript
interface NodeStatusUpdate {
  nodeId: string;
  status: NodeStatus;
  data?: any;
  timestamp: Date;
}
```

## 模块依赖关系 (Dependencies)

### 核心依赖
- **ExecutionService**: 执行服务，负责工作流执行逻辑
- **NotificationService**: 通知服务，负责状态变化通知
- **WorkflowGateway**: WebSocket网关，负责前后端实时通信
- **SimpleEventBus**: 事件总线，负责事件分发和处理

### 前端依赖
- **StateLinkageManager**: 状态联动管理器
- **WorkflowWebSocketService**: WebSocket客户端服务
- **React Context**: 状态上下文管理

### 后端依赖
- **ExecutionModule**: 执行模块
- **NotificationModule**: 通知模块
- **GatewayModule**: 网关模块

## 典型端到端工作流程 (Typical Workflow)

### 1. 状态初始化
1. 前端StateLinkageManager初始化
2. 建立WebSocket连接
3. 注册状态变更事件监听器
4. 设置节点和执行状态回调函数

### 2. 执行启动流程
1. 用户点击开始执行
2. 前端调用API启动执行
3. 后端验证状态转换(READY → RUNNING)
4. 后端发送状态变更事件
5. 事件总线触发多个处理器
6. WebSocket向前端推送状态更新
7. 前端更新UI显示

### 3. 节点执行流程
1. 后端设置节点状态为RUNNING
2. 发送状态变更通知和WebSocket消息
3. 执行节点逻辑
4. 根据执行结果设置COMPLETED或FAILED状态
5. 更新执行进度
6. 前端实时显示状态变化

### 4. 状态同步机制
1. 后端状态变化触发事件
2. 事件总线并行处理通知、状态、指标等
3. WebSocket实时推送到前端
4. 前端验证状态有效性
5. 更新本地状态副本
6. 触发UI组件重新渲染

### 5. 错误处理流程
1. 状态转换验证失败时抛出错误
2. WebSocket断开时自动重连
3. 状态不一致时以后端状态为准
4. 错误通知通过通知系统发送
5. 前端显示错误状态和恢复选项