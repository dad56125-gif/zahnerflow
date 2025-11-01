# useOnClickOutside - 快速参考卡

## 一分钟上手

```tsx
import { useOnClickOutside } from '../services/hooks/useOnClickOutside';

function MyComponent() {
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => {
    console.log('点击了外部！');
  });

  return <div ref={ref}>点击我外部试试</div>;
}
```

## API 速览

```typescript
useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,           // 组件引用
  handler: () => void,         // 外部点击处理函数
  enabled?: boolean = true     // 是否启用（可选）
)
```

## 常见用法

### 1. 弹窗/面板关闭
```tsx
const Modal = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div>
      <div ref={modalRef} className="modal-content">
        Modal Content
      </div>
    </div>
  );
};
```

### 2. 下拉菜单
```tsx
const Dropdown = ({ isOpen, onClose, children }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(dropdownRef, onClose, isOpen);

  if (!isOpen) return null;

  return <div ref={dropdownRef}>{children}</div>;
};
```

### 3. 带条件启用
```tsx
const Tooltip = ({ show, onClose }) => {
  const tipRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(tipRef, onClose, show);

  if (!show) return null;

  return <div ref={tipRef}>Tooltip</div>;
};
```

## 关键要点

| 要点 | 说明 |
|------|------|
| **ref 必须附加到容器元素** | 确保 ref 指向正确的 DOM 元素 |
| **支持触摸设备** | 自动监听 `touchstart` 事件 |
| **自动清理** | 组件卸载时自动移除监听器 |
| **可控制启用** | 通过 `enabled` 参数控制 |

## 实际应用列表

### ✅ 已实现
- 工作流管理面板 (`WorkflowManagerUI`)
- 文件路径管理器 (`FilePathManagerUI`)
- 用户选择下拉栏 (`UserSelector`)
- 新建用户面板 (`UserSelector`)
- 工作站选择下拉栏 (`TopNavbar`)
- 管式炉设备面板 (`DeviceModal`)
- MFC设备面板 (`MFCModal`)

### 📋 待实现
- [ ] 其他弹出式组件（如需要）

## 文件位置
```
📁 services/hooks/
├── useOnClickOutside.ts                 # Hook 实现
├── useOnClickOutside-使用指南.md        # 详细文档
├── useOnClickOutside-快速参考.md        # 本文件
└── 点击外部关闭功能实现总结.md           # 完整总结
```

## 相关链接
- [完整使用指南](./useOnClickOutside-使用指南.md)
- [实现总结](./点击外部关闭功能实现总结.md)
