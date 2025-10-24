# 熔炉系统错误处理指南

## 概述

本文档描述了熔炉系统中实现的完整错误处理机制，包括重试机制、熔断器模式、错误分类和处理策略。

## 系统架构

错误处理系统覆盖了整个应用栈：
- **设备层**（Python）：基础设备通信错误处理
- **后端服务层**（TypeScript/NestJS）：业务逻辑错误处理和熔断器
- **前端层**（TypeScript/React）：用户界面错误处理和重试机制

## 核心组件

### 1. 错误分类（ErrorCategory）

```typescript
enum ErrorCategory {
  NETWORK = 'NETWORK',           // 网络错误
  DEVICE = 'DEVICE',             // 设备通信错误
  PROTOCOL = 'PROTOCOL',         // 协议解析错误
  TIMEOUT = 'TIMEOUT',           // 超时错误
  VALIDATION = 'VALIDATION',     // 参数验证错误
  BUSINESS = 'BUSINESS',         // 业务逻辑错误
  SYSTEM = 'SYSTEM',             // 系统错误
  UNKNOWN = 'UNKNOWN'            // 未知错误
}
```

### 2. 错误严重程度（ErrorSeverity）

```typescript
enum ErrorSeverity {
  LOW = 'LOW',                   // 低级错误，不影响核心功能
  MEDIUM = 'MEDIUM',             // 中级错误，影响部分功能
  HIGH = 'HIGH',                 // 高级错误，影响核心功能
  CRITICAL = 'CRITICAL'          // 严重错误，系统不可用
}
```

### 3. 重试机制（RetryHandler）

实现了指数退避算法：
- 最大重试次数：3次（可配置）
- 基础延迟：1000ms
- 最大延迟：30000ms
- 退避因子：2.0
- 随机抖动：启用

### 4. 熔断器（CircuitBreaker）

防止级联故障：
- 失败阈值：5次（可配置）
- 恢复超时：60秒（可配置）
- 三种状态：CLOSED、OPEN、HALF_OPEN

## 设备层错误处理（Python）

### 增强功能

1. **FurnaceError类**：结构化错误信息
2. **RetryHandler**：指数退避重试
3. **CircuitBreaker**：熔断器保护
4. **EnhancedCommLogManager**：增强的日志管理

### 使用示例

```python
# 连接管理器自动使用错误处理
connection_id = connection_pool.create_connection(
    port="COM4",
    baudrate=9600,
    address=1
)

# 设备操作自动应用重试和熔断器
controller = connection_pool.get_controller(connection_id)
with controller:
    status = controller.get_all_status()
```

## 后端服务层错误处理（TypeScript）

### FurnaceErrorHandlerService

专门为熔炉系统设计的错误处理服务：

```typescript
@Injectable()
export class FurnaceErrorHandlerService {
  // 设备连接错误处理
  async handleDeviceConnection<T>(operation: () => Promise<T>, context?: FurnaceErrorContext): Promise<T>

  // 设备操作错误处理
  async handleDeviceOperation<T>(operation: () => Promise<T>, context?: FurnaceErrorContext): Promise<T>

  // 程序段操作错误处理
  async handleProgramSegmentsOperation<T>(operation: () => Promise<T>, context?: FurnaceErrorContext): Promise<T>
}
```

### 在服务中使用

```typescript
// 在FurnaceControlService中使用
async connect(connectionParams: ConnectionParams): Promise<any> {
  return this.errorHandler.handleDeviceConnection(
    () => this.device.connect(connectionParams),
    {
      operation: 'connect',
      port: connectionParams.port,
      address: connectionParams.address
    }
  );
}
```

### 错误监控API

新增的错误监控端点：

- `GET /api/devices/furnace/error/stats` - 获取错误统计
- `POST /api/devices/furnace/error/circuit-breaker/:name/reset` - 重置指定熔断器
- `POST /api/devices/furnace/error/circuit-breakers/reset` - 重置所有熔断器
- `GET /api/devices/furnace/error/recent` - 获取最近的错误
- `GET /api/devices/furnace/error/export` - 导出错误数据
- `POST /api/devices/furnace/error/clear` - 清理错误日志

## 前端错误处理（TypeScript/React）

### FrontendErrorHandler

与后端一致的错误处理机制：

```typescript
// 创建API错误处理器
const apiErrorHandler = createFurnaceApiErrorHandler();

// 使用示例
await apiErrorHandler.execute(
  () => FurnaceApi.connect(config),
  {
    operation: 'connect',
    port: config.port,
    address: config.address
  },
  (error) => {
    // 自定义重试逻辑
    return error.code === 'DEVICE_ERROR' || error.status >= 500;
  }
);
```

### 在useFurnace Hook中集成

所有关键的设备操作都使用增强的错误处理：

```typescript
// 连接操作
await apiErrorHandler.execute(
  () => FurnaceApi.connect(config),
  { operation: 'connect', port: config.port }
);

// 程序段操作
await apiErrorHandler.execute(
  () => FurnaceApi.getProgramSegments(),
  { operation: 'read_program_segments' }
);
```

## 错误处理策略

### 网络错误
- **策略**：自动重试，指数退避
- **用户消息**："网络连接出现问题，请检查网络后重试"

### 设备错误
- **策略**：自动重试，熔断器保护
- **用户消息**："设备通信失败，请检查设备连接"

### 超时错误
- **策略**：自动重试，增加延迟
- **用户消息**："操作超时，请稍后重试"

### 验证错误
- **策略**：不重试，立即返回
- **用户消息**："输入参数有误，请检查后重新输入"

### 业务逻辑错误
- **策略**：不重试，立即返回
- **用户消息**："操作无法执行，请检查相关条件"

### 系统错误
- **策略**：不重试，记录详细日志
- **用户消息**："系统出现错误，请联系技术支持"

## 监控和诊断

### 错误统计

系统提供详细的错误统计信息：

```json
{
  "monitor": {
    "total": 45,
    "recentCount": 12,
    "categoryStats": {
      "DEVICE": 8,
      "TIMEOUT": 3,
      "NETWORK": 1
    },
    "severityStats": {
      "HIGH": 7,
      "MEDIUM": 4,
      "LOW": 1
    }
  },
  "circuitBreakers": {
    "device_connection": {
      "state": "CLOSED",
      "failureCount": 0
    },
    "device_operation": {
      "state": "HALF_OPEN",
      "failureCount": 2
    }
  }
}
```

### 熔断器状态监控

- **CLOSED**：正常工作状态
- **OPEN**：熔断状态，拒绝请求
- **HALF_OPEN**：尝试恢复状态

### 日志记录

所有错误都被详细记录，包括：
- 错误分类和严重程度
- 时间戳
- 上下文信息
- 重试次数
- 熔断器状态

## 最佳实践

### 1. 参数命名规范

所有API参数、接口定义、变量命名统一使用snake_case，与Python设备层保持一致。

### 2. 错误处理原则

- **设备操作**：使用专门的错误处理器
- **网络请求**：使用重试机制
- **用户输入**：验证后立即返回错误
- **系统级操作**：记录详细日志

### 3. 熔断器配置

不同操作使用不同的熔断器配置：
- **设备连接**：更严格的阈值（3次失败）
- **设备操作**：标准阈值（5次失败）
- **程序段操作**：中等阈值（3次失败）

### 4. 重试策略

- **网络错误**：立即重试
- **设备错误**：延迟重试
- **超时错误**：指数退避
- **业务错误**：不重试

## 故障排查

### 常见问题

1. **设备连接失败**
   - 检查端口和地址配置
   - 查看设备层日志
   - 检查熔断器状态

2. **频繁超时**
   - 调整超时时间配置
   - 检查网络连接稳定性
   - 查看重试统计

3. **熔断器频繁开启**
   - 检查设备状态
   - 调整失败阈值
   - 分析根本原因

### 调试工具

1. **错误统计API**：`/api/devices/furnace/error/stats`
2. **最近错误API**：`/api/devices/furnace/error/recent`
3. **熔断器重置API**：`/api/devices/furnace/error/circuit-breakers/reset`

## 总结

这套错误处理系统提供了：

1. **统一的错误分类和处理策略**
2. **自动重试机制和熔断器保护**
3. **详细的错误监控和诊断**
4. **用户友好的错误消息**
5. **完整的日志记录和统计**

通过这套系统，熔炉应用的可靠性和用户体验得到了显著提升，同时为运维和故障排查提供了有力支持。