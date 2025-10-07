# 节点系统模块 (NodeSystem)

## 设计原则 (Design Principles)

- **可视化设计**: 基于React Flow提供直观的拖拽式节点编辑界面
- **类型安全**: 通过TypeScript确保节点配置的类型安全性
- **模块化配置**: 每个节点类型独立定义，便于扩展新节点类型
- **参数验证**: 前端实时验证参数有效性，后端二次验证确保安全性
- **统一接口**: 所有节点遵循统一的接口规范，便于执行引擎处理

## 对外接口 (Public API)

### 节点配置接口
- `NODE_CONFIGS` - 节点类型配置定义
- `PropertyPanel` - 节点参数配置面板组件
- `Sidebar` - 节点列表显示组件

### 节点操作接口
- `createNode(type: string, position: Position)` - 创建节点
- `updateNode(id: string, data: any)` - 更新节点数据
- `deleteNode(id: string)` - 删除节点
- `connectNodes(sourceId: string, targetId: string)` - 连接节点
- `validateNodeData(type: string, data: any)` - 验证节点数据

### 节点类型接口
- `NodeConfig` - 节点配置类型定义
- `NodeData` - 节点数据类型定义
- `NodeCategory` - 节点分类类型定义

## 主要功能列表 (Key Functions)

1. **节点管理**
   - 节点类型注册与管理
   - 节点创建与删除
   - 节点连接与断开
   - 节点分组与分类

2. **参数配置**
   - 动态参数表单生成
   - 实时参数验证
   - 参数模板管理
   - 默认值设置

3. **可视化编辑**
   - 拖拽式节点创建
   - 连线关系可视化
   - 布局自动优化
   - 缩放与平移

4. **节点分类**
   - 设备控制节点 (startup, shutdown)
   - 基础测量节点 (eis_potentiostatic, eis_galvanostatic)
   - 高级测量节点 (cv, lsv)
   - 控制流程节点 (wait, loop)

## 核心数据模型 (Core Data Model)

### 节点配置模型
```typescript
interface NodeConfig {
  id: string;
  name: string;
  description: string;
  category: 'device' | 'basic_measurement' | 'advanced_measurement' | 'control_flow';
  inputs: NodePort[];
  outputs: NodePort[];
  parameters: ParameterDefinition[];
  icon: string;
}
```

### 节点数据模型
```typescript
interface NodeData {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  parameters: Record<string, any>;
  status: 'idle' | 'running' | 'completed' | 'error';
}
```

### 参数定义模型
```typescript
interface ParameterDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'file';
  required: boolean;
  default?: any;
  options?: Array<{ label: string; value: any }>;
  validation?: ValidationRule[];
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **React**: 前端框架
- **React Flow**: 流程图可视化库
- **TypeScript**: 类型系统

### 内部依赖
- **ExecutionEngine**: 执行引擎模块
- **DataFlow**: 数据流模块
- **DeviceControl**: 设备控制模块

## 典型端到端工作流程 (Typical Workflow)

1. **节点创建流程**
   ```
   用户从侧边栏拖拽 → 创建节点实例 → 显示参数配置面板 → 用户配置参数 → 验证参数有效性
   ```

2. **节点连接流程**
   ```
   用户拖拽连线 → 验证连接有效性 → 建立数据流关系 → 更新工作流图 → 保存连接关系
   ```

3. **参数配置流程**
   ```
   选择节点 → 显示参数面板 → 动态生成表单 → 实时验证 → 保存参数配置
   ```

4. **工作流验证流程**
   ```
   验证所有节点 → 检查连接关系 → 验证参数完整性 → 返回验证结果 → 显示错误信息
   ```