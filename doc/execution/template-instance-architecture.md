# 简化模板-实例架构设计

## 文档信息
- **创建日期**: 2025-09-22
- **版本**: 2.0.0
- **目标**: 设计基于KISS原则的Python模板层和设备实例层分离架构
- **文件夹**: `@doc/execution/`

## 1. 架构概述

### 1.1 核心问题分析

**当前通知重复问题：**
- 执行服务发送工作流和节点通知
- 设备服务发送连接和错误通知
- Python层通过`send_notification()`发送测量通知
- 同一操作产生多条重复通知

**简化解决方案：**
- Python层保持单文件结构，移除通知调用
- 设备服务专注纯设备操作，移除通知调用
- 执行服务作为统一通知分发中心

### 1.2 简化架构设计

```
┌─────────────────────────────────────────┐
│        Python 模板层 (简化版)             │
│  ┌─────────────────────────────────┐   │
│  │  zahner_device.py (单文件)        │   │
│  │ ├── 移除 send_notification()     │   │
│  │ ├── 统一返回结构化结果           │   │
│  │ └── 保持现有测量方法             │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                     │
                     │ HTTP API (结构化结果)
                     ▼
┌─────────────────────────────────────────┐
│         设备实例层 (TypeScript)         │
│  ┌─────────────────────────────────┐   │
│  │  ZahnerZenniumPureService         │   │
│  │ ├── 纯设备操作 (无通知)           │   │
│  │ ├── 状态管理                     │   │
│  │ └── 结果返回                     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                     │
                     │ 统一通知分发
                     ▼
┌─────────────────────────────────────────┐
│         执行服务 (统一通知中心)          │
│  ┌─────────────────────────────────┐   │
│  │    ExecutionNotificationService    │   │
│  │ ├── 工作流通知统一分发            │   │
│  │ ├── 节点通知统一分发              │   │
│  │ ├── 设备通知统一分发              │   │
│  │ └── 测量结果通知统一分发          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## 2. 核心修改逻辑

### 2.1 Python层修改 (保持单文件)

**修改原则：** 保持 `zahner_device.py` 单文件结构，只移除通知调用

**关键修改示例：**
```python
# 在现有文件中修改
class ZahnerDeviceManager:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        # 移除通知相关初始化

    async def measure_eis_potentiostatic(self, measurement_id: str, params: dict):
        """EIS测量 - 移除通知调用，返回结构化结果"""
        start_time = time.time()

        try:
            # 执行测量逻辑 (保持不变)
            result = await self.device_manager.execute_eis(params)

            # 移除：send_notification(...)

            # 返回统一结构化结果
            return {
                "measurement_id": measurement_id,
                "success": True,
                "data": result,
                "duration": int((time.time() - start_time) * 1000),
                "timestamp": time.time(),
                "status": "completed"
            }

        except Exception as e:
            # 移除错误通知调用，只记录日志
            self.logger.error(f"EIS测量失败: {measurement_id}, 错误: {str(e)}")

            return {
                "measurement_id": measurement_id,
                "success": False,
                "error": str(e),
                "duration": int((time.time() - start_time) * 1000),
                "timestamp": time.time(),
                "status": "failed"
            }
```

### 2.2 设备服务层修改

**修改原则：** 移除直接通知调用，专注设备操作

```typescript
// ZahnerZenniumPureService (简化版)
@Injectable()
export class ZahnerZenniumPureService {
  constructor(
    private readonly httpService: HttpService,
    // 移除 NotificationService 依赖
  ) {}

  async connect(): Promise<DeviceConnectionResult> {
    try {
      const result = await this.makeRequest<any>('POST', '/connect', {
        host: process.env.ZAHNER_DEVICE_HOST || 'localhost'
      });

      if (result.success) {
        this.isConnected = true;
        this.logger.log('设备连接成功');

        // 移除：this.notificationService.notifyDevice(...)

        return {
          success: true,
          endpoint: this.baseUrl,
          status: 'connected',
          timestamp: new Date().toISOString()
        };
      }

      // ... 错误处理 (移除通知调用)
    } catch (error) {
      // ... 异常处理 (移除通知调用)
    }
  }
}
```

### 2.3 统一通知分发器

```typescript
// ExecutionNotificationService (核心)
@Injectable()
export class ExecutionNotificationService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly eventBus: EventBus,
  ) {}

  // 统一工作流通知
  notifyWorkflow(event: WorkflowEvent, details: any): void {
    const message = this.buildWorkflowMessage(event, details);
    this.notificationService.notifyWorkflow(message, details);
  }

  // 统一节点通知
  notifyNode(event: NodeEvent, nodeId: string, details: any): void {
    const message = this.buildNodeMessage(event, nodeId, details);
    this.notificationService.notifyExecutionDetail(message, `Node: ${nodeId}`);
  }

  // 统一测量结果通知
  notifyMeasurement(measurementId: string, result: any): void {
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

## 3. 实施要点

### 3.1 核心修改原则

**KISS原则优先：**
- 保持现有文件结构
- 最小化代码改动
- 只移除通知调用，不改变业务逻辑

**统一通知原则：**
- 所有通知通过ExecutionService统一分发
- Python层专注测量逻辑，不处理通知
- 设备层专注设备操作，不处理通知

### 3.2 修改范围

| 层级 | 修改内容 | 保持不变 |
|------|----------|----------|
| Python层 | 移除`send_notification()`调用 | 测量逻辑、单文件结构 |
| 设备服务 | 移除NotificationService依赖 | 设备操作逻辑 |
| 执行服务 | 集成统一通知分发器 | 工作流执行逻辑 |

### 3.3 预期效果

**修改前：**
```
用户收到10条重复通知：
1. 执行服务: 工作流开始
2. 执行服务: 节点开始
3. 设备服务: 连接成功
4. Python层: 测量开始
5. Python层: 测量完成
6. 执行服务: 节点完成
... 更多重复
```

**修改后：**
```
用户收到3条精简通知：
1. 执行服务: 工作流开始
2. 执行服务: 节点执行完成 (包含测量结果)
3. 执行服务: 工作流完成
```

### 3.4 风险控制

**低风险方案：**
- 保持现有功能完全不变
- 只移除冗余通知调用
- 可以随时回退到原始状态

**回退策略：**
```bash
# 恢复Python层
cp python/zahner_device.py.backup python/zahner_device.py

# 恢复设备服务
git checkout apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts

# 恢复执行服务
git checkout apps/backend/src/modules/execution/execution.service.ts
```
        """执行测量"""
        pass

    @abstractmethod
    def get_capabilities(self) -> Dict[str, Any]:
        """获取模板能力"""
        pass

    @abstractmethod
    def get_default_parameters(self) -> Dict[str, Any]:
        """获取默认参数"""
        pass

    async def validate_device_capabilities(self, device_capabilities: Dict[str, Any]) -> ValidationResult:
        """验证设备能力是否满足模板要求"""
        required_capabilities = self.get_capabilities().get('required_capabilities', [])
        errors = []

        for capability in required_capabilities:
            if capability not in device_capabilities:
                errors.append(f"设备缺少必要能力: {capability}")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors
        )

    async def handle_state_transition(self, from_status: MeasurementStatus,
                                   to_status: MeasurementStatus,
                                   context: MeasurementContext) -> bool:
        """处理状态转换"""
        self.logger.info(f"状态转换: {from_status} -> {to_status} for {context.measurement_id}")

        # 验证状态转换是否合法
        valid_transitions = self._get_valid_transitions()
        if to_status not in valid_transitions.get(from_status, []):
            self.logger.error(f"无效的状态转换: {from_status} -> {to_status}")
            return False

        return True

    def _get_valid_transitions(self) -> Dict[MeasurementStatus, List[MeasurementStatus]]:
        """获取有效的状态转换"""
        return {
            MeasurementStatus.PENDING: [MeasurementStatus.RUNNING, MeasurementStatus.CANCELLED],
            MeasurementStatus.RUNNING: [MeasurementStatus.COMPLETED, MeasurementStatus.FAILED, MeasurementStatus.CANCELLED],
            MeasurementStatus.COMPLETED: [],
            MeasurementStatus.FAILED: [],
            MeasurementStatus.CANCELLED: []
        }
```

### 2.2 EIS测量模板
```python
# templates/eis_template.py
from typing import Dict, Any, Optional
import asyncio
import time
from .base_template import BaseMeasurementTemplate, MeasurementContext, MeasurementResult, ValidationResult, MeasurementStatus

class EISTemplate(BaseMeasurementTemplate):
    """EIS测量模板"""

    def __init__(self):
        super().__init__("eis", "电化学阻抗谱测量")

    def validate_parameters(self, parameters: Dict[str, Any]) -> ValidationResult:
        errors = []
        warnings = []

        # 验证频率范围
        if 'frequency_range' in parameters:
            freq_range = parameters['frequency_range']
            if len(freq_range) != 2:
                errors.append("频率范围必须是包含最小和最大频率的数组")
            elif freq_range[0] >= freq_range[1]:
                errors.append("最小频率必须小于最大频率")
            elif freq_range[0] < 0.001 or freq_range[1] > 1000000:
                warnings.append("频率范围超出推荐范围 (0.001Hz - 1MHz)")

        # 验证振幅
        if 'amplitude' in parameters:
            amplitude = parameters['amplitude']
            if not isinstance(amplitude, (int, float)) or amplitude <= 0:
                errors.append("振幅必须是正数")
            elif amplitude > 0.1:  # 100mV
                warnings.append("振幅较大，可能影响电极稳定性")

        # 验证测量持续时间
        if 'measurement_duration' in parameters:
            duration = parameters['measurement_duration']
            if not isinstance(duration, (int, float)) or duration <= 0:
                errors.append("测量持续时间必须是正数")
            elif duration > 3600:  # 1小时
                warnings.append("测量时间较长，建议分批进行")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )

    async def prepare_execution(self, context: MeasurementContext) -> Dict[str, Any]:
        """准备EIS测量执行环境"""
        self.logger.info(f"准备EIS测量: {context.measurement_id}")

        # 设置默认参数
        default_params = self.get_default_parameters()
        params = {**default_params, **context.parameters}

        # 计算测量点数
        freq_range = params['frequency_range']
        points_per_decade = params.get('points_per_decade', 10)

        min_freq = max(freq_range[0], 0.001)
        max_freq = min(freq_range[1], 1000000)

        # 计算总测量点数
        decades = (max_freq / min_freq) ** (1/10)  # 对数 decades
        total_points = int(decades * points_per_decade)

        return {
            'parameters': params,
            'measurement_points': total_points,
            'estimated_duration': total_points * 0.5,  # 每点约0.5秒
            'validation_result': self.validate_parameters(params)
        }

    async def execute_measurement(self, context: MeasurementContext) -> MeasurementResult:
        """执行EIS测量"""
        start_time = time.time()
        measurement_id = context.measurement_id

        try:
            self.logger.info(f"开始执行EIS测量: {measurement_id}")

            # 准备执行环境
            prep_result = await self.prepare_execution(context)

            if not prep_result['validation_result'].is_valid:
                return MeasurementResult(
                    success=False,
                    measurement_id=measurement_id,
                    error="参数验证失败: " + "; ".join(prep_result['validation_result'].errors),
                    duration=int((time.time() - start_time) * 1000),
                    timestamp=time.time(),
                    status=MeasurementStatus.FAILED
                )

            # 模拟测量执行过程
            await self._simulate_eis_measurement(context, prep_result)

            duration = int((time.time() - start_time) * 1000)

            # 生成模拟数据
            impedance_data = self._generate_impedance_data(
                context.parameters['frequency_range'],
                context.parameters.get('amplitude', 0.01)
            )

            return MeasurementResult(
                success=True,
                measurement_id=measurement_id,
                data={
                    'type': 'eis',
                    'frequency_range': context.parameters['frequency_range'],
                    'amplitude': context.parameters.get('amplitude', 0.01),
                    'impedance_data': impedance_data,
                    'quality_metrics': self._calculate_quality_metrics(impedance_data)
                },
                duration=duration,
                timestamp=time.time(),
                status=MeasurementStatus.COMPLETED,
                progress={
                    'percentage': 100,
                    'phase': 'completed',
                    'current_step': '测量完成'
                }
            )

        except Exception as e:
            duration = int((time.time() - start_time) * 1000)

            return MeasurementResult(
                success=False,
                measurement_id=measurement_id,
                error=str(e),
                duration=duration,
                timestamp=time.time(),
                status=MeasurementStatus.FAILED,
                progress={
                    'percentage': 0,
                    'phase': 'failed',
                    'current_step': '测量失败'
                }
            )

    async def _simulate_eis_measurement(self, context: MeasurementContext, prep_result: Dict[str, Any]):
        """模拟EIS测量执行过程"""
        total_points = prep_result['measurement_points']
        estimated_duration = prep_result['estimated_duration']

        # 模拟测量进度
        for i in range(0, total_points, max(1, total_points // 10)):
            progress = (i / total_points) * 100
            await asyncio.sleep(estimated_duration / 1000)  # 模拟测量时间
            self.logger.debug(f"EIS测量进度: {progress:.1f}%")

    def _generate_impedance_data(self, frequency_range: list, amplitude: float) -> Dict[str, Any]:
        """生成阻抗数据"""
        import numpy as np

        # 生成频率点
        min_freq = max(frequency_range[0], 0.001)
        max_freq = min(frequency_range[1], 1000000)
        frequencies = np.logspace(np.log10(min_freq), np.log10(max_freq), 50)

        # 模拟RC电路的阻抗响应
        R1 = 100  # 溶液电阻
        R2 = 1000  # 电荷转移电阻
        C1 = 1e-6  # 双电层电容

        omega = 2 * np.pi * frequencies
        Z_C = 1 / (1j * omega * C1)
        Z_R2C = R2 * Z_C / (R2 + Z_C)
        Z_total = R1 + Z_R2C

        return {
            'frequencies': frequencies.tolist(),
            'real': Z_total.real.tolist(),
            'imaginary': Z_total.imag.tolist(),
            'magnitude': np.abs(Z_total).tolist(),
            'phase': np.angle(Z_total, deg=True).tolist()
        }

    def _calculate_quality_metrics(self, impedance_data: Dict[str, Any]) -> Dict[str, Any]:
        """计算测量质量指标"""
        # 简化的质量指标计算
        real_parts = impedance_data['real']
        imag_parts = impedance_data['imaginary']

        # 计算噪声水平（标准差）
        noise_level = np.std(real_parts[-10:]) if len(real_parts) > 10 else 0.01

        # 计算拟合误差（简化）
        fit_error = noise_level / np.mean(real_parts) if np.mean(real_parts) > 0 else 0.1

        return {
            'noise_level': float(noise_level),
            'fit_error': float(fit_error),
            'data_quality': 'good' if fit_error < 0.05 else 'acceptable'
        }

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            'required_capabilities': ['impedance_measurement', 'frequency_control'],
            'supported_parameters': [
                'frequency_range', 'amplitude', 'points_per_decade',
                'measurement_duration', 'settling_time'
            ],
            'measurement_types': ['potentiostatic', 'galvanostatic']
        }

    def get_default_parameters(self) -> Dict[str, Any]:
        return {
            'frequency_range': [1, 1000000],  # 1Hz to 1MHz
            'amplitude': 0.01,  # 10mV
            'points_per_decade': 10,
            'measurement_duration': 300,  # 5分钟
            'settling_time': 2  # 2秒稳定时间
        }
```

### 2.3 模板管理器
```python
# templates/template_manager.py
from typing import Dict, Any, Optional, Type
from .base_template import BaseMeasurementTemplate, MeasurementContext, MeasurementResult
from .eis_template import EISTemplate
import logging

class TemplateManager:
    """测量模板管理器"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.templates: Dict[str, BaseMeasurementTemplate] = {}
        self._register_default_templates()

    def _register_default_templates(self):
        """注册默认测量模板"""
        self.register_template(EISTemplate())

        # 可以在这里注册更多模板
        # self.register_template(OCPTemplate())
        # self.register_template(ChronoamperometryTemplate())

    def register_template(self, template: BaseMeasurementTemplate):
        """注册测量模板"""
        self.templates[template.template_id] = template
        self.logger.info(f"注册测量模板: {template.name} ({template.template_id})")

    def get_template(self, template_id: str) -> Optional[BaseMeasurementTemplate]:
        """获取测量模板"""
        return self.templates.get(template_id)

    def list_templates(self) -> Dict[str, Dict[str, Any]]:
        """列出所有可用模板"""
        return {
            template_id: {
                'name': template.name,
                'capabilities': template.get_capabilities(),
                'default_parameters': template.get_default_parameters()
            }
            for template_id, template in self.templates.items()
        }

    async def execute_with_template(self, template_id: str, context: MeasurementContext) -> MeasurementResult:
        """使用指定模板执行测量"""
        template = self.get_template(template_id)
        if not template:
            return MeasurementResult(
                success=False,
                measurement_id=context.measurement_id,
                error=f"未找到测量模板: {template_id}",
                duration=0,
                timestamp=time.time(),
                status="failed"
            )

        try:
            return await template.execute_measurement(context)
        except Exception as e:
            return MeasurementResult(
                success=False,
                measurement_id=context.measurement_id,
                error=f"模板执行失败: {str(e)}",
                duration=0,
                timestamp=time.time(),
                status="failed"
            )
```

### 2.4 FastAPI集成
```python
# main.py - 更新后的FastAPI主文件
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging
import time

from templates.template_manager import TemplateManager
from templates.base_template import MeasurementContext, MeasurementResult

app = FastAPI(title="ZahnerFlow Device API - Template Layer")

# 日志配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局模板管理器
template_manager = TemplateManager()

class MeasurementRequest(BaseModel):
    measurement_id: str
    template_id: str
    device_id: str
    parameters: Dict[str, Any]
    user_id: Optional[str] = None
    session_id: Optional[str] = None

@app.post("/measurements/execute")
async def execute_measurement(request: MeasurementRequest):
    """使用模板执行测量"""
    start_time = time.time()

    try:
        logger.info(f"开始执行测量: {request.measurement_id} 使用模板: {request.template_id}")

        # 创建测量上下文
        context = MeasurementContext(
            measurement_id=request.measurement_id,
            device_id=request.device_id,
            parameters=request.parameters,
            user_id=request.user_id,
            session_id=request.session_id
        )

        # 使用模板执行测量
        result = await template_manager.execute_with_template(request.template_id, context)

        logger.info(f"测量完成: {request.measurement_id}, 成功: {result.success}")
        return result

    except Exception as e:
        duration = int((time.time() - start_time) * 1000)

        logger.error(f"测量执行失败: {request.measurement_id}, 错误: {str(e)}")
        return MeasurementResult(
            success=False,
            measurement_id=request.measurement_id,
            error=str(e),
            duration=duration,
            timestamp=time.time(),
            status="failed"
        )

@app.get("/templates")
async def list_templates():
    """获取所有可用测量模板"""
    return template_manager.list_templates()

@app.get("/templates/{template_id}")
async def get_template(template_id: str):
    """获取指定模板信息"""
    template = template_manager.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板未找到: {template_id}")

    return {
        'template_id': template.template_id,
        'name': template.name,
        'capabilities': template.get_capabilities(),
        'default_parameters': template.get_default_parameters()
    }

@app.post("/templates/{template_id}/validate")
async def validate_parameters(template_id: str, parameters: Dict[str, Any]):
    """验证测量参数"""
    template = template_manager.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"模板未找到: {template_id}")

    return template.validate_parameters(parameters)

@app.get("/health")
async def get_health():
    """获取服务健康状态"""
    return {
        "status": "healthy",
        "uptime": int(time.time()),
        "available_templates": len(template_manager.templates),
        "template_ids": list(template_manager.templates.keys())
    }
```

## 3. 设备实例层详细设计

### 3.1 设备实例基类
```typescript
// apps/backend/src/devices/base-device.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

export interface DeviceCapabilities {
  supportedTemplates: string[];
  features: string[];
  maxConcurrentMeasurements: number;
  precision: Record<string, string>;
}

export interface DeviceConnectionInfo {
  endpoint: string;
  protocol: string;
  timeout: number;
  healthCheck: boolean;
}

export interface DeviceStatus {
  connected: boolean;
  busy: boolean;
  lastActivity: Date;
  capabilities: DeviceCapabilities;
  error?: string;
  currentMeasurement?: string;
}

export abstract class BaseDeviceService {
  protected readonly logger: Logger;
  protected status: DeviceStatus;
  protected connectionInfo: DeviceConnectionInfo;

  constructor(
    protected readonly httpService: HttpService,
    deviceName: string,
    connectionInfo: DeviceConnectionInfo
  ) {
    this.logger = new Logger(`${deviceName}Device`);
    this.connectionInfo = connectionInfo;
    this.status = {
      connected: false,
      busy: false,
      lastActivity: new Date(),
      capabilities: {
        supportedTemplates: [],
        features: [],
        maxConcurrentMeasurements: 1,
        precision: {}
      }
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getStatus(): DeviceStatus;
  abstract getCapabilities(): Promise<DeviceCapabilities>;
  abstract executeTemplateMeasurement(templateId: string, parameters: any): Promise<any>;

  protected async makeRequest<T>(method: string, path: string, data?: any): Promise<T> {
    // 基础HTTP请求实现
    try {
      const config = {
        timeout: this.connectionInfo.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      let response;
      if (method === 'GET') {
        response = await this.httpService.axiosRef.get(
          `${this.connectionInfo.endpoint}${path}`,
          config
        );
      } else if (method === 'POST') {
        response = await this.httpService.axiosRef.post(
          `${this.connectionInfo.endpoint}${path}`,
          data,
          config
        );
      } else {
        throw new Error(`不支持的HTTP方法: ${method}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`HTTP请求失败: ${error.message}`);
      throw error;
    }
  }

  protected updateStatus(newStatus: Partial<DeviceStatus>): void {
    this.status = { ...this.status, ...newStatus, lastActivity: new Date() };
    this.logger.log(`设备状态更新: ${JSON.stringify(newStatus)}`);
  }
}
```

### 3.2 ZahnerZennium设备实例
```typescript
// apps/backend/src/devices/zahner-zennium-instance.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseDeviceService, DeviceCapabilities, DeviceStatus, DeviceConnectionInfo } from './base-device.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ZahnerZenniumInstanceService extends BaseDeviceService {
  constructor(
    protected readonly httpService: HttpService,
  ) {
    super(
      httpService,
      'ZahnerZennium',
      {
        endpoint: process.env.ZAHNER_FASTAPI_URL || 'http://localhost:8000',
        protocol: 'http',
        timeout: 300000,
        healthCheck: true
      }
    );
  }

  async connect(): Promise<void> {
    this.logger.log('连接Zahner ZENNIUM设备实例...');

    try {
      const result = await this.makeRequest<any>('POST', '/connect', {
        host: process.env.ZAHNER_DEVICE_HOST || 'localhost'
      });

      if (result.success) {
        this.updateStatus({ connected: true, error: undefined });
        this.logger.log('设备实例连接成功');
      } else {
        this.updateStatus({
          connected: false,
          error: `设备连接失败: ${result.error}`
        });
        throw new Error(`设备连接失败: ${result.error}`);
      }
    } catch (error) {
      this.updateStatus({
        connected: false,
        error: `连接异常: ${error.message}`
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.logger.log('断开Zahner ZENNIUM设备实例连接...');

    try {
      await this.makeRequest<any>('POST', '/disconnect');
      this.updateStatus({ connected: false, busy: false, currentMeasurement: undefined });
      this.logger.log('设备实例断开连接成功');
    } catch (error) {
      this.logger.error(`断开连接失败: ${error.message}`);
      throw error;
    }
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  async getCapabilities(): Promise<DeviceCapabilities> {
    try {
      const response = await this.makeRequest<any>('GET', '/capabilities');

      return {
        supportedTemplates: ['eis', 'ocp', 'chronoamperometry', 'chronopotentiometry'],
        features: response.features || [
          'real_time_progress',
          'error_recovery',
          'data_validation',
          'temperature_compensation'
        ],
        maxConcurrentMeasurements: response.max_concurrent_measurements || 1,
        precision: response.precision || {
          voltage: '±1mV',
          current: '±1pA',
          frequency: '±0.1%'
        }
      };
    } catch (error) {
      this.logger.error(`获取设备能力失败: ${error.message}`);
      return {
        supportedTemplates: ['eis', 'ocp', 'chronoamperometry'],
        features: ['real_time_progress'],
        maxConcurrentMeasurements: 1,
        precision: { voltage: '±1mV', current: '±1pA' }
      };
    }
  }

  async executeTemplateMeasurement(templateId: string, parameters: any): Promise<any> {
    const measurementId = `measurement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`执行模板测量: ${templateId}, 测量ID: ${measurementId}`);

    if (!this.status.connected) {
      this.logger.warn('设备未连接，尝试自动连接...');
      await this.connect();
    }

    this.updateStatus({
      busy: true,
      currentMeasurement: measurementId
    });

    try {
      const request = {
        measurement_id: measurementId,
        template_id: templateId,
        device_id: 'zahner-zennium',
        parameters: parameters
      };

      const result = await this.makeRequest<any>('POST', '/measurements/execute', request);

      this.logger.log(`模板测量完成: ${templateId}, 成功: ${result.success}`);

      return {
        ...result,
        device_id: 'zahner-zennium',
        template_id: templateId,
        executed_at: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`模板测量失败: ${templateId}, 错误: ${error.message}`);
      throw error;
    } finally {
      this.updateStatus({
        busy: false,
        currentMeasurement: undefined
      });
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.makeRequest<any>('GET', '/health');
      return response.status === 'healthy';
    } catch (error) {
      this.logger.error(`健康检查失败: ${error.message}`);
      return false;
    }
  }
}
```

## 4. 架构优势总结

### 4.1 职责分离
- **Python模板层**: 专注测量逻辑、验证、状态管理
- **设备实例层**: 专注设备连接、状态管理、结果转换
- **执行服务**: 专注通知分发、工作流编排

### 4.2 扩展性提升
- **新设备类型**: 实现BaseDeviceService接口即可
- **新测量类型**: Python端实现新模板即可
- **通知策略**: 执行服务统一管理，易于修改

### 4.3 维护性改善
- **代码复用**: 模板层提供通用逻辑
- **测试友好**: 各层独立测试
- **调试便利**: 问题定位到具体层级

### 4.4 KISS原则体现
- **简单接口**: 清晰的职责边界
- **统一模式**: 模板-实例模式一致
- **渐进复杂**: 从简单到复杂的扩展路径

这种模板-实例分离架构既解决了当前的通知重复问题，又为未来的设备扩展和测量类型增加提供了良好的架构基础。