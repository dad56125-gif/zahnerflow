# Frontend Rebuilt Structure

## apps/frontend/src/

### main.tsx
应用入口

### app/ - 根应用模块
- **App.tsx** - 主应用组件
- **app.ts** - 应用配置
- **index.ts** - 导出文件

### shared/ - 共享模块
- **ui/** - 通用UI组件
  - Portal.tsx
  - WorkflowIdDisplay.tsx
  - index.ts
- **hooks/** - 通用hooks
  - useOnClickOutside.ts
  - useOnClickOutside.test.ts
  - index.ts
- **utils/** - 通用工具
  - glassEffect.ts
  - format.ts
  - index.ts
- **types/** - 共享类型
  - common.ts
  - api.ts
  - index.ts
- **index.ts** - 统一导出

### canvas/ - 画布模块 (完全自包含)
- **components/**
  - Canvas.tsx
  - NodeRenderer.tsx
  - ConnectionLines.tsx
  - DeviceHoverContent.tsx
  - index.ts
- **services/**
  - canvasStore.ts
  - layout.service.ts
  - index.ts
- **types/**
  - canvas.types.ts
  - node.types.ts
  - index.ts
- **utils/**
  - node.utils.ts
  - layout.utils.ts
  - index.ts
- **hooks/**
  - useCanvas.ts
  - useNodeSelection.ts
  - index.ts
- **index.ts** - 模块导出

### layout/ - 布局模块 (完全自包含)
- **components/**
  - TopNavbar.tsx
  - Sidebar.tsx
  - StatusBar.tsx
  - Toolbar.tsx
  - index.ts
- **services/**
  - layout.service.ts
  - index.ts
- **types/**
  - layout.types.ts
  - index.ts
- **hooks/**
  - useLayout.ts
  - index.ts
- **index.ts** - 模块导出

### panels/ - 面板模块 (完全自包含)
- **components/**
  - PropertyPanel.tsx
  - ParameterInput.tsx
  - DataViewer.tsx
  - NotificationPanel.tsx
  - index.ts
- **services/**
  - propertyPanel.service.ts
  - index.ts
- **types/**
  - panels.types.ts
  - index.ts
- **hooks/**
  - usePropertyPanel.ts
  - index.ts
- **index.ts** - 模块导出

### workflow/ - 工作流模块 (完全自包含)
- **components/**
  - WorkflowManager.tsx
  - WorkflowManagerUI.tsx
  - WorkflowExporter.tsx
  - WorkflowImporter.tsx
  - index.ts
- **services/**
  - workflow.service.ts
  - workflowStore.ts
  - index.ts
- **types/**
  - workflow.types.ts
  - workflowMetadata.types.ts
  - index.ts
- **api/**
  - workflow.api.ts
  - index.ts
- **utils/**
  - workflow.utils.ts
  - validation.utils.ts
  - index.ts
- **hooks/**
  - useWorkflow.ts
  - useWorkflowManager.ts
  - index.ts
- **index.ts** - 模块导出

### loop/ - 循环系统模块 (完全自包含)
- **components/**
  - LoopBoundary.tsx
  - LoopControlPanel.tsx
  - LoopDetector.ts
  - LoopContextManager.ts
  - LoopSystemController.ts
  - index.ts
- **services/**
  - loop.service.ts
  - index.ts
- **types/**
  - loop.types.ts
  - index.ts
- **utils/**
  - loop.utils.ts
  - index.ts
- **hooks/**
  - useLoop.ts
  - index.ts
- **index.ts** - 模块导出

### mfc/ - MFC模块 (完全自包含)
- **components/**
  - MFCModal.tsx
  - MFCDeviceCard.tsx
  - MFCConnectionPanel.tsx
  - index.ts
- **services/**
  - mfc.service.ts
  - mfcWebSocket.service.ts
  - mfcStore.ts
  - index.ts
- **types/**
  - mfc.types.ts
  - mfcDevice.types.ts
  - index.ts
- **api/**
  - mfc.api.ts
  - index.ts
- **utils/**
  - mfc.utils.ts
  - index.ts
- **hooks/**
  - useMfc.ts
  - index.ts
- **index.ts** - 模块导出

### furnace/ - 炉温模块 (完全自包含)
- **components/**
  - FurnaceModal.tsx
  - FurnaceDeviceCard.tsx
  - ConnectionPanel.tsx
  - StatusPanel.tsx
  - ProgramEditor.tsx
  - PresetManager.tsx
  - FurnaceTemperatureChart.tsx
  - index.ts
- **services/**
  - furnace.service.ts
  - furnaceStore.ts
  - index.ts
- **types/**
  - furnace.types.ts
  - index.ts
- **api/**
  - furnace.api.ts
  - index.ts
- **utils/**
  - furnace.utils.ts
  - index.ts
- **hooks/**
  - useFurnace.ts
  - index.ts
- **index.ts** - 模块导出

### user/ - 用户模块 (完全自包含)
- **components/**
  - UserSelector.tsx
  - FilePathManager.tsx
  - index.ts
- **contexts/**
  - UserContext.tsx
  - index.ts
- **services/**
  - user.service.ts
  - index.ts
- **types/**
  - user.types.ts
  - index.ts
- **api/**
  - user.api.ts
  - index.ts
- **hooks/**
  - useUser.ts
  - index.ts
- **index.ts** - 模块导出

### core/ - 核心模块
- **services/** - 全局服务
  - **api/**
    - client.ts
    - index.ts
  - **stores/**
    - globalStore.ts
    - index.ts
  - **index.ts**
- **types/** - 核心类型
  - global.types.ts
  - index.ts
- **utils/** - 核心工具
  - constants.ts
  - helpers.ts
  - index.ts
- **index.ts**

---

## 总结

该重构后的前端结构移除了所有的样式文件（styles/目录和.css文件），专注于逻辑和组件结构：

1. **模块化设计**：每个模块都是完全自包含的，包含components、services、types、utils、hooks等
2. **清晰的分层**：
   - components：React组件
   - services：业务逻辑和数据管理
   - types：TypeScript类型定义
   - utils：工具函数
   - hooks：自定义React Hooks
   - api：API接口
3. **统一导出**：每个模块都有index.ts统一导出
4. **核心模块**：core模块提供全局服务和工具

这种结构便于维护和扩展，样式可以通过CSS-in-JS或其他方案在组件内部管理。