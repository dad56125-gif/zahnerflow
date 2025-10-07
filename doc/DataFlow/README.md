# 数据流模块 (DataFlow)

## 设计原则 (Design Principles)

- **单向数据流**: 数据从前端到设备层的单向流动，确保数据一致性
- **类型约束**: 通过TypeScript和共享类型包确保各层数据结构的一致性
- **参数验证**: 多层参数验证机制，确保数据安全和有效性
- **格式转换**: 在不同层级间进行必要的数据格式转换，适配各自的需求
- **实时同步**: 关键状态变更的实时同步机制

## 对外接口 (Public API)

### 前端数据接口
- `WorkflowNode` - 前端节点数据结构
- `WorkflowDefinition` - 工作流定义传输格式
- `ParameterTransformer` - 参数转换工具

### 后端数据处理接口
- `DataProcessor` - 数据处理服务
- `ParameterValidator` - 参数验证服务
- `DataTransformer` - 数据格式转换服务

### 设备层数据接口
- `DeviceParameters` - 设备参数格式
- `MeasurementData` - 测量数据格式
- `StatusData` - 状态数据格式

## 主要功能列表 (Key Functions)

1. **数据格式转换**
   - 前端节点数据到工作流定义转换
   - 后端配置到设备参数转换
   - 设备响应到前端状态转换

2. **参数验证**
   - 前端实时参数验证
   - 后端安全参数验证
   - 设备层参数合法性检查

3. **数据传输**
   - 工作流定义传输
   - 实时状态同步
   - 测量数据传输

4. **参数优化**
   - 参数范围优化
   - 默认值设置
   - 参数模板管理

## 核心数据模型 (Core Data Model)

### 前端节点数据模型
```typescript
interface ReactFlowNode {
  id: string;
  type: string;
  name: string;
  data: {
    parameters: {
      output_path: string;
      frequency_range: [number, number];
      amplitude: number;
      // ... 其他测量参数
    };
  };
  position: { x: number; y: number };
}
```

### 工作流定义模型
```typescript
interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
}

interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  config: any; // 前端的 node.data.parameters
  position: { x: number; y: number };
}
```

### 设备参数模型
```typescript
interface DeviceParameters {
  technique: string;
  parameters: Record<string, any>;
  outputPath: string;
  metadata?: Record<string, any>;
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **React Flow**: 前端流程图组件
- **TypeScript**: 类型系统
- **WebSocket**: 实时通信

### 内部依赖
- **NodeSystem**: 节点系统模块
- **ExecutionEngine**: 执行引擎模块
- **DeviceControl**: 设备控制模块

## 典型端到端工作流程 (Typical Workflow)

1. **工作流创建数据流**
   ```
   用户配置节点 → 前端参数验证 → 工作流定义生成 → 后端接收验证 → 数据持久化
   ```

2. **参数转换数据流**
   ```
   前端参数格式 → 数据格式转换 → 后端配置格式 → 设备参数格式 → 设备执行
   ```

3. **实时状态数据流**
   ```
   设备状态变更 → 状态数据上传 → 后端处理 → WebSocket推送 → 前端状态更新
   ```

4. **测量数据流**
   ```
   设备采集数据 → 数据格式化 → 后端存储 → 实时传输 → 前端可视化显示
   ```

5. **参数优化数据流**
   ```
   原始参数输入 → 范围验证 → 优化算法应用 → 推荐参数生成 → 用户确认应用
   ```