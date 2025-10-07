# SleepDelay - 延迟睡眠模块

## 设计原则 (Design Principles)

- **精确时间控制**: 提供可配置的精确延迟功能，支持0.1秒到24小时的时间范围
- **非阻塞执行**: 使用轮询机制避免完全阻塞事件循环，保持系统响应性
- **用户友好**: 提供直观的参数配置界面和实时进度反馈
- **可中断设计**: 支持用户取消等待操作，提高工作流控制的灵活性
- **通知集成**: 与通知系统深度集成，提供完整的等待生命周期通知

## 对外接口 (Public API)

### 节点类型定义
```typescript
// 节点类型
type NodeType = 'wait_delay';

// 节点配置参数
interface WaitDelayConfig {
  duration: number;        // 延迟时长（秒）
  description?: string;    // 延迟描述
  allow_cancel?: boolean;  // 是否允许取消
}
```

### 执行服务接口
```typescript
interface ExecutionService {
  // 执行等待/延迟节点
  executeWaitDelay(config: WaitDelayConfig): Promise<void>;

  // 估算执行时间
  getEstimatedExecutionTime(nodeType: 'wait_delay', parameters: WaitDelayConfig): number;
}
```

### 参数输入组件接口
```typescript
interface ParameterInputProps {
  label: string;
  type: 'number' | 'text' | 'boolean';
  value: any;
  onChange: (value: any) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  unit?: string;
}
```

## 主要功能列表 (Key Functions)

- **延迟执行**: 支持可配置的时间延迟，范围从0.1秒到24小时
- **参数配置**: 提供duration、description、allow_cancel三个核心参数
- **进度通知**: 长时间等待（>10秒）时提供进度更新通知
- **取消支持**: 可配置是否允许用户中途取消等待
- **状态集成**: 与现有状态机系统完全集成
- **时间估算**: 准确估算等待时间用于工作流计划
- **通知集成**: 等待开始、进度、完成时发送相应通知

## 核心数据模型 (Core Data Model)

### WaitDelayNode类型
```typescript
interface WaitDelayNode {
  type: 'wait_delay';
  category: 'flow_control';
  name: string;
  description: string;
  parameters: {
    duration: number;        // 必需：延迟时长（秒）
    description?: string;    // 可选：延迟描述
    allow_cancel?: boolean;  // 可选：是否允许取消，默认true
  };
}
```

### 默认参数
```typescript
const defaultParameters = {
  duration: 1.0,           // 默认1秒
  description: '',         // 默认空描述
  allow_cancel: true       // 默认允许取消
};
```

### 参数约束
- **duration**: 0.1 ≤ duration ≤ 86400（24小时），步长0.1秒
- **description**: 最大200字符
- **allow_cancel**: 布尔值，默认true

## 模块依赖关系 (Dependencies)

### 核心依赖
- **ExecutionService**: 执行服务，负责节点执行逻辑
- **NotificationService**: 通知服务，负责等待生命周期通知
- **StateLinkageManager**: 状态管理器，负责状态同步
- **WorkflowGateway**: WebSocket网关，负责实时通信

### 前端依赖
- **React**: 组件渲染框架
- **ParameterInput**: 通用参数输入组件
- **NodeStatusIndicator**: 节点状态指示器
- **Glass UI**: UI样式系统

### 后端依赖
- **ExecutionModule**: 执行模块
- **NotificationModule**: 通知模块
- **TypeScript**: 类型系统

## 典型端到端工作流程 (Typical Workflow)

### 1. 节点创建流程
1. 用户从节点面板选择"Wait/Delay"节点
2. 拖拽节点到工作流画布
3. 系统创建wait_delay类型节点实例
4. 应用默认参数配置

### 2. 参数配置流程
1. 用户点击节点打开配置面板
2. 配置duration参数（1.0-86400秒）
3. 可选配置description描述信息
4. 可选配置allow_cancel取消选项
5. 实时参数验证和保存

### 3. 工作流执行流程
1. 工作流执行到wait_delay节点
2. 后端调用executeWaitDelay方法
3. 发送等待开始通知
4. 开始轮询等待循环
5. 长时间等待时发送进度通知
6. 等待完成或被用户取消
7. 发送等待完成通知

### 4. 状态管理流程
1. 节点状态设置为running
2. 等待期间保持running状态
3. 完成时设置为completed状态
4. 取消时设置为cancelled状态
5. 通过WebSocket实时同步到前端

### 5. 用户交互流程
1. 等待期间显示进度信息
2. allow_cancel为true时显示取消按钮
3. 用户点击取消触发中断逻辑
4. 系统清理等待状态
5. 继续执行后续节点或结束工作流

### 6. 错误处理流程
1. 参数验证失败时抛出错误
2. 等待被中断时发送取消通知
3. WebSocket断开时自动重连
4. 异常情况时设置failed状态
5. 错误信息通过通知系统发送