# 熔炉系统严格三层架构解决方案

## 问题分析总结

### 原始问题
1. **前端双重轮询机制**：useFurnace.ts中存在两套独立的轮询系统
2. **前端直接调用设备API**：绕过后端统一管理，违反架构原则
3. **缺乏WebSocket实时推送**：依赖轮询导致延迟和资源浪费
4. **轮询冲突**：多重轮询导致设备通信问题

### 架构违规
- 前端承担了Signal（信号）和Delivery（传输）双重职责
- 缺乏统一的数据流管理
- 违反了Signal-Delivery-Display严格分层原则

## 解决方案：严格三层架构

### 第一层：Signal（信号层） - 后端统一轮询管理

**核心职责**：
- 统一设备状态轮询
- 设备通信管理
- 信号生成和标准化

**实现文件**：
```
apps/backend/src/modules/furnace/furnace-polling-manager.service.ts
```

**关键特性**：
- 单一轮询源（2秒间隔）
- 智能订阅管理（仅在有订阅者时轮询）
- 设备忙碌状态检测
- 错误重试机制
- 采样数据生成（1秒间隔）

### 第二层：Delivery（传输层） - WebSocket实时推送

**核心职责**：
- 实时数据传输
- 连接管理
- 事件分发

**实现文件**：
```
apps/backend/src/gateways/furnace.gateway.ts
apps/frontend/src/services/furnace-websocket.service.ts
```

**关键特性**：
- 双向WebSocket通信
- 自动重连机制
- 订阅/取消订阅管理
- 多种事件类型支持（状态更新、采样数据、通知、错误）

### 第三层：Display（显示层） - 前端状态管理

**核心职责**：
- UI状态管理
- 用户交互处理
- 数据展示

**实现文件**：
```
apps/frontend/src/services/hooks/useFurnace.ts
```

**关键特性**：
- 移除所有前端轮询
- WebSocket事件监听
- 纯响应式状态更新
- 用户操作转发

## 技术实现细节

### 1. 后端轮询管理器

```typescript
@Injectable()
export class FurnacePollingManagerService {
  // 统一轮询逻辑
  private pollFurnaceStatus(): void {
    // 检查设备忙碌状态
    // 获取设备状态
    // 生成标准化状态更新
    // 广播到WebSocket订阅者
  }

  // 订阅管理
  subscribe(clientId: string): void
  unsubscribe(clientId: string): void
}
```

### 2. WebSocket传输层

```typescript
// 后端Gateway
@WebSocketGateway()
export class FurnaceGateway {
  sendFurnaceStatusUpdate(statusUpdate: any): void
  sendFurnaceSamplingData(samplingData: any): void
}

// 前端Service
export class FurnaceWebSocketService {
  subscribeToFurnace(): void
  onStatusUpdate(callback: Function): void
  onSamplingData(callback: Function): void
}
```

### 3. 前端显示层

```typescript
export function useFurnace(): [FurnaceState, FurnaceControls] {
  // WebSocket事件处理
  const handleStatusUpdate = useCallback((statusUpdate) => {
    updateState({ status: validatedStatus });
  }, []);

  // 连接时自动订阅
  const connect = useCallback(async () => {
    await FurnaceApi.connect(config);
    furnaceWebSocketService.subscribeToFurnace();
  }, []);
}
```

## 严格分层保证

### 1. 职责分离
- **Signal层**：只负责设备通信和信号生成
- **Delivery层**：只负责数据传输和连接管理
- **Display层**：只负责UI状态和用户交互

### 2. 数据流向
```
Device → Signal Layer → Delivery Layer → Display Layer
   ↑                                                    ↓
   └─────── Control Commands (only user actions) ─────────┘
```

### 3. 通信模式
- **上行**：设备 → 轮询管理器 → WebSocket → 前端
- **下行**：用户操作 → API → 设备服务 → 设备

## 性能优化

### 1. 智能轮询
- 仅在有WebSocket订阅者时启动轮询
- 设备忙碌时自动暂停轮询
- 连接失败时指数退避重试

### 2. 事件驱动
- 状态变化时立即推送
- 采样数据定期推送
- 错误事件实时通知

### 3. 资源管理
- 连接池管理
- 内存缓冲区限制
- 自动清理机制

## 监控和诊断

### 1. 轮询状态监控
```typescript
GET /api/devices/furnace/polling/status
{
  "is_polling": boolean,
  "is_sampling": boolean,
  "subscriber_count": number,
  "retry_count": number,
  "last_update": string
}
```

### 2. 连接统计
```typescript
// WebSocket Gateway统计
{
  "totalClients": number,
  "subscribedToFurnace": number,
  "clientDetails": [...]
}
```

## 兼容性和迁移

### 1. API兼容性
- 保持所有现有API端点不变
- 新增WebSocket功能作为增强
- 渐进式迁移支持

### 2. 配置参数
- 使用snake_case命名规范
- 现有配置继续有效
- 新增WebSocket相关配置

## 部署注意事项

### 1. 服务依赖
```typescript
// furnace.module.ts更新
@Module({
  imports: [GatewayModule, SamplingModule],
  providers: [
    FurnaceService,
    FurnaceDeviceService,
    FurnacePollingManagerService,
    FurnaceGateway,
  ],
})
```

### 2. 端口和CORS配置
- WebSocket服务端口：3001
- 支持的开发环境端口：8081, 8083, 4173, 3000

## 测试建议

### 1. 功能测试
- WebSocket连接稳定性
- 订阅/取消订阅功能
- 状态更新实时性
- 错误处理和重连

### 2. 性能测试
- 多客户端并发连接
- 长时间连接稳定性
- 内存使用情况
- 轮询效率对比

### 3. 集成测试
- 设备连接断开场景
- 网络中断恢复
- 前后端同步

## 总结

此解决方案实现了严格的三层架构设计：
1. **移除了前端双重轮询机制**，解决了轮询冲突问题
2. **建立了WebSocket实时数据推送**，提高了响应速度
3. **实现了职责清晰的三层分离**，符合架构最佳实践
4. **保持了完全的向后兼容性**，支持渐进式升级

通过这种架构，熔炉系统现在具有更好的性能、可维护性和扩展性，同时解决了原有的轮询冲突和通信中断问题。