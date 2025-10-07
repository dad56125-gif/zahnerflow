# 设备控制模块 (DeviceControl)

## 设计原则 (Design Principles)

- **分层架构**: 采用三层架构模式，Python FastAPI → NestJS后端 → 前端界面
- **实时通知**: 基于WebSocket实现设备状态的实时更新和通知推送
- **接口标准化**: 统一使用HTTP/JSON协议，确保前后端通信的一致性
- **状态同步**: 通过事件驱动机制保证设备状态在各层级间的实时同步

## 对外接口 (Public API)

### Python FastAPI接口
- `POST /eis` - 执行EIS电化学阻抗谱测量
- `POST /potentiostatic` - 执行恒电位测量
- `POST /galvanostatic` - 执行恒电流测量
- `GET /status` - 获取设备连接状态
- `POST /connect` - 连接设备
- `POST /disconnect` - 断开设备连接

### NestJS服务接口
- `DeviceService` - 设备控制服务封装
- `DeviceNotificationService` - 设备状态通知服务
- `MeasurementDataService` - 测量数据处理服务

### 前端接口
- 设备节点可视化组件
- 实时状态监控面板
- 参数配置界面

## 主要功能列表 (Key Functions)

1. **设备连接管理**
   - 自动设备检测与连接
   - 连接状态监控与恢复
   - 设备断开检测

2. **电化学测量执行**
   - EIS电化学阻抗谱测量
   - 恒电位/恒电流测量
   - 自定义测量协议支持

3. **实时数据传输**
   - 测量数据实时采集
   - 状态变更实时通知
   - 错误信息实时推送

4. **参数配置管理**
   - 测量参数验证
   - 设备配置同步
   - 参数模板管理

## 核心数据模型 (Core Data Model)

### 设备状态模型
```typescript
interface DeviceStatus {
  id: string;
  name: string;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'busy' | 'error';
  lastUpdate: Date;
}
```

### 测量参数模型
```typescript
interface MeasurementParameters {
  technique: 'eis' | 'potentiostatic' | 'galvanostatic';
  parameters: Record<string, any>;
  outputPath: string;
}
```

### 测量数据模型
```typescript
interface MeasurementData {
  id: string;
  timestamp: Date;
  parameters: MeasurementParameters;
  data: Array<number[]>;
  metadata: Record<string, any>;
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **Thales SDK**: Zahner设备官方SDK
- **FastAPI**: Python后端框架
- **WebSocket**: 实时通信协议

### 内部依赖
- **EventBus**: 事件总线模块
- **NotificationSystem**: 通知系统模块
- **DataFlow**: 数据流处理模块

## 典型端到端工作流程 (Typical Workflow)

1. **设备初始化**
   ```
   前端发起连接请求 → NestJS调用FastAPI → Python连接设备 → 返回连接状态
   ```

2. **测量执行流程**
   ```
   前端配置参数 → 参数验证 → 发起测量请求 → 设备执行测量 → 实时数据推送 → 测量完成通知
   ```

3. **状态监控流程**
   ```
   设备状态变更 → Python检测状态 → 发送通知事件 → EventBus分发 → 前端更新显示
   ```

4. **错误处理流程**
   ```
   设备异常 → Python捕获错误 → 发送错误通知 → 前端显示错误 → 用户确认处理
   ```