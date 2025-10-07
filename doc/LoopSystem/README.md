# LoopSystem - 循环系统模块

## 设计原则 (Design Principles)

- **循环节点分离**: 明确区分循环开始(loop_start)和循环结束(loop_end)节点
- **可视化边界**: 使用中括号[]直观显示循环范围，长度自动调整
- **节点后缀命名**: 自动为循环内节点添加eis_01_01格式的层级后缀
- **嵌套支持**: 支持任意层级的嵌套循环，自动检测和管理
- **向后兼容**: 不影响现有工作流的正常执行

## 对外接口 (Public API)

### 循环节点类型
```typescript
// 循环开始节点
interface LoopStartNode {
  type: 'loop_start';
  parameters: {
    loop_count: number;      // 循环次数
    loop_variable: string;   // 循环变量名
    start_value: number;     // 起始值
    step: number;           // 步长
    loop_id: string;        // 循环唯一标识符
  };
}

// 循环结束节点
interface LoopEndNode {
  type: 'loop_end';
  parameters: {
    loop_id: string;        // 对应的循环开始节点ID
  };
}
```

### 循环上下文管理器
```typescript
interface LoopContextManager {
  enterLoop(loopId: string): void;
  incrementIteration(): void;
  exitLoop(): void;
  generateSuffix(): string;
  getNodeName(baseName: string): string;
}
```

### 循环配对管理器
```typescript
interface LoopPairManager {
  buildLoopPairs(nodes: Node[], edges: Edge[]): Map<string, string>;
  validateLoopPairs(): void;
  getLoopEnd(startNodeId: string): string | undefined;
  detectNestedLoops(nodes: Node[], edges: Edge[]): NestedLoopInfo[];
}
```

## 主要功能列表 (Key Functions)

- **循环节点创建**: 提供循环开始和结束节点，支持可视化循环定义
- **循环配对检测**: 自动检测和验证循环开始/结束节点的配对关系
- **嵌套循环支持**: 支持多层嵌套循环，自动计算层级和作用域
- **中括号可视化**: 渲染循环边界，根据层级调整样式和颜色
- **节点后缀生成**: 自动为循环内节点生成层级后缀命名
- **变量系统**: 支持循环变量定义和数学表达式解析
- **执行引擎集成**: 与执行引擎深度集成，支持循环执行流程

## 核心数据模型 (Core Data Model)

### 循环配置结构
```typescript
interface LoopConfig {
  loop_id: string;          // 循环唯一标识
  loop_count: number;       // 循环次数
  loop_variable: string;    // 循环变量名（如i, j, k）
  start_value: number;      // 起始值
  step: number;            // 步长
  current_iteration: number; // 当前迭代次数
}

// 嵌套循环信息
interface NestedLoopInfo {
  outerLoop: string;        // 外层循环ID
  innerLoops: string[];     // 内层循环ID列表
}

// 循环层级信息
interface LoopLevelInfo {
  loopId: string;
  level: number;           // 嵌套层级，从1开始
  parentId?: string;       // 父循环ID
}
```

### 节点后缀格式
- **格式**: `{原节点名}_{外层索引}_{内层索引}`
- **索引**: 从01开始编号，两位数补零
- **示例**: eis_01_01（第一层循环第一次迭代）
- **嵌套示例**: eis_01_02_03（三层嵌套循环）

### 状态管理
```typescript
interface LoopExecutionState {
  loopStack: Array<{
    loopId: string;
    iteration: number;
    maxIterations: number;
  }>;
  currentSuffix: string;
  isExecuting: boolean;
}
```

## 模块依赖关系 (Dependencies)

### 核心依赖
- **ExecutionService**: 执行服务，负责循环执行逻辑
- **WorkflowExecutor**: 工作流执行器，集成循环处理
- **VariableResolver**: 变量解析器，处理循环变量
- **StateLinkageManager**: 状态管理器，负责循环状态同步

### 前端依赖
- **ReactFlow**: 工作流画布框架
- **LoopBoundaryRenderer**: 循环边界渲染组件
- **NodeSuffixManager**: 节点后缀管理器
- **Glass UI**: UI样式系统

### 后端依赖
- **ExecutionModule**: 执行模块
- **WorkflowModule**: 工作流模块
- **NotificationModule**: 通知模块

## 典型端到端工作流程 (Typical Workflow)

### 1. 循环创建流程
1. 用户从节点面板选择"循环开始"节点
2. 拖拽节点到工作流画布并配置参数
3. 创建"循环结束"节点并设置相同loop_id
4. 在循环区域内添加其他节点
5. 系统自动渲染中括号边界

### 2. 循环验证流程
1. 循环配对管理器检测start/end节点配对
2. 验证loop_id的一致性和唯一性
3. 检测嵌套层级关系
4. 计算循环边界和节点包含关系
5. 验证循环结构的合法性

### 3. 循环执行流程
1. 执行到循环开始节点，初始化循环上下文
2. 循环上下文管理器进入循环栈
3. 开始循环迭代，从start_value开始
4. 为当前迭代生成节点后缀
5. 执行循环内的所有节点
6. 更新循环变量和迭代计数
7. 检查是否达到循环次数
8. 重复或退出循环

### 4. 嵌套循环处理流程
1. 检测多层嵌套循环结构
2. 建立循环层级映射关系
3. 执行时按层级顺序进入循环
4. 内层循环完全执行完成后再执行外层
5. 维护循环栈的正确嵌套顺序
6. 生成包含所有层级的节点后缀

### 5. 节点后缀生成流程
1. 进入循环时推入循环栈
2. 迭代时更新当前循环计数
3. 生成基于当前栈状态的字符串后缀
4. 应用后缀到循环内所有节点名称
5. 退出循环时弹出循环栈
6. 恢复原始节点名称

### 6. 可视化渲染流程
1. 检测所有循环配对和嵌套关系
2. 计算每个循环的边界矩形
3. 根据层级确定中括号样式
4. 渲染中括号边界和层级标识
5. 响应节点位置变化动态调整边界
6. 提供交互式的循环编辑功能