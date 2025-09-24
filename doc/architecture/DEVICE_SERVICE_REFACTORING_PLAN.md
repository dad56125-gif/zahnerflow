# 设备服务架构重构执行计划

## 概述

将现有的三层架构（BaseDeviceService ← ZahnerZenniumInstanceService ← ZahnerZenniumService）简化为两层架构，BaseDeviceService只负责设备状态管理，具体设备服务继承并实现设备特定的功能。

## 架构对比

### 当前架构（复杂）
```
BaseDeviceService（抽象基类）
└── ZahnerZenniumInstanceService（HTTP代理）
    └── ZahnerZenniumService（业务逻辑层）
```

### 目标架构（简化）
```
BaseDeviceService（简化版，只负责状态管理）
├── ZahnerDeviceService（测量逻辑）
├── PP242DeviceService（测量逻辑）
├── HeatingFurnaceService（温度控制）
├── FlowMeterService（流量控制）
└── MultiplexerService（通道切换）
```

## 文件修改清单

### 1. 需要删除的文件

- `src/devices/zahner-zennium-instance.service.ts` - 完全删除
- 删除后需要清理所有对该服务的引用

### 2. 需要修改的文件

#### 2.1 简化BaseDeviceService
**文件**: `src/devices/base-device.service.ts`

**修改内容**:
- 移除实例管理相关的Map和复杂逻辑
- 保留核心的状态管理功能
- 简化抽象方法定义

**修改前**:
```typescript
protected readonly instances = new Map<string, DeviceInstance>();
// 复杂的实例管理逻辑
```

**修改后**:
```typescript
// 只保留状态管理相关的抽象方法
abstract connect(): Promise<void>;
abstract disconnect(): Promise<void>;
abstract healthCheck(): Promise<boolean>;
// 移除实例管理，每个服务只管理一个设备实例
```

#### 2.2 创建新的ZahnerDeviceService
**文件**: `src/devices/zahner-device.service.ts`

**操作**: 重命名`zahner-zennium-instance.service.ts`并重构

**修改内容**:
- 直接继承简化的BaseDeviceService
- 合并原InstanceService和ZahnerService的HTTP代理功能
- 实现设备特定的连接、断开、健康检查逻辑
- 保留executeMeasurement方法

**主要方法**:
```typescript
class ZahnerDeviceService extends BaseDeviceService {
  private endpoint: string;

  constructor(private readonly httpService: HttpService) {
    super();
    this.endpoint = process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';
  }

  async connect(): Promise<void> {
    // HTTP连接逻辑
  }

  async disconnect(): Promise<void> {
    // HTTP断开逻辑
  }

  async healthCheck(): Promise<boolean> {
    // HTTP健康检查
  }

  async executeMeasurement(measurementType: string, parameters: any): Promise<any> {
    // 测量执行逻辑
  }
}
```

#### 2.3 简化ZahnerZenniumService
**文件**: `src/modules/zahner-zennium/zahner-zennium.service.ts`

**修改内容**:
- 移除对ZahnerZenniumInstanceService的依赖
- 直接注入ZahnerDeviceService
- 简化为纯业务逻辑层，专注于事件包装和业务流程

**修改前**:
```typescript
constructor(
  private readonly deviceInstanceService: ZahnerZenniumInstanceService,
  // ...
) {}
```

**修改后**:
```typescript
constructor(
  private readonly zahnerDeviceService: ZahnerDeviceService,
  // ...
) {}
```

#### 2.4 更新模块依赖
**文件**: `src/modules/zahner-zennium/zahner-zennium.module.ts`

**修改内容**:
- 移除ZahnerZenniumInstanceService的提供
- 添加ZahnerDeviceService的提供

**修改前**:
```typescript
providers: [ZahnerZenniumService, ZahnerZenniumInstanceService]
```

**修改后**:
```typescript
providers: [ZahnerZenniumService, ZahnerDeviceService]
```

#### 2.5 更新执行服务依赖
**文件**: `src/modules/execution/execution.service.ts`

**修改内容**:
- 如果直接使用了ZahnerZenniumInstanceService，需要更新为使用ZahnerDeviceService
- 但当前执行服务是通过ZahnerZenniumService访问设备的，所以可能不需要修改

### 3. 未来设备扩展模板

#### 3.1 PP242DeviceService模板
**文件**: `src/devices/pp242-device.service.ts`

```typescript
@Injectable()
export class PP242DeviceService extends BaseDeviceService {
  constructor(private readonly httpService: HttpService) {
    super();
  }

  async connect(): Promise<void> {
    // PP242特定的连接逻辑
  }

  async disconnect(): Promise<void> {
    // PP242特定的断开逻辑
  }

  async healthCheck(): Promise<boolean> {
    // PP242特定的健康检查
  }

  async executeMeasurement(measurementType: string, parameters: any): Promise<any> {
    // PP242特定的测量逻辑
  }
}
```

#### 3.2 HeatingFurnaceService模板
**文件**: `src/devices/heating-furnace.service.ts`

```typescript
@Injectable()
export class HeatingFurnaceService extends BaseDeviceService {
  constructor() {
    super();
  }

  async connect(): Promise<void> {
    // 加热炉连接逻辑（可能是串口、USB等）
  }

  async disconnect(): Promise<void> {
    // 加热炉断开逻辑
  }

  async healthCheck(): Promise<boolean> {
    // 加热炉健康检查
  }

  // 加热炉特有方法
  async setTemperature(targetTemp: number): Promise<void> {
    // 温度设置逻辑
  }

  async getTemperature(): Promise<number> {
    // 温度读取逻辑
  }
}
```

#### 3.3 FlowMeterService模板
**文件**: `src/devices/flow-meter.service.ts`

```typescript
@Injectable()
export class FlowMeterService extends BaseDeviceService {
  constructor() {
    super();
  }

  async connect(): Promise<void> {
    // 流量计连接逻辑
  }

  async disconnect(): Promise<void> {
    // 流量计断开逻辑
  }

  async healthCheck(): Promise<boolean> {
    // 流量计健康检查
  }

  // 流量计特有方法
  async setFlowRate(rate: number): Promise<void> {
    // 流量设置逻辑
  }

  async getFlowRate(): Promise<number> {
    // 流量读取逻辑
  }
}
```

#### 3.4 MultiplexerService模板
**文件**: `src/devices/multiplexer.service.ts`

```typescript
@Injectable()
export class MultiplexerService extends BaseDeviceService {
  constructor() {
    super();
  }

  async connect(): Promise<void> {
    // 多路复用器连接逻辑
  }

  async disconnect(): Promise<void> {
    // 多路复用器断开逻辑
  }

  async healthCheck(): Promise<boolean> {
    // 多路复用器健康检查
  }

  // 多路复用器特有方法
  async switchChannel(channel: number): Promise<void> {
    // 通道切换逻辑
  }

  async getCurrentChannel(): Promise<number> {
    // 当前通道读取逻辑
  }
}
```

## 依赖迁移指南

### 1. 当前依赖关系
```
ExecutionService → ZahnerZenniumService → ZahnerZenniumInstanceService → BaseDeviceService
```

### 2. 目标依赖关系
```
ExecutionService → ZahnerZenniumService → ZahnerDeviceService → BaseDeviceService
```

### 3. 迁移步骤

1. **第一步**: 创建简化的BaseDeviceService
2. **第二步**: 创建ZahnerDeviceService，合并原InstanceService功能
3. **第三步**: 更新ZahnerZenniumService，移除对InstanceService的依赖
4. **第四步**: 更新模块配置
5. **第五步**: 删除ZahnerZenniumInstanceService文件
6. **第六步**: 运行测试确保功能正常

## 测试验证

### 1. 单元测试
- BaseDeviceService抽象方法测试
- ZahnerDeviceService连接/断开/健康检查测试
- ZahnerZenniumService业务逻辑测试

### 2. 集成测试
- 设备连接测试
- 测量执行测试
- 事件系统测试

### 3. 端到端测试
- 完整的测量流程测试
- 错误处理测试
- 设备状态管理测试

## 风险评估

### 1. 低风险
- 代码结构简化
- 依赖关系清晰
- 未来扩展性更好

### 2. 中等风险
- 需要更新所有引用ZahnerZenniumInstanceService的地方
- 需要确保所有功能在新的架构下正常工作

### 3. 缓解措施
- 逐步迁移，先创建新服务再删除旧服务
- 充分测试确保功能完整性
- 保留原代码备份，必要时可以回滚

## 预期收益

1. **代码简化**: 减少约30%的设备管理相关代码
2. **维护性**: 更清晰的职责分离
3. **扩展性**: 更容易添加新设备类型
4. **性能**: 减少不必要的实例管理开销
5. **可测试性**: 更简单的依赖关系便于测试

## 执行时间估计

- **BaseDeviceService简化**: 2小时
- **ZahnerDeviceService创建**: 3小时
- **ZahnerZenniumService更新**: 1小时
- **模块配置更新**: 0.5小时
- **测试和验证**: 3小时
- **总计**: 约9.5小时

## 后续优化

1. **设备工厂模式**: 未来可以考虑引入设备工厂来管理不同设备的创建
2. **插件架构**: 考虑将设备服务做成插件，支持动态加载
3. **配置管理**: 统一设备配置管理机制