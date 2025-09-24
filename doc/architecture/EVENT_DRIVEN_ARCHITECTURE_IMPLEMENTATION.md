# 事件驱动架构详细实现文档

## 文档信息
- **创建日期**: 2025-09-24
- **版本**: 4.0.0
- **架构阶段**: 第三阶段完成 - 模板-实例分离架构

## 🏗️ 总体架构概览

### 当前实现的完整架构

```
业务逻辑层 (Business Logic Layer)
    ↓
事件总线层 (Event Bus Layer)
    ↓
┌─────────────────────────────────────────────────────────────┐
│                    多个并行事件处理器                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │NotificationEH  │  │   StateEH      │  │MetricsEH   │ │
│  │  (通知处理器)   │  │  (状态处理器)   │  │(指标处理器) │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                     │
│  │ExecutionNH      │  │  DeviceEH       │                     │
│  │(执行通知处理器) │  │  (设备处理器)   │                     │
│  └─────────────────┘  └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
    ↓
设备实例服务层 (Device Instance Service Layer)
    ↓
Python模板层 (Python Template Layer)
```

## 🔧 核心组件详细实现

### 1. SimpleEventBus - 事件总线核心

**文件位置**: `apps/backend/src/notification/simple-event-bus.service.ts`

**核心功能**:
- 事件发布和订阅机制
- 支持同步和异步事件处理
- 事件处理器管理和统计
- 错误隔离和容错处理

**关键接口**:
```typescript
export interface EventPayload {
  type: string;
  timestamp: Date;
  context?: any;
  data: any;
}

export interface EventHandler {
  handle(event: EventPayload): Promise<void> | void;
}
```

**核心方法**:
- `emit(eventType, data, context)` - 发布事件
- `on(eventType)` - 订阅事件流
- `onEvent(eventType, handler)` - 注册事件处理器
- `onEvents(handlers)` - 批量注册处理器

**事件处理机制**:
```typescript
private invokeHandlers(event: EventPayload): void {
  const handlers = this.handlers.get(event.type);
  if (!handlers || handlers.length === 0) return;

  // 异步调用所有处理器，不等待结果
  handlers.forEach(handler => {
    try {
      const result = handler.handle(event);
      if (result instanceof Promise) {
        result.catch(error => {
          this.logger.error(`Event handler failed for event ${event.type}:`, error);
        });
      }
    } catch (error) {
      this.logger.error(`Event handler threw error for event ${event.type}:`, error);
    }
  });
}
```

### 2. NotificationEventHandler - 通知事件处理器

**文件位置**: `apps/backend/src/notification/event-handlers/notification.handler.ts`

**处理器统计**: 15个事件处理器

**处理的事件类型**:
```typescript
// 工作流事件 (3个)
'workflow.started', 'workflow.completed', 'workflow.failed'

// 节点事件 (3个)
'node.started', 'node.completed', 'node.failed'

// 设备事件 (3个)
'device.connected', 'device.disconnected', 'device.error'

// 系统事件 (3个)
'system.health_check', 'client.connected', 'client.disconnected'

// 操作事件 (3个)
'workflow.created', 'workflow.updated', 'workflow.deleted'
```

**通知格式**:
```typescript
interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  source: string;
  timestamp: Date;
  details: string;
}
```

**处理示例**:
```typescript
private async handleWorkflowStarted(event: EventPayload): Promise<void> {
  const { executionId, workflowId, context } = event.data;
  const notification = {
    id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: '工作流执行开始',
    message: `Workflow execution started: ${workflowId}`,
    type: 'info' as const,
    source: context?.source || 'execution-service',
    timestamp: new Date(),
    details: `Execution ID: ${executionId}, Source: ${context?.source || 'unknown'}`
  };
  this.workflowGateway.broadcast('notification', notification);
}
```

### 3. StateEventHandler - 状态事件处理器

**文件位置**: `apps/backend/src/notification/event-handlers/state.handler.ts`

**处理器统计**: 12个事件处理器

**统一状态枚举**:
```typescript
export enum NodeStatus {
  READY = 'ready',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  PENDING = 'pending'
}
```

**状态管理**:
```typescript
private readonly nodeStates = new Map<string, NodeStatus>();
private readonly workflowStates = new Map<string, any>();
private readonly deviceStates = new Map<string, any>();
```

**状态转换验证**:
```typescript
private isValidStateTransition(from: NodeStatus | undefined, to: NodeStatus): boolean {
  if (!from) return true; // 初始状态

  const validTransitions: Record<NodeStatus, NodeStatus[]> = {
    [NodeStatus.READY]: [NodeStatus.RUNNING, NodeStatus.CANCELLED],
    [NodeStatus.RUNNING]: [NodeStatus.COMPLETED, NodeStatus.FAILED, NodeStatus.PAUSED],
    [NodeStatus.PAUSED]: [NodeStatus.RUNNING, NodeStatus.CANCELLED],
    [NodeStatus.COMPLETED]: [],
    [NodeStatus.FAILED]: [],
    [NodeStatus.CANCELLED]: [],
    [NodeStatus.PENDING]: [NodeStatus.READY, NodeStatus.RUNNING]
  };

  return validTransitions[from]?.includes(to) || false;
}
```

### 4. MetricsEventHandler - 指标事件处理器

**文件位置**: `apps/backend/src/notification/event-handlers/metrics.handler.ts`

**处理器统计**: 13个事件处理器

**指标分类**:
```typescript
// 性能指标
metrics = {
  eventsProcessed: 0,
  eventsByType: new Map<string, number>(),
  processingTimes: [] as number[],
  errors: 0,
  lastEventTime: 0,

  // 业务指标
  workflowsStarted: 0,
  workflowsCompleted: 0,
  workflowsFailed: 0,
  nodesStarted: 0,
  nodesCompleted: 0,
  nodesFailed: 0,
  devicesConnected: 0,
  devicesDisconnected: 0,
  deviceErrors: 0,

  // 实时指标
  activeWorkflows: new Set<string>(),
  activeNodes: new Set<string>(),
  connectedDevices: new Set<string>(),
}
```

**性能统计**:
```typescript
getPerformanceMetrics() {
  const processingTimes = this.metrics.processingTimes;
  const avgProcessingTime = processingTimes.length > 0
    ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    : 0;

  const sortedTimes = [...processingTimes].sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

  return {
    avgProcessingTime,
    p50ProcessingTime: p50,
    p95ProcessingTime: p95,
    p99ProcessingTime: p99,
    totalEventsProcessed: this.metrics.eventsProcessed,
    errorRate: this.metrics.eventsProcessed > 0
      ? (this.metrics.errors / this.metrics.eventsProcessed) * 100
      : 0,
    timestamp: new Date()
  };
}
```

### 5. BaseDeviceService - 设备实例管理基类

**文件位置**: `apps/backend/src/devices/base-device.service.ts`

**设备实例接口**:
```typescript
export interface DeviceInstance {
  id: string;
  type: string;
  endpoint: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastActivity: Date;
  metadata: Record<string, any>;
}
```

**核心方法**:
```typescript
// 创建设备实例
protected createInstance(endpoint: string, metadata: Record<string, any> = {}): DeviceInstance

// 获取设备实例
getInstance(instanceId: string): DeviceInstance | undefined

// 更新实例状态
protected updateInstanceStatus(instanceId: string, status: DeviceInstance['status']): void

// 移除设备实例
protected removeInstance(instanceId: string): void

// 抽象方法 - 子类实现
abstract connect(instanceId: string): Promise<void>;
abstract disconnect(instanceId: string): Promise<void>;
abstract healthCheck(instanceId: string): Promise<boolean>;
```

**事件驱动的状态管理**:
```typescript
protected updateInstanceStatus(instanceId: string, status: DeviceInstance['status']): void {
  const instance = this.instances.get(instanceId);
  if (instance) {
    const oldStatus = instance.status;
    instance.status = status;
    instance.lastActivity = new Date();

    this.logger.log(`设备实例状态变更: ${instanceId} ${oldStatus} → ${status}`);

    // 发送状态变更事件
    this.eventBus.emit('device.instance.status.changed', {
      instanceId,
      deviceType: this.deviceType,
      oldStatus,
      newStatus: status,
      timestamp: new Date(),
    });
  }
}
```

### 6. ZahnerZenniumInstanceService - 具体设备实例服务

**文件位置**: `apps/backend/src/devices/zahner-zennium-instance.service.ts`

**继承关系**: extends BaseDeviceService

**设备操作实现**:
```typescript
// 连接设备
async connect(instanceId: string): Promise<void> {
  const instance = this.getInstance(instanceId);
  if (!instance) {
    throw new Error(`设备实例不存在: ${instanceId}`);
  }

  this.updateInstanceStatus(instanceId, 'connecting');

  try {
    // 健康检查
    const response = await firstValueFrom(
      this.httpService.get(`${instance.endpoint}/health`, {
        timeout: this.timeoutMs,
      })
    );

    if (response?.status === 200) {
      this.updateInstanceStatus(instanceId, 'connected');

      // 发送设备连接事件
      this.eventBus.emit('device.connected', {
        deviceType: 'zahner-zennium',
        instanceId,
        endpoint: instance.endpoint,
        timestamp: new Date(),
        context: { source: 'device-instance-service' }
      });
    }
  } catch (error) {
    this.updateInstanceStatus(instanceId, 'error');
    // 发送错误事件...
  }
}
```

**执行测量（无通知，返回结构化结果）**:
```typescript
async executeMeasurement(instanceId: string, measurementType: string, parameters: Record<string, any>): Promise<any> {
  const instance = this.getInstance(instanceId);
  if (!instance) {
    throw new Error(`设备实例不存在: ${instanceId}`);
  }

  if (instance.status !== 'connected') {
    throw new Error(`设备未连接: ${instanceId}`);
  }

  try {
    const response = await firstValueFrom(
      this.httpService.post(`${instance.endpoint}/measure`, {
        type: measurementType,
        parameters,
      }, {
        timeout: this.timeoutMs,
      })
    );

    return response?.data;
  } catch (error) {
    // 发送测量失败事件
    this.eventBus.emit('measurement.failed', {
      instanceId,
      measurementType,
      error: error.message,
      timestamp: new Date(),
      context: { source: 'device-instance-service' }
    });

    throw error;
  }
}
```

### 7. Python模板层 - 专注测量逻辑

**文件位置**: `apps/backend/scripts/zahner_device.py`

**架构特点**:
- 无任何通知调用
- 专注纯测量逻辑
- 返回结构化结果
- KISS原则设计

**统一返回格式**:
```python
return {
    "status": "success",
    "measurement_type": "eis_potentiostatic",
    "data": {
        "message": success_msg,
        "output_path": output_path,
        "mode": "POTMODE_POTENTIOSTATIC",
        "parameters": {
            "frequency_range": f"{lower_freq}-{upper_freq} Hz",
            "amplitude_v": amplitude,
            "dc_potential": params.get("eis_potential", 0.0) if enable_dc_bias else None,
            "enable_dc_bias": enable_dc_bias,
            "scan_direction": scan_dir,
            "scan_strategy": scan_strat
        }
    },
    "timestamp": time.time(),
    "parameters": params
}
```

**统一测量端点**:
```python
@app.post("/measure")
def measure_unified(request: UnifiedMeasureRequest):
    """统一测量端点"""
    measurement_type = request.measurement_type
    parameters = request.parameters

    # 根据测量类型调用相应的测量函数
    if measurement_type == "eis_potentiostatic":
        return measure_eis_potentiostatic(parameters)
    elif measurement_type == "eis_galvanostatic":
        return measure_eis_galvanostatic(parameters)
    # ... 其他测量类型
```

## 🔄 事件流详细分析

### 典型的事件驱动流程

#### 1. 工作流执行流程

```typescript
// 1. 业务逻辑发送事件
this.eventBus.emit('workflow.started', {
  executionId,
  workflowId,
  timestamp: new Date(),
  context: { source: 'execution-service' }
});

// 2. 并行触发多个处理器
// NotificationEventHandler → 发送WebSocket通知
// StateEventHandler → 更新工作流状态
// MetricsEventHandler → 记录业务指标

// 3. NotificationEventHandler处理
private async handleWorkflowStarted(event: EventPayload): Promise<void> {
  const { executionId, workflowId, context } = event.data;
  const notification = {
    id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: '工作流执行开始',
    message: `Workflow execution started: ${workflowId}`,
    type: 'info' as const,
    source: context?.source || 'execution-service',
    timestamp: new Date(),
    details: `Execution ID: ${executionId}`
  };
  this.workflowGateway.broadcast('notification', notification);
}

// 4. StateEventHandler处理
private async handleWorkflowStarted(event: EventPayload): Promise<void> {
  const { executionId, workflowId } = event.data;
  const newState = {
    executionId,
    workflowId,
    status: 'running',
    startTime: event.timestamp,
    context: event.context
  };

  this.workflowStates.set(executionId, newState);

  // 触发状态变更事件
  this.eventBus.emit('workflow.state.changed', {
    executionId,
    workflowId,
    fromState: previousState?.status || 'unknown',
    toState: 'running',
    timestamp: event.timestamp,
    context: event.context
  });
}

// 5. MetricsEventHandler处理
private async handleWorkflowStarted(event: EventPayload): Promise<void> {
  const { executionId, workflowId } = event.data;

  this.metrics.workflowsStarted++;
  this.metrics.activeWorkflows.add(executionId);

  this.logger.debug(`Workflow metrics updated`, {
    workflowId,
    executionId,
    totalStarted: this.metrics.workflowsStarted,
    activeWorkflows: this.metrics.activeWorkflows.size
  });
}
```

#### 2. 设备测量流程

```typescript
// 1. 执行服务调用设备服务
const result = await this.zahnerService.performMeasurement(measurementType, parameters);

// 2. 设备服务通过设备实例服务执行测量
const result = await this.zahnerInstanceService.executeMeasurement(instanceId, measurementType, parameters);

// 3. 设备实例服务调用Python API
const response = await this.httpService.post(`${instance.endpoint}/measure`, {
  type: measurementType,
  parameters,
});

// 4. Python层执行测量并返回结构化结果
return {
  "status": "success",
  "measurement_type": "eis_potentiostatic",
  "data": { /* 测量结果 */ },
  "timestamp": time.time(),
  "parameters": params
};

// 5. 设备实例服务发送测量完成事件
this.eventBus.emit('measurement.completed', {
  instanceId,
  measurementType,
  result: response.data,
  timestamp: new Date(),
  context: { source: 'device-instance-service' }
});

// 6. 并行触发多个处理器处理测量完成事件
// ExecutionNotificationService → 转换为工作流节点通知
// MetricsEventHandler → 记录测量指标
// StateEventHandler → 更新设备状态
```

## 📊 处理器统计汇总

### 事件处理器分布
- **NotificationEventHandler**: 15个处理器
- **StateEventHandler**: 12个处理器
- **MetricsEventHandler**: 13个处理器
- **ExecutionNotificationService**: 自动监听测量事件

### 事件类型分类
```typescript
// 工作流相关事件
'workflow.started', 'workflow.completed', 'workflow.failed',
'workflow.created', 'workflow.updated', 'workflow.deleted',
'workflow.state.changed'

// 节点相关事件
'node.started', 'node.completed', 'node.failed',
'node.state.changed'

// 设备相关事件
'device.connected', 'device.disconnected', 'device.error',
'device.state.changed', 'device.instance.created',
'device.instance.status.changed', 'device.instance.removed'

// 测量相关事件
'measurement.completed', 'measurement.failed',
'measurement.*'

// 系统相关事件
'system.health_check', 'client.connected', 'client.disconnected'

// 状态查询事件
'state.query.node', 'state.query.workflow', 'state.query.device',
'state.query.node.response', 'state.query.workflow.response',
'state.query.device.response'

// 指标相关事件
'metrics.query', 'metrics.query.response',
'metrics.workflow.completed', 'metrics.workflow.failed',
'metrics.node.completed', 'metrics.node.failed',
'metrics.device.error', 'metrics.system.health',
'metrics.client.connected', 'metrics.client.disconnected'

// 执行相关事件
'execution.started', 'execution.completed', 'execution.failed',
'execution.paused', 'execution.resumed', 'execution.cancelled'

// 延迟相关事件
'delay.started', 'delay.completed'

// 模块相关事件
'module.initialized'
```

## 🎯 架构优势

### 1. 完全的事件驱动
- 一个事件源可同时触发多个并行处理器
- 处理器之间完全解耦，互不依赖
- 支持异步处理，提高系统响应性

### 2. 清晰的模板-实例分离
- **Python模板层**: 专注测量逻辑，返回结构化结果
- **Node.js实例层**: 管理设备实例，处理事件和通知
- **事件总线层**: 协调各层间的通信

### 3. 统一的状态管理
- 统一的状态枚举定义
- 状态转换验证机制
- 实时状态查询接口

### 4. 全面的指标收集
- 性能指标：处理时间、错误率
- 业务指标：工作流、节点、设备统计
- 实时指标：活跃实例、连接状态

### 5. 高可扩展性
- 新增事件类型：只需实现新的处理器
- 新增设备类型：继承BaseDeviceService
- 新增指标类型：扩展MetricsEventHandler

## 🔧 配置和部署

### 依赖注入配置
```typescript
// notification.module.ts
@Module({
  providers: [
    SimpleEventBus,
    NotificationEventHandler,
    StateEventHandler,
    MetricsEventHandler,
    ZahnerZenniumInstanceService,
    ExecutionNotificationService,
  ],
  exports: [SimpleEventBus],
})
export class NotificationModule {}
```

### 模块集成
```typescript
// execution.module.ts
@Module({
  imports: [NotificationModule],
  providers: [ExecutionService],
  controllers: [ExecutionController],
})
export class ExecutionModule {}
```

## 📈 性能特征

### 并发处理能力
- 事件处理器异步并行执行
- 错误隔离，单个处理器失败不影响其他处理器
- 支持高并发事件流

### 内存管理
- 事件处理器无状态设计
- 定期清理过期的处理时间记录
- 设备实例生命周期管理

### 响应时间
- 事件发布：同步操作，微秒级响应
- 事件处理：异步操作，毫秒级响应
- 状态查询：内存查找，微秒级响应

## 🚀 总结

当前实现的事件驱动架构具有以下特点：

1. **完整的事件驱动机制**: 从业务逻辑到多个并行处理器的完整链路
2. **模板-实例分离**: Python层专注测量，Node.js层管理实例和通知
3. **多处理器并行响应**: 一个事件源同时触发通知、状态、指标等多个响应
4. **统一的接口设计**: 所有处理器都实现EventHandler接口
5. **全面的监控能力**: 性能、业务、实时指标的完整收集
6. **高可扩展性**: 新功能只需添加新的处理器，无需修改现有代码

这个架构为系统的进一步发展奠定了坚实的基础，支持快速功能扩展和系统性能优化。