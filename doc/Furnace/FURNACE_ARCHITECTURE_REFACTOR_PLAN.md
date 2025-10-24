# 熔炉系统前后端架构重构规划报告

## 概述

本报告针对工业控制系统中的熔炉（Furnace）模块进行前后端架构重构规划。基于**严格的三层架构设计原则**，确保架构的清晰性和稳定性。重构目标是**解决轮询冲突问题、优化组件结构、提升代码可维护性**，同时严格遵循前端显示层、后端应用逻辑层、设备驱动层的职责分离。

---

## Part 1: 现有模块功能及重构评估

### 核心模块分析表格

| 模块/文件 | 所在层 | 当前核心功能描述 | 建议行动 | 建议理由/去向 |
|---------|--------|------------------|----------|---------------|
| **后端 furnace.module** | 后端 (应用逻辑) | 熔炉设备业务逻辑，包括程序段管理、预设存储、设备控制API | **保留+小幅优化** | 结构合理，只需优化职责分离 |
| **后端 furnace.service** | 后端 (应用逻辑) | 熔炉核心业务逻辑，设备操作、预设管理、轮询控制 | **拆分** | 拆分为设备控制和数据管理两个服务，职责更清晰 |
| **后端 furnace.controller** | 后端 (API层) | REST API端点，处理前端请求 | **保留+优化** | 添加WebSocket支持，优化错误处理 |
| **后端 furnace-device.service** | 后端 (设备通信) | FastAPI客户端，处理与Python设备层的通信 | **保留+优化** | 优化轮询管理，增强错误恢复机制 |
| **后端 ai518p_device.py** | 后端 (设备层) | AI-518P温控器Python实现，串口通信、协议处理 | **优化** | 移除全局变量，实现无状态设计 |
| **前端 useFurnace.ts** | 前端 (状态管理) | 主状态管理Hook，包含连接、轮询、程序段管理 | **简化+合并** | 合并相关Hook，减少复杂性 |
| **前端 useFurnacePolling.ts** | 前端 (轮询管理) | 智能轮询管理，动态调整轮询频率 | **合并** | 合并到主Hook中，简化使用 |
| **前端 useFurnaceConnection.ts** | 前端 (连接管理) | 设备连接状态管理，端口选择、连接控制 | **保留+优化** | 增强错误处理和重连机制 |
| **前端 useFurnaceProgram.ts** | 前端 (程序管理) | 程序段读写、编辑、验证逻辑 | **保留** | 功能完整，无需大改 |
| **前端 useFurnacePresets.ts** | 前端 (预设管理) | 预设的增删改查、应用、回滚逻辑 | **保留** | 功能完整，无需大改 |
| **前端 DeviceModal.tsx** | 前端 (UI组件) | 熔炉控制界面，包含监控、程序段、预设等选项卡 | **拆分** | 按功能拆分为3-4个子组件，提高可维护性 |
| **前端 TemperatureChart.tsx** | 前端 (数据可视化) | 温度历史数据图表组件，使用ECharts渲染 | **通用化** | 优化为通用图表组件，支持配置化 |

### 详细功能分析

#### 后端模块分析

**1. furnace.service.ts 核心功能：**
- 设备连接管理和状态监控
- 程序段的读写操作（30个段，每段温度+时间）
- 预设管理（创建、读取、更新、删除、克隆、应用）
- 幂等操作支持（预设应用的回滚机制）
- 限流保护（5秒间隔的写操作保护）

**2. furnace-device.service.ts 核心功能：**
- FastAPI客户端封装
- HTTP请求/响应处理
- 超时控制（正常1.5s，扩展15s）
- 轮询暂停/恢复机制
- 连接状态管理

**3. ai518p_device.py 核心功能：**
- AI-518P温控器串口通信
- 协议帧构建和解析
- 设备状态读取（PV、SV、MV、状态、段号等）
- 程序段读写操作
- 运行控制（启动、暂停、停止）
- 通信日志记录

#### 前端模块分析

**1. useFurnace.ts 状态管理：**
- 设备状态（PV、SV、MV、程序状态、段号等）
- 连接状态管理
- 程序段数据缓存
- 预设数据管理
- 历史数据管理
- 错误处理和重试机制

**2. DeviceModal.tsx UI组件：**
- 多选项卡界面（监控、程序段、预设、记录、历史）
- 实时状态显示
- 程序段网格编辑（30个段）
- 温度趋势图表
- 设备连接管理
- 控制按钮（运行、暂停、停止、段切换）

**3. TemperatureChart.tsx 数据可视化：**
- ECharts温度历史图表
- 实时数据更新
- 多条曲线显示（PV、SV、MV）
- 时间轴缩放
- 数据加载状态

---

## Part 2: 简化的新架构方案

### 🎯 核心问题识别

通过分析现有系统，我们发现违反三层架构原则的关键问题：

1. **前端轮询违规**：前端页面直接调用设备API，违反前端层职责
2. **后端轮询冲突**：多个页面同时轮询导致设备通信冲突
3. **全局状态违规**：Python设备层使用全局变量，违反无状态设计原则
4. **组件职责混乱**：前端组件包含业务逻辑，违反关注点分离
5. **初始化逻辑错误**：后端在未连接端口时尝试初始化，违反正确初始化顺序

### 💡 设计原则

**严格三层架构，职责分离：**
- **前端层**：仅负责信号（Signal）和显示（Display），禁止直接设备通信
- **后端层**：统一业务逻辑处理和设备调度，单一数据源原则
- **设备层**：提供原子化、无状态的设备操作接口
- **初始化顺序**：先连接端口，后进行服务初始化
- **数据流向**：前端→后端→设备层，严格的单向数据流

### A. 后端简化重构方案

#### 组织原则：
严格遵循三层架构原则，确保职责清晰分离。保持现有模块结构，进行**架构合规性重构**，修复违反架构原则的部分。

#### 新的目录结构：
```
apps/backend/src/
├── modules/
│   └── furnace/                    # 熔炉模块（保持现有结构）
│       ├── controllers/
│       │   └── furnace.controller.ts        # 添加WebSocket支持
│       ├── services/
│       │   ├── furnace-control.service.ts   # 新增：设备控制逻辑
│       │   ├── furnace-data.service.ts      # 新增：数据管理逻辑
│       │   └── furnace-preset.service.ts    # 从原service拆分
│       ├── dto/                          # 数据传输对象
│       │   ├── furnace-status.dto.ts       # 新增：状态DTO
│       │   └── program-segment.dto.ts      # 新增：程序段DTO
│       └── furnace.module.ts              # 模块定义
├── devices/                     # 设备通信层（保持现有结构）
│   └── furnace-device.service.ts         # 优化轮询管理
├── websocket/                   # 新增：WebSocket服务
│   └── furnace.gateway.ts              # 熔炉实时数据推送
├── shared/                     # 共享模块（保持现有结构）
│   ├── sampling/               # 数据采样服务
│   │   └── sampling.service.ts         # 优化采样逻辑
│   └── utils/                  # 通用工具
│       ├── error-handler.util.ts        # 新增：统一错误处理
│       └── retry.util.ts               # 新增：重试机制
└── drivers/                    # 设备驱动层（优化现有Python代码）
    └── ai518p_device.py               # 移除全局变量，无状态设计
```

#### 关键改进点：

**1. 服务拆分（最小化改动）：**
```typescript
// 原来：furnace.service.ts (过于庞大)
// 现在：拆分为两个专职服务

// furnace-control.service.ts - 专注设备控制
@Injectable()
export class FurnaceControlService {
  constructor(private device: FurnaceDeviceService) {}

  async run() { return this.device.run(); }
  async pause() { return this.device.pause(); }
  async stop() { return this.device.stop(); }
  async setSegment(segment: number) { return this.device.setSegment(segment); }
  async getStatus() { return this.device.status(); }
}

// furnace-data.service.ts - 专注数据管理
@Injectable()
export class FurnaceDataService {
  constructor(private samplingService: SamplingService) {}

  async getHistoryData(params: HistoryQueryParams) {
    return this.samplingService.getFurnaceHistory(params);
  }

  async exportData(dateRange: DateRange) {
    // 数据导出逻辑
  }
}
```

**2. 后端统一轮询 + WebSocket推送（解决轮询冲突）：**
```typescript
// websocket/furnace.gateway.ts
@WebSocketGateway({
  namespace: '/furnace',
  cors: true
})
export class FurnaceGateway {
  @WebSocketServer()
  server: Server;

  private statusInterval: NodeJS.Timeout;

  constructor(private furnaceControl: FurnaceControlService) {
    this.startStatusPolling();
  }

  private startStatusPolling() {
    // 🔴 关键：后端统一轮询，禁止前端轮询
    // 只有后端可以主动轮询设备，前端只能通过WebSocket接收数据
    this.statusInterval = setInterval(async () => {
      try {
        const status = await this.furnaceControl.getStatus();
        if (status) {
          this.server.emit('status', status);
        }
      } catch (error) {
        this.server.emit('error', { message: error.message });
      }
    }, 1000);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket) {
    // 客户端订阅，立即发送当前状态
  }
}
```

**3. 无状态设备驱动（解决全局变量问题）：**
```python
# drivers/ai518p_device.py - 优化后
class FurnaceDeviceManager:
    """设备管理器 - 无状态设计"""

    def __init__(self):
        self.connections = {}  # 连接池替代全局变量

    async def create_connection(self, config: ConnectRequest) -> str:
        """创建设备连接"""
        connection_id = f"{config.port}_{config.address}"

        if connection_id in self.connections:
            await self.remove_connection(connection_id)

        controller = AI518PController(
            port=config.port,
            baudrate=config.baudrate,
            address=config.address
        )

        controller.connect()
        self.connections[connection_id] = controller
        return connection_id

    async def get_status(self, connection_id: str):
        """获取设备状态"""
        if connection_id not in self.connections:
            raise DeviceNotConnectedError(f"Connection {connection_id} not found")

        controller = self.connections[connection_id]
        return controller.get_all_status()

# 全局管理器实例（线程安全）
device_manager = FurnaceDeviceManager()
```

### B. 前端简化重构方案

#### 组织原则：
按功能特性组织，但保持结构简单，避免过度抽象。

#### 新的目录结构：
```
apps/frontend/src/
├── features/
│   └── furnace/                  # 熔炉功能模块
│       ├── components/           # 熔炉相关组件
│       │   ├── FurnaceModal.tsx          # 主模态框（简化后）
│       │   ├── StatusPanel.tsx           # 实时状态面板
│       │   ├── ProgramEditor.tsx         # 程序段编辑器
│       │   ├── PresetManager.tsx         # 预设管理器
│       │   └── ConnectionPanel.tsx       # 连接管理面板
│       ├── hooks/               # 熔炉相关Hook
│       │   ├── useFurnace.ts             # 统一的状态管理Hook
│       │   ├── useFurnaceConnection.ts   # 连接管理
│       │   └── useFurnaceWebSocket.ts    # WebSocket连接
│       └── types/               # 类型定义
│           └── furnace.types.ts
├── components/                  # 通用组件
│   ├── charts/
│   │   └── TemperatureChart.tsx         # 通用温度图表
│   └── forms/
│       └── SegmentForm.tsx              # 程序段表单
├── hooks/                       # 通用Hook
│   ├── useWebSocket.ts                   # WebSocket Hook
│   └── useLocalStorage.ts               # 本地存储Hook
├── services/                    # 服务层
│   └── api/
│       ├── furnace.api.ts              # 熔炉API
│       └── websocket-client.ts         # WebSocket客户端
└── shared/                      # 共享资源
    ├── types/                  # 全局类型
    └── utils/                  # 工具函数
```

#### 关键改进点：

**1. 简化状态管理（合并Hook）：**
```typescript
// hooks/useFurnace.ts - 统一的状态管理
export function useFurnace() {
  const [state, setState] = useState<FurnaceState>(initialState);
  const wsClient = useWebSocket('/furnace');

  // WebSocket实时数据接收
  useEffect(() => {
    wsClient.on('status', (status: FurnaceStatus) => {
      setState(prev => ({
        ...prev,
        status,
        lastUpdate: new Date()
      }));
    });

    wsClient.on('error', (error: any) => {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
    });

    return () => wsClient.disconnect();
  }, []);

  // 统一的控制器方法
  const controls = useMemo(() => ({
    connect: async (config: ConnectionConfig) => {
      try {
        await furnaceApi.connect(config);
        setState(prev => ({ ...prev, connectionState: 'connected' }));
      } catch (error) {
        setState(prev => ({ ...prev, error }));
      }
    },

    run: async () => {
      try {
        await furnaceApi.run();
      } catch (error) {
        setState(prev => ({ ...prev, error }));
      }
    },

    // ... 其他控制方法
  }), []);

  return { state, controls };
}
```

**2. 组件拆分（提高可维护性）：**
```typescript
// components/FurnaceModal.tsx - 简化后的主组件
export const FurnaceModal: React.FC<FurnaceModalProps> = ({
  device, onClose, modalPosition
}) => {
  const { state, controls } = useFurnace();
  const [activeTab, setActiveTab] = useState('monitoring');

  return (
    <div className="device-modal furnace-modal">
      <div className="device-modal-content">
        <FurnaceHeader onClose={onClose} />

        <div className="modal-body">
          <FurnaceTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'monitoring' && (
            <StatusPanel state={state} controls={controls} />
          )}

          {activeTab === 'program' && (
            <ProgramEditor state={state} controls={controls} />
          )}

          {activeTab === 'presets' && (
            <PresetManager state={state} controls={controls} />
          )}
        </div>

        <ConnectionPanel state={state} controls={controls} />
      </div>
    </div>
  );
};
```

**3. WebSocket集成（替代轮询）：**
```typescript
// services/websocket-client.ts
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private messageHandlers: Map<string, Function[]> = new Map();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const handlers = this.messageHandlers.get(data.type) || [];
        handlers.forEach(handler => handler(data.payload));
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
    });
  }

  subscribe(type: string, handler: Function): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }

    this.messageHandlers.get(type)!.push(handler);

    // 返回取消订阅函数
    return () => {
      const handlers = this.messageHandlers.get(type) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  send(type: string, payload: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
```

**Q2: 如何确保轮询冲突问题的彻底解决？**

**A:** 通过严格遵循三层架构原则：
- **后端统一轮询**：只有后端可以轮询设备，前端严格禁止轮询
- **WebSocket实时推送**：后端通过WebSocket向前端推送状态更新
- **单一数据源**：确保所有前端都从同一个数据源获取信息
- **连接池管理**：避免多个连接同时操作设备，确保通信稳定性
- **操作队列**：设备操作进入队列，串行执行，避免冲突

**Q3: 新架构如何支持后续扩展？**

**A:** 通过合理的分层设计：
- **模块化结构**：新功能可以作为独立模块添加
- **接口抽象**：设备接口抽象支持新设备类型
- **配置化设计**：通过配置文件支持不同场景
- **插件机制**：预留扩展点，支持功能插件
