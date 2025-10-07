# 简化执行统一通知分发架构方案

## 文档信息
- **创建日期**: 2025-09-22
- **版本**: 2.0.0
- **目标**: 基于KISS原则的统一通知分发，解决通知重复问题
- **文件夹**: `@doc/execution/`

## 1. 架构概述

### 1.1 核心问题
- **通知重复**: 执行服务、设备服务、Python层都发送通知
- **用户体验差**: 同一操作收到10条重复通知
- **维护困难**: 通知逻辑分散在多个层级
- **职责混乱**: 设备层承担了通知分发职责

### 1.2 简化解决方案

**核心思路：** 保持现有代码结构，只移除冗余通知调用

```
简化后架构：
执行服务 (统一通知中心)
├── ExecutionNotificationService
├── 统一工作流通知
├── 统一节点通知
└── 统一测量结果通知

设备服务 (纯设备操作)
├── 移除NotificationService依赖
├── 专注设备连接和命令执行
└── 返回结构化结果

Python FastAPI层 (保持单文件)
├── 保持zahner_device.py单文件结构
├── 移除send_notification()调用
└── 返回统一结构化结果
```

### 1.3 KISS原则优先
- **最小改动**: 只修改通知相关代码
- **保持结构**: 维持现有文件组织方式
- **清晰职责**: 每层只做自己的事
- **统一出口**: 执行服务作为唯一通知源

## 2. 当前问题分析

### 2.1 重复通知问题

**用户当前体验：**
```
执行一个EIS测量，用户收到10条通知：
1. 执行服务: "工作流开始执行"
2. 执行服务: "执行节点 zahner_connect"
3. 设备服务: "FastAPI设备服务连接成功"
4. Python层: "设备连接完成" (send_notification)
5. 执行服务: "节点 zahner_connect 执行成功"
6. 执行服务: "执行节点 eis_potentiostatic"
7. Python层: "EIS测量开始" (send_notification)
8. Python层: "EIS测量完成" (send_notification)
9. 执行服务: "节点 eis_potentiostatic 执行成功"
10. 执行服务: "工作流执行完成"
```

### 2.2 问题根源分析

**通知发送点：**
- **执行服务** (execution.service.ts): 工作流和节点通知
- **设备服务** (zahner-zennium.service.ts): 设备连接和错误通知
- **Python层** (zahner_device.py): 测量开始/完成通知 (send_notification)

**重复原因：**
- 同一操作在多个层级都发送通知
- 缺乏统一的通知分发机制
- 职责边界不清晰

## 3. 简化解决方案

### 3.1 核心策略

**策略：** 保持现有架构，只移除冗余通知调用

| 层级 | 当前行为 | 修改后行为 |
|------|----------|------------|
| 执行服务 | 发送工作流和节点通知 | 保留，作为统一通知中心 |
| 设备服务 | 发送设备连接通知 | 移除通知调用，专注设备操作 |
| Python层 | 发送测量过程通知 | 移除send_notification，返回结构化结果 |

### 3.2 预期效果

**修改后用户体验：**
```
执行同一个EIS测量，用户只收到3条精简通知：
1. 执行服务: "工作流开始执行"
2. 执行服务: "节点 eis_potentiostatic 执行完成 (包含测量结果)"
3. 执行服务: "工作流执行完成"
```

## 4. 核心修改点

### 4.1 Python层修改 (zahner_device.py)

**修改前：**
```python
async def measure_eis_potentiostatic(self, measurement_id: str, params: dict):
    result = await self.device_manager.execute_eis(params)

    # 问题：直接发送通知
    send_notification(
        measurement_id=measurement_id,
        status="completed",
        data=result
    )

    return {"success": True, "data": result}
```

**修改后：**
```python
async def measure_eis_potentiostatic(self, measurement_id: str, params: dict):
    start_time = time.time()

    try:
        result = await self.device_manager.execute_eis(params)

        # 移除通知调用，只返回结构化结果
        return {
            "measurement_id": measurement_id,
            "success": True,
            "data": result,
            "duration": int((time.time() - start_time) * 1000),
            "timestamp": time.time(),
            "status": "completed"
        }
    except Exception as e:
        return {
            "measurement_id": measurement_id,
            "success": False,
            "error": str(e),
            "duration": int((time.time() - start_time) * 1000),
            "timestamp": time.time(),
            "status": "failed"
        }
```

### 4.2 设备服务修改 (zahner-zennium.service.ts)

**修改前：**
```typescript
constructor(
  private readonly httpService: HttpService,
  @Inject(forwardRef(() => NotificationService))
  private readonly notificationService: NotificationService
) {}

async connect(): Promise<void> {
  // ... 连接逻辑
  this.notificationService.notifyDevice('FastAPI设备服务连接成功', `Endpoint: ${this.baseUrl}`);
}
```

**修改后：**
```typescript
constructor(
  private readonly httpService: HttpService,
  // 移除 NotificationService 依赖
) {}

async connect(): Promise<DeviceConnectionResult> {
  // ... 连接逻辑
  // 移除通知调用，只记录日志
  this.logger.log('设备连接成功');

  return {
    success: true,
    endpoint: this.baseUrl,
    status: 'connected',
    timestamp: new Date().toISOString()
  };
}
```

### 4.3 执行服务统一通知

**新增 ExecutionNotificationService：**
```typescript
@Injectable()
export class ExecutionNotificationService {
  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  // 统一处理测量结果通知
  notifyMeasurementResult(measurementId: string, result: any): void {
    if (result.success) {
      this.notificationService.notifyOperation(
        `测量完成: ${measurementId}`,
        `状态: 成功, 耗时: ${result.duration}ms`
      );
    } else {
      this.notificationService.notifyError(
        `测量失败: ${measurementId}`,
        result.error
      );
    }
  }
}
```
```
ExecutionService
├── notifyOperation("Workflow started")
├── 调用 ZahnerService
│   ├── notifyDevice("Device connected")
│   └── 调用 FastAPI
│       ├── send_notification("Measurement started")
│       └── send_notification("Measurement completed")
└── notifyOperation("Workflow completed")
```

### 2.2 问题识别
1. **重复通知**: 用户收到4个通知同一测量操作
2. **职责混乱**: 设备层处理UI通知
3. **状态不一致**: 不同层的状态可能不同步
4. **维护困难**: 通知逻辑分散在多个层级

## 3. 目标架构设计

### 3.1 统一通知分发器
```typescript
// apps/backend/src/modules/execution/execution-notification.service.ts
@Injectable()
export class ExecutionNotificationService {
  private readonly logger = new Logger(ExecutionNotificationService.name);

  constructor(
    private readonly notificationAdapter: NotificationAdapter,
    private readonly eventBus: SimpleEventBus,
  ) {}

  /**
   * 工作流级别通知
   */
  notifyWorkflow(event: WorkflowEvent, details: any): void {
    const message = this.buildWorkflowMessage(event, details);
    this.notificationAdapter.notifyWorkflow(message, details);

    // 发送到事件总线供其他处理器使用
    this.eventBus.emit('workflow.event', { event, details, timestamp: Date.now() });
  }

  /**
   * 节点级别通知
   */
  notifyNode(event: NodeEvent, nodeId: string, details: any): void {
    const message = this.buildNodeMessage(event, nodeId, details);
    this.notificationAdapter.notifyOperation(message, details);

    this.eventBus.emit('node.event', { event, nodeId, details, timestamp: Date.now() });
  }

  /**
   * 设备状态聚合通知
   */
  notifyDeviceStatus(deviceId: string, status: DeviceStatus, context: any): void {
    const message = this.buildDeviceStatusMessage(deviceId, status, context);
    this.notificationAdapter.notifyDevice(message, JSON.stringify(context));

    this.eventBus.emit('device.status.changed', { deviceId, status, context });
  }

  /**
   * 测量执行统一通知
   */
  notifyMeasurement(measurementId: string, event: MeasurementEvent, result: any): void {
    const message = this.buildMeasurementMessage(measurementId, event, result);
    const details = {
      measurementId,
      event,
      result,
      timestamp: new Date().toISOString()
    };

    switch (event) {
      case MeasurementEvent.STARTED:
        this.notificationAdapter.notifyExecutionStart(
          measurementId,
          'measurement',
          `测量 ${measurementId} 开始执行`
        );
        break;
      case MeasurementEvent.PROGRESS:
        this.notificationAdapter.notifyExecutionDetail(
          `测量 ${measurementId} 进行中`,
          `进度: ${result.progress}%, 当前阶段: ${result.phase}`
        );
        break;
      case MeasurementEvent.COMPLETED:
        this.notificationAdapter.notifyExecutionComplete(
          measurementId,
          true,
          result.duration,
          `测量 ${measurementId} 成功完成`
        );
        break;
      case MeasurementEvent.FAILED:
        this.notificationAdapter.notifyExecutionComplete(
          measurementId,
          false,
          result.duration,
          `测量 ${measurementId} 失败: ${result.error}`
        );
        break;
    }

    this.eventBus.emit('measurement.event', { measurementId, event, result });
  }

  // 私有方法：构建各种通知消息
  private buildWorkflowMessage(event: WorkflowEvent, details: any): string {
    const eventMap = {
      [WorkflowEvent.STARTED]: `工作流 ${details.workflowId} 开始执行`,
      [WorkflowEvent.COMPLETED]: `工作流 ${details.workflowId} 执行完成`,
      [WorkflowEvent.FAILED]: `工作流 ${details.workflowId} 执行失败`,
      [WorkflowEvent.PAUSED]: `工作流 ${details.workflowId} 已暂停`,
      [WorkflowEvent.CANCELLED]: `工作流 ${details.workflowId} 已取消`
    };
    return eventMap[event] || `工作流 ${details.workflowId} 状态变更`;
  }

  private buildNodeMessage(event: NodeEvent, nodeId: string, details: any): string {
    const eventMap = {
      [NodeEvent.STARTED]: `节点 ${nodeId} 开始执行`,
      [NodeEvent.COMPLETED]: `节点 ${nodeId} 执行完成`,
      [NodeEvent.FAILED]: `节点 ${nodeId} 执行失败`,
      [NodeEvent.SKIPPED]: `节点 ${nodeId} 已跳过`
    };
    return eventMap[event] || `节点 ${nodeId} 状态变更`;
  }

  private buildDeviceStatusMessage(deviceId: string, status: DeviceStatus, context: any): string {
    const statusMap = {
      [DeviceStatus.CONNECTED]: `设备 ${deviceId} 连接成功`,
      [DeviceStatus.DISCONNECTED]: `设备 ${deviceId} 连接断开`,
      [DeviceStatus.BUSY]: `设备 ${deviceId} 正在执行测量`,
      [DeviceStatus.ERROR]: `设备 ${deviceId} 发生错误`,
      [DeviceStatus.READY]: `设备 ${deviceId} 准备就绪`
    };
    return statusMap[status] || `设备 ${deviceId} 状态变更`;
  }

  private buildMeasurementMessage(measurementId: string, event: MeasurementEvent, result: any): string {
    const eventMap = {
      [MeasurementEvent.STARTED]: `测量 ${measurementId} 开始执行`,
      [MeasurementEvent.PROGRESS]: `测量 ${measurementId} 执行进度更新`,
      [MeasurementEvent.COMPLETED]: `测量 ${measurementId} 执行完成`,
      [MeasurementEvent.FAILED]: `测量 ${measurementId} 执行失败`
    };
    return eventMap[event] || `测量 ${measurementId} 状态变更`;
  }
}

// 事件枚举定义
export enum WorkflowEvent {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

export enum NodeEvent {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export enum DeviceStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  BUSY = 'busy',
  ERROR = 'error',
  READY = 'ready'
}

export enum MeasurementEvent {
  STARTED = 'started',
  PROGRESS = 'progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
```

### 3.2 设备服务纯化
```typescript
// apps/backend/src/modules/zahner-zennium/zahner-zennium-pure.service.ts
@Injectable()
export class ZahnerZenniumPureService {
  private readonly logger = new Logger(ZahnerZenniumPureService.name);
  private deviceStatus: DeviceStatus = DeviceStatus.DISCONNECTED;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 设备连接管理 - 无UI通知
   */
  async connect(): Promise<DeviceConnectionResult> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/health`,
        { timeout: 5000 }
      );

      this.deviceStatus = DeviceStatus.CONNECTED;

      // 本地日志记录，不发送UI通知
      this.logger.log(`设备连接成功: ${this.baseUrl}`);

      return {
        success: true,
        endpoint: this.baseUrl,
        status: response?.status || 'unknown',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.deviceStatus = DeviceStatus.ERROR;
      this.logger.error(`设备连接失败: ${error.message}`);

      return {
        success: false,
        endpoint: this.baseUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 执行测量 - 返回详细结果，不发送通知
   */
  async executeMeasurement(measurement: MeasurementCommand): Promise<MeasurementResult> {
    try {
      this.deviceStatus = DeviceStatus.BUSY;
      const startTime = Date.now();

      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/measurements`,
        measurement,
        { timeout: measurement.timeout || 300000 }
      );

      const result: MeasurementResult = {
        success: true,
        measurementId: measurement.id,
        data: response.data,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: MeasurementEvent.COMPLETED
      };

      this.deviceStatus = DeviceStatus.READY;
      return result;
    } catch (error) {
      this.deviceStatus = DeviceStatus.ERROR;

      const result: MeasurementResult = {
        success: false,
        measurementId: measurement.id,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        status: MeasurementEvent.FAILED
      };

      return result;
    }
  }

  /**
   * 获取设备状态
   */
  getDeviceStatus(): DeviceStatus {
    return this.deviceStatus;
  }

  /**
   * 获取设备能力
   */
  async getCapabilities(): Promise<DeviceCapabilities> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/capabilities`,
        { timeout: 10000 }
      );

      return {
        supportedMeasurements: response.data.supportedMeasurements || [],
        features: response.data.features || [],
        maxConcurrentMeasurements: response.data.maxConcurrentMeasurements || 1
      };
    } catch (error) {
      this.logger.error(`获取设备能力失败: ${error.message}`);
      return {
        supportedMeasurements: [],
        features: [],
        maxConcurrentMeasurements: 1
      };
    }
  }

  // 设备状态管理
  private updateDeviceStatus(status: DeviceStatus, context?: any): void {
    this.deviceStatus = status;
    this.logger.log(`设备状态变更: ${status}`, context);
  }
}

// 类型定义
export interface DeviceConnectionResult {
  success: boolean;
  endpoint: string;
  status?: string;
  error?: string;
  timestamp: string;
}

export interface MeasurementCommand {
  id: string;
  type: string;
  parameters: any;
  timeout?: number;
}

export interface MeasurementResult {
  success: boolean;
  measurementId: string;
  data?: any;
  error?: string;
  duration: number;
  timestamp: string;
  status: MeasurementEvent;
}

export interface DeviceCapabilities {
  supportedMeasurements: string[];
  features: string[];
  maxConcurrentMeasurements: number;
}
```

### 3.3 Python模板层重构
```python
# main.py - 移除send_notification，返回结构化状态
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging
import time

app = FastAPI(title="ZahnerFlow Device API")

# 日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MeasurementRequest(BaseModel):
    id: str
    type: str
    parameters: Dict[str, Any]

class MeasurementResponse(BaseModel):
    success: bool
    measurement_id: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration: int
    timestamp: str
    status: str
    progress: Optional[Dict[str, Any]] = None

class DeviceHealth(BaseModel):
    status: str
    uptime: int
    active_measurements: int
    capabilities: Dict[str, Any]

# 移除send_notification函数，改为返回结构化响应
@app.post("/measurements")
async def execute_measurement(request: MeasurementRequest):
    """执行测量并返回结构化结果，不发送通知"""
    start_time = time.time()
    measurement_id = request.id

    try:
        logger.info(f"开始执行测量: {measurement_id}")

        # 模拟测量执行过程
        result = await perform_measurement(request.type, request.parameters)

        duration = int((time.time() - start_time) * 1000)

        response = MeasurementResponse(
            success=True,
            measurement_id=measurement_id,
            data=result,
            duration=duration,
            timestamp=time.time(),
            status="completed",
            progress={
                "percentage": 100,
                "phase": "completed",
                "current_step": "测量完成"
            }
        )

        logger.info(f"测量完成: {measurement_id}, 耗时: {duration}ms")
        return response

    except Exception as e:
        duration = int((time.time() - start_time) * 1000)

        response = MeasurementResponse(
            success=False,
            measurement_id=measurement_id,
            error=str(e),
            duration=duration,
            timestamp=time.time(),
            status="failed",
            progress={
                "percentage": 0,
                "phase": "failed",
                "current_step": "测量失败"
            }
        )

        logger.error(f"测量失败: {measurement_id}, 错误: {str(e)}")
        return response

@app.get("/health")
async def get_health():
    """获取设备健康状态"""
    return DeviceHealth(
        status="healthy",
        uptime=int(time.time()),
        active_measurements=0,
        capabilities={
            "supported_measurements": ["eis", "ocp", "cv"],
            "max_concurrent": 1,
            "features": ["real_time_monitoring", "data_export"]
        }
    )

@app.get("/capabilities")
async def get_capabilities():
    """获取设备能力"""
    return {
        "supported_measurements": ["eis", "ocp", "cv", "chronoamperometry"],
        "features": [
            "real_time_progress",
            "error_recovery",
            "data_validation",
            "temperature_compensation"
        ],
        "max_concurrent_measurements": 1,
        "precision": {
            "voltage": "±1mV",
            "current": "±1pA",
            "frequency": "±0.1%"
        }
    }

async def perform_measurement(measurement_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """执行具体的测量逻辑"""
    # 这里实现具体的测量算法
    await asyncio.sleep(2)  # 模拟测量时间

    if measurement_type == "eis":
        return {
            "type": "eis",
            "frequency_range": parameters.get("frequency_range", [1, 1000000]),
            "amplitude": parameters.get("amplitude", 0.01),
            "impedance_data": generate_impedance_data(parameters),
            "quality_metrics": calculate_quality_metrics()
        }
    elif measurement_type == "ocp":
        return {
            "type": "ocp",
            "duration": parameters.get("duration", 60),
            "sampling_rate": parameters.get("sampling_rate", 10),
            "potential_data": generate_potential_data(parameters),
            "stability_metrics": calculate_stability_metrics()
        }
    else:
        raise ValueError(f"不支持的测量类型: {measurement_type}")

# 辅助函数
def generate_impedance_data(parameters: Dict[str, Any]) -> Dict[str, Any]:
    """生成阻抗数据"""
    # 实现阻抗数据生成逻辑
    return {"real": [], "imaginary": [], "frequency": []}

def calculate_quality_metrics() -> Dict[str, Any]:
    """计算质量指标"""
    return {
        "noise_level": 0.01,
        "fit_error": 0.001,
        "kramers_kronig": 0.95
    }

def generate_potential_data(parameters: Dict[str, Any]) -> Dict[str, Any]:
    """生成电位数据"""
    return {"time": [], "potential": [], "current": []}

def calculate_stability_metrics() -> Dict[str, Any]:
    """计算稳定性指标"""
    return {
        "drift_rate": 0.001,
        "noise_rms": 0.0001,
        "stability_factor": 0.98
    }
```

## 4. 执行服务增强
```typescript
// apps/backend/src/modules/execution/execution-enhanced.service.ts
@Injectable()
export class ExecutionEnhancedService {
  private readonly logger = new Logger(ExecutionEnhancedService.name);

  constructor(
    private readonly executionNotificationService: ExecutionNotificationService,
    private readonly zahnerService: ZahnerZenniumPureService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * 增强的工作流执行方法
   */
  async executeWorkflow(workflowId: string): Promise<ExecutionResult> {
    const executionId = this.generateExecutionId();

    // 发送工作流开始通知
    this.executionNotificationService.notifyWorkflow(
      WorkflowEvent.STARTED,
      { workflowId, executionId }
    );

    try {
      const workflow = await this.workflowService.getWorkflow(workflowId);
      const startTime = Date.now();

      // 执行工作流中的每个节点
      for (const node of workflow.nodes) {
        await this.executeNode(node, executionId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 发送工作流完成通知
      this.executionNotificationService.notifyWorkflow(
        WorkflowEvent.COMPLETED,
        { workflowId, executionId, duration, success: true }
      );

      return {
        executionId,
        success: true,
        duration,
        startTime: new Date(startTime),
        endTime: new Date(endTime)
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // 发送工作流失败通知
      this.executionNotificationService.notifyWorkflow(
        WorkflowEvent.FAILED,
        { workflowId, executionId, duration, success: false, error: error.message }
      );

      throw error;
    }
  }

  /**
   * 增强的节点执行方法
   */
  async executeNode(node: WorkflowNode, executionId: string): Promise<void> {
    const nodeId = node.id;

    // 发送节点开始通知
    this.executionNotificationService.notifyNode(
      NodeEvent.STARTED,
      nodeId,
      { executionId, nodeType: node.type }
    );

    try {
      if (node.type === 'measurement') {
        // 执行测量节点
        await this.executeMeasurementNode(node, executionId);
      } else if (node.type === 'delay') {
        // 执行延时节点
        await this.executeDelayNode(node, executionId);
      } else {
        // 其他节点类型
        await this.executeGenericNode(node, executionId);
      }

      // 发送节点完成通知
      this.executionNotificationService.notifyNode(
        NodeEvent.COMPLETED,
        nodeId,
        { executionId, duration: Date.now() - node.startTime }
      );

    } catch (error) {
      // 发送节点失败通知
      this.executionNotificationService.notifyNode(
        NodeEvent.FAILED,
        nodeId,
        { executionId, error: error.message, duration: Date.now() - node.startTime }
      );

      throw error;
    }
  }

  /**
   * 测量节点执行 - 统一通知分发
   */
  private async executeMeasurementNode(node: WorkflowNode, executionId: string): Promise<void> {
    const measurementId = `${executionId}_${node.id}`;

    // 检查设备连接状态
    const deviceStatus = this.zahnerService.getDeviceStatus();
    if (deviceStatus !== DeviceStatus.READY && deviceStatus !== DeviceStatus.CONNECTED) {
      // 发送设备状态通知
      this.executionNotificationService.notifyDeviceStatus(
        'zahner-zennium',
        deviceStatus,
        { executionId, nodeId: node.id, reason: '设备未就绪' }
      );
      throw new Error(`设备未就绪，当前状态: ${deviceStatus}`);
    }

    // 发送测量开始通知
    this.executionNotificationService.notifyMeasurement(
      measurementId,
      MeasurementEvent.STARTED,
      { measurementType: node.measurementType, parameters: node.parameters }
    );

    try {
      // 构建测量命令
      const measurementCommand: MeasurementCommand = {
        id: measurementId,
        type: node.measurementType,
        parameters: node.parameters,
        timeout: node.timeout || 300000
      };

      // 执行测量
      const result = await this.zahnerService.executeMeasurement(measurementCommand);

      // 发送测量完成通知
      this.executionNotificationService.notifyMeasurement(
        measurementId,
        result.success ? MeasurementEvent.COMPLETED : MeasurementEvent.FAILED,
        result
      );

      if (!result.success) {
        throw new Error(`测量失败: ${result.error}`);
      }

    } catch (error) {
      // 发送测量失败通知
      this.executionNotificationService.notifyMeasurement(
        measurementId,
        MeasurementEvent.FAILED,
        { error: error.message, duration: 0 }
      );

      throw error;
    }
  }

  /**
   * 延时节点执行
   */
  private async executeDelayNode(node: WorkflowNode, executionId: string): Promise<void> {
    const delay = node.parameters?.delay || 0;

    this.logger.log(`执行延时: ${delay}ms, 执行ID: ${executionId}`);

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * 通用节点执行
   */
  private async executeGenericNode(node: WorkflowNode, executionId: string): Promise<void> {
    this.logger.log(`执行通用节点: ${node.id}, 类型: ${node.type}, 执行ID: ${executionId}`);

    // 根据节点类型执行相应逻辑
    switch (node.type) {
      case 'start':
        // 开始节点，无特殊逻辑
        break;
      case 'end':
        // 结束节点，无特殊逻辑
        break;
      default:
        this.logger.warn(`未知的节点类型: ${node.type}`);
        break;
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## 5. 模块配置更新
```typescript
// apps/backend/src/modules/execution/execution.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { ExecutionEnhancedService } from './execution-enhanced.service';
import { ExecutionNotificationService } from './execution-notification.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { ZahnerZenniumModule } from '../zahner-zennium/zahner-zennium.module';
import { NotificationModule } from '../../notification/notification.module';

@Module({
  imports: [
    WorkflowModule,
    ZahnerZenniumModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [],
  providers: [
    ExecutionService, // 保持原有服务
    ExecutionEnhancedService, // 新增：增强执行服务
    ExecutionNotificationService, // 新增：执行通知服务
  ],
  exports: [
    ExecutionService,
    ExecutionEnhancedService,
    ExecutionNotificationService,
  ],
})
export class ExecutionModule {}
```

## 6. 迁移策略

### 6.1 阶段1: 创建基础设施 (1天)
- 创建ExecutionNotificationService
- 创建ZahnerZenniumPureService
- 创建ExecutionEnhancedService
- 更新模块配置

### 6.2 阶段2: 修改Python API层 (1天)
- 移除send_notification调用
- 重构返回结构化结果
- 保持API兼容性

### 6.3 阶段3: 逐步迁移 (2-3天)
- 从非关键路径开始使用新架构
- 验证通知一致性
- 处理边缘情况

### 6.4 阶段4: 清理旧代码 (1天)
- 移除重复通知代码
- 清理设备层通知逻辑
- 完善文档和测试

## 7. 验证清单

### 7.1 功能验证
- [ ] 统一通知分发正常工作
- [ ] 设备层无UI通知发送
- [ ] 通知内容完整准确
- [ ] 无重复通知

### 7.2 性能验证
- [ ] 通知发送性能稳定
- [ ] 内存使用合理
- [ ] 响应时间无下降
- [ ] 并发处理正常

### 7.3 架构验证
- [ ] 职责分离清晰
- [ ] 代码结构优化
- [ ] 易于扩展新设备
- [ ] 符合KISS原则

## 8. 预期效果

### 8.1 直接效果
- ✅ 统一通知分发，减少重复
- ✅ 清晰的职责分离
- ✅ 改善用户体验
- ✅ 提高可维护性

### 8.2 长期收益
- 更容易添加新设备类型
- 统一的通知管理策略
- 更好的系统可扩展性
- 更清晰的架构边界

---

**架构总结**: 通过执行服务统一通知分发，设备服务专注设备操作，Python层作为测量模板，实现了清晰的分层架构，既解决了当前问题，又为未来扩展提供了良好基础。