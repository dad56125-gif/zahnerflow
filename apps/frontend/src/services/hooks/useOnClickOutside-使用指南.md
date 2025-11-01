# useOnClickOutside Hook 使用指南

## 概述

`useOnClickOutside` 是一个通用的自定义 Hook，用于检测组件外部的点击事件。它可以帮助您实现点击外部区域关闭弹窗、面板、下拉菜单等交互功能。

## 安装位置

```
apps/frontend/src/services/hooks/useOnClickOutside.ts
```

## 使用方法

### 基本用法

```tsx
import React, { useRef } from 'react';
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

const MyComponent: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  // 关闭处理函数
  const handleClose = () => {
    console.log('点击了外部区域');
    // 执行关闭逻辑
  };

  // 使用 useOnClickOutside
  useOnClickOutside(ref, handleClose);

  return (
    <div ref={ref}>
      {/* 您的组件内容 */}
      点击外部区域时会触发 handleClose
    </div>
  );
};
```

## 应用场景示例

### 1. 工作流管理面板

```tsx
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

export const WorkflowManagerUI: React.FC<WorkflowManagerUIProps> = ({
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // 使用 Hook
  useOnClickOutside(panelRef, () => {
    if (onClose) {
      onClose();
    }
  });

  return (
    <div ref={panelRef} className="workflow-manager-ui">
      {/* 面板内容 */}
    </div>
  );
};
```

### 2. 文件路径管理器

```tsx
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

export const FilePathManagerUI: React.FC<FilePathManagerUIProps> = ({
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(panelRef, onClose);

  return (
    <div ref={panelRef} className="file-path-manager-panel">
      {/* 管理器内容 */}
    </div>
  );
};
```

### 3. 下拉菜单

```tsx
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Dropdown: React.FC<DropdownProps> = ({
  isOpen,
  onClose,
  children
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(dropdownRef, onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div ref={dropdownRef} className="dropdown-menu">
      {children}
    </div>
  );
};
```

### 4. 模态对话框

```tsx
import { useOnClickOutside } from '../../services/hooks/useOnClickOutside';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(modalRef, onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div ref={modalRef} className="modal-content">
        {children}
      </div>
    </div>
  );
};
```

## 参数说明

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `ref` | `RefObject<T>` | 组件的引用对象 | - |
| `handler` | `(event: MouseEvent \| TouchEvent) => void` | 点击外部时要执行的回调函数 | - |
| `enabled` | `boolean` | 是否启用监听 | `true` |

## 特性

1. **支持多种事件类型**：同时监听 `mousedown` 和 `touchstart` 事件，适配鼠标和触摸设备。
2. **可控制启用/禁用**：通过 `enabled` 参数可以控制是否启用监听。
3. **自动清理**：组件卸载时自动移除事件监听器，避免内存泄漏。
4. **类型安全**：使用 TypeScript 泛型，确保类型安全。

## 注意事项

1. **ref 必须附加到需要检测的容器元素**：确保 ref 附加到了正确的 DOM 元素。
2. **避免事件冒泡**：如果内部元素有点击事件，记得调用 `event.stopPropagation()`。
3. **性能考虑**：在不需要时将 `enabled` 设置为 `false`，避免不必要的监听。

## 实际应用场景

以下组件建议使用此 Hook：

- ✅ 工作流管理面板
- ✅ 文件路径管理器
- ✅ 用户选择下拉菜单
- ✅ 选择工作站下拉菜单
- ✅ 新建用户面板
- ✅ 任何弹出式面板或菜单

## 最佳实践

1. **统一的关闭模式**：所有可关闭的UI组件都应支持点击外部关闭。
2. **与键盘事件结合**：除了点击外部，还可以添加 ESC 键关闭功能。
3. **动画过渡**：在关闭时添加平滑的动画效果，提升用户体验。
4. **无障碍支持**：确保键盘导航和屏幕阅读器用户也能正常使用。

## 扩展用法

您可以基于此 Hook 创建更具体的功能：

```tsx
// 创建自定义 Hook，例如 useModal
export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);
  const toggleModal = () => setIsOpen(!isOpen);

  useOnClickOutside(modalRef, closeModal, isOpen);

  return {
    isOpen,
    modalRef,
    openModal,
    closeModal,
    toggleModal
  };
};
```
