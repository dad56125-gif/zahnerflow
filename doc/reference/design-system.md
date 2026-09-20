# ZahnerFlow 设计规范

状态：当前规则。归属：前端样式维护者。来源：`apps/frontend/src/styles/`、`scripts/check-design.mjs` 及下表组件。来源复核：2026-09-20；本次不代表重新视觉验收。

本规范以现有主工作台的玻璃界面为基准，保留布局、圆角、排版和组件层级。

2026-09-20 亮色模式实施范围：在 `codex/light-ui` 分支增加浅色玻璃配色，复用 `appStore.theme` 和现有持久化，增加顶栏主题切换并修复启动恢复；覆盖主工作台、设备与设置浮层、画布及图表。基线为 `baseline/light-ui-20260920`。当前状态：实现已完成，1600×1000 与 1280×800 浏览器检查通过；版本检查、完整构建、lint 和主题切换/刷新恢复检查通过。浏览器以临时数据目录核对工作台、节点属性、用户设置、管式炉和流量计；未连接真机，未验证 Electron 壳。默认亮色，顶栏月亮/太阳按钮切换；刷新恢复既有 `app-storage` 中的选择。中性前景与凹面通道、主题文字及设备图标统一在 `_tokens.scss` 定义；阴影和遮罩保持独立，不使用整体反色。

| 维度 | 固定规则 | 实现入口 |
| --- | --- | --- |
| 色彩 | 蓝色表示主要操作；绿/橙/红分别表示成功、警告和失败。设备与测量类型使用有业务名称的专用色 | `_tokens.scss` |
| 文本 | Oxanium 数字/拉丁文字、Noto Sans SC 中文；主文、次文、弱化文字依次使用 `--text-primary/secondary/muted` | `_tokens.scss`、`_base.scss` |
| 间距 | 常规排版使用 `--space-*`；流式控件大小使用 `--size-*`；不得为视觉接近的控件另建一组尺寸 | `_tokens.scss` |
| 面板 | 单个玻璃容器，使用 `--glass-*`、`--radius-panel`、`--blur-panel`、`--shadow-panel` | `_placeholders.scss` |
| 按钮 | `.btn` 提供完整默认外观，尺寸和语义通过 `btn--sm/md`、`btn--primary/secondary/...` 组合 | `_buttons.scss` |
| 节点图标 | 一个 SVG 组件、一份几何样式、一份语义配色，库/画布/弹窗共用 | `NodeIconSvg.tsx`、`_node-icons.scss` |
| 弹窗 | 统一 `ModalLayer`，标题/内容/操作区分明；使用画布边界与桌面 chrome 变量定位 | `OverlayLayer.tsx` |
| 交互 | 可见焦点、键盘可达、禁用原因、等待和失败反馈；只有最顶层浮层响应 Escape | 共享浮层与具体组件 |
| 长列表 | 容器滚动，普通行不逐行加 backdrop-filter；展开计划每页最多 100 项 | `_scroll-rendering.scss`、`_unroll.scss` |

核心令牌只在 `_tokens.scss` 定义，响应式布局覆盖集中在 `_base.scss`。业务模块可以定义自身布局参数，但不能重定义核心令牌。静态颜色、间距、圆角等写在 SCSS；运行计算得到的图像尺寸、图表坐标、拖动偏移可以使用内联 style。

Sass 入口保留 `base → layout → components` 的 CSS 层顺序，通过 `meta.load-css` 加载模块。每个使用 mixin 或 placeholder 的模块显式 `@use './placeholders' as *`。不得重新引入旧 `@import` 或跨模块隐式依赖。

`pnpm design:check` 已纳入根 lint：禁止旧导入、检查核心令牌重定义，并对展开窗口、头像裁剪和共享节点图标执行无原始颜色检查。现存图表曲线、硬件状态和装饰渐变仍有业务专色；检查没有宣称全仓库所有颜色字面量都已消除。

变更验证应同时检查主工作台、已有设置弹窗、被修改的弹窗及紧凑窗口。结构检查和构建不能替代截图审阅，浏览器检查也不能证明 Electron 桌面窗口或真机设备行为已验证。
