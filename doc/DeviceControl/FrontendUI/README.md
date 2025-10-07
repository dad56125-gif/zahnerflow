# FrontendUI - 前端UI模块

## 设计原则 (Design Principles)

- **玻璃态设计**: 现代化的毛玻璃效果UI，提供优雅的视觉体验
- **状态可视化**: 丰富的节点状态显示，包括颜色、动画和状态指示器
- **实时响应**: 基于WebSocket的实时状态同步和UI更新
- **交互友好**: 直观的拖拽、连接和配置操作
- **响应式布局**: 适配不同屏幕尺寸和分辨率

## 对外接口 (Public API)

### 节点组件接口
```typescript
interface NodeComponentProps {
  node: ElectrochemicalNode;
  onUpdate: (node: ElectrochemicalNode) => void;
  selected?: boolean;
  status?: NodeStatus;
}

interface ElectrochemicalNode {
  id: string;
  type: NodeType;
  name: string;
  position: { x: number; y: number };
  status: NodeStatus;
  parameters: Record<string, any>;
  style: NodeStyle;
}
```

### 状态管理接口
```typescript
interface StateLinkageManager {
  initialize(): Promise<void>;
  setNodesUpdateCallback(callback: (nodes: ElectrochemicalNode[]) => void): void;
  setExecutionUpdateCallback(callback: (state: ExecutionState) => void): void;
  startExecution(workflowId: string, nodes: ElectrochemicalNode[]): Promise<void>;
  pauseExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;
}
```

### WebSocket服务接口
```typescript
interface WorkflowWebSocketService {
  connect(): void;
  disconnect(): void;
  joinWorkflow(workflowId: string): void;
  leaveWorkflow(workflowId: string): void;
  onNodeStatusUpdate(callback: (update: NodeStatusUpdate) => void): void;
  onExecutionUpdate(callback: (update: ExecutionUpdate) => void): void;
}
```

## 主要功能列表 (Key Functions)

- **节点状态显示**: 支持7种节点状态的可视化显示，包括颜色、边框、阴影和动画效果
- **玻璃态UI**: 现代化的毛玻璃效果设计，提供半透明背景和模糊效果
- **实时状态同步**: 通过WebSocket实现前后端状态的实时同步和UI更新
- **工作流控制**: 提供开始、暂停、取消等执行控制功能
- **节点配置**: 支持节点参数的动态配置和实时更新
- **拖拽交互**: 基于ReactFlow的节点拖拽、连接和编辑功能
- **通知面板**: 实时显示系统通知和执行状态信息
- **响应式设计**: 适配不同屏幕尺寸的响应式布局

## 核心数据模型 (Core Data Model)

### 节点状态类型
```typescript
type NodeStatus = 'ready' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'pending';

interface NodeStatusUpdate {
  workflowId: string;
  nodeId: string;
  status: NodeStatus;
  data?: any;
  timestamp: Date;
}
```

### 节点样式定义
```typescript
interface NodeStyle {
  width: number;
  height: number;
  background: string;
  borderColor: string;
  borderRadius: string;
  textColor: string;
  icon: string;
}
```

### 执行状态
```typescript
interface ExecutionState {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  currentNode: string;
  completedNodes: string[];
  progress: number;
  startTime: Date;
  endTime?: Date;
}
```

### UI配置
```typescript
interface UIConfig {
  glassEffect: {
    blur: number;
    opacity: number;
    backgroundColor: string;
  };
  animations: {
    transitionDuration: string;
    pulseDuration: string;
  };
  colors: {
    primary: string;
    success: string;
    warning: string;
    error: string;
  };
}
```

## 模块依赖关系 (Dependencies)

### 核心依赖
- **React**: 前端框架，提供组件化和状态管理
- **ReactFlow**: 工作流可视化库，提供节点和边的渲染
- **Socket.IO**: WebSocket客户端，实现实时通信
- **TypeScript**: 类型系统，提供类型安全

### UI组件依赖
- **Glass UI**: 自定义玻璃态UI组件库
- **Node Components**: 各种类型节点的专用组件
- **Status Indicators**: 状态指示器和进度条组件
- **Control Panels**: 控制面板和配置界面

### 状态管理依赖
- **StateLinkageManager**: 状态联动管理器
- **WorkflowWebSocketService**: WebSocket服务
- **NotificationPanel**: 通知面板组件

### 样式依赖
- **CSS Variables**: CSS自定义属性
- **Backdrop Filter**: 毛玻璃效果滤镜
- **CSS Animations**: 动画和过渡效果

## 典型端到端工作流程 (Typical Workflow)

### 1. 应用初始化流程
1. React应用启动，加载主要组件
2. StateLinkageManager初始化WebSocket连接
3. 注册节点状态和执行状态更新回调
4. 加载工作流数据和节点配置
5. 渲染工作流画布和节点组件

### 2. 节点状态显示流程
1. 节点组件接收status属性
2. 根据状态应用相应的CSS类名
3. 渲染状态指示器和动画效果
4. WebSocket接收状态更新事件
5. 更新节点状态并重新渲染
6. 触发状态切换动画效果

### 3. 工作流执行控制流程
1. 用户点击开始执行按钮
2. 调用StateLinkageManager.startExecution
3. 发送API请求启动工作流执行
4. 更新本地执行状态
5. 节点状态开始实时更新
6. 显示执行进度和当前节点

### 4. 实时状态同步流程
1. WebSocket接收nodeStatusUpdate事件
2. StateLinkageManager处理状态更新
3. 更新本地节点状态数组
4. 触发React组件重新渲染
5. 应用新的状态样式和动画
6. 更新执行进度和相关UI

### 5. 用户交互流程
1. 用户拖拽节点到画布
2. ReactFlow处理拖拽事件
3. 更新节点位置状态
4. 创建节点间的连接关系
5. 验证工作流结构的合法性
6. 保存工作流配置

### 6. 错误处理和恢复流程
1. WebSocket连接断开时自动重连
2. API调用失败时显示错误提示
3. 状态同步失败时重新请求
4. 显示错误状态和恢复选项
5. 用户可以重试或取消操作
6. 系统保持稳定和响应性