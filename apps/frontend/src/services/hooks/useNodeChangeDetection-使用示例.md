# useNodeChangeDetection Hook 使用示例

## 基本用法

```typescript
import { useNodeChangeDetection } from './services/hooks/useNodeChangeDetection';

// 在组件中使用
const MyComponent = ({ nodes }) => {
  const update_trigger = useNodeChangeDetection(nodes);

  // 当 update_trigger 变化时，重新渲染连接线
  React.useEffect(() => {
    // 重新计算连接线的逻辑
    recalculateConnections();
  }, [update_trigger]);

  return (
    <div>
      {/* 渲染节点和连接线 */}
    </div>
  );
};
```

## 配置选项

### 1. 快速响应模式（默认）
```typescript
const update_trigger = useNodeChangeDetection(nodes, {
  enable_delay: false,
  delay_ms: 0,
  layout_stable: true
});
```

### 2. 启用延迟更新
```typescript
const update_trigger = useNodeChangeDetection(nodes, {
  enable_delay: true,
  delay_ms: 300,  // 300ms延迟
  layout_stable: true
});
```

### 3. 使用预设配置
```typescript
import { NODE_CHANGE_DETECTION_CONFIG } from './services/hooks/useNodeChangeDetection';

// 防抖配置
const update_trigger = useNodeChangeDetection(
  nodes,
  NODE_CHANGE_DETECTION_CONFIG.DEBOUNCE
);

// 保守配置
const update_trigger = useNodeChangeDetection(
  nodes,
  NODE_CHANGE_DETECTION_CONFIG.CONSERVATIVE
);
```

## 与 ConnectionLines 组件集成

```typescript
import { useNodeChangeDetection } from '../hooks/useNodeChangeDetection';
import { ConnectionLines } from '../components/ConnectionLines';

const Canvas = ({ nodes }) => {
  // 使用 Hook 检测节点变化
  const update_trigger = useNodeChangeDetection(nodes, {
    enable_delay: true,
    delay_ms: 150,
    layout_stable: true
  });

  return (
    <div>
      {/* 节点渲染 */}
      {nodes.map(node => (
        <Node key={node.id} node={node} />
      ))}

      {/* 连接线渲染 - 通过 key 强制重新渲染 */}
      <ConnectionLines
        key={`connections-${update_trigger}`}
        nodes={nodes}
      />
    </div>
  );
};
```

## 参数说明

### nodes: any[]
要监听变化的节点数组。支持任意格式的节点数据，Hook 会自动转换为 `ElectrochemicalNode` 格式。

### options: UseNodeChangeDetectionOptions
配置选项对象：

- **enable_delay**: boolean - 是否启用延迟更新机制，默认 false
- **delay_ms**: number - 延迟时间（毫秒），默认 300
- **layout_stable**: boolean - 布局是否稳定，默认 true

### 返回值
**update_trigger**: number - 更新触发计数器，每次检测到节点变化时会递增，可用于强制重新渲染相关组件。

## 预设配置

Hook 提供了 4 种预设配置：

1. **FAST_RESPONSE** - 快速响应，禁用延迟
2. **BALANCED** - 平衡模式，150ms 延迟
3. **DEBOUNCE** - 防抖模式，300ms 延迟
4. **CONSERVATIVE** - 保守模式，500ms 延迟且仅在布局稳定时更新

## 注意事项

1. Hook 内部使用 `connection_binding_service.shouldUpdateConnections` 进行变化检测
2. 自动处理节点格式的转换，无需手动转换
3. 包含完整的清理机制，避免内存泄漏
4. 遵循项目的 snake_case 命名规范
5. 支持延迟更新机制，可优化渲染性能