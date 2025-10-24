# 炉子系统正确运行方式指导手册

## 核心原则：严格三层架构

### 1. 前端层（信号、显示）
**角色：** 人机交互层 (Presentation/HMI Layer)

**核心功能：**
- **显示（Display）：** 负责数据的可视化、设备状态的展示、报警信息的提示等
- **信号（Signal）：** 接收用户的操作指令（如点击按钮、输入参数）并将其转化为系统可识别的请求信号

**严格禁止：**
- ❌ 直接调用设备层API（如 `furnace_control.py`）
- ❌ 包含任何设备通信代码
- ❌ 自主发起轮询请求
- ❌ 执行业务逻辑判断

**正确实现：**
```typescript
// ✅ 前端正确实现 - 仅发送用户操作信号
async function handleStartButton() {
  try {
    await apiClient.post('/api/furnace/start', {
      segment_id: selectedSegment
    });
  } catch (error) {
    showError('启动失败');
  }
}

// ✅ 前端正确实现 - 订阅实时数据
const { data: furnaceStatus } = useWebSocket('/ws/furnace/status');
```

### 2. 后端层（设备层通信、逻辑处理）
**角色：** 应用逻辑层 (Application/Business Logic Layer)

**核心功能：**
- **逻辑处理（Logic Processing）：** 系统的"大脑"，处理前端请求，根据业务规则决定操作
- **设备层通信（Device Layer Communication）：** 作为前端和设备层API之间的桥梁
- **统一轮询管理：** 单一数据源原则，避免轮询冲突

**关键职责：**
- ✅ 统一管理所有设备轮询
- ✅ 维护系统状态的一致性
- ✅ 执行业务规则和权限验证
- ✅ 实现实时数据推送（WebSocket）

**正确实现：**
```python
# ✅ 后端正确实现 - 统一轮询管理
class FurnaceManager:
    def __init__(self):
        self.polling_task = None
        self.subscribers = set()
        self.current_status = {}

    async def start_polling(self):
        """单一轮询实例，避免冲突"""
        if self.polling_task is None:
            self.polling_task = asyncio.create_task(self._poll_loop())

    async def _poll_loop(self):
        """统一轮询循环"""
        while True:
            try:
                # 调用设备层API获取数据
                status = await furnace_control.get_status()

                # 更新状态
                self.current_status = status

                # 推送给所有订阅者
                await self._broadcast_update(status)

                await asyncio.sleep(1)  # 轮询间隔
            except Exception as e:
                logger.error(f"轮询错误: {e}")
                await self._handle_error(e)

    async def handle_start_command(self, segment_id: int):
        """处理前端启动命令"""
        # 业务逻辑验证
        if not self._can_start(segment_id):
            raise BusinessLogicError("设备状态不允许启动")

        # 调用设备层API
        await furnace_control.start_segment(segment_id)
```

### 3. 设备层API（设备通信、原语）
**角色：** 驱动/数据访问层 (Driver/Data Access Layer)

**核心功能：**
- **设备通信（Device Communication）：** 处理实际的通信协议
- **原语（Primitives）：** 提供最基础、最原子化的操作接口

**设计原则：**
- ✅ 原子化操作，不可再分
- ✅ 无状态设计
- ✅ 协议抽象，隐藏硬件细节
- ✅ 线程安全

**正确实现：**
```python
# ✅ 设备层API正确实现 - 原子化操作
class FurnaceControl:
    async def read_temperature(self) -> float:
        """读取温度 - 原子操作"""
        return await self._read_register(TEMP_REGISTER)

    async def read_segment_data(self, segment_id: int) -> dict:
        """读取程序段数据 - 原子操作"""
        return await self._read_segment(segment_id)

    async def start_segment(self, segment_id: int) -> bool:
        """启动程序段 - 原子操作"""
        return await self._write_command(START_CMD, segment_id)
```

## 正确的数据流和控制流

### A. 命令/控制流（从上到下）
```
前端：用户点击"启动设备"按钮
    ↓ 发送HTTP请求 /api/furnace/start
后端：接收请求 → 业务逻辑验证 → 调用设备层API
    ↓ furnace_control.start_segment(segment_id)
设备层API：转换为通信协议指令 → 发送给设备
```

### B. 状态/数据流（从下到上）
```
设备层API：从设备接收数据 → 返回给后端
    ↓ furnace_control.get_status()
后端：统一轮询 → 数据处理 → 状态管理
    ↓ WebSocket推送 /ws/furnace/status
前端：订阅接收 → 更新界面显示
```

## 关键实现要求

### 1. 单一数据源原则
- **唯一轮询实例：** 整个系统只能有一个轮询实例
- **统一状态管理：** 所有设备状态由后端统一维护
- **禁止重复轮询：** 前端页面禁止独立轮询设备状态

### 2. 实时数据推送
```python
# ✅ 后端WebSocket实现
@app.websocket("/ws/furnace/status")
async def furnace_status_websocket(websocket: WebSocket):
    await websocket.accept()

    # 添加到订阅列表
    furnace_manager.add_subscriber(websocket)

    try:
        # 保持连接，等待关闭
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        # 移除订阅
        furnace_manager.remove_subscriber(websocket)
```

### 3. 前端订阅模式
```typescript
// ✅ 前端WebSocket订阅
const furnaceSocket = new WebSocket('/ws/furnace/status');

furnaceSocket.onmessage = (event) => {
  const status = JSON.parse(event.data);
  updateFurnaceDisplay(status);
};

// ❌ 禁止：前端直接轮询
// setInterval(() => {
//   fetch('/api/furnace/status')  // 错误！会导致轮询冲突
// }, 1000);
```

### 4. 错误处理和恢复
```python
# ✅ 后端错误处理
async def _handle_error(self, error: Exception):
    """统一错误处理"""
    # 记录错误
    logger.error(f"设备通信错误: {error}")

    # 通知所有订阅者
    error_message = {
        'type': 'error',
        'message': str(error),
        'timestamp': datetime.now().isoformat()
    }
    await self._broadcast_error(error_message)

    # 尝试重连
    await self._attempt_reconnection()
```

## 常见错误和纠正

### ❌ 错误实现1：前端直接轮询
```typescript
// 错误！会导致轮询冲突
useEffect(() => {
  const interval = setInterval(async () => {
    const data = await fetch('/api/furnace/status');
    setStatus(data);
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### ✅ 正确实现1：WebSocket订阅
```typescript
// 正确！订阅后端推送的数据
useEffect(() => {
  const socket = new WebSocket('/ws/furnace/status');

  socket.onmessage = (event) => {
    setStatus(JSON.parse(event.data));
  };

  return () => socket.close();
}, []);
```

### ❌ 错误实现2：多页面独立轮询
```python
# 错误！每个页面都会创建轮询实例
@app.get("/api/furnace/status")
async def get_furnace_status():
    # 多个页面同时调用，造成竞争条件
    return await furnace_control.get_status()
```

### ✅ 正确实现2：统一轮询管理
```python
# 正确！单一轮询实例管理
furnace_manager = FurnaceManager()

@app.on_event("startup")
async def startup():
    await furnace_manager.start_polling()  # 启动唯一轮询实例

@app.websocket("/ws/furnace/status")
async def furnace_status_websocket(websocket: WebSocket):
    # 所有页面通过WebSocket订阅同一个数据源
    return await furnace_manager.handle_subscription(websocket)
```

## 监控和诊断

### 1. 轮询状态监控
```python
# 添加轮询健康检查
@app.get("/api/furnace/health")
async def furnace_health_check():
    return {
        "polling_active": furnace_manager.is_polling(),
        "last_update": furnace_manager.last_update_time,
        "subscriber_count": len(furnace_manager.subscribers),
        "error_count": furnace_manager.error_count
    }
```
