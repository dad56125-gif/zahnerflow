# 数据流文档

## 概述
本文档记录ZahnerFlow系统中数据从前端到设备层的完整流动过程，以及各层之间的接口定义。

## 数据流架构

### 1. 前端节点数据结构
```
React Flow Node:
- id: string
- type: string (e.g., 'eis_potentiostatic')
- name: string
- data: {
    parameters: {
      output_path: string
      frequency_range: [number, number]
      amplitude: number
      // ... 其他测量参数
    }
  }
- position: { x: number, y: number }
```

### 2. 工作流定义传输
前端发送到后端的工作流定义：
```typescript
WorkflowDefinition {
  id: string
  name: string
  description: string
  nodes: WorkflowNode[]  // 注意：节点数据结构转换
  edges: WorkflowEdge[]
  version: number
}

WorkflowNode {
  id: string
  type: string
  name: string
  config: any         // 前端的 node.data.parameters
  position: { x: number, y: number }
}
```

**关键转换点**：`App.tsx:527`
```typescript
config: node.data?.parameters || {}
```

### 3. 后端执行服务
执行服务接收工作流定义并处理节点：
```typescript
// execution.service.ts:269
case 'eis_potentiostatic':
  await this.zahnerService.executeMeasurement({
    ...node.config,        // 使用 config 字段
    measurement_type: 'eis_potentiostatic'
  });
```

### 4. 设备服务层
设备服务接收测量参数并执行：
```typescript
// zahner.service.ts
executeMeasurement(measurement: {
  output_path: string
  frequency_range: [number, number]
  amplitude: number
  measurement_type: string
  // ... 其他参数
})
```

## 数据字段映射

| 前端节点 | 工作流定义 | 执行服务 | 设备服务 |
|---------|-----------|---------|---------|
| node.data.parameters | config | node.config | measurement |
| output_path | output_path | output_path | output_path |
| frequency_range | frequency_range | frequency_range | frequency_range |
| amplitude | amplitude | amplitude | amplitude |

## 关键接口文件

### 后端接口定义
- **文件**: `apps/backend/src/interfaces/module-interfaces.ts`
- **关键接口**: `WorkflowNode`, `WorkflowDefinition`

### 前端类型定义
- **文件**: `apps/frontend/src/nodes/types.ts`
- **关键类型**: `NodeTypeConfig`, `createDefaultNodeDataWithWorkstation`

### 数据转换点
- **文件**: `apps/frontend/src/App.tsx:527`
- **转换逻辑**: `config: node.data?.parameters || {}`

## 维护注意事项

1. **新增节点类型时**：
   - 在前端 `NODE_CONFIGS` 中添加默认参数
   - 确保包含 `output_path` 等必需字段
   - 更新后端执行服务的 case 分支

2. **修改数据结构时**：
   - 同步更新前端节点组件
   - 检查 `App.tsx` 中的数据转换逻辑
   - 验证后端接口定义

3. **调试数据流问题**：
   - 检查前端节点数据是否正确设置
   - 验证工作流创建时的数据转换
   - 确认执行服务中的数据访问路径

## 常见问题

### 问题：缺少必需字段
**错误信息**: `"Field required: output_path"`
**原因**: 前后端数据结构不匹配
**解决**: 确保执行服务使用 `node.config` 而不是 `node.data?.parameters`

### 问题：参数传递错误
**原因**: 数据转换过程中字段丢失
**解决**: 检查 `App.tsx:527` 的转换逻辑和默认值设置

## 更新历史

- 2025-09-19: 修复执行服务数据访问路径，统一使用 `node.config`
- 2025-09-19: 创建数据流文档，记录完整的字段映射关系