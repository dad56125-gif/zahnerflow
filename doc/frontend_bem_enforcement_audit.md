# Frontend SCSS BEM Enforcement Audit

审计日期：2026-06-19

审计范围：`apps/frontend/src` 下 React/TSX、SCSS 入口链路、共享 UI 组件、画布组件和设备业务组件。

## 强制规范

### 类名结构

- 组件 Block：`.block`
- 组件 Element：`.block__element`
- 组件 Modifier：`.block--modifier`
- Element Modifier：`.block__element--modifier`
- 状态：`.is-*` / `.has-*`

禁止新增或继续使用以下形式作为组件类名：

- 单下划线旧类：`.modal_content`、`.btn_base`
- 连字符 Element 旧类：`.progress-bar-container`、`.mfc-card-title`
- 裸状态类：`.active`、`.selected`、`.show`、`.hiding`、`.success`、`.error`、`.connected`

### 禁止兼容层

本项目本轮迁移不允许保留旧类 alias。

- 禁止 `.old-class { @extend .new__class; }`
- 禁止 TSX 同时输出旧类和新类。
- 禁止新增 `_legacy.scss`、`compat`、`fallback`、`backward-compatible` 样式层。
- 旧类发现后必须直接替换到最终 BEM 或最终工具类。

### 工具类边界

工具类只允许在 `_utilities.scss` 或明确布局工具层中定义。

- 工具类使用 kebab-case，例如 `gap-sm`。
- 禁止继续使用 underscore 工具类，例如 `gap_sm`、`w_full`。
- 组件内部结构不允许用 `.title`、`.content`、`.header` 这类短类名代替 BEM element。

### 动态类名

动态 class 必须输出完整最终类名。

- 合规：`is-${status}`，前提是 status 值受控且 SCSS 支持 `.is-*`。
- 合规：`dropdown__result-message--${modifier}`。
- 不合规：`${status}` 直接输出 `success/error/connected`。

## 当前审计结果

命令：

```bash
cd apps/frontend
pnpm audit:bem
pnpm build
```

当前结果：

- TS/TSX 文件：119 个。
- `className` 属性：924 个。
- TSX 静态抽取唯一 class token：570 个。
- 编译后 CSS 唯一 class selector：767 个。
- TSX 使用但编译 CSS 未命中的候选：98 个。
- 能直接映射到已存在 BEM 选择器的遗留项：0 个。
- 旧单下划线 TSX 命中：0 个。
- `pnpm build`：通过。

构建仍有 Sass `@import` / legacy JS API deprecation warning，以及 Vite chunk size warning。这些不是 BEM 迁移失败。

## 已完成的迁移域

- Button：旧 `btn_*` 类已迁到 `btn btn--size btn--variant`。
- Dropdown：`show/hiding/selected/rotated` 已迁到 `is-visible/is-hiding/is-selected/is-rotated`。
- Save result dropdown：结果状态已迁到 `dropdown__result-message--success/info/error`。
- Modal/Tabs：`modal__*`、`tabs__*` 已对齐，tab 状态使用 `is-active`。
- MFC：`mfc-card/mfc-bar-*` 已迁到 `.mfc__*`。
- Furnace：监控、图表、程序段、记录、历史、预设选择器已迁到 `.monitoring__*`、`.chart__*`、`.segments__*`、`.recording__*`、`.history__*`、`.preset__*`。
- Canvas：节点、缩放控件、LoopBoundary 已迁到 `.node__*`、`.zoom-controls__*`、`.loop-boundary__*`。
- Workflow：WorkflowName、WorkflowManager、History list 已迁到 `.workflow-name__*`、`.workflow-manager__*`、`.history__*`。
- Status/connection：StatusBar、设备连接面板、连接状态点已迁到 `.status__*`、`.device-connection__*`、`.connection__status-dot`。
- User settings：设置表单、路径、通知、云同步和用户选择器已迁到 `.settings__*`、`.user-selector__*`、`.delete-confirm__*`。
- Device hover：悬浮状态框已迁到 `.device-hover__*`。

## 审计脚本

脚本位置：`apps/frontend/scripts/audit-bem.mjs`

NPM 命令：`pnpm audit:bem`

脚本检查：

- 编译 `src/styles/main.scss` 并提取 CSS class selector。
- 解析 TS/TSX 中 JSX `className` 静态 token。
- 报告旧单下划线类名。
- 报告“TSX 旧类名可以直接映射到已存在 BEM 目标”的高置信项。

如需在 CI 中强制失败：

```bash
cd apps/frontend
node scripts/audit-bem.mjs --fail
```

## 剩余非 BEM 事项

以下不是本轮类名断链问题，但建议后续单独治理：

- Sass 仍使用 `@import`，后续应迁到 `@use` / `@forward`。
- 构建产物 chunk 超过 Vite 默认提示阈值，后续可拆分 dynamic import。
- TSX 仍有部分 inline style，主要在通知设置和临时 loading/end 状态，后续可继续收敛到 BEM SCSS。
- `usedButUnstyledCount` 仍有 98 个候选，其中包含动态类、第三方图表配置、工具类、运行时拼接和未过滤 token；不等同于 BEM 断链。
