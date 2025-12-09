# 前端文件夹结构

本文档描述 `apps/frontend/src` 目录结构。

## 目录概览

```
src/
├── App.tsx                 # 应用入口组件
├── main.tsx                # Vite 入口文件
├── assets/                 # 静态资源
├── canvas/                 # 画布核心模块 ✅ (详见下方)
├── components/             # 通用 UI 组件
├── config/                 # 环境配置
├── hooks/                  # 通用 hooks
├── modules/                # 设备模块 (furnace, mfc, common)
├── services/               # API 服务层
├── shared/                 # 共享工具和上下文
├── styles/                 # CSS 样式文件
├── types/                  # 类型定义
└── workflow/               # 工作流管理
```

---

## canvas/ - 画布核心模块

工作流画布渲染和交互的核心实现。

| 文件 | 行数 | 功能说明 |
|------|------|----------|
| `Canvas.tsx` | 332 | **主画布组件**：整合所有子组件，处理节点渲染、拖拽放置、缩放变换、工作流管理弹窗 |
| `useLayout.ts` | 297 | **布局算法 Hook**：计算蛇形网格布局、节点坐标、连接线锚点，生成 `DisplayNode[]` 和 `ComputedEdge[]` |
| `LoopBoundary.tsx` | 283 | **循环边界组件**：使用 Clipper.js 算法绘制循环节点的包围带状路径 |
| `ConnectionLines.tsx` | 209 | **连接线组件**：SVG 渲染节点间的直线和折线连接，支持箭头和缩放补偿 |
| `NodeRenderer.tsx` | 180 | **节点渲染器**：渲染单个节点卡片，显示图标、名称、参数，处理点击/拖拽事件 |
| `LayoutConfig.ts` | 141 | **布局配置**：定义布局参数类型、默认配置、列数计算函数 |
| `NodeParameterDisplay.tsx` | 133 | **参数显示组件**：数据驱动的节点参数渲染，使用配置对象替代硬编码条件 |
| `canvasStore.ts` | 99 | **画布状态管理**：Zustand store，管理节点数组、选中状态、画布尺寸 |
| `useCanvasDrag.ts` | 90 | **拖动 Hook**：封装 Y 轴拖动逻辑，包括拖动状态、事件处理、偏移量管理 |
| `ZoomControls.tsx` | 80 | **缩放控件**：放大/缩小/重置按钮和拖动模式切换按钮 |
| `useLoopDetection.ts` | 49 | **循环检测 Hook**：扫描节点数组识别 `loop_start`/`loop_end` 配对，返回循环信息 |

### 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                       Canvas.tsx                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ ZoomControls│  │useCanvasDrag│  │    useLayout()      │  │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
│                                               │              │
│            ┌────────────────────────┬─────────┴──────┐      │
│            ▼                        ▼                ▼      │
│  ┌─────────────────┐    ┌──────────────────┐  ┌───────────┐ │
│  │ ConnectionLines │    │  NodeRenderer    │  │LoopBoundary│ │
│  │   (SVG 连接线)   │    │ NodeParamDisplay │  │(循环包围)  │ │
│  └─────────────────┘    └──────────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                      ┌──────────────┐
                      │ canvasStore  │
                      │ (Zustand)    │
                      └──────────────┘
```

### 数据流

1. **canvasStore** 持有原始 `WorkflowNode[]` 数据
2. **useLayout** 将 `WorkflowNode[]` 转换为带坐标的 `DisplayNode[]` 和 `ComputedEdge[]`
3. **NodeRenderer** 渲染每个 `DisplayNode`
4. **ConnectionLines** 渲染 `ComputedEdge[]`
5. **useLoopDetection** 检测循环结构
6. **LoopBoundary** 绘制循环包围

---

## workflow/ - 工作流管理模块

管理工作流状态、执行和历史记录。

| 文件 | 行数 | 功能说明 |
|------|------|----------|
| `executionStore.ts` | 248 | **执行状态管理**：Zustand store，管理执行ID、节点状态、WebSocket 监听 |
| `workflowService.ts` | 195 | **API 服务**：工作流 CRUD、执行控制、模板管理的 HTTP 封装 |
| `workflowStore.ts` | 112 | **工作流状态管理**：Zustand store，列表和当前工作流管理 |
| `appStore.ts` | 93 | **全局应用状态**：侧边栏、通知、主题等 UI 状态 |
| `WorkflowManager.ts` | 71 | **工作流工具类**：创建空工作流、验证配置 |
| `websocket.service.ts` | 68 | **WebSocket 服务**：连接管理、事件监听、执行状态推送 |
| `index.ts` | 22 | **模块入口**：统一导出所有 store、service |

---

## components/ - 通用 UI 组件

通用 UI 组件库，供全局复用。

| 文件 | 行数 | 功能说明 |
|------|------|----------|
| `FilePathManagerUI.tsx` | 434 | **文件路径配置弹窗**：基础路径浏览器、项目名选择、样品编号输入 |
| `WorkflowManagerUI.tsx` | 349 | **工作流管理弹窗**：历史记录浏览、项目筛选、双击加载、删除确认 |
| `PropertyPanel.tsx` | 316 | **属性面板**：选中节点的参数编辑面板 |
| `PropertyInputs.tsx` | 290 | **参数输入组件**：数值/枚举/温度/气体流量等专用输入组件 |
| `UserSelector.tsx` | 271 | **用户选择器**：下拉菜单选择用户、创建/删除用户 |
| `NodeChart.tsx` | 268 | **节点图表**：使用 echarts 渲染实时测量数据 |
| `DataViewer.tsx` | 248 | **数据查看器**：查看原始/处理后数据 |
| `TopNavbar.tsx` | 231 | **顶部导航栏**：品牌区、工作站切换、用户选择 |
| `useWorkflowHistory.ts` | 212 | **历史记录 Hook**：加载项目/历史列表、加载/删除工作流操作 |
| `propertyConfig.ts` | 204 | **参数配置**：节点类型对应的参数定义 |
| `Toolbar.tsx` | 198 | **工具栏**：运行/停止/暂停按钮、工作流管理入口 |
| `NotificationPanel.tsx` | 155 | **通知面板**：系统消息显示 |
| `StatusBar.tsx` | 132 | **状态栏**：显示连接状态、系统信息 |
| `WorkflowIdDisplay.tsx` | 117 | **工作流名称显示**：双击编辑名称、实时保存 |
| `Portal.tsx` | 112 | **Portal 组件**：渲染子元素到 DOM 其他位置，支持 isOpen/onClose |
| `Sidebar.tsx` | 102 | **侧边栏**：节点面板，可拖拽添加节点 |
| `HistoryListItem.tsx` | 83 | **历史列表项组件**：单条历史记录的展示和操作按钮 |
| `propertyUtils.ts` | 69 | **参数工具函数**：科学记数法解析等 |
| `DeviceHoverContent.tsx` | 53 | **设备悬停内容**：显示设备详细信息 |

---

## modules/ - 设备模块

待补充
