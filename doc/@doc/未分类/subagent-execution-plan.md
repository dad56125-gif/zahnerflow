# ZahnerFlow Subagent执行命令方案

## 1. 后端连接管理方案

### 1.1 NestJS与FastAPI连接策略

#### 连接架构
```
前端 → NestJS API Gateway → FastAPI Device Service → Zahner硬件设备
```

#### 连接配置
```typescript
// apps/backend/src/config/device-service.config.ts
export const DeviceServiceConfig = {
  fastapi: {
    baseUrl: process.env.FASTAPI_BASE_URL || 'http://localhost:8000',
    timeout: 30000, // 30秒超时
    retryAttempts: 3,
    healthCheckInterval: 30000, // 30秒健康检查
  },
  nestjs: {
    port: process.env.PORT || 3001,
    wsPort: process.env.WS_PORT || 3001,
  }
};
```

#### 健康检查机制
```typescript
// apps/backend/src/modules/zahner-zennium/zahner-zennium.service.ts
@Injectable()
export class ZahnerZenniumService {
  private isHealthy = false;
  private lastHealthCheck = 0;

  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${DeviceServiceConfig.fastapi.baseUrl}/health`);
      this.isHealthy = response.data.status === 'healthy';
      this.lastHealthCheck = Date.now();
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      return false;
    }
  }
}
```

### 1.2 Subagent执行命令框架

#### 命令执行流程
```typescript
// apps/backend/src/modules/execution/subagent.executor.ts
@Injectable()
export class SubagentExecutor {
  constructor(
    private readonly zahnerService: ZahnerZenniumService,
    private readonly notificationService: NotificationService,
  ) {}

  async executeCommand(command: SubagentCommand): Promise<SubagentResult> {
    const startTime = Date.now();

    try {
      // 1. 验证命令
      this.validateCommand(command);

      // 2. 检查设备连接状态
      await this.ensureDeviceConnected();

      // 3. 执行命令
      const result = await this.executeOnFastAPI(command);

      // 4. 处理结果
      return this.processResult(result, startTime);

    } catch (error) {
      return this.handleExecutionError(error, command, startTime);
    }
  }

  private async executeOnFastAPI(command: SubagentCommand): Promise<any> {
    const endpoint = this.getEndpointForCommand(command.type);
    const response = await axios.post(
      `${DeviceServiceConfig.fastapi.baseUrl}${endpoint}`,
      command.parameters
    );
    return response.data;
  }
}
```

#### 命令类型定义
```typescript
// packages/types/src/subagent.types.ts
export enum SubagentCommandType {
  DEVICE_CONNECT = 'device_connect',
  DEVICE_DISCONNECT = 'device_disconnect',
  EIS_POTENTIOSTATIC = 'eis_potentiostatic',
  EIS_GALVANOSTATIC = 'eis_galvanostatic',
  OCP_MEASUREMENT = 'ocp_measurement',
  CHRONOAMPEROMETRY = 'chronoamperometry',
  CHRONOPOTENTIOMETRY = 'chronopotentiometry',
  VOLTAGE_RAMP = 'voltage_ramp',
  CURRENT_RAMP = 'current_ramp',
  LSV_MEASUREMENT = 'lsv_measurement',
}

export interface SubagentCommand {
  id: string;
  type: SubagentCommandType;
  parameters: Record<string, any>;
  nodeId: string;
  workflowId: string;
  timestamp: number;
  priority: 'low' | 'medium' | 'high';
}

export interface SubagentResult {
  commandId: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
  timestamp: number;
}
```

### 1.3 命令队列管理

#### 优先级队列
```typescript
// apps/backend/src/modules/execution/command.queue.ts
@Injectable()
export class CommandQueue {
  private queues = {
    high: [] as SubagentCommand[],
    medium: [] as SubagentCommand[],
    low: [] as SubagentCommand[],
  };
  private isProcessing = false;

  enqueue(command: SubagentCommand): void {
    this.queues[command.priority].push(command);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.hasCommands()) {
      const command = this.getNextCommand();
      if (command) {
        await this.executeCommand(command);
      }
    }

    this.isProcessing = false;
  }

  private getNextCommand(): SubagentCommand | null {
    // 按优先级获取命令
    for (const priority of ['high', 'medium', 'low'] as const) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift()!;
      }
    }
    return null;
  }
}
```

## 2. 前后端接口层校对方案

### 2.1 接口版本管理

#### 版本化API设计
```typescript
// apps/backend/src/interfaces/api-v1.interface.ts
export interface ApiV1Interface {
  prefix: '/api/v1';
  workflows: {
    create: '/workflows';
    getById: '/workflows/:id';
    update: '/workflows/:id';
    delete: '/workflows/:id';
    execute: '/workflows/:id/execute';
  };
  devices: {
    connect: '/devices/connect';
    disconnect: '/devices/disconnect';
    status: '/devices/status';
  };
  executions: {
    start: '/executions';
    status: '/executions/:id';
    cancel: '/executions/:id';
  };
}
```

#### 前端API客户端
```typescript
// apps/frontend/src/services/api.client.ts
export class ApiClient {
  private baseUrl = '/api/v1';

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }

    return response.json();
  }

  // 工作流API
  async createWorkflow(workflow: WorkflowDTO): Promise<Workflow> {
    return this.request<Workflow>('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  }

  // 设备API
  async connectDevice(deviceId: string): Promise<DeviceStatus> {
    return this.request<DeviceStatus>('/devices/connect', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  }

  // 执行API
  async startExecution(workflowId: string): Promise<Execution> {
    return this.request<Execution>('/executions', {
      method: 'POST',
      body: JSON.stringify({ workflowId }),
    });
  }
}
```

### 2.2 类型同步机制

#### 自动类型生成
```json
// scripts/generate-types.json
{
  "sources": [
    {
      "backend": "apps/backend/src/**/*.types.ts",
      "frontend": "apps/frontend/src/types/backend.ts",
      "shared": "packages/types/src"
    }
  ],
  "generators": {
    "api-client": "scripts/generate-api-client.ts",
    "type-definitions": "scripts/generate-type-definitions.ts"
  }
}
```

#### 类型验证中间件
```typescript
// apps/backend/src/middleware/validation.middleware.ts
@Injectable()
export class ValidationMiddleware implements NestMiddleware {
  constructor(private readonly schema: Schema) {}

  use(req: Request, res: Response, next: NextFunction) {
    const { error } = this.schema.validate(req.body);
    if (error) {
      throw new BadRequestException(error.details);
    }
    next();
  }
}
```

### 2.3 接口测试方案

#### 自动化测试
```typescript
// test/integration/api-integration.spec.ts
describe('API Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingModule();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Workflow API', () => {
    it('should create workflow', async () => {
      const workflow = createTestWorkflow();
      const response = await request(app.getHttpServer())
        .post('/api/v1/workflows')
        .send(workflow)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: workflow.name,
        nodes: workflow.nodes,
      });
    });
  });

  describe('Device API', () => {
    it('should connect device', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/devices/connect')
        .send({ deviceId: 'test-device' })
        .expect(200);

      expect(response.body).toMatchObject({
        connected: true,
        deviceId: 'test-device',
      });
    });
  });
});
```

## 3. FastAPI功能扩展与前端节点增加方案

### 3.1 FastAPI功能扩展

#### 新增测量类型
```python
# apps/backend/scripts/measurement_types/cyclic_voltammetry.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class CyclicVoltammetryParams(BaseModel):
    start_voltage: float
    end_voltage: float
    scan_rate: float
    cycles: int
    sample_interval: float

@router.post("/measure/cyclic_voltammetry")
async def cyclic_voltammetry(params: CyclicVoltammetryParams):
    """
    执行循环伏安法测量
    """
    try:
        # 实现循环伏安法测量逻辑
        result = await perform_cv_measurement(params)
        return {
            "success": True,
            "data": result,
            "measurement_type": "cyclic_voltammetry"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
```

#### 设备管理功能
```python
# apps/backend/scripts/device_management.py
from fastapi import APIRouter, HTTPException
from typing import List, Dict

router = APIRouter()

class DeviceInfo(BaseModel):
    device_id: str
    device_type: str
    capabilities: List[str]
    status: str
    last_seen: float

@router.get("/devices/list")
async def list_devices() -> List[DeviceInfo]:
    """
    获取所有可用设备列表
    """
    devices = await scan_devices()
    return devices

@router.post("/devices/calibrate")
async def calibrate_device(device_id: str, calibration_params: Dict):
    """
    校准设备
    """
    result = await perform_calibration(device_id, calibration_params)
    return result
```

### 3.2 前端节点扩展

#### 节点定义配置
```json
// apps/frontend/src/nodes/types.ts
{
  "nodes": {
    "cyclic_voltammetry": {
      "type": "cyclic_voltammetry",
      "name": "循环伏安法",
      "category": "measurement",
      "description": "执行循环伏安法测量",
      "icon": "🔄",
      "input": { "type": "trigger", "label": "触发" },
      "output": { "type": "data", "label": "数据" },
      "parameters": {
        "start_voltage": { "type": "number", "label": "起始电压", "default": -0.5 },
        "end_voltage": { "type": "number", "label": "终止电压", "default": 0.5 },
        "scan_rate": { "type": "number", "label": "扫描速率", "default": 0.1 },
        "cycles": { "type": "integer", "label": "循环次数", "default": 3 }
      }
    },
    "device_calibration": {
      "type": "device_calibration",
      "name": "设备校准",
      "category": "device_control",
      "description": "校准电化学设备",
      "icon": "🔧",
      "input": { "type": "trigger", "label": "触发" },
      "output": { "type": "status", "label": "状态" },
      "parameters": {
        "calibration_type": { "type": "select", "label": "校准类型", "options": ["电位", "电流", "阻抗"] },
        "reference_value": { "type": "number", "label": "参考值", "default": 0.0 }
      }
    }
  }
}
```

#### 节点组件实现
```typescript
// apps/frontend/src/nodes/cyclic_voltammetry.node.tsx
export const CyclicVoltammetryNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    start_voltage: -0.5,
    end_voltage: 0.5,
    scan_rate: 0.1,
    cycles: 3
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">🔄</span>
        <span className="node-title">循环伏安法</span>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="起始电压 (V)"
          type="number"
          value={parameters.start_voltage}
          onChange={(value) => handleParameterChange('start_voltage', value)}
          step={0.01}
        />

        <ParameterInput
          label="终止电压 (V)"
          type="number"
          value={parameters.end_voltage}
          onChange={(value) => handleParameterChange('end_voltage', value)}
          step={0.01}
        />

        <ParameterInput
          label="扫描速率 (V/s)"
          type="number"
          value={parameters.scan_rate}
          onChange={(value) => handleParameterChange('scan_rate', value)}
          step={0.001}
        />

        <ParameterInput
          label="循环次数"
          type="integer"
          value={parameters.cycles}
          onChange={(value) => handleParameterChange('cycles', value)}
          min={1}
          max={100}
        />
      </div>
    </div>
  );
};
```

### 3.3 执行逻辑扩展

#### 后端执行逻辑
```typescript
// apps/backend/src/modules/execution/node-executors/cyclic_voltammetry.executor.ts
@Injectable()
export class CyclicVoltammetryExecutor {
  constructor(
    private readonly zahnerService: ZahnerZenniumService,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(node: WorkflowNode, context: ExecutionContext): Promise<ExecutionResult> {
    this.notificationService.notify('info', '开始循环伏安法测量', 'CyclicVoltammetryExecutor', 'execute');

    try {
      const result = await this.zahnerService.executeMeasurement({
        type: 'cyclic_voltammetry',
        parameters: node.parameters,
        nodeId: node.id,
        workflowId: context.workflowId,
      });

      return {
        success: true,
        data: result,
        nodeId: node.id,
        executionTime: Date.now() - context.startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        nodeId: node.id,
        executionTime: Date.now() - context.startTime,
      };
    }
  }
}
```

#### 节点类型注册
```typescript
// apps/backend/src/modules/execution/execution.service.ts
@Injectable()
export class ExecutionService {
  private nodeExecutors = new Map<string, NodeExecutor>();

  constructor(
    private readonly cyclicVoltammetryExecutor: CyclicVoltammetryExecutor,
    private readonly deviceCalibrationExecutor: DeviceCalibrationExecutor,
  ) {
    this.registerExecutors();
  }

  private registerExecutors(): void {
    this.nodeExecutors.set('cyclic_voltammetry', this.cyclicVoltammetryExecutor);
    this.nodeExecutors.set('device_calibration', this.deviceCalibrationExecutor);
    // 注册其他执行器...
  }

  async executeNode(node: WorkflowNode, context: ExecutionContext): Promise<ExecutionResult> {
    const executor = this.nodeExecutors.get(node.type);
    if (!executor) {
      throw new Error(`No executor found for node type: ${node.type}`);
    }
    return executor.execute(node, context);
  }
}
```

## 4. 部署和测试方案

### 4.1 开发环境启动脚本
```bash
#!/bin/bash
# scripts/dev-start.sh

echo "启动ZahnerFlow开发环境..."

# 启动FastAPI设备服务
echo "启动FastAPI设备服务..."
cd apps/backend/scripts
python -m uvicorn zahner_device:app --reload --port 8000 &
FASTAPI_PID=$!

# 启动NestJS后端
echo "启动NestJS后端..."
cd ../..
pnpm dev:backend &
NESTJS_PID=$!

# 启动前端
echo "启动前端..."
pnpm dev:frontend &
FRONTEND_PID=$!

# 等待所有服务启动
sleep 10

echo "所有服务已启动:"
echo "- FastAPI: http://localhost:8000"
echo "- NestJS: http://localhost:3001"
echo "- Frontend: http://localhost:8081"

# 清理函数
cleanup() {
    echo "关闭所有服务..."
    kill $FASTAPI_PID $NESTJS_PID $FRONTEND_PID
    exit 0
}

# 注册清理函数
trap cleanup SIGINT SIGTERM

# 保持脚本运行
wait
```

### 4.2 测试命令
```bash
# 运行所有测试
pnpm test

# 运行集成测试
pnpm test:integration

# 运行E2E测试
pnpm test:e2e

# 运行后端测试
pnpm test:backend

# 运行前端测试
pnpm test:frontend
```

### 4.3 部署脚本
```bash
#!/bin/bash
# scripts/deploy.sh

echo "部署ZahnerFlow..."

# 构建项目
pnpm build

# 部署到生产环境
scp -r dist/* user@server:/path/to/deployment/

# 重启服务
ssh user@server "cd /path/to/deployment && docker-compose restart"

echo "部署完成!"
```

## 5. 监控和日志方案

### 5.1 日志记录
```typescript
// apps/backend/src/logger/logger.service.ts
@Injectable()
export class LoggerService {
  private readonly logger = new Logger('ExecutionLogger');

  logCommand(command: SubagentCommand): void {
    this.logger.log(`Executing command: ${command.type}`, {
      commandId: command.id,
      nodeId: command.nodeId,
      workflowId: command.workflowId,
      timestamp: command.timestamp,
    });
  }

  logResult(result: SubagentResult): void {
    if (result.success) {
      this.logger.log(`Command completed successfully: ${result.commandId}`, {
        executionTime: result.executionTime,
        dataSize: JSON.stringify(result.data).length,
      });
    } else {
      this.logger.error(`Command failed: ${result.commandId}`, {
        error: result.error,
        executionTime: result.executionTime,
      });
    }
  }
}
```

### 5.2 性能监控
```typescript
// apps/backend/src/monitoring/performance.monitor.ts
@Injectable()
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();

  recordExecutionTime(commandType: string, executionTime: number): void {
    if (!this.metrics.has(commandType)) {
      this.metrics.set(commandType, []);
    }
    this.metrics.get(commandType)!.push(executionTime);
  }

  getAverageExecutionTime(commandType: string): number {
    const times = this.metrics.get(commandType) || [];
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {};

    for (const [commandType, times] of this.metrics.entries()) {
      report[commandType] = {
        count: times.length,
        average: this.getAverageExecutionTime(commandType),
        min: Math.min(...times),
        max: Math.max(...times),
      };
    }

    return report;
  }
}
```

这个方案提供了完整的Subagent执行命令框架，涵盖了后端连接、接口校对、功能扩展等各个方面。方案具有以下特点：

1. **模块化设计**：各个组件职责明确，易于维护和扩展
2. **类型安全**：使用TypeScript确保类型一致性
3. **异步处理**：支持并发执行和队列管理
4. **错误处理**：完善的错误处理和重试机制
5. **监控和日志**：完整的性能监控和日志记录
6. **测试覆盖**：包含单元测试、集成测试和E2E测试