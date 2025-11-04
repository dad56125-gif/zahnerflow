# ID 模块

## 核心要点

- **统一命名规范**: 全部采用 snake_case 命名，符合项目核心规则
- **层级化关系**: workflow → node → execution → loop 的层级结构
- **全生命周期管理**: 从生成、使用到清理的完整ID管理机制
- **事件驱动架构**: 所有ID作为事件总线的路由参数

## 设计思路

### ID分类体系
项目采用分层ID设计，每个层级负责不同的标识粒度：

1. **工作流层** (workflow_id): 整个工作流的唯一标识
2. **节点层** (node_id): 单个节点的唯一标识
3. **执行层** (execution_id): 单次执行的唯一标识
4. **循环层** (loop_id): 循环节点的配对标识
5. **设备层** (device_id/device_address): 物理设备的标识

### 唯一性保证策略
- **时间戳基准**: 使用 Date.now() 确保时间维度唯一性
- **随机数补充**: Math.random() 提供随机性避免冲突
- **计数器递增**: execution服务使用递增计数器保证严格顺序
- **UUID优先**: 优先使用 crypto.randomUUID() 提供全局唯一性

## 关键决策

### 命名格式选择
- **可读性优先**: 采用前缀+时间戳+随机数格式，便于调试和日志分析
- **前缀标准化**: `node_`, `workflow_`, `exec_`, `loop_` 等前缀快速识别ID类型
- **长度控制**: 随机部分长度限制在9-11字符，平衡唯一性和可读性

### 生存期管理
- **内存映射**: 执行期间使用Map结构维护ID间关系
- **自动清理**: 执行结束后自动清理内存中的上下文
- **持久化**: 关键ID持久化到数据库供历史查询

### 事件驱动集成
- **路由参数**: 所有ID都作为事件总线的路由键
- **状态追踪**: 通过ID实现节点状态和工作流状态的实时追踪
- **分布式支持**: ID机制支持多实例部署的状态同步

## 技术逻辑

### ID生成流程
1. **创建对象时**: 调用对应的generate函数生成唯一ID
2. **上下文存储**: 将ID关系存储到内存Map中
3. **事件发布**: 通过事件总线发布ID相关的状态变更
4. **持久化**: 关键对象存储到数据库时包含ID信息

### 关系映射机制
```typescript
// 执行上下文映射
executionContexts: Map<execution_id, {
  workflowId: string,
  executionId: string,
  startTime: Date
}>

// 循环上下文映射
LoopContextManager: Map<loop_id, LoopContext>
```

### 生命周期管理
1. **生成阶段**: 对象创建时自动生成唯一标识
2. **活跃阶段**: 内存中维护ID关系和状态
3. **清理阶段**: 执行结束后清理内存映射
4. **归档阶段**: 数据库中保留历史记录

## 涉及的文件范围

### 核心生成逻辑
- `apps/backend/src/modules/workflow/workflow.service.ts` - workflow_id 和 node_id 生成
- `apps/backend/src/modules/execution/execution.service.ts` - execution_id 生成和管理
- `apps/frontend/src/types/nodes/types.ts` - loop_id 生成

### 类型定义
- `packages/types/src/api.types.ts` - 所有ID的接口定义
- `apps/frontend/src/types/nodes/types.ts` - 节点相关ID类型

### 管理服务
- `apps/frontend/src/components/features/loop/core/LoopContextManager.ts` - loop_id 上下文管理
- `apps/backend/src/db/db.service.ts` - ID的数据库持久化

### 接口定义
- `apps/backend/src/interfaces/module-interfaces.ts` - 模块间ID传递接口
- `packages/types/src/device.types.ts` - 设备相关ID类型

### 事件系统
- `apps/backend/src/notification/` - 通过ID进行事件路由
- `apps/backend/src/gateways/workflow.gateway.ts` - WebSocket的ID消息传递

### 前端使用
- `apps/frontend/src/services/stores/` - 前端状态管理中的ID使用
- `apps/frontend/src/components/Canvas.tsx` - 画布组件中的ID操作
- `apps/frontend/src/services/workflowService.ts` - 工作流服务中的ID处理