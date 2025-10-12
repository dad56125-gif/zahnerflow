# CSS 重构任务清单

此清单用于跟踪前端样式的统一和模块化进程。

## 第一大阶段：核心样式 `glass-ui.css` 重构

### 阶段 1.1: 文件结构创建

- [x] 在 `src/styles/` 目录下创建 `base`, `components`, `layout`, `themes` 文件夹。
- [x] 创建 `main.css` 作为新的 CSS 入口。
- [x] 创建 `base/_reset.css`。
- [x] 创建 `base/_variables.css`。
- [x] 创建 `base/_typography.css`。

### 阶段 1.2: 样式迁移

- [x] **Reset & Variables**: 将 `glass-ui.css` 中的重置样式和颜色/字体变量迁移到 `base/` 目录下的相应文件。
- [x] **Layout**: 识别并迁移布局相关样式到 `layout/` 目录。
- [x] **Components**: 迁移所有组件样式到 `components/` 目录下的各个模块文件。
- [x] **Themes**: 识别并迁移主题相关样式 (如 dark/light mode) 到 `themes/` 目录。(经检查，当前代码库中无主题相关样式，故此项不适用)

### 阶段 1.3: 代码集成与清理

- [x] 更新 React 组件入口 (`main.tsx`)，使其从 `styles/main.css` 引入样式。
- [x] 在 `main.css` 中使用 `@import` 规则导入所有模块。
- [x] 删除了旧的 `glass-ui.css` 文件并修复了其在 `App.tsx` 中的残留引用。
- [ ] **待办**: 确认所有样式正常应用，无视觉回归。
- [ ] **待办**: 代码审查和最终确认。

---

## 第二大阶段：整合零散样式文件

### 阶段 2.1: 分析与计划

- [x] 分析 `components.css`, `DeviceModal.css`, `globals.css`, `theme.css` 的内容。
- [x] 确定整合策略：将有用的、独立的组件样式吸收到现有模块化结构中，废弃冗余和冲突的样式系统（如 `globals.css` 和 `theme.css`）。

### 阶段 2.2: 执行整合

- [x] **Overlay**: 从 `components.css` 中提取 `.validation-error-overlay` 样式，并将其放入新的 `components/_overlay.css` 文件中。
- [x] **Modal**: 从 `DeviceModal.css` 中提取 `.device-modal` 相关样式，并将其放入新的 `components/_modal.css` 文件中。
- [x] **更新入口**: 在 `main.css` 中导入 `_overlay.css` 和 `_modal.css`。
- [x] **清理**: 删除已迁移的旧文件 (`components.css`, `DeviceModal.css`)。
- [x] **废弃**: 删除与当前设计系统冲突且未被使用的旧文件 (`globals.css`, `theme.css`)。
- [x] **验证**: 搜索并确保没有代码再导入已删除的四个CSS文件。

### 阶段 2.3: 最终审查

- [ ] **待办**: 确认所有样式正常应用，无视觉回归。
- [ ] **待办**: 代码审查和最终确认。

---

## 第三阶段：CSS 优化

### 阶段 3.1: 规范与初始化

- [x] 更新《项目架构规范》，增加 CSS 优化指引。
- [x] 在 `RebuildTodoList.md` 中创建第三阶段任务列表。
- [x] 更新 `EXECUTION_LOG_FrontEnd.md`，记录阶段开始。

### 阶段 3.2: 分析与诊断

- [x] 查找项目中所有 `.css` 文件，并列出清单。
- [x] 分析各 CSS 文件的层级关系和加载顺序。
- [x] 诊断重复的样式规则。
- [x] 诊断未被使用的样式规则。
- [x] 诊断样式冲突和不必要的覆盖。

### 阶段 3.3: 执行优化

- [x] **精简**: 修复 `_node.css` 重复定义，精简 `_input.css` 多余属性。
- [x] **移除**: 删除未使用的 `_card.css` 和 `_device.css` 文件。
- [x] **重构**: 降低选择器特异性，解决样式覆盖问题。

### 阶段 3.4: 验证与收尾

- [x] 确认所有优化无视觉回归。
- [x] 代码审查和最终确认。
- [x] 更新 `EXECUTION_LOG_FrontEnd.md`，记录阶段完成。