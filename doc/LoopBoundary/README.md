# 循环边界系统

## 概述

循环边界系统为ZAHNERFLOW工作流提供循环结构的可视化功能，包括循环检测、边界显示和状态管理。

## 实施状态

- ✅ **P0完成** - 基础样式系统（2025-10-29）
- ✅ **P1完成** - Canvas组件集成（2025-10-29）
- 📋 **P2待办** - 高级功能增强

## 核心组件

### 1. LoopBoundary组件
- 位置：`apps/frontend/src/components/LoopBoundary.tsx`
- 功能：渲染循环边界的括号样式和循环信息
- 支持嵌套循环的层级颜色区分

### 2. LoopVisualizer组件
- 位置：`apps/frontend/src/components/loops/LoopVisualizer.tsx`
- 功能：集成循环检测和可视化，提供控制界面
- 已修改以使用LoopBoundary组件

### 3. 样式文件
- 位置：`apps/frontend/src/styles/components/_loop-boundary.css`
- 包含完整的括号样式和动画效果

## 使用方法

1. 在工作流中添加 `loop_start` 和 `loop_end` 节点
2. 设置相同的 `loop_id` 参数
3. 连接节点形成循环结构
4. 系统自动检测并显示循环边界

## 功能特性

- 四角括号标记循环范围
- 显示循环ID、当前迭代和变量值
- 支持运行、暂停、错误等状态动画
- 鼠标悬停显示控制面板
- 支持嵌套循环的层级区分

## 维护说明

如需修改循环边界样式，请编辑 `_loop-boundary.css` 文件。