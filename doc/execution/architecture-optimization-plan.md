# 综合重构方案：架构层级优化计划

## 文档信息
- **创建日期**: 2025-09-23
- **更新日期**: 2025-09-23
- **版本**: 1.0.0
- **目标**: 实现模板-实例分离，优化架构层级
- **执行顺序**: 第三阶段（在事件驱动架构完成后执行）
- **文件夹**: `@doc/execution/`

## 1. 重构策略概述

### 1.1 重构原则
- **顺序执行**: 在事件驱动架构重构完成后执行
- **模板-实例分离**: Python层专注测量模板，Node.js层处理设备实例
- **渐进式迁移**: 零破坏性，保持现有功能完全不变
- **风险控制**: 每个阶段都可以独立回退
- **KISS原则**: Python层保持简单，只移除通知调用

### 1.2 阶段划分（第三阶段：架构层级优化）

| 阶段 | 名称 | 时间 | 风险级别 | 主要目标 | 前置条件 |
|------|------|------|----------|----------|-------------|
| 阶段3.1 | 设备实例层建设 | 1-2天 | 零风险 | 创建设备实例管理 | 事件驱动架构完成 |
| 阶段3.2 | Python模板层重构 | 2天 | 低风险 | 移除Python层通知调用 | 阶段3.1完成 |
| 阶段3.3 | 设备服务重构 | 2天 | 低风险 | 重构设备服务为纯操作 | 阶段3.2完成 |
| 阶段3.4 | 执行服务集成 | 1-2天 | 中风险 | 集成新架构 | 阶段3.3完成 |
| 阶段3.5 | 清理优化 | 1天 | 中风险 | 清理冗余代码 | 阶段3.4完成 |

### 1.3 与事件驱动架构的关系

**前置条件**: 必须先完成事件驱动架构重构（第二阶段）
- 事件驱动架构正常工作
- 多处理器并行响应正常
- 一个事件源触发多个响应正常

**架构演进**:
```
第二阶段完成后:
ExecutionService → EventBus → 多个并行事件处理器
                    ├── NotificationEventHandler（通知）
                    ├── StateEventHandler（状态）
                    ├── MetricsEventHandler（指标）
                    └── DeviceEventHandler（设备）

第三阶段完成后:
ExecutionService → EventBus → 多个并行事件处理器
                    ├── NotificationEventHandler（通知）
                    ├── StateEventHandler（状态）
                    ├── MetricsEventHandler（指标）
                    ├── DeviceEventHandler（设备）
                    └── 设备实例服务 → (事件驱动，纯设备操作)
                    ↓
                    Python模板层 → (无通知，返回结构化结果)
```

### 1.4 核心架构模式

**模板-实例分离**:
```
模板层 (Python):
- 测量方法定义
- 参数配置
- 纯测量逻辑（无通知）
- 返回结构化结果

实例层 (Node.js):
- 设备实例管理
- 状态管理
- 事件驱动通知
- 错误处理和重试

事件总线层:
- 统一事件分发
- 多处理器并行响应
- 解耦业务逻辑
```

## 2. 阶段3.1：设备实例层建设 (1-2天)

### 2.1 目标
- 创建设备实例管理基础设施
- 实现设备状态管理
- 为模板-实例分离奠定基础
- 保持完全向后兼容

### 2.2 新增文件

#### 文件1: `apps/backend/src/devices/base-device.service.ts`
**完整实现**:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { SimpleEventBus } from '../notification/simple-event-bus.service';

export interface DeviceInstance {
  id: string;
  type: string;
  endpoint: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastActivity: Date;
  metadata: Record<string, any>;
}

@Injectable()
export abstract class BaseDeviceService {
  protected readonly logger: Logger;
  protected readonly instances = new Map<string, DeviceInstance>();

  constructor(
    protected readonly eventBus: SimpleEventBus,
    protected readonly deviceType: string,
  ) {
    this.logger = new Logger(`${deviceType}DeviceService`);
  }

  // 创建设备实例
  protected createInstance(endpoint: string, metadata: Record<string, any> = {}): DeviceInstance {
    const instance: DeviceInstance = {
      id: `${this.deviceType}-${Date.now()}`,
      type: this.deviceType,
      endpoint,
      status: 'disconnected',
      lastActivity: new Date(),
      metadata,
    };

    this.instances.set(instance.id, instance);
    this.logger.log(`创建设备实例: ${instance.id}`);

    // 发送设备实例创建事件
    this.eventBus.emit('device.instance.created', {
      instanceId: instance.id,
      deviceType: this.deviceType,
      endpoint,
      metadata,
      timestamp: new Date(),
    });

    return instance;
  }

  // 获取设备实例
  getInstance(instanceId: string): DeviceInstance | undefined {
    return this.instances.get(instanceId);
  }

  // 获取所有实例
  getAllInstances(): DeviceInstance[] {
    return Array.from(this.instances.values());
  }

  // 更新实例状态
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

  // 移除设备实例
  protected removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.instances.delete(instanceId);

      this.logger.log(`移除设备实例: ${instanceId}`);

      // 发送设备实例移除事件
      this.eventBus.emit('device.instance.removed', {
        instanceId,
        deviceType: this.deviceType,
        timestamp: new Date(),
      });
    }
  }

  // 抽象方法：子类实现具体的设备操作
  abstract connect(instanceId: string): Promise<void>;
  abstract disconnect(instanceId: string): Promise<void>;
  abstract healthCheck(instanceId: string): Promise<boolean>;
}
```

#### 文件2: `apps/backend/src/devices/zahner-zennium-instance.service.ts`
**完整实现**:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BaseDeviceService, DeviceInstance } from './base-device.service';
import { SimpleEventBus } from '../notification/simple-event-bus.service';

@Injectable()
export class ZahnerZenniumInstanceService extends BaseDeviceService {
  private readonly timeoutMs = 30000;

  constructor(
    private readonly httpService: HttpService,
    eventBus: SimpleEventBus,
  ) {
    super(eventBus, 'zahner-zennium');
  }

  // 创建 Zahner 设备实例
  createZahnerInstance(endpoint: string): DeviceInstance {
    return this.createInstance(endpoint, {
      protocol: 'http',
      apiVersion: 'v1',
    });
  }

  // 连接设备
  async connect(instanceId: string): Promise<void> {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`设备实例不存在: ${instanceId}`);
    }

    this.updateInstanceStatus(instanceId, 'connecting');

    try {
      // 健康检查
      const response = await this.httpService.get(`${instance.endpoint}/health`, {
        timeout: this.timeoutMs,
      }).toPromise();

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
      } else {
        throw new Error(`健康检查失败: ${response?.status}`);
      }
    } catch (error) {
      this.updateInstanceStatus(instanceId, 'error');

      // 发送设备连接失败事件
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        instanceId,
        error: error.message,
        endpoint: instance.endpoint,
        timestamp: new Date(),
        context: { source: 'device-instance-service' }
      });

      throw error;
    }
  }

  // 断开连接
  async disconnect(instanceId: string): Promise<void> {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`设备实例不存在: ${instanceId}`);
    }

    try {
      // 这里可以添加具体的断开连接逻辑
      // 对于 HTTP API，可能不需要特别的断开操作

      this.updateInstanceStatus(instanceId, 'disconnected');

      // 发送设备断开事件
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        instanceId,
        endpoint: instance.endpoint,
        timestamp: new Date(),
        context: { source: 'device-instance-service' }
      });
    } catch (error) {
      this.updateInstanceStatus(instanceId, 'error');
      throw error;
    }
  }

  // 健康检查
  async healthCheck(instanceId: string): Promise<boolean> {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      return false;
    }

    try {
      const response = await this.httpService.get(`${instance.endpoint}/health`, {
        timeout: this.timeoutMs,
      }).toPromise();

      return response?.status === 200;
    } catch (error) {
      this.updateInstanceStatus(instanceId, 'error');
      return false;
    }
  }

  // 执行测量（无通知，返回结构化结果）
  async executeMeasurement(instanceId: string, measurementType: string, parameters: Record<string, any>): Promise<any> {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`设备实例不存在: ${instanceId}`);
    }

    if (instance.status !== 'connected') {
      throw new Error(`设备未连接: ${instanceId}`);
    }

    try {
      const response = await this.httpService.post(`${instance.endpoint}/measure`, {
        type: measurementType,
        parameters,
      }, {
        timeout: this.timeoutMs,
      }).toPromise();

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
}
```

#### 文件3: `apps/backend/src/modules/execution/execution-notification.service.ts`
**完整实现**:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';

@Injectable()
export class ExecutionNotificationService {
  private readonly logger = new Logger(ExecutionNotificationService.name);

  constructor(
    private readonly eventBus: SimpleEventBus,
  ) {
    // 监听测量完成事件，自动发送通知
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 监听测量完成事件
    this.eventBus.on('measurement.completed', (data) => {
      this.sendMeasurementCompleteNotification(data);
    });

    // 监听测量失败事件
    this.eventBus.on('measurement.failed', (data) => {
      this.sendMeasurementFailedNotification(data);
    });
  }

  // 发送测量完成通知
  private sendMeasurementCompleteNotification(data: any): void {
    this.eventBus.emit('workflow.node.completed', {
      nodeId: data.nodeId,
      executionId: data.executionId,
      result: data.result,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }

  // 发送测量失败通知
  private sendMeasurementFailedNotification(data: any): void {
    this.eventBus.emit('workflow.node.failed', {
      nodeId: data.nodeId,
      executionId: data.executionId,
      error: data.error,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }

  // 发送执行开始通知
  sendExecutionStartNotification(executionId: string, workflowId: string): void {
    this.eventBus.emit('workflow.started', {
      executionId,
      workflowId,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }

  // 发送执行完成通知
  sendExecutionCompleteNotification(executionId: string, success: boolean, duration: number): void {
    this.eventBus.emit('workflow.completed', {
      executionId,
      success,
      duration,
      timestamp: new Date(),
      context: { source: 'execution-notification-service' }
    });
  }
}
```

### 2.3 修改文件

#### 文件1: `apps/backend/src/modules/execution/execution.module.ts`
**修改内容**:
```typescript
import { Module } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { StateAwareExecutionService } from './state-aware-execution.service';
import { ExecutionNotificationService } from './execution-notification.service';
import { ZahnerZenniumInstanceService } from '../../devices/zahner-zennium-instance.service';
import { HttpModule } from '@nestjs/axios';
import { NotificationModule } from '../../notification/notification.module';

@Module({
  imports: [
    HttpModule,
    NotificationModule,
  ],
  providers: [
    ExecutionService,
    StateAwareExecutionService,
    ExecutionNotificationService,
    ZahnerZenniumInstanceService,
  ],
  exports: [
    ExecutionService,
    StateAwareExecutionService,
    ExecutionNotificationService,
    ZahnerZenniumInstanceService,
  ],
})
export class ExecutionModule {}
```

### 2.4 实施步骤

#### 步骤1: 创建设备目录
```bash
# 创建设备服务目录
mkdir -p apps/backend/src/devices

# 创建设备实例文件
touch apps/backend/src/devices/base-device.service.ts
touch apps/backend/src/devices/zahner-zennium-instance.service.ts

# 创建执行通知服务
touch apps/backend/src/modules/execution/execution-notification.service.ts
```

#### 步骤2: 实现设备实例服务
- 实现基础的设备实例管理
- 实现设备连接、断开、健康检查
- 实现无通知的测量执行

#### 步骤3: 更新模块配置
- 更新执行模块配置
- 添加设备实例服务

#### 步骤4: 编译测试
```bash
cd apps/backend
npm run build
npm test
```

### 2.5 验证清单
- [ ] 设备实例管理服务创建成功
- [ ] 设备连接、断开、健康检查正常
- [ ] 无通知的测量执行正常
- [ ] 编译无错误
- [ ] 现有功能不受影响

## 3. 阶段3.2：Python模板层重构 (2天)

### 3.1 目标
- 移除Python层所有`send_notification()`调用
- 保持Python层专注于测量逻辑
- 返回结构化的测量结果
- 为设备实例层提供干净的API

### 3.2 Python层当前状态分析

根据文档，Python层包含以下需要移除的通知调用:
- `python/zahner_device.py` - 包含`send_notification()`调用
- `python/main.py` - 需要添加统一测量端点

### 3.3 重构策略

#### 3.3.1 移除通知调用
**原则**: Python层只负责测量，不负责通知

**修改前**:
```python
# python/zahner_device.py
def send_notification(self, message: str, details: dict = None):
    """发送通知到WebSocket"""
    # 通知发送逻辑
    pass

def measure_impedance(self, parameters: dict):
    """测量阻抗"""
    # 发送测量开始通知
    self.send_notification("阻抗测量开始", {"type": "impedance_start"})

    try:
        # 执行测量
        result = self._perform_impedance_measurement(parameters)

        # 发送测量完成通知
        self.send_notification("阻抗测量完成", {"type": "impedance_complete", "result": result})

        return result
    except Exception as e:
        # 发送测量失败通知
        self.send_notification("阻抗测量失败", {"type": "impedance_failed", "error": str(e)})
        raise
```

**修改后**:
```python
# python/zahner_device.py
def measure_impedance(self, parameters: dict) -> dict:
    """测量阻抗并返回结构化结果"""
    try:
        # 执行测量
        result = self._perform_impedance_measurement(parameters)

        # 返回结构化结果
        return {
            "status": "success",
            "measurement_type": "impedance",
            "data": result,
            "timestamp": datetime.datetime.now().isoformat(),
            "parameters": parameters
        }
    except Exception as e:
        # 返回结构化错误结果
        return {
            "status": "error",
            "measurement_type": "impedance",
            "error": str(e),
            "timestamp": datetime.datetime.now().isoformat(),
            "parameters": parameters
        }
```

#### 3.3.2 添加统一测量端点
**修改 `python/main.py`**:
```python
# python/main.py
from fastapi import FastAPI, HTTPException
from zahner_device import ZahnerDevice
from pydantic import BaseModel

app = FastAPI(title="Zahner Device API", version="1.0.0")

device = ZahnerDevice()

class MeasurementRequest(BaseModel):
    type: str
    parameters: dict = {}

class MeasurementResponse(BaseModel):
    status: str
    measurement_type: str
    data: dict = None
    error: str = None
    timestamp: str
    parameters: dict

@app.post("/measure", response_model=MeasurementResponse)
async def measure(request: MeasurementRequest):
    """统一测量端点"""
    try:
        if request.type == "impedance":
            result = device.measure_impedance(request.parameters)
        elif request.type == "potentiostatic":
            result = device.measure_potentiostatic(request.parameters)
        elif request.type == "galvanostatic":
            result = device.measure_galvanostatic(request.parameters)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的测量类型: {request.type}")

        return MeasurementResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 3.4 实施步骤

#### 步骤1: 备份Python文件
```bash
# 备份现有Python文件
cp python/zahner_device.py python/zahner_device.py.backup
cp python/main.py python/main.py.backup
```

#### 步骤2: 重构zahner_device.py
- 移除所有`send_notification()`方法
- 修改测量方法返回结构化结果
- 保持测量逻辑不变

#### 步骤3: 重构main.py
- 添加统一测量端点
- 使用FastAPI替代Flask（如果需要）
- 添加健康检查端点

#### 步骤4: 测试Python服务
```bash
cd python
python -m pytest
python main.py
```

#### 步骤5: 验证API
```bash
# 测试健康检查
curl http://localhost:8000/health

# 测试测量端点
curl -X POST http://localhost:8000/measure \
  -H "Content-Type: application/json" \
  -d '{"type": "impedance", "parameters": {}}'
```

### 3.5 验证清单
- [ ] Python层移除所有通知调用
- [ ] 测量方法返回结构化结果
- [ ] 统一测量端点正常工作
- [ ] 健康检查端点正常工作
- [ ] Python服务启动正常
- [ ] API测试通过

## 4. 阶段3.3：设备服务重构 (2天)

### 4.1 目标
- 重构设备服务为纯设备操作
- 移除设备服务中的通知逻辑
- 集成设备实例管理
- 保持向后兼容性

### 4.2 重构策略

#### 4.2.1 当前设备服务问题
- 混合了设备操作和通知逻辑
- 直接调用通知适配器
- 缺少设备实例管理

#### 4.2.2 重构后的架构
```
旧架构:
ZahnerZenniumService → (设备操作 + 通知) → Python API

新架构:
ZahnerZenniumService → (纯设备操作) → 设备实例服务 → Python API
                     ↓
                事件总线 → 自动通知
```

### 4.3 修改文件

#### 文件1: `apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts`
**修改内容**:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { IZahnerZenniumModule, MeasurementResult, DeviceStatus, CalibrationResult, ModuleStatus } from '../../interfaces/module-interfaces';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';
import { ZahnerZenniumInstanceService } from '../../devices/zahner-zennium-instance.service';

@Injectable()
export class ZahnerZenniumService implements IZahnerZenniumModule, OnModuleInit, OnModuleDestroy {
  readonly name = 'zahner-zennium';
  readonly version = '2.4.0'; // 版本升级
  readonly dependencies = ['HttpModule'];

  private logger = new Logger(ZahnerZenniumService.name);
  private activeInstance: string | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly eventBus: SimpleEventBus,
    private readonly deviceInstanceService: ZahnerZenniumInstanceService,
  ) {}

  async onModuleInit() {
    this.logger.log('ZahnerZenniumService 初始化...');

    // 创建默认设备实例
    const defaultEndpoint = process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';
    const instance = this.deviceInstanceService.createZahnerInstance(defaultEndpoint);

    try {
      // 连接设备
      await this.deviceInstanceService.connect(instance.id);
      this.activeInstance = instance.id;

      this.logger.log(`Zahner设备连接成功: ${instance.id}`);
    } catch (error) {
      this.logger.error(`Zahner设备连接失败: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.activeInstance) {
      try {
        await this.deviceInstanceService.disconnect(this.activeInstance);
        this.logger.log('Zahner设备断开连接');
      } catch (error) {
        this.logger.error(`设备断开连接失败: ${error.message}`);
      }
    }
  }

  // 获取设备状态
  async getStatus(): Promise<DeviceStatus> {
    if (!this.activeInstance) {
      return {
        isConnected: false,
        isInitialized: false,
        lastActivity: new Date(),
        error: '设备未连接'
      };
    }

    const instance = this.deviceInstanceService.getInstance(this.activeInstance);
    if (!instance) {
      return {
        isConnected: false,
        isInitialized: false,
        lastActivity: new Date(),
        error: '设备实例不存在'
      };
    }

    const isHealthy = await this.deviceInstanceService.healthCheck(this.activeInstance);

    return {
      isConnected: instance.status === 'connected',
      isInitialized: isHealthy,
      lastActivity: instance.lastActivity,
      endpoint: instance.endpoint
    };
  }

  // 连接设备
  async connect(endpoint?: string): Promise<boolean> {
    const targetEndpoint = endpoint || process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000';

    // 如果已有活跃实例，先断开
    if (this.activeInstance) {
      await this.deviceInstanceService.disconnect(this.activeInstance);
    }

    // 创建新实例
    const instance = this.deviceInstanceService.createZahnerInstance(targetEndpoint);

    try {
      await this.deviceInstanceService.connect(instance.id);
      this.activeInstance = instance.id;

      // 发送设备连接事件
      this.eventBus.emit('device.connected', {
        deviceType: 'zahner-zennium',
        instanceId: instance.id,
        endpoint: targetEndpoint,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      return true;
    } catch (error) {
      this.logger.error(`设备连接失败: ${error.message}`);

      // 发送设备连接失败事件
      this.eventBus.emit('device.error', {
        deviceType: 'zahner-zennium',
        instanceId: instance.id,
        error: error.message,
        endpoint: targetEndpoint,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      return false;
    }
  }

  // 断开设备
  async disconnect(): Promise<boolean> {
    if (!this.activeInstance) {
      return true;
    }

    try {
      const instance = this.deviceInstanceService.getInstance(this.activeInstance);
      const endpoint = instance?.endpoint;

      await this.deviceInstanceService.disconnect(this.activeInstance);

      // 发送设备断开事件
      this.eventBus.emit('device.disconnected', {
        deviceType: 'zahner-zennium',
        instanceId: this.activeInstance,
        endpoint,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      this.activeInstance = null;
      return true;
    } catch (error) {
      this.logger.error(`设备断开失败: ${error.message}`);
      return false;
    }
  }

  // 执行测量（纯设备操作，无通知）
  async performMeasurement(measurementType: string, parameters: Record<string, any>): Promise<any> {
    if (!this.activeInstance) {
      throw new Error('设备未连接');
    }

    // 发送测量开始事件
    this.eventBus.emit('measurement.started', {
      instanceId: this.activeInstance,
      measurementType,
      parameters,
      timestamp: new Date(),
      context: { source: 'zahner-service' }
    });

    try {
      // 调用设备实例服务执行测量
      const result = await this.deviceInstanceService.executeMeasurement(
        this.activeInstance,
        measurementType,
        parameters
      );

      // 发送测量完成事件
      this.eventBus.emit('measurement.completed', {
        instanceId: this.activeInstance,
        measurementType,
        result,
        parameters,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      return result;
    } catch (error) {
      // 发送测量失败事件
      this.eventBus.emit('measurement.failed', {
        instanceId: this.activeInstance,
        measurementType,
        error: error.message,
        parameters,
        timestamp: new Date(),
        context: { source: 'zahner-service' }
      });

      throw error;
    }
  }

  // 保持向后兼容的方法
  async measureImpedance(parameters: Record<string, any>): Promise<MeasurementResult> {
    const result = await this.performMeasurement('impedance', parameters);

    return {
      success: result.status === 'success',
      data: result.data,
      timestamp: new Date(result.timestamp),
      measurementType: 'impedance'
    };
  }

  async calibrate(): Promise<CalibrationResult> {
    const result = await this.performMeasurement('calibration', {});

    return {
      success: result.status === 'success',
      data: result.data,
      timestamp: new Date(result.timestamp)
    };
  }

  // 获取模块状态
  async getModuleStatus(): Promise<ModuleStatus> {
    const deviceStatus = await this.getStatus();

    return {
      name: this.name,
      version: this.version,
      status: deviceStatus.isConnected ? 'running' : 'stopped',
      dependencies: this.dependencies,
      lastActivity: deviceStatus.lastActivity,
      health: deviceStatus.isConnected ? 'healthy' : 'unhealthy'
    };
  }
}
```

#### 文件2: `apps/backend/src/modules/zahner-zennium/zahner-zennium.module.ts`
**修改内容**:
```typescript
import { Module } from '@nestjs/common';
import { ZahnerZenniumService } from './zahner-zennium.service';
import { HttpModule } from '@nestjs/axios';
import { ZahnerZenniumInstanceService } from '../../devices/zahner-zennium-instance.service';
import { NotificationModule } from '../../notification/notification.module';

@Module({
  imports: [
    HttpModule,
    NotificationModule,
  ],
  providers: [
    ZahnerZenniumService,
    ZahnerZenniumInstanceService,
  ],
  exports: [
    ZahnerZenniumService,
    ZahnerZenniumInstanceService,
  ],
})
export class ZahnerZenniumModule {}
```

### 4.4 实施步骤

#### 步骤1: 备份现有文件
```bash
# 备份设备服务文件
cp apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts.backup
```

#### 步骤2: 重构设备服务
- 移除直接的通知调用
- 集成设备实例服务
- 保持向后兼容的接口

#### 步骤3: 更新模块配置
- 添加设备实例服务
- 更新依赖注入

#### 步骤4: 编译测试
```bash
cd apps/backend
npm run build
npm test
```

### 4.5 验证清单
- [ ] 设备服务移除直接通知调用
- [ ] 设备实例服务集成正常
- [ ] 向后兼容接口正常
- [ ] 编译无错误
- [ ] 现有功能不受影响

## 5. 阶段3.4：执行服务集成 (1-2天)

### 5.1 目标
- 集成新的设备实例架构
- 优化执行服务的设备操作
- 完善事件驱动的执行流程
- 确保与现有架构的兼容性

### 5.2 集成策略

#### 5.2.1 执行服务架构优化
```
旧架构:
ExecutionService → ZahnerZenniumService → (设备操作 + 通知)

新架构:
ExecutionService → ZahnerZenniumService → 设备实例服务 → Python API
               ↓
          事件总线 → 自动通知
```

### 5.3 修改文件

#### 文件1: `apps/backend/src/modules/execution/execution.service.ts`
**修改内容**:
```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { IExecutionModule, ExecutionResult, ExecutionStatus, ModuleStatus } from '../../interfaces/module-interfaces';
import { WorkflowService } from '../workflow/workflow.service';
import { ZahnerZenniumService } from '../zahner-zennium/zahner-zennium.service';
import { SimpleEventBus } from '../../notification/simple-event-bus.service';
import { ExecutionNotificationService } from './execution-notification.service';

@Injectable()
export class ExecutionService implements IExecutionModule, OnModuleInit {
  readonly name = 'execution';
  readonly version = '1.1.0'; // 版本升级
  readonly dependencies = [];

  protected executions = new Map<string, ExecutionStatus>();
  private executionCounter = 0;
  protected logger = new Logger(ExecutionService.name);

  constructor(
    protected readonly zahnerService: ZahnerZenniumService,
    protected readonly workflowService: WorkflowService,
    protected readonly eventBus: SimpleEventBus,
    protected readonly executionNotificationService: ExecutionNotificationService,
  ) {}

  async onModuleInit() {
    // 事件驱动架构：发送模块初始化事件
    this.eventBus.emit('module.initialized', {
      moduleName: 'execution',
      version: this.version,
      timestamp: new Date()
    });
  }

  async executeWorkflow(workflowId: string): Promise<ExecutionResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    // 创建执行状态
    const executionStatus: ExecutionStatus = {
      executionId,
      workflowId,
      status: 'pending',
      currentNode: '',
      completedNodes: [],
      startTime: new Date(),
      progress: 0,
    };

    this.executions.set(executionId, executionStatus);

    // 发送执行开始通知
    this.executionNotificationService.sendExecutionStartNotification(executionId, workflowId);

    // 事件驱动架构：发送工作流开始事件
    this.eventBus.emit('workflow.started', {
      executionId,
      workflowId,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });

    try {
      // 获取工作流定义
      const workflow = await this.workflowService.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`工作流不存在: ${workflowId}`);
      }

      // 执行工作流节点
      for (const node of workflow.nodes) {
        await this.executeNode(executionId, node);
        executionStatus.completedNodes.push(node.id);
        executionStatus.progress = (executionStatus.completedNodes.length / workflow.nodes.length) * 100;
      }

      // 工作流执行完成
      executionStatus.status = 'completed';
      const duration = Date.now() - startTime;

      // 发送执行完成通知
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, true, duration);

      // 事件驱动架构：发送工作流完成事件
      this.eventBus.emit('workflow.completed', {
        executionId,
        workflowId,
        success: true,
        duration,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      return {
        executionId,
        success: true,
        duration,
        completedNodes: executionStatus.completedNodes,
        timestamp: new Date(),
      };
    } catch (error) {
      // 工作流执行失败
      executionStatus.status = 'failed';
      const duration = Date.now() - startTime;

      // 发送执行失败通知
      this.executionNotificationService.sendExecutionCompleteNotification(executionId, false, duration);

      // 事件驱动架构：发送工作流失败事件
      this.eventBus.emit('workflow.failed', {
        executionId,
        workflowId,
        error: error.message,
        duration,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      return {
        executionId,
        success: false,
        duration,
        error: error.message,
        completedNodes: executionStatus.completedNodes,
        timestamp: new Date(),
      };
    }
  }

  private async executeNode(executionId: string, node: any): Promise<void> {
    const nodeId = node.id;
    const nodeType = node.type;

    // 更新当前节点
    const executionStatus = this.executions.get(executionId);
    if (executionStatus) {
      executionStatus.currentNode = nodeId;
    }

    // 事件驱动架构：发送节点开始事件
    this.eventBus.emit('node.started', {
      executionId,
      nodeId,
      nodeType,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });

    try {
      // 执行节点操作
      switch (nodeType) {
        case 'measurement':
          await this.executeMeasurementNode(executionId, node);
          break;
        case 'delay':
          await this.executeDelayNode(executionId, node);
          break;
        default:
          throw new Error(`不支持的节点类型: ${nodeType}`);
      }

      // 事件驱动架构：发送节点完成事件
      this.eventBus.emit('node.completed', {
        executionId,
        nodeId,
        nodeType,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });
    } catch (error) {
      // 事件驱动架构：发送节点失败事件
      this.eventBus.emit('node.failed', {
        executionId,
        nodeId,
        nodeType,
        error: error.message,
        timestamp: new Date(),
        context: { source: 'execution-service' }
      });

      throw error;
    }
  }

  private async executeMeasurementNode(executionId: string, node: any): Promise<void> {
    const measurementType = node.parameters.measurementType;
    const parameters = node.parameters;

    // 使用新的设备服务架构执行测量
    const result = await this.zahnerService.performMeasurement(measurementType, parameters);

    // 发送测量完成事件
    this.eventBus.emit('measurement.completed', {
      executionId,
      nodeId: node.id,
      measurementType,
      result,
      parameters,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });
  }

  private async executeDelayNode(executionId: string, node: any): Promise<void> {
    const delayMs = node.parameters.duration || 1000;

    // 发送延迟开始事件
    this.eventBus.emit('delay.started', {
      executionId,
      nodeId: node.id,
      duration: delayMs,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });

    // 执行延迟
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // 发送延迟完成事件
    this.eventBus.emit('delay.completed', {
      executionId,
      nodeId: node.id,
      duration: delayMs,
      timestamp: new Date(),
      context: { source: 'execution-service' }
    });
  }

  // 其他现有方法保持不变...
}
```

### 5.4 实施步骤

#### 步骤1: 备份执行服务文件
```bash
# 备份执行服务文件
cp apps/backend/src/modules/execution/execution.service.ts apps/backend/src/modules/execution/execution.service.ts.backup
```

#### 步骤2: 集成执行通知服务
- 添加执行通知服务注入
- 修改通知发送逻辑

#### 步骤3: 优化设备操作
- 使用新的设备服务架构
- 集成设备实例管理

#### 步骤4: 编译测试
```bash
cd apps/backend
npm run build
npm test
```

### 5.5 验证清单
- [ ] 执行服务集成新架构正常
- [ ] 设备操作使用新架构
- [ ] 通知服务集成正常
- [ ] 编译无错误
- [ ] 现有功能不受影响

## 6. 阶段3.5：清理优化 (1天)

### 6.1 目标
- 清理冗余代码和备份文件
- 优化架构层级和代码质量
- 更新文档和测试
- 完成架构重构

### 6.2 清理内容

#### 6.2.1 文件清理
**备份文件清理**:
- `apps/backend/src/modules/execution/execution.service.ts.backup`
- `apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts.backup`
- Python层的备份文件（如果存在）

**临时文件清理**:
- 开发过程中产生的临时文件
- 测试输出文件
- 编译产物

#### 6.2.2 代码优化
**导入语句优化**:
- 清理未使用的导入语句
- 统一导入顺序和格式
- 移除过时的类型导入

**错误处理优化**:
- 统一错误处理模式
- 完善异常信息
- 添加错误恢复机制

**日志记录优化**:
- 统一日志格式
- 优化日志级别
- 添加关键操作日志

#### 6.2.3 架构验证
**性能测试**:
- 设备操作响应时间测试
- 事件处理延迟测试
- 并发处理能力测试

**内存泄漏检查**:
- 事件总线内存泄漏检查
- 设备实例管理内存检查
- 长时间运行稳定性测试

**并发测试**:
- 多设备实例并发操作测试
- 高并发事件处理测试
- 资源竞争测试

#### 6.2.4 文档更新
**API文档更新**:
- 更新所有API端点文档
- 添加新架构的使用说明
- 更新请求/响应示例

**架构文档更新**:
- 更新架构图和说明
- 添加模板-实例分离说明
- 更新部署和配置文档

**部署文档更新**:
- 更新安装步骤
- 更新配置说明
- 更新故障排除指南

### 6.3 实施步骤

#### 步骤1: 文件清理 (2小时)
```bash
# 删除备份文件
rm -f apps/backend/src/modules/execution/execution.service.ts.backup
rm -f apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts.backup

# 清理Python备份文件（如果存在）
rm -f apps/backend/scripts/zahner_device.py.backup
rm -f apps/backend/scripts/main.py.backup

# 清理编译产物
rm -rf apps/backend/dist/
rm -rf node_modules/.cache/
```

#### 步骤2: 代码优化 (3小时)
**清理未使用的导入**:
- 检查所有TypeScript文件的导入语句
- 移除未使用的导入
- 统一导入格式

**统一错误处理**:
- 检查所有服务类的错误处理
- 统一异常抛出格式
- 完善错误信息

**优化日志记录**:
- 检查所有服务的日志记录
- 统一日志格式
- 优化日志级别

#### 步骤3: 架构验证 (2小时)
**性能测试**:
```bash
# 性能测试
cd apps/backend
npm run test:performance

# 内存泄漏检查
npm run test:memory

# 并发测试
npm run test:concurrency
```

**功能验证**:
- 端到端测试
- 集成测试
- 回归测试

#### 步骤4: 文档更新 (2小时)
**更新架构文档**:
- 更新 `architecture-optimization-plan.md`
- 更新 `SUMMARY.md`
- 创建架构变更日志

**更新API文档**:
- 更新所有API文档
- 添加新架构示例
- 更新配置说明

#### 步骤5: 最终验证 (1小时)
```bash
# 最终构建和测试
cd apps/backend
npm run build
npm test
npm run test:integration
npm run test:e2e
```

### 6.4 验证清单

#### 6.4.1 文件清理验证
- [ ] 所有备份文件已删除
- [ ] 临时文件已清理
- [ ] 编译产物已清理

#### 6.4.2 代码质量验证
- [ ] 未使用的导入已清理
- [ ] 错误处理已统一
- [ ] 日志记录已优化
- [ ] 代码格式一致

#### 6.4.3 架构验证
- [ ] 性能测试通过
- [ ] 内存泄漏检查通过
- [ ] 并发测试通过
- [ ] 功能测试通过

#### 6.4.4 文档验证
- [ ] 架构文档已更新
- [ ] API文档已更新
- [ ] 部署文档已更新
- [ ] 变更日志已创建

#### 6.4.5 最终验证
- [ ] 构建成功
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 端到端测试通过
- [ ] 部署就绪

### 6.5 风险控制

#### 6.5.1 回退方案
**快速回退**:
```bash
# 如果发现问题，使用git回退
git checkout HEAD~1 -- apps/backend/src/modules/execution/
git checkout HEAD~1 -- apps/backend/src/modules/zahner-zennium/
git checkout HEAD~1 -- apps/backend/src/devices/
git checkout HEAD~1 -- apps/backend/scripts/
```

**部分回退**:
- 可以单独回退某个服务的更改
- 可以保留设备实例层，只回退业务逻辑层

#### 6.5.2 监控要点
- 构建成功率
- 测试通过率
- 性能指标
- 错误率

### 6.6 成功标准

#### 6.6.1 清理标准
- [ ] 冗余文件完全清理
- [ ] 代码质量显著提升
- [ ] 文档完整更新
- [ ] 架构重构完成

#### 6.6.2 质量标准
- [ ] 所有测试通过
- [ ] 性能指标达标
- [ ] 无内存泄漏
- [ ] 并发处理正常

#### 6.6.3 文档标准
- [ ] 架构文档清晰
- [ ] API文档完整
- [ ] 部署文档准确
- [ ] 变更日志详细

## 7. 风险控制

### 7.1 风险等级评估
- **阶段3.1**: 零风险 - 只添加新代码，不修改现有代码
- **阶段3.2**: 低风险 - 只修改Python层，不影响Node.js层
- **阶段3.3**: 低风险 - 重构设备服务，保持向后兼容
- **阶段3.4**: 中风险 - 集成新架构到执行服务
- **阶段3.5**: 中风险 - 清理冗余代码

### 7.2 回退方案

#### 7.2.1 每个阶段的回退策略
```bash
# 阶段3.1回退 - 删除设备实例文件
rm -rf apps/backend/src/devices/
rm apps/backend/src/modules/execution/execution-notification.service.ts

# 阶段3.2回退 - 恢复Python文件
cp python/zahner_device.py.backup python/zahner_device.py
cp python/main.py.backup python/main.py

# 阶段3.3回退 - 恢复设备服务
cp apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts.backup apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts

# 阶段3.4回退 - 恢复执行服务
cp apps/backend/src/modules/execution/execution.service.ts.backup apps/backend/src/modules/execution/execution.service.ts

# 阶段3.5回退 - 使用git恢复
git checkout apps/backend/src/modules/execution/
git checkout apps/backend/src/modules/zahner-zennium/
```

#### 7.2.2 快速回退脚本
创建回退脚本 `rollback-architecture.sh`:
```bash
#!/bin/bash
echo "开始回退架构重构..."

# 删除设备实例文件
rm -rf apps/backend/src/devices/
rm apps/backend/src/modules/execution/execution-notification.service.ts

# 恢复Python文件
if [ -f "python/zahner_device.py.backup" ]; then
    cp python/zahner_device.py.backup python/zahner_device.py
fi
if [ -f "python/main.py.backup" ]; then
    cp python/main.py.backup python/main.py
fi

# 恢复服务文件
git checkout apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts
git checkout apps/backend/src/modules/execution/execution.service.ts
git checkout apps/backend/src/modules/execution/execution.module.ts

echo "架构重构回退完成"
```

### 7.3 监控要点

#### 7.3.1 功能监控
- Python服务正常工作
- 设备实例管理正常
- 事件驱动架构正常
- 业务逻辑执行正常

#### 7.3.2 性能监控
- 设备操作响应时间
- 事件处理延迟
- 内存使用情况
- 系统响应时间

#### 7.3.3 错误监控
- Python服务错误
- 设备连接失败
- 测量执行失败
- 系统异常

## 8. 成功标准

### 8.1 功能标准
- [ ] 所有现有功能保持不变
- [ ] Python层专注测量，无通知调用
- [ ] 设备实例管理正常工作
- [ ] 模板-实例分离架构清晰
- [ ] 事件驱动架构正常工作
- [ ] 一个事件源触发多个响应

### 8.2 性能标准
- [ ] 设备操作响应时间 < 1s
- [ ] 事件处理延迟 < 10ms
- [ ] 系统响应时间无显著下降
- [ ] 内存使用合理
- [ ] 并发处理能力保持

### 8.3 架构标准
- [ ] 模板-实例分离实现
- [ ] Python层简洁明了
- [ ] Node.js层功能完整
- [ ] 事件驱动架构清晰
- [ ] 扩展性提升
- [ ] 维护性改善

---

## 9. 阶段3.1-3.4实施记录

### 9.1 已完成的更改

#### 9.1.1 阶段3.1：设备实例层建设（已完成）
**新增文件**:
- `apps/backend/src/devices/base-device.service.ts` - 设备实例管理基类
- `apps/backend/src/devices/zahner-zennium-instance.service.ts` - ZahnerZennium设备实例服务
- `apps/backend/src/modules/execution/execution-notification.service.ts` - 执行通知服务

**修改文件**:
- `apps/backend/src/modules/execution/execution.module.ts` - 添加新服务到模块配置

**实施内容**:
- 创建了设备实例管理基础设施
- 实现了设备状态管理和事件驱动通知
- 建立了模板-实例分离的基础架构

#### 9.1.2 阶段3.2：Python模板层重构（已完成）
**修改文件**:
- `apps/backend/scripts/zahner_device.py` - 移除所有`send_notification()`调用
- 添加统一测量端点，返回结构化结果

**实施内容**:
- Python层专注测量逻辑，不再负责通知
- 返回结构化的测量结果供Node.js层处理
- 实现了模板-实例分离的Python端

#### 9.1.3 阶段3.3：设备服务重构（已完成）
**修改文件**:
- `apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts` - 完全重构为事件驱动架构

**实施内容**:
- 移除直接通知调用，改为事件驱动
- 集成设备实例管理服务
- 保持向后兼容性，版本从1.0.0升级到2.4.0

#### 9.1.4 阶段3.4：执行服务集成（已完成）
**修改文件**:
- `apps/backend/src/modules/execution/execution.service.ts` - 集成新架构和通知服务

**实施内容**:
- 集成ExecutionNotificationService
- 使用新的设备服务架构
- 完善事件驱动的执行流程
- 版本从1.0.0升级到1.1.0

### 9.2 被替代的功能

#### 9.2.1 通知机制
**旧架构**: Python层直接调用`send_notification()` → WebSocket
**新架构**: Python层返回结构化结果 → Node.js层事件总线 → 自动通知

#### 9.2.2 设备管理
**旧架构**: ZahnerZenniumService直接管理单个设备连接
**新架构**: ZahnerZenniumInstanceService管理多个设备实例，支持多实例并发

#### 9.2.3 测量执行
**旧架构**: 设备服务混合了设备操作和通知逻辑
**新架构**: 设备服务专注纯设备操作，通知通过事件总线自动处理

### 9.3 待清理内容（阶段3.5目标）

#### 9.3.1 文件清理
- **备份文件清理**:
  - `apps/backend/src/modules/execution/execution.service.ts.backup`
  - `apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts.backup`
  - Python层的备份文件（如果存在）

#### 9.3.2 代码优化
- **导入语句优化**: 清理未使用的导入
- **错误处理优化**: 统一错误处理模式
- **日志记录优化**: 改进日志记录的详细程度和格式

#### 9.3.3 架构验证
- **性能测试**: 验证新架构的性能表现
- **内存泄漏检查**: 确保事件驱动架构没有内存泄漏
- **并发测试**: 验证多设备实例并发操作的正确性

#### 9.3.4 文档更新
- **API文档更新**: 更新所有相关的API文档
- **架构文档更新**: 更新架构图和说明
- **部署文档更新**: 更新部署和配置说明

### 9.4 实施验证结果

#### 9.4.1 功能验证
- ✅ Python层移除所有通知调用
- ✅ 设备实例管理正常工作
- ✅ 事件驱动架构正常运行
- ✅ 向后兼容性保持完整
- ✅ 编译无错误

#### 9.4.2 架构验证
- ✅ 模板-实例分离架构实现
- ✅ 事件驱动架构正常运行
- ✅ 设备实例管理支持多实例
- ✅ 系统模块化和可扩展性提升

#### 9.4.3 阶段3.5清理验证（已完成）
- ✅ 所有备份文件已删除（6个文件）
- ✅ 编译产物已清理
- ✅ 代码质量优化完成
- ✅ 应用程序启动正常
- ✅ 事件驱动架构验证通过
- ✅ Python API接口正常
- ✅ 文档完整更新（创建ARCHITECTURE_CHANGELOG.md）
- ✅ 架构重构完全结束

---

**架构重构完成标志**: Python层专注测量逻辑，Node.js层处理设备实例和通知，模板-实例分离架构清晰，系统更加模块化和可扩展。

**重要提醒**: 本阶段（第三阶段）必须在事件驱动架构重构（第二阶段）完成后执行。