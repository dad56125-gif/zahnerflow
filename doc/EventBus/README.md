# 事件总线模块 (EventBus)

## 设计原则 (Design Principles)

- **解耦架构**: 基于发布-订阅模式实现系统各模块间的松耦合
- **统一日志管理**: 通过ConsoleDisplayManager实现集中的日志控制和显示
- **事件驱动**: 以事件为核心驱动力，支持异步处理和状态变更通知
- **可扩展性**: 支持动态注册事件处理器，便于功能模块扩展

## 对外接口 (Public API)

### 核心服务接口
- `SimpleEventBus` - 事件总线核心服务
- `ConsoleDisplayManager` - 控制台显示管理服务
- `EventHandler` - 事件处理器基础接口

### 事件操作接口
- `emit(event: Event)` - 发布事件
- `subscribe(eventType: string, handler: EventHandler)` - 订阅事件
- `unsubscribe(eventType: string, handler: EventHandler)` - 取消订阅
- `log(source: string, level: string, message: string, metadata?: any)` - 统一日志接口

### 控制台管理接口
- `setDisplayLevel(level: LogLevel)` - 设置显示级别
- `setModuleDisplay(module: string, enabled: boolean)` - 设置模块显示开关
- `enableQuickMode()` - 启用快速模式
- `disableQuickMode()` - 禁用快速模式

## 主要功能列表 (Key Functions)

1. **事件发布订阅**
   - 事件类型注册与管理
   - 动态事件处理器注册
   - 事件分发与路由

2. **日志管理**
   - 统一日志输出控制
   - 分级别日志显示
   - 模块化日志开关

3. **事件处理**
   - NotificationEventHandler - 通知事件处理
   - StateEventHandler - 状态事件处理
   - MetricsEventHandler - 指标事件处理

4. **实时通知**
   - WebSocket事件推送
   - 前端状态同步
   - 错误事件广播

## 核心数据模型 (Core Data Model)

### 事件模型
```typescript
interface Event {
  id: string;
  type: string;
  timestamp: Date;
  payload: any;
  source: string;
}
```

### 事件处理器模型
```typescript
interface EventHandler {
  handle(event: Event): void;
  canHandle(eventType: string): boolean;
}
```

### 日志模型
```typescript
interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  metadata?: any;
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **WebSocket**: 实时通信协议
- **NestJS**: 后端框架基础设施

### 内部依赖
- **NotificationSystem**: 通知系统模块
- **StateManagement**: 状态管理模块
- **ConsoleManagement**: 控制台管理模块

## 典型端到端工作流程 (Typical Workflow)

1. **事件发布流程**
   ```
   模块调用eventBus.emit() → SimpleEventBus路由事件 → 对应Handler处理 → 控制台日志记录
   ```

2. **日志管理流程**
   ```
   Handler调用consoleManager.log() → 日志级别检查 → 格式化输出 → 前端显示
   ```

3. **实时通知流程**
   ```
   事件触发 → WebSocket Gateway推送 → 前端接收更新 → UI状态同步
   ```

4. **错误处理流程**
   ```
   异常捕获 → 错误事件发布 → ErrorHandler处理 → 错误日志记录 → 用户通知
   ```