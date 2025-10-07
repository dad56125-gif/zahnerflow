# NotificationSystem - 通知系统模块

## 设计原则 (Design Principles)

- **事件驱动架构**: 基于EventBus的完全解耦通知分发机制
- **分层通知**: 支持SYSTEM、WORKFLOW、DEVICE、OPERATION、ERROR五个用户层级
- **并行处理**: 一个事件源可同时触发多个事件处理器并行响应
- **零破坏性**: 渐进式迁移，保持现有功能完全不变
- **模板实例分离**: Python层专注测量逻辑，Node.js层处理设备实例和通知

## 对外接口 (Public API)

### 事件总线接口
```typescript
interface SimpleEventBus {
  emit<T>(eventType: string, data: T): void;
  on<T>(eventType: string): Observable<T>;
  once<T>(eventType: string, callback: (data: T) => void): void;
  clearEvent(eventType: string): void;
  clearAll(): void;
  getStats(): { activeEvents: number; eventTypes: string[] };
}
```

### 通知服务接口
```typescript
interface NotificationService {
  notifySystem(message: string, details?: string): void;
  notifyWorkflow(message: string, details?: string): void;
  notifyDevice(message: string, details?: string): void;
  notifyOperation(message: string, details?: string): void;
  notifyError(message: string, details?: string): void;
}
```

### 事件处理器接口
```typescript
interface NotificationEventHandler {
  handleSystemNotification(data: NotificationData): void;
  handleWorkflowNotification(data: NotificationData): void;
  handleDeviceNotification(data: NotificationData): void;
  handleOperationNotification(data: NotificationData): void;
  handleErrorNotification(data: NotificationData): void;
}
```

## 主要功能列表 (Key Functions)

- **事件分发**: 基于RxJS的轻量级事件总线，支持异步非阻塞事件分发
- **多层通知**: 支持用户通知和调试通知两个大层级，每个层级细分为多个子类型
- **并行处理器**: 支持通知、状态、指标、设备等多个事件处理器并行响应
- **WebSocket集成**: 通过WorkflowGateway实现实时通知推送
- **状态机集成**: 与状态管理系统深度集成，状态变化自动触发通知
- **指标收集**: MetricsEventHandler收集系统运行指标和性能数据
- **错误隔离**: 单个处理器失败不影响其他处理器和主流程

## 核心数据模型 (Core Data Model)

### 通知层级定义
```typescript
// 用户通知层级
enum UserNotificationLevel {
  SYSTEM = 'system',       // 系统级通知
  WORKFLOW = 'workflow',   // 工作流通知
  DEVICE = 'device',       // 设备通知
  OPERATION = 'operation', // 操作通知
  ERROR = 'error'         // 错误通知
}

// 调试通知层级
enum DebugNotificationLevel {
  EXECUTION_DETAIL = 'execution_detail', // 执行详情
  STATE_CHANGE = 'state_change',        // 状态变化
  NETWORK = 'network',                  // 网络相关
  PERFORMANCE = 'performance',          // 性能指标
  INTERNAL = 'internal'                // 内部调试
}
```

### 事件数据结构
```typescript
interface NotificationData {
  message: string;
  details?: string;
  level: NotificationLevel;
  source: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface EventPayload {
  eventType: string;
  data: any;
  timestamp: Date;
  source: string;
  context?: any;
}
```

### 指标数据结构
```typescript
interface SystemMetrics {
  notificationsSent: number;
  stateChanges: number;
  executionsStarted: number;
  executionsCompleted: number;
  executionsFailed: number;
  startTime: number;
  uptime: number;
  successRate: number;
}
```

## 模块依赖关系 (Dependencies)

### 核心依赖
- **RxJS**: 响应式编程库，提供Observable和Subject
- **WorkflowGateway**: WebSocket网关，负责实时通信
- **NestJS**: 依赖注入和模块系统
- **EventEmitter**: Node.js事件发射器

### 事件处理器依赖
- **NotificationEventHandler**: 通知事件处理器
- **StateEventHandler**: 状态事件处理器
- **MetricsEventHandler**: 指标事件处理器
- **DeviceEventHandler**: 设备事件处理器

### 集成模块
- **ExecutionModule**: 执行模块，发送执行相关事件
- **WorkflowModule**: 工作流模块，发送工作流事件
- **ZahnerZenniumModule**: 设备模块，发送设备事件

## 典型端到端工作流程 (Typical Workflow)

### 1. 事件驱动架构流程
1. 业务逻辑调用eventBus.emit发送事件
2. EventBus异步分发事件到所有注册的处理器
3. 多个事件处理器并行处理同一事件
4. NotificationEventHandler发送WebSocket通知
5. StateEventHandler更新状态和验证转换
6. MetricsEventHandler收集性能指标
7. 各处理器独立运行，互不影响

### 2. 通知生成流程
1. 业务模块确定通知层级和内容
2. 调用相应的notify方法或发送事件
3. NotificationEventHandler接收事件
4. 格式化通知消息和详情
5. 通过NotificationService发送通知
6. WebSocket推送到前端客户端
7. 前端显示通知面板更新

### 3. 状态变更通知流程
1. 状态变更触发state.node.changed事件
2. StateEventHandler接收并验证状态转换
3. 更新内部状态存储
4. 发送WebSocket状态更新
5. 触发状态变更的副作用事件
6. NotificationEventHandler发送状态通知
7. MetricsEventHandler记录状态变更指标

### 4. 设备操作通知流程
1. 设备服务执行设备操作
2. 发送device.operation事件
3. DeviceEventHandler处理设备事件
4. 更新设备状态和连接信息
5. NotificationEventHandler发送设备通知
6. WebSocket推送设备状态更新
7. 前端更新设备状态显示

### 5. 错误处理通知流程
1. 系统发生错误或异常
2. 发送error.occurred事件
3. NotificationEventHandler接收错误事件
4. 格式化错误信息和堆栈
5. 发送ERROR级别的用户通知
6. WebSocket推送错误通知
7. 前端显示错误提示和恢复选项

### 6. 指标收集流程
1. 各类事件触发时MetricsEventHandler监听
2. 更新内部计数器和统计信息
3. 计算成功率、平均时间等衍生指标
4. 定期生成系统性能报告
5. 提供指标查询API接口
6. 支持指标重置和清理操作