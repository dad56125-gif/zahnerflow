# Portal 使用指南

## 概述

本指南说明了在ZAHNERFLOW项目中如何正确使用Portal组件，区分不同的UI场景和交互需求。

## Portal 组件接口

```tsx
interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement | null;
  /**
   * 控制 Portal 容器的点击穿透行为
   * 'none': 点击穿透（适用于下拉菜单、Tooltip，不阻挡下方内容）- 默认值
   * 'auto': 阻挡点击（适用于模态框、全屏遮罩）
   */
  pointerEvents?: 'none' | 'auto';
}
```

## UI 类型分类

### 1. Overlay UI (悬浮层UI)

**特点**：
- 不完全阻挡用户对下方内容的交互
- 需要能够检测到点击外部来关闭
- 通常是轻量级的临时界面

**适用组件**：
- 下拉菜单 (Dropdown)
- 工具提示 (Tooltip)
- 上下文菜单 (Context Menu)
- 自动完成建议 (Autocomplete)

**Portal配置**：
```tsx
<Portal pointerEvents="none">
  {/* 内容 */}
</Portal>
```

**行为**：
- Portal容器设置 `pointer-events: none`
- 点击事件穿透到下方页面
- 通过全局监听器检测点击外部来关闭组件
- 不阻挡页面滚动等背景操作

### 2. Modal UI (模态层UI)

**特点**：
- 完全阻挡用户对下方内容的交互
- 要求内部元素正常响应点击事件
- 通常有遮罩层和明确的关闭操作

**适用组件**：
- 对话框 (Dialog)
- 确认弹窗 (Confirm Dialog)
- 全屏加载 (Full Screen Loading)
- 图片预览 (Image Preview)

**Portal配置**：
```tsx
<Portal pointerEvents="auto">
  {/* 内容 */}
</Portal>
```

**行为**：
- Portal容器设置 `pointer-events: auto`
- 点击事件被Portal容器捕获，不穿透到下方
- 内部按钮和表单元素正常响应点击
- 通过遮罩层点击或关闭按钮来关闭组件

## 具体实现示例

### 下拉菜单 (正确实现)

```tsx
import { Portal } from './common/Portal';

export const DropdownExample: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭逻辑
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在下拉菜单内，不关闭
      if (dropdownRef.current?.contains(target)) return;

      // 点击在其他地方，关闭下拉菜单
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>
        打开下拉菜单
      </button>

      {/* 下拉菜单使用 pointerEvents="none" */}
      <Portal pointerEvents="none">
        {isOpen && (
          <div ref={dropdownRef} className="dropdown">
            <div>选项 1</div>
            <div>选项 2</div>
            <div>选项 3</div>
          </div>
        )}
      </Portal>
    </div>
  );
};
```

### 模态对话框 (正确实现)

```tsx
import { Portal } from './common/Portal';

export const DialogExample: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭逻辑 (简化版)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在对话框内，不关闭
      if (dialogRef.current?.contains(target)) return;

      // 点击在对话框外部，关闭对话框
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleConfirm = () => {
    // 确认逻辑，不会意外关闭对话框
    console.log('确认操作执行');
    setIsOpen(false);
  };

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>
        打开对话框
      </button>

      {/* 对话框使用 pointerEvents="auto" */}
      <Portal pointerEvents="auto">
        {isOpen && (
          <div className="modal-overlay" ref={dialogRef}>
            <div className="dialog-content">
              <h3>确认操作</h3>
              <p>确定要执行此操作吗？</p>

              <div className="dialog-buttons">
                <button onClick={() => setIsOpen(false)}>
                  取消
                </button>
                <button onClick={handleConfirm}>
                  确认
                </button>
              </div>
            </div>
          </div>
        )}
      </Portal>
    </div>
  );
};
```

## 常见错误和解决方案

### ❌ 错误1: 对话框使用默认pointerEvents

```tsx
// 错误：对话框使用了 pointerEvents="none" (默认值)
<Portal>
  {showDialog && (
    <div className="dialog">
      <button onClick={handleConfirm}>确认</button>
      {/* 点击确认按钮可能导致对话框意外关闭 */}
    </div>
  )}
</Portal>
```

**问题**：由于`pointer-events: none`，点击确认按钮时事件可能穿透到document，触发外部点击关闭逻辑。

**解决方案**：
```tsx
// 正确：对话框使用 pointerEvents="auto"
<Portal pointerEvents="auto">
  {showDialog && (
    <div className="dialog">
      <button onClick={handleConfirm}>确认</button>
      {/* 点击确认按钮正常工作 */}
    </div>
  )}
</Portal>
```

### ❌ 错误2: 下拉菜单使用pointerEvents="auto"

```tsx
// 错误：下拉菜单使用了 pointerEvents="auto"
<Portal pointerEvents="auto">
  {isOpen && (
    <div className="dropdown">
      {/* 点击外部可能无法关闭下拉菜单 */}
    </div>
  )}
</Portal>
```

**问题**：由于`pointer-events: auto`，点击页面其他区域时事件被Portal容器阻挡，无法触发外部点击关闭逻辑。

**解决方案**：
```tsx
// 正确：下拉菜单使用 pointerEvents="none"
<Portal pointerEvents="none">
  {isOpen && (
    <div className="dropdown">
      {/* 点击外部能正常关闭下拉菜单 */}
    </div>
  )}
</Portal>
```

### ❌ 错误3: 在对话框内容中使用stopPropagation

```tsx
// 错误：不必要的事件阻止
<div className="dialog-content" onMouseDown={(e) => e.stopPropagation()}>
  <button onClick={handleConfirm}>确认</button>
</div>
```

**问题**：阻止事件冒泡可能干扰正常的事件传播和检测逻辑。

**解决方案**：
```tsx
// 正确：让事件正常传播
<div className="dialog-content">
  <button onClick={handleConfirm}>确认</button>
</div>
```

## CSS 配套样式

### Overlay UI 样式

```css
/* 下拉菜单样式 */
.dropdown {
  position: fixed;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  pointer-events: auto; /* 内部元素需要响应点击 */
}

.dropdown-item {
  padding: 8px 16px;
  cursor: pointer;
  pointer-events: auto; /* 确保选项可点击 */
}
```

### Modal UI 样式

```css
/* 模态遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  pointer-events: auto; /* 遮罩层可点击 */
}

/* 对话框内容 */
.dialog-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 24px;
  min-width: 320px;
  max-width: 90vw;
  max-height: 90vh;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  pointer-events: auto; /* 内容区域可交互 */
}

/* 对话框按钮 */
.dialog-buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  pointer-events: auto; /* 按钮可点击 */
}
```

## 性能考虑

### 1. Portal 容器管理
- Portal组件会自动管理容器的创建和清理
- 避免在组件中手动创建DOM节点
- 使用React的生命周期确保正确的清理

### 2. 事件监听器优化
- 使用`useEffect`正确添加和移除事件监听器
- 避免在渲染过程中添加监听器
- 考虑使用防抖来优化频繁的外部点击检测

### 3. CSS 性能
- 使用`transform`和`opacity`进行动画，避免重排
- 合理使用`will-change`属性
- 避免过多的`box-shadow`和`filter`嵌套

## 测试要点

### 功能测试
- [ ] Overlay UI：点击外部正确关闭
- [ ] Modal UI：点击内部按钮正常工作
- [ ] Modal UI：点击遮罩层正确关闭
- [ ] 键盘交互：ESC键关闭
- [ ] 表单提交：Enter键确认

### 边界测试
- [ ] 快速连续点击
- [ ] 在输入框中输入时点击外部
- [ ] 多个Portal组件同时存在
- [ ] 响应式布局下的定位

### 兼容性测试
- [ ] 不同浏览器的事件行为
- [ ] 移动设备的触摸事件
- [ ] 高DPI显示器
- [ ] 辅助功能支持

## 总结

正确使用Portal的关键在于理解不同UI类型的交互需求：

- **Overlay UI**：使用`pointerEvents="none"`，允许事件穿透，通过全局监听器管理关闭
- **Modal UI**：使用`pointerEvents="auto"`，阻挡事件穿透，确保内部交互正常

通过这种分类，我们能够：
1. 避免事件冲突和意外关闭
2. 提供更好的用户体验
3. 简化事件处理逻辑
4. 保持代码的可维护性

遵循本指南，可以确保Portal在项目中的正确使用和一致的交互行为。