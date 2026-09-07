# ZahnerFlow 设计规范

本规范固定现有主工作台的暗色玻璃界面。维护时优先统一表达，避免为每个弹窗重新设计色板、阴影和按钮。

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
