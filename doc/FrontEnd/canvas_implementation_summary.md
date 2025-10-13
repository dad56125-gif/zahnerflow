# Canvas 功能实现总结 (Git Commit 5a57a7e)

本文档汇总了 Git 提交 `5a57a7e` 中前端 Canvas 功能的实现细节，主要基于对 `canvasStore.ts`、`App.tsx` 和 `nodes/types.ts` 文件的分析，并结合相关 CSS 样式。

## 1. `apps/frontend/src/stores/canvasStore.ts` 概述

`canvasStore.ts` 文件主要负责 Canvas 状态的管理和布局逻辑。

### 关键状态 (State)

*   `nodes`: `ElectrochemicalNode` 对象的数组，代表 Canvas 上的各个节点。
*   `connections`: `Connection` 对象的数组，代表节点之间的连接。
*   `selectedNode`: 当前选中的节点，或 `null`。
*   `canvasSize`: 包含 `width` 和 `height` 的对象，表示 Canvas 的尺寸。
*   `validationError`: 验证错误信息，或 `null`。

### 关键动作 (Actions)

*   `setCanvasSize(width, height)`: 设置 Canvas 的尺寸。
*   `addNode(type, selectedWorkstation, index?)`: 添加新节点。
*   `deleteNode(nodeId)`: 删除指定 ID 的节点。
*   `moveNode(nodeId, newPosition)`: 移动指定 ID 的节点到新位置。
*   `selectNode(node)`: 选中或取消选中节点。
*   `updateNode(updatedNode)`: 更新节点信息。
*   `setNodes(nodes)`: 批量设置节点。
*   `setConnections(connections)`: 批量设置连接。
*   `clearCanvas()`: 清空 Canvas 上的所有节点和连接。
*   `recalculateNodePositions()`: 根据当前 Canvas 尺寸重新计算所有节点的位置。

### 布局逻辑

*   `calculateNodePosition(index, canvasWidth)`: 根据节点索引和 Canvas 宽度计算节点的 `x, y` 坐标。实现了 S 形布局，即偶数行从左到右排列，奇数行从右到左排列。
*   `NODE_SPACING`, `NODE_START_X`, `CANVAS_ROW_HEIGHT`: 定义布局参数的常量。
*   `calculateNodeIndex(position, canvasWidth, nodeCount)`: 用于在移动节点时确定插入位置的索引。

### 验证逻辑

*   `validateNodes(nodes)`: 验证节点数组，例如确保只有一个“启动”和“停止”节点，并检查它们的相对位置。

## 2. `apps/frontend/src/App.tsx` 概述

`App.tsx` 是主应用组件，负责渲染 Canvas UI 并处理用户交互。

### Canvas 渲染结构

*   **主 Canvas 容器**: 一个 `div` 元素，具有 `className="canvas-container canvas-grid glass"` 和 `ref={canvasRef}`。这是所有节点和连接的渲染区域。
    *   `onClick`: 如果点击目标是 Canvas 容器本身，则取消选中任何节点。
    *   `onDrop`, `onDragOver`: 处理将新节点拖放到 Canvas 上的逻辑。
*   **连接渲染**: 使用内联 `<svg>` 元素来绘制连接。
    *   `<svg>` 元素包含 `<line>` 和 `<g>` 元素，用于绘制直线和 L 形连接。
    *   `<defs>` 元素定义了箭头标记 (`marker`)。
*   **节点渲染**: 每个节点都渲染为一个 HTML `div` 元素。
    *   节点通过 `nodes.map((node) => (...))` 迭代渲染。
    *   使用 `style={{ position: 'absolute', left: node.position.x, top: node.position.y, ... }}` 进行绝对定位。
    *   节点具有 `className="node glass ..."`，应用了玻璃态样式。

### 用户交互

*   **节点交互**:
    *   `onClick`: 选中节点，并处理连接的开始/完成。
    *   `onContextMenu`: 弹出确认框以删除节点。
    *   `draggable`, `onDragStart`, `onDragEnd`: 实现了自定义的节点拖放功能，用于移动节点。
*   **连接交互**: 节点上的端口 `div` 元素 (`node-port input`, `node-port output`) 具有 `onClick` 事件，用于启动或完成连接。
*   **缩放**: 一个父级 `div` 元素包裹了 SVG 和节点 `div`s，通过 `transform: scale(${zoomLevel})` 实现缩放功能。
*   **拖放添加节点**: `handleCanvasDrop` 函数处理从侧边栏拖放节点到 Canvas 的逻辑。

### 工作流执行

*   `runFlow()`: 启动工作流执行，向 `/api/workflows` 发送节点数据，并通过 `stateLinkageManager.startExecution` 启动执行。
*   `stopFlow()`: 停止工作流执行，通过 `stateLinkageManager.cancelExecution` 取消执行。
*   `isRunning` 状态: 跟踪工作流是否正在运行。

## 3. `apps/frontend/src/nodes/types.ts` 概述

`nodes/types.ts` 文件定义了 Canvas 中使用的核心数据结构和类型。

### 核心类型定义

*   `NodeType`: 定义了所有可能的节点类型（设备控制、基础测量、流程控制）。
*   `WorkstationType`, `MeasurementType`: 从 `@zahnerflow/types` 导入的工作站和测量类型。
*   `NodeCategory`: 节点分类（`device`, `basic_measurement`, `flow_control`）。
*   `Port`: 定义节点输入/输出端口的结构（`id`, `name`, `dataType`, `description`）。
*   `NodeData`: 节点数据的通用结构（`name`, `description`, `parameters`, `results`, `createdAt`, `updatedAt`）。
*   `NodeStatus`: 从 `@zahnerflow/types` 导入的节点状态。
*   `NodeStyle`: 定义节点视觉样式的接口（`width`, `height`, `background`, `borderColor`, `borderRadius`, `textColor`, `icon`）。
*   `ElectrochemicalNode`: 核心节点接口，包含了所有节点的基本属性。
*   `NodeConfig`: 节点配置接口，定义了节点的默认属性和样式。
*   `NodeGroup`: 节点分组接口。
*   `LoopStartNode`, `LoopEndNode`, `LoopContext`, `LoopPair`: 循环节点的特定接口。

### 节点配置和工具函数

*   `NODE_CONFIGS`: 一个映射，包含了所有 `NodeType` 对应的 `NodeConfig` 详细配置。
*   `NODE_GROUPS`: 节点分类到节点类型的映射。
*   `NODE_CATEGORY_NAMES`: 节点分类的显示名称。
*   `getNodeConfig(type)`: 根据节点类型获取其配置。
*   `getNodeCategoryName(category)`: 获取节点分类的显示名称。
*   `createDefaultNodeData(type)`: 创建指定类型的默认节点数据。
*   `ZAHNER_NODE_CONFIGS`, `ZAHNER_NODE_GROUPS`: 针对特定工作站（`zahner-zennium`）的节点配置和分组。
*   `getNodeConfigByWorkstation(type, workstation)`: 根据节点类型和工作站获取节点配置。
*   `getNodeGroupsByWorkstation(workstation)`: 根据工作站获取节点分组。
*   `validateNodeConnection(sourceType, targetType)`: 验证源节点和目标节点之间的连接是否有效。
*   `createDefaultNodeDataWithWorkstation(type, workstation)`: 创建带有工作站支持的默认节点数据。

## 4. CSS 样式对 Canvas 的影响

Canvas 的视觉效果受到以下 CSS 文件的影响：

*   **`apps/frontend/src/styles/components/_modal.css`**:
    *   `.device-modal`: 定义了模态框的整体样式，包括 `backdrop-filter: blur(1.5rem);` 和 `background: linear-gradient(...)`。原始的 `linear-gradient` 使用了 `rgba(0, 0, 0, 0.9)` 到 `rgba(0, 0, 0, 0.8)` 的颜色，导致模态框背景非常不透明，从而遮挡了 `backdrop-filter` 对其下方内容的模糊效果。
*   **`apps/frontend/src/styles/components/_glass.css`**:
    *   `.glass`: 这是一个通用的玻璃态效果类，也使用了 `backdrop-filter: blur(var(--blur-xl));`。它还定义了边框、圆角、阴影和鼠标悬停效果。
*   **`apps/frontend/src/styles/main.css`**:
    *   通过 `@import` 引入了所有其他 CSS 文件。
    *   `.canvas-container`: 在 `App.tsx` 中被赋予了 `glass` 类，因此会继承 `.glass` 的样式。
    *   `.node`: 在 `App.tsx` 中被赋予了 `glass` 类，因此也会继承 `.glass` 的样式。
    *   `.connection-line`, `.connection-arrow`: 定义了 SVG 连接线和箭头的样式。

## 5. 关于“Canvas 失能”的结论

在 Git 提交 `5a57a7e` 中，Canvas 功能的实现是基于 **React 渲染标准 HTML `div` 元素和 SVG 元素**来构建的，而不是依赖于 Konva.js、Fabric.js 等专门的 Canvas 库。`canvasStore.ts` 负责数据管理和布局计算，而 `App.tsx` 负责将这些数据渲染到 DOM 中并处理用户交互。

如果当前版本的 Canvas 出现“失能”情况，根据上述实现细节，可能的原因包括：

1.  **条件渲染问题**: 在 `App.tsx` 或其父组件中，可能存在某个条件判断阻止了 `.canvas-container` 或其内部元素的渲染。
2.  **CSS 隐藏**: 某些 CSS 规则（例如 `display: none;` 或 `visibility: hidden;`）可能被应用到 Canvas 容器或其关键子元素上。
3.  **JavaScript 逻辑错误**: `canvasStore` 中的状态管理或 `App.tsx` 中的事件处理逻辑可能存在问题，导致节点无法被添加、连接无法被绘制，或者 Canvas 无法响应用户输入。
4.  **`selectedWorkstation` 未设置**: 如果 `selectedWorkstation` 状态为 `null`，可能会阻止节点组的加载和节点的添加，从而导致 Canvas 看起来是空的。
5.  **`stateLinkageManager` 错误**: 与后端通信的 `stateLinkageManager` 出现问题，可能导致 Canvas 无法获取或更新数据。

要诊断具体的“失能”原因，需要对比 `5a57a7e` 提交与当前 `HEAD` 之间的代码差异，尤其关注 `App.tsx`、`canvasStore.ts` 以及相关的 CSS 文件。
