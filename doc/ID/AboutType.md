# ID 类型定义

## 接口类型

### 核心ID接口

```typescript
// 工作流节点ID接口
interface ElectrochemicalNode {
  id: string;
  type: NodeType;
  name: string;
  category: NodeCategory;
  position: { x: number; y: number };
  data: NodeData;
  status: NodeStatus;
  input: Port;
  output: Port;
  style: NodeStyle;
}

// 循环节点接口
interface LoopStartNode extends ElectrochemicalNode {
  type: 'loop_start';
  data: NodeData & {
    parameters: {
      loop_count: number;
      loop_variable: string;
      start_value: number;
      step: number;
      loop_id: string;
    };
  };
}

interface LoopEndNode extends ElectrochemicalNode {
  type: 'loop_end';
  data: NodeData & {
    parameters: {
      loop_id: string;
    };
  };
}

// 循环上下文接口
interface LoopContext {
  loop_id: string;
  start_node: LoopStartNode;
  end_node: LoopEndNode;
  level: number;
  iterations: number;
  current_iteration: number;
  variable_name: string;
  variable_value: number;
}

// 循环配对信息
interface LoopPair {
  start_node_id: string;
  end_node_id: string;
  loop_id: string;
  level: number;
}
```

### API相关ID接口

#### 前端使用的接口定义 (来源: packages/types/src/api.types.ts)

```typescript
// 工作流接口 - 前端使用
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  workstation: WorkstationType;           // 前端包含设备类型
  status: WorkflowStatus;                 // 前端包含状态字段
  createdAt: Date;
  updatedAt: Date;
  ownerName?: string;
  individualName?: string;
}

// 工作流定义接口 - 前端使用
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  parameters?: Record<string, any>;       // 前端包含参数字段
  ownerName?: string;
  individualName?: string;
}
```

#### 后端使用的接口定义 (来源: apps/backend/src/interfaces/module-interfaces.ts)

```typescript
// 工作流接口 - 后端使用
export interface Workflow {
  id: string;
  name: string;
  description: string;                    // 后端为必填字段
  ownerName?: string;                     // 注释："便于列表页与存储索引使用"
  individualName?: string;                // 注释："便于列表页与存储索引使用"
  definition: WorkflowDefinition;
  version: number;                        // 后端顶层包含版本号
  createdAt: Date;
  updatedAt: Date;
  // 注意：后端不包含 workstation 和 status 字段
}

// 工作流定义接口 - 后端使用
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;                    // 后端为必填字段
  ownerName?: string;
  individualName?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
  // 注意：后端不包含 parameters 字段
}
```

#### 通用接口定义 (前后端共用)

```typescript
// 工作流节点接口 - 后端定义 (module-interfaces.ts)
export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  config: any;                         // 后端使用config字段
  position: { x: number; y: number };
}

// 工作流连接接口 - 后端定义 (module-interfaces.ts)
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// 工作流节点接口 - 前端定义 (@zahnerflow/types)
export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  data?: any;                           // 前端使用data字段
  config?: any;                         // 前端同时支持data和config
  status?: NodeStatus;                  // 前端包含状态字段
}

// 工作流连接接口 - 前端定义 (@zahnerflow/types)
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// 执行接口 - 前端定义 (@zahnerflow/types)
export interface Execution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  currentNode?: string;
  completedNodes: string[];
  results?: ExecutionResult;
}

// 设备接口
interface Device {
  id: string;
  type: WorkstationType;
  name: string;
  status: ApiDeviceStatus;
  isConnected: boolean;
  lastSeen: Date;
}

// 设备配置接口
interface DeviceConfiguration {
  id: string;
  type: WorkstationType;
  name: string;
  parameters: DeviceParameters;
  calibration: any;
  safety: any;
}

// 用户接口
interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}
```

### 执行相关ID接口

```typescript
// 执行结果接口
interface ExecutionResult {
  executionId: string;
  status: 'success' | 'failed';
  startTime: new Date(startTime);
  endTime: new Date();
  results: completedNodes[];
  error?: string;
}

// 执行更新消息接口
interface ExecutionUpdateMessage {
  executionId: string;
  status: ExecutionStatus;
  currentNode?: string;
  progress?: number;
  error?: string;
}

// WebSocket消息接口
interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

// 通知消息接口
interface NotificationMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  sourceFile: string;
  sourceFunction: string;
  details?: string;
  timestamp: Date;
  executionId: string;
  level: UserNotificationLevel | DebugNotificationLevel;
  layerTrace: string;
}
```

## 数据结构定义

### ID生成格式规范

```typescript
// Node ID 格式
type NodeIdFormat = `node_${number}_${string}`; // node_1703123456789_abc123

// Workflow ID 格式
type WorkflowIdFormat = `workflow_${string}`; // workflow_550e8400-e29b-41d4-a716-446655440000

// Execution ID 格式
type ExecutionIdFormat = `exec_${number}_${number}`; // exec_1_1703123456789

// Loop ID 格式
type LoopIdFormat = `loop_${number}_${string}`; // loop_1703123456789_def456

// Device Address 格式
type DeviceAddressFormat = string; // "1", "2", "3"

// Session ID 格式
type SessionIdFormat = `session_${number}`; // session_1703123456789
```

### 状态枚举类型

```typescript
// 节点状态类型
type NodeStatus = 'ready' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'pending';

// 工作流状态类型
type WorkflowStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed';

// 执行状态类型
type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

// 设备状态类型
type ApiDeviceStatus = 'online' | 'offline' | 'error' | 'maintenance';

// 工作站类型
type WorkstationType = 'zahner-zennium';

// 用户角色类型
type UserRole = 'admin' | 'operator' | 'viewer';
```

### 通知层级枚举

```typescript
// 用户通知层级
enum UserNotificationLevel {
  SYSTEM = 'system',
  WORKFLOW = 'workflow',
  DEVICE = 'device',
  OPERATION = 'operation',
  ERROR = 'error'
}

// 调试通知层级
enum DebugNotificationLevel {
  EXECUTION_DETAIL = 'execution_detail',
  STATE_CHANGE = 'state_change',
  NETWORK = 'network',
  PERFORMANCE = 'performance',
  INTERNAL = 'internal'
}

type NotificationLevel = UserNotificationLevel | DebugNotificationLevel;
```

### 执行上下文数据结构

```typescript
// 执行上下文映射
interface ExecutionContext {
  workflowId: string;
  executionId: string;
  startTime: Date;
}

// Hook规则数据结构
interface HookRule {
  id: string;
  name: string;
  enabled: boolean;
  loopBinding: { loopNodeId: string };
  trigger: {
    type: 'after_node' | 'before_node';
    nodeSelector: { id?: string; type?: string }
  };
  cycle: { every: number; offset?: number };
  limit?: { perIteration?: number; perRun?: number };
  action: {
    type: 'insert_node';
    placement: 'after' | 'before';
    nodeTemplate: { type: string; params: Record<string, any> };
    tag?: string;
    priority?: number
  };
}

// 循环框架数据结构
interface LoopFrame {
  loopNodeId: string;
  depth: number;
  startIp: number;
  endIp: number;
  iteration: number;
  total: number;
}
```

### 模块状态数据结构

```typescript
// 模块状态接口
interface ModuleStatus {
  state: 'initialized' | 'running' | 'stopped' | 'error';
  health: 'good' | 'warning' | 'error';
  lastCheck: Date;
  error?: string;
}

// API响应数据结构
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页响应数据结构
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// API错误数据结构
interface ApiError {
  code: string;
  message: string;
  details?: any;
}
```