# 循环边界显示系统

## 核心要点

- **状态驱动更新**：引入 `useNodeChangeDetection` Hook，实现主动的节点变化检测机制
- **组件重构**：合并冗余组件，统一为 `LoopBoundary` 组件，专注于循环边界显示
- **智能延迟**：支持布局稳定检查和延迟更新，避免拖动过程中的频繁计算
- **架构优化**：通过通用 Hook 提高复用性，简化组件职责
- **路径完整性**：修复循环边界路径遍历，确保包含从 start_node 到 end_node 的完整节点序列

## 设计思路

### 系统架构设计
采用分层架构：
- **检测层**：`useNodeChangeDetection` Hook 负责节点变化检测和更新触发
- **组件层**：`LoopBoundary` 组件负责边界渲染和级别显示
- **服务层**：复用 `connection_binding_service` 进行节点比较

### 更新流程设计
```
节点移动 → useNodeChangeDetection 检测 → 触发更新 → 组件重新渲染 → 边界带自动更新
```

### 路径遍历设计
```
start_node → 中间节点1 → 中间节点2 → ... → end_node
完整路径遍历，不跳过任何节点，确保边界完整性
```

## 关键决策

### 1. 状态管理策略
- **决策**：引入 Hook 内部状态管理，通过 `updateTrigger` 强制重新渲染
- **理由**：解决被动响应问题，实现主动检测和更新

### 2. 组件合并策略
- **决策**：合并为单一 `LoopBoundary` 组件，统一边界显示和级别信息
- **理由**：简化架构，消除不必要的组件层次

### 3. 复用性设计
- **决策**：提取为通用 Hook，封装变化检测逻辑
- **理由**：提高代码复用性，统一变化检测机制

### 4. 路径完整性策略
- **决策**：区分完整路径节点和循环内节点，确保边界覆盖完整路径
- **理由**：解决三行节点中间节点被跳过的问题，保证边界的视觉完整性

## 技术逻辑

### 节点变化检测算法
基于 `connection_binding_service.shouldUpdateConnections`：
1. 将普通节点转换为 `ElectrochemicalNode` 格式
2. 比较前后节点的位置、尺寸等关键属性
3. 检测到变化时触发 `updateTrigger` 更新

### 延迟更新机制
支持智能延迟策略：
1. **layoutStable 检查**：布局不稳定时跳过更新
2. **enableDelay 延迟**：避免拖动过程中的频繁计算
3. **定时器管理**：自动清理延时器，防止内存泄漏

### 完整路径遍历算法
1. **节点定位**：根据 start_node_id 和 end_node_id 在节点数组中找到位置
2. **路径切片**：获取从 start_node 到 end_node 的完整节点序列
3. **方向处理**：根据节点索引顺序决定正向或反向遍历
4. **边界渲染**：基于完整路径计算循环边界

### 边界渲染系统
- **路径生成**：使用 `generateBeltPath` 函数生成 SVG 路径
- **Clipper 算法**：使用工业级几何运算进行路径偏移
- **级别显示**：计算并显示循环嵌套级别

## 涉及修改的文件范围

### 核心组件文件
- `apps/frontend/src/services/hooks/useNodeChangeDetection.ts` - 节点变化检测 Hook
- `apps/frontend/src/components/features/loop/visualization/LoopBoundary.tsx` - 循环边界组件（已修改）
- `apps/frontend/src/components/Canvas.tsx` - 画布组件，传入 layoutStable 参数

### 支持文件
- `apps/frontend/src/components/features/loop/index.ts` - 组件导出
- `apps/frontend/src/utils/clipper.ts` - 路径生成工具
- `apps/frontend/src/services/layout/ConnectionBindingService.ts` - 连接服务

### 样式文件
- `apps/frontend/src/styles/components/_loop-boundary-new.css` - 循环边界样式

## 定义的接口类型

### Hook 接口
```typescript
export interface UseNodeChangeDetectionOptions {
  enable_delay?: boolean;
  delay_ms?: number;
  layout_stable?: boolean;
}

export const useNodeChangeDetection = (
  nodes: any[],
  options: UseNodeChangeDetectionOptions = {}
) => number;
```

### 组件接口
```typescript
export interface LoopBoundaryProps {
  loop: LoopInfo;
  nodes: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    position?: { x: number; y: number };
    style?: { width?: number; height?: number };
  }>;
  context?: LoopExecutionContext;
  layout_stable?: boolean;
  zoom_level?: number;
  canvas_offset_y?: number;
  class_name?: string;
  style?: React.CSSProperties;
}
```

## 数据结构定义

### 循环信息结构
```typescript
export interface LoopInfo {
  id: string;
  start_node_id: string;
  end_node_id: string;
  node_ids: string[];
  iteration_count: number;
  current_iteration: number;
  is_active: boolean;
  parameters: {
    loop_variable?: string;
    start_value?: number;
    step?: number;
    delay_ms?: number;
    break_condition?: string;
    continue_condition?: string;
    data_accumulation?: string;
    export_format?: string;
  };
}
```

### 几何计算结构
```typescript
export interface Point {
  x: number;
  y: number;
}

export interface PathSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}
```

### 节点分类结构
```typescript
// 完整路径节点（包括循环间节点）
const completeLoopNodes: Node[];

// 循环内节点（用于标签显示）
const loopInnerNodes: Node[];
```

---

**文档版本**: v5.0
**最后更新**: 2025-11-03
**相关模块**: LoopSystem, NodeSystem, WorkflowEngine, ConnectionLines
**构建状态**: ✅ TypeScript编译通过
**最新修复**: 循环边界完整路径遍历