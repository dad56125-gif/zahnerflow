# CSS组件系统文档

## 基本原则

### 1. CSS变量系统
- **必须使用CSS变量**，禁止硬编码数值
- CSS变量定义在 `_base.css` 的 `:root` 中
- 变量命名：`--模块-属性`（如 `--btn-gap`、`--input-padding`）
- 使用 `clamp()` 函数实现响应式

### 2. 基础类组合原则
- 每个类只负责单一职责
- 通过HTML多重类名实现组合（不是CSS嵌套）

## 通用组件架构

### CSS变量定义方式
```css
/* 组件尺寸系统 - _base.css */
--btn-medium-gap: clamp(0.5rem, 1.2vw, 0.75rem);
--btn-mini-font: clamp(0.625rem, 1.5vw, 0.6875rem);
--input-padding: clamp(0.5rem, 1.2vw, 0.625rem);
--card-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
```

### 基础类命名规范
- **行为类**：`组件_base`（cursor、transition、user-select等）
- **布局类**：`组件_layout`（display、align-items、justify-content等）
- **样式类**：`组件_style_common`（border、font-weight、text-shadow等）
- **尺寸类**：`组件_size`（medium、mini、large等）
- **状态类**：`组件_状态`（primary、secondary、disabled等）

### 使用方式
```html
<!-- 按钮组件 -->
<button class="btn_base btn_layout btn_style_common btn_medium btn-primary">操作</button>

<!-- 输入框组件 -->
<input class="input_base input_layout input_style_common input_medium" />

<!-- 卡片组件 -->
<div class="card_base card_layout card_style_common card_medium">内容</div>

<!-- 容器组件 -->
<div class="container_base container_layout container_style_common container_flex">子元素</div>
```

## 组件扩展规范

### 1. 定义CSS变量
```css
--新组件-属性: clamp(最小值, 偏好值, 最大值);
```

### 2. 创建基础类
```css
.新组件_base { /* 行为属性 */ }
.新组件_layout { /* 布局属性 */ }
.新组件_style_common { /* 通用样式 */ }
.新组件_medium { /* 中等尺寸 */ }
```

### 3. 组合使用
```html
<div class="新组件_base 新组件_layout 新组件_style_common 新组件_medium 状态类">
```

## overlay_base 模糊背景类

用途：为所有overlay组件提供统一的背景模糊效果。

使用方法：通过多重类名组合，将模糊背景应用到任何需要背景模糊的组件。

设计理念：分离模糊背景与玻璃态效果，使各组件能灵活组合不同视觉效果。

## 注意事项
- 变量命名：`--模块-属性` 格式
- 响应式：使用 `clamp()` 函数
- 类组合：HTML多重类名，非CSS嵌套
- 单一职责：每个类负责一个方面属性
- 一致性：所有尺寸使用CSS变量
- 可扩展：遵循命名规范，便于添加新组件