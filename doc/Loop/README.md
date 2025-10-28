# 循环节点系统文档

## 概述

循环节点系统是ZAHNERFLOW工作流编辑器的核心功能，提供了从循环检测到可视化展示的完整解决方案。系统通过识别工作流中的`loop_start`和`loop_end`节点对，自动生成循环边界的可视化表示，并提供实时的状态反馈和交互控制。

## 文档结构

### 📋 [设计文档](./2025-10-29-loop-node-system-design.md)
完整的系统设计说明，包括：
- 系统架构和组件关系
- 核心组件详解
- 数据流设计
- 类型系统设计
- 扩展性规划

### 🔧 [实现细节](./implementation-details.md)
深入的技术实现细节：
- 核心算法实现
- 状态管理机制
- 渲染优化技巧
- 样式实现细节
- 调试技巧
- 常见问题解决

### 📚 [最佳实践](./best-practices.md)
开发和维护指南：
- 开发规范和命名约定
- 性能优化策略
- 代码组织最佳实践
- 测试策略
- 维护指南

## 快速开始

### 1. 在工作流中创建循环

```typescript
// 1. 添加循环节点
const startNode = {
  type: 'loop_start',
  data: {
    parameters: {
      loop_id: 'my-loop',
      loop_count: 10,
      loop_variable: 'i',
      start_value: 0,
      step: 1
    }
  }
};

const endNode = {
  type: 'loop_end',
  data: {
    parameters: {
      loop_id: 'my-loop'
    }
  }
};

// 2. 连接节点形成循环
// startNode → middleNodes → endNode → startNode
```

### 2. 使用可视化组件

```typescript
import { LoopVisualizer } from '@/components/loops';

<LoopVisualizer
  loop={loopInfo}
  nodes={nodes}
  context={executionContext}
  onLoopStart={handleStart}
  onLoopPause={handlePause}
  onLoopResume={handleResume}
/>
```

### 3. 自定义样式

```css
/* 自定义循环边界样式 */
.bracket-container.custom-loop {
  --bracket-color: #custom-color;
  --bracket-width: 4px;
  --animation-duration: 2s;
}

/* 自定义层级颜色 */
.level-0 { --bracket-color: #FF6B6B; }
.level-1 { --bracket-color: #4ECDC4; }
.level-2 { --bracket-color: #45B7D1; }
.level-3 { --bracket-color: #96CEB4; }
```

## 核心特性

### ✨ 可视化特性
- **四角括号边界**：清晰的循环范围标识
- **层级颜色区分**：支持最多4层嵌套循环
- **实时状态动画**：运行、暂停、错误、完成等状态
- **悬停控制面板**：便捷的循环控制接口

### 🚀 性能特性
- **React优化**：使用memo、useMemo、useCallback
- **事件委托**：减少事件监听器数量
- **批量更新**：使用requestAnimationFrame优化渲染
- **虚拟化支持**：大量循环时的性能保障

### 🔧 技术特性
- **TypeScript类型安全**：完整的类型定义
- **模块化设计**：清晰的组件职责划分
- **事件驱动架构**：松耦合的组件通信
- **插件化扩展**：易于添加新功能

## 系统架构图

```
┌─────────────────────────────────────────────────────┐
│                   工作流编辑器                        │
├─────────────────────────────────────────────────────┤
│  循环节点系统                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ 检测层      │  │ 数据层      │  │ 渲染层      │ │
│  │LoopDetector │  │ContextMgr   │  │LoopBoundary │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│         │                │                │        │
│         └────────────────┼────────────────┘        │
│                          │                         │
│              ┌─────────────┐                     │
│              │ 交互层      │                     │
│              │LoopVisualizer│                     │
│              └─────────────┘                     │
└─────────────────────────────────────────────────────┘
```

## 常见问题

### Q: 如何创建嵌套循环？
A: 创建多对loop_start/loop_end节点，确保内层循环完全包含在外层循环内。系统会自动识别并分配不同颜色。

### Q: 循环边界计算不准确怎么办？
A: 检查节点的position属性是否包含width和height，确保所有内部节点都被正确识别。

### Q: 如何自定义循环动画？
A: 在CSS中定义新的动画类，并应用到.bracket-container上。参考最佳实践文档。

### Q: 性能优化建议？
A: 使用React.memo包装组件，使用useMemo缓存计算，避免在render中创建新对象。

## 版本历史

- **v1.0 (2025-10-29)**
  - 基础循环边界可视化
  - 支持4层嵌套
  - 状态动画和控制面板
  - TypeScript类型安全

## 贡献指南

1. 遵循代码规范（见[最佳实践](./best-practices.md)）
2. 添加适当的测试
3. 更新相关文档
4. 提交清晰的commit信息

## 联系方式

如有问题或建议，请：
1. 查看相关文档
2. 搜索已有的Issue
3. 创建新的Issue并提供详细信息

---

**最后更新**: 2025-10-29
**维护者**: ZAHNERFLOW开发团队