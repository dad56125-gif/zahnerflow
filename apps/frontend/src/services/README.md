# 工作流执行参数同步解决方案

## 问题描述

用户在前端 PropertyPanel 中修改节点参数后运行工作流，后端执行时使用的仍然是旧版本的节点参数，导致运行结果不符合用户预期。

## 解决方案

### 核心思路

1. **执行前同步**：在执行工作流前，将前端当前的节点参数自动同步到后端工作流定义
2. **双重参数存储**：前端参数同时存储在 `node.data.parameters` 和 `node.config` 中，后端优先使用 `node.config`
3. **容错机制**：同步失败不影响工作流执行，确保系统可用性

### 实现的文件

#### 1. `workflowExecutionService.ts`

新的工作流执行服务，替代原有的 `executionService`：

```typescript
import workflowExecutionService from '@/services/workflowExecutionService';

// 执行工作流（会自动同步前端参数）
const result = await workflowExecutionService.executeWorkflow(workflowId, {
  priority: 'normal'
});

// 检查是否需要同步
const needsSync = workflowExecutionService.needsSync(workflowId);

// 获取同步状态
const syncStatus = workflowExecutionService.getSyncStatus(workflowId);
```

#### 2. 后端执行服务改进

在 `execution.service.ts` 中改进了参数读取逻辑：

```typescript
private async executeMeasurement(executionId: string, node: any, type: string): Promise<void> {
  // 优先从 node.config 读取参数（前端传递的最新参数）
  let params = {};

  if (node.config && typeof node.config === 'object') {
    params = { ...node.config };
    this.logger.log(`使用 node.config 中的参数`);
  } else if (node.data?.parameters) {
    // 回退到 data.parameters
    params = { ...node.data.parameters };
    this.logger.log(`使用 node.data.parameters 中的参数`);
  }

  // ... 使用 params 执行测量
}
```

## 使用方法

### 1. 替换执行服务调用

```typescript
// 原来的调用方式
import { executionService } from '@/services/workflowService';
const result = await executionService.executeWorkflow(workflowId);

// 新的调用方式（推荐）
import workflowExecutionService from '@/services/workflowExecutionService';
const result = await workflowExecutionService.executeWorkflow(workflowId);
```

### 2. PropertyPanel 参数存储

确保 PropertyPanel 中的参数正确存储：

```typescript
// 参数应该同时存储在 data.parameters 和 config 中
const updateNodeParameter = (nodeId: string, parameters: Record<string, any>) => {
  updateNode(nodeId, {
    data: {
      ...node.data,
      parameters: parameters  // 兼容性存储
    },
    config: parameters      // 优先级存储（供后端使用）
  });
};
```

## 数据流程

```
用户修改参数 → PropertyPanel → 前端状态更新
                                    ↓
用户点击执行 → workflowExecutionService.executeWorkflow()
                                    ↓
自动参数同步 → 更新后端工作流定义 (workflowService.updateWorkflow)
                                    ↓
执行工作流 → 后端使用最新参数执行 (execution.service.ts)
                                    ↓
返回执行结果 → 包含用户配置的最新参数执行结果
```

## 同步状态检查

```typescript
// 检查是否需要同步
const needsSync = workflowExecutionService.needsSync(workflowId);
if (needsSync) {
  console.log('工作流有未保存的参数修改');
}

// 获取详细同步状态
const syncStatus = workflowExecutionService.getSyncStatus(workflowId);
console.log('同步状态:', {
  isCurrentWorkflow: syncStatus.isCurrentWorkflow,
  nodeCount: syncStatus.nodeCount,
  configuredNodes: syncStatus.configuredNodes,
  workflowVersion: syncStatus.workflowVersion,
  lastUpdated: syncStatus.lastUpdated
});
```

## 错误处理和日志

### 日志输出示例

```
[WorkflowExecutionService] 开始执行工作流: workflow_00000001
[WorkflowExecutionService] 检测到当前工作流，正在同步前端参数到后端...
[WorkflowExecutionService] 前端参数已成功同步到后端工作流
[WorkflowExecutionService] 同步了 5 个节点和 4 个连接
[WorkflowExecutionService] 开始执行工作流...
[WorkflowExecutionService] 工作流执行已启动: { executionId: 'exec_123', status: 'running' }
```

### 错误处理

1. **同步失败**：记录错误日志，继续执行工作流
2. **参数格式错误**：使用默认参数，给出警告
3. **网络错误**：重试机制，确保可靠性

## 兼容性说明

- **向后兼容**：原有 API 调用方式仍然有效
- **数据格式**：支持旧的 `data.parameters` 和新的 `config` 格式
- **渐进式迁移**：可以逐步迁移到新的执行服务

## 测试验证

### 测试步骤

1. 在 PropertyPanel 中修改任意节点的参数
2. 检查 `needsSync()` 返回 `true`
3. 执行工作流
4. 验证后端使用了新的参数值
5. 检查执行日志确认同步过程

### 验证方法

```typescript
// 执行前检查
const beforeStatus = workflowExecutionService.getSyncStatus(workflowId);
console.log('执行前状态:', beforeStatus);

// 执行工作流
const result = await workflowExecutionService.executeWorkflow(workflowId);

// 验证结果
console.log('执行结果:', result);
```

## 总结

这个解决方案通过在执行前自动同步前端参数到后端，确保了用户修改的参数能够正确应用到工作流执行中。同时保持了系统的容错性和兼容性。