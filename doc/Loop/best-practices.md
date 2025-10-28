# 循环节点系统最佳实践指南

**创建日期**: 2025-10-29
**版本**: 1.0
**作者**: Claude Code

## 1. 开发规范

### 1.1 组件设计原则

`✶ Insight ─────────────────────────────────────`
良好的组件设计应该遵循**单一职责原则**。每个组件只做一件事，并做好这件事。循环系统的组件划分正是这一原则的体现：检测、管理、渲染、交互各司其职。
`─────────────────────────────────────────────────`

#### ✅ 推荐做法

```typescript
// 好的做法：组件职责单一
const LoopBoundary: React.FC<LoopBoundaryProps> = ({
  startNode,
  endNode,
  nodesInLoop
}) => {
  // 只负责渲染循环边界
  // 不处理业务逻辑
  // 通过props接收所有需要的数据
};

// 好的做法：使用明确的类型
interface LoopBoundaryProps {
  startNode: LoopStartNode;
  endNode: LoopEndNode;
  nodesInLoop: ElectrochemicalNode[];
}
```

#### ❌ 避免的做法

```typescript
// 避免：组件承担过多职责
const LoopBoundary = () => {
  // 不要在这里处理循环检测
  const loops = detectLoops(allNodes);

  // 不要在这里管理循环状态
  const [loopState, setLoopState] = useState();

  // 不要直接操作DOM
  useEffect(() => {
    document.getElementById('loop').style...
  });
};
```

### 1.2 命名规范

```typescript
// 组件命名：PascalCase + 描述性名称
LoopBoundary
LoopVisualizer
LoopControlPanel
LoopStatusIndicator

// 函数命名：动词开头，描述功能
calculateBoundary()
detectLoops()
adaptNodeToLoopNode()
validateLoopStructure()

// 变量命名：名词或形容词
const loopInfo = {...};
const isLoopValid = true;
const boundaryPosition = {...};

// CSS类命名：kebab-case，层级清晰
.loop-boundary
.loop-boundary__container
.loop-boundary--running
.loop-boundary__bracket--top-left
```

### 1.3 类型定义规范

```typescript
// 接口命名：描述性 + 可选的后缀
interface LoopInfo {
  // 必需属性在前
  id: string;
  startNodeId: string;
  endNodeId: string;

  // 可选属性在后，使用?标记
  parameters?: LoopParameters;
  metadata?: Record<string, any>;
}

// 联合类型：使用 | 分隔
type LoopExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// 泛型使用：T代表类型，K代表键
interface LoopContext<T = any> {
  data: T;
  metadata: Record<string, any>;
}
```

## 2. 性能优化最佳实践

### 2.1 React组件优化

```typescript
// ✅ 使用React.memo包装组件
const LoopBoundary = React.memo<LoopBoundaryProps>(({
  startNode,
  endNode,
  nodesInLoop
}) => {
  return <div>...</div>;
}, (prevProps, nextProps) => {
  // 自定义比较函数，只比较必要的属性
  return prevProps.startNode.id === nextProps.startNode.id &&
         prevProps.endNode.id === nextProps.endNode.id &&
         prevProps.nodesInLoop.length === nextProps.nodesInLoop.length;
});

// ✅ 使用useMemo缓存计算结果
const boundaryPosition = useMemo(() => {
  return calculateBoundary(startNode, endNode, nodesInLoop);
}, [startNode.id, endNode.id, nodesInLoop.map(n => n.id).join(',')]);

// ✅ 使用useCallback缓存函数
const handleLoopStart = useCallback(() => {
  onLoopStart?.(loop.id);
}, [onLoopStart, loop.id]);

// ❌ 避免在render中创建新对象
const BadComponent = ({ nodes }) => {
  // 每次渲染都会创建新对象，导致子组件重渲染
  return <ChildComponent data={{ nodes }} />;
};

// ✅ 正确的做法
const GoodComponent = ({ nodes }) => {
  const data = useMemo(() => ({ nodes }), [nodes]);
  return <ChildComponent data={data} />;
};
```

### 2.2 事件处理优化

```typescript
// ✅ 使用事件委托
const LoopContainer = ({ loops }) => {
  useEffect(() => {
    const handleLoopEvent = (event: CustomEvent) => {
      // 统一处理所有循环事件
      updateLoopState(event.detail.loopId, event.detail.state);
    };

    // 在容器上添加一个监听器
    document.addEventListener('loopEvent', handleLoopEvent);
    return () => document.removeEventListener('loopEvent', handleLoopEvent);
  }, []);

  return <div>{loops.map(renderLoop)}</div>;
};

// ❌ 避免为每个循环添加单独的监听器
const BadLoopContainer = ({ loops }) => {
  return loops.map(loop => {
    useEffect(() => {
      // 每个循环都创建监听器，性能差
      const listener = (e) => {...};
      loop.addEventListener('change', listener);
    }, [loop]);
  });
};
```

### 2.3 批量更新优化

```typescript
// ✅ 使用批量更新
class LoopStateManager {
  private pendingUpdates = new Map<string, LoopState>();
  private updateScheduled = false;

  scheduleUpdate(loopId: string, state: LoopState) {
    this.pendingUpdates.set(loopId, state);

    if (!this.updateScheduled) {
      this.updateScheduled = true;
      // 使用requestAnimationFrame进行批量更新
      requestAnimationFrame(() => {
        this.flushUpdates();
        this.updateScheduled = false;
      });
    }
  }

  private flushUpdates() {
    // 一次性处理所有待更新的状态
    for (const [loopId, state] of this.pendingUpdates) {
      this.updateLoopState(loopId, state);
    }
    this.pendingUpdates.clear();
  }
}
```

## 3. 代码组织最佳实践

### 3.1 文件结构

```
src/components/loops/
├── index.ts                 # 导出入口
├── LoopBoundary.tsx        # 边界渲染组件
├── LoopVisualizer.tsx      # 可视化主组件
├── LoopDetector.ts         # 循环检测逻辑
├── LoopContextManager.ts   # 状态管理
├── components/             # 子组件
│   ├── LoopControlPanel.tsx
│   ├── LoopStatusIndicator.tsx
│   └── LoopDetailsPanel.tsx
├── hooks/                  # 自定义Hooks
│   ├── useLoopState.ts
│   ├── useLoopEvents.ts
│   └── useLoopBoundary.ts
├── utils/                  # 工具函数
│   ├── loopCalculations.ts
│   ├── loopValidation.ts
│   └── nodeAdaptation.ts
└── types/                  # 类型定义
    ├── loop.types.ts
    └── boundary.types.ts
```

### 3.2 导入导出规范

```typescript
// index.ts - 统一导出
export { LoopBoundary } from './LoopBoundary';
export { LoopVisualizer } from './LoopVisualizer';
export { LoopDetector } from './LoopDetector';
export { LoopContextManager } from './LoopContextManager';
export type { LoopInfo, LoopState } from './types';

// 组件文件 - 明确的导入顺序
// 1. React相关
import React, { useState, useEffect, useMemo } from 'react';

// 2. 第三方库
import clsx from 'clsx';

// 3. 内部组件
import { LoopBoundary } from '../LoopBoundary';

// 4. 工具函数和Hooks
import { useLoopState } from '../hooks/useLoopState';
import { calculateBoundary } from '../utils/loopCalculations';

// 5. 类型定义
import { LoopInfo, LoopBoundaryProps } from '../types';
```

### 3.3 错误处理

```typescript
// ✅ 统一的错误处理
class LoopError extends Error {
  constructor(
    message: string,
    public readonly loopId: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LoopError';
  }
}

// 使用Error Boundary捕获错误
class LoopErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LoopErrorBoundary]', error, errorInfo);
    // 发送错误报告
    this.reportError(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loop-error-fallback">
          <h3>循环渲染出错</h3>
          <details>
            {this.state.error?.message}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## 4. 测试最佳实践

### 4.1 单元测试

```typescript
// 测试命名：describe + 测试场景
describe('LoopBoundary.calculateBoundary', () => {
  // 测试用例命名：test + 具体场景和期望
  test('should calculate correct boundary for single loop', () => {
    // Arrange - 准备测试数据
    const startNode = createMockLoopNode('start', { x: 100, y: 100 });
    const endNode = createMockLoopNode('end', { x: 300, y: 200 });
    const nodesInLoop = [createMockNode('middle', { x: 200, y: 150 })];

    // Act - 执行测试
    const boundary = calculateBoundary(startNode, endNode, nodesInLoop);

    // Assert - 验证结果
    expect(boundary.x).toBeLessThanOrEqual(100 - 20);
    expect(boundary.y).toBeLessThanOrEqual(100 - 40);
    expect(boundary.width).toBeGreaterThanOrEqual(200 + 40);
    expect(boundary.height).toBeGreaterThanOrEqual(100 + 80);
  });

  test('should handle empty loop gracefully', () => {
    // 边界情况测试
  });
});
```

### 4.2 集成测试

```typescript
describe('Loop Visualization Integration', () => {
  test('should render complete loop workflow', async () => {
    // 1. 设置测试环境
    const mockNodes = [
      createLoopStartNode('loop1'),
      createMeasureNode(),
      createLoopEndNode('loop1')
    ];

    // 2. 渲染组件
    render(
      <LoopVisualizer
        loop={mockLoop}
        nodes={mockNodes}
        onLoopStart={jest.fn()}
      />
    );

    // 3. 验证渲染结果
    expect(screen.getByTestId('loop-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('loop-control-panel')).toBeInTheDocument();

    // 4. 模拟用户交互
    fireEvent.click(screen.getByText('开始'));

    // 5. 验证交互结果
    await waitFor(() => {
      expect(mockOnLoopStart).toHaveBeenCalledWith('loop1');
    });
  });
});
```

### 4.3 性能测试

```typescript
describe('Loop Performance Tests', () => {
  test('should render 100 loops within 100ms', () => {
    const loops = Array.from({ length: 100 }, (_, i) => createMockLoop(i));

    const startTime = performance.now();

    render(<LoopCanvas loops={loops} />);

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100);
  });

  test('should not re-render unnecessarily', () => {
    const renderSpy = jest.fn();

    const LoopBoundary = React.memo(({ loop }) => {
      renderSpy();
      return <div>{loop.id}</div>;
    });

    const { rerender } = render(
      <LoopBoundary loop={mockLoop} />
    );

    rerender(<LoopBoundary loop={mockLoop} />);

    // 不应该重新渲染
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
```

## 5. 维护指南

### 5.1 添加新功能步骤

1. **更新类型定义**
   ```typescript
   // 先更新接口
   interface LoopInfo {
     // 新增属性
     newFeature?: NewFeatureType;
   }
   ```

2. **编写测试用例**
   ```typescript
   // 先写测试，明确预期行为
   test('should support new feature', () => {
     // 测试实现
   });
   ```

3. **实现功能逻辑**
   ```typescript
   // 实现新功能
   const handleNewFeature = () => {
     // 功能实现
   };
   ```

4. **更新文档**
   ```markdown
   ## 新功能说明
   - 功能描述
   - 使用方法
   - 注意事项
   ```

### 5.2 代码审查清单

- [ ] 类型定义是否完整
- [ ] 是否遵循命名规范
- [ ] 是否有性能优化
- [ ] 错误处理是否完善
- [ ] 测试覆盖率是否足够
- [ ] 文档是否更新

### 5.3 常见陷阱

#### 性能陷阱

```typescript
// ❌ 避免在render中创建新对象
const BadComponent = ({ items }) => {
  return items.map(item => ({
    id: item.id,
    value: item.value * 2  // 每次都创建新对象
  }));
};

// ✅ 正确的做法：使用useMemo
const GoodComponent = ({ items }) => {
  const processedItems = useMemo(() =>
    items.map(item => ({
      id: item.id,
      value: item.value * 2
    })), [items]
  );

  return processedItems.map(renderItem);
};
```

#### 状态陷阱

```typescript
// ❌ 避免直接修改状态
const BadComponent = () => {
  const [loops, setLoops] = useState([]);

  const updateLoop = (id, data) => {
    // 直接修改是错误的！
    loops.find(l => l.id === id).data = data;
    setLoops(loops);
  };
};

// ✅ 正确的做法：创建新对象
const GoodComponent = () => {
  const [loops, setLoops] = useState([]);

  const updateLoop = (id, data) => {
    setLoops(prevLoops =>
      prevLoops.map(loop =>
        loop.id === id
          ? { ...loop, data }
          : loop
      )
    );
  };
};
```

## 6. 调试技巧

### 6.1 开启调试模式

```typescript
// 创建调试工具
const LoopDebugger = {
  enabled: process.env.NODE_ENV === 'development',

  log: (message: string, data?: any) => {
    if (this.enabled) {
      console.log(`[Loop] ${message}`, data);
    }
  },

  group: (label: string, fn: () => void) => {
    if (this.enabled) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  }
};

// 使用示例
LoopDebugger.log('Loop detected', { id: 'loop1', nodes: 5 });
```

### 6.2 可视化调试

```typescript
// 添加调试覆盖层
const DebugOverlay = ({ loops }) => {
  if (!process.env.REACT_APP_DEBUG) return null;

  return (
    <div className="debug-overlay">
      {loops.map(loop => (
        <div
          key={loop.id}
          className="debug-loop-info"
          style={{
            position: 'absolute',
            left: loop.boundary.x,
            top: loop.boundary.y - 20,
            background: 'rgba(255, 0, 0, 0.8)',
            color: 'white',
            padding: '2px 5px',
            fontSize: '10px'
          }}
        >
          {loop.id} - {loop.nodes.length} nodes
        </div>
      ))}
    </div>
  );
};
```

## 7. 版本控制最佳实践

### 7.1 提交信息规范

```bash
# 格式：<类型>(<范围>): <描述>

# 示例
feat(loop): add nested loop support
fix(visual): correct boundary calculation for large loops
docs(loop): update API documentation
refactor(loop): optimize boundary rendering performance
test(loop): add unit tests for loop detection
```

### 7.2 分支管理

```bash
# 功能分支
feature/loop-nested-support
feature/loop-performance-optimization

# 修复分支
fix/loop-boundary-calculation
fix/loop-memory-leak

# 发布分支
release/v1.2.0-loop-enhancements
```

## 8. 安全注意事项

### 8.1 输入验证

```typescript
// 验证循环参数
const validateLoopParameters = (params: any): boolean => {
  if (!params.loop_id || typeof params.loop_id !== 'string') {
    return false;
  }

  if (params.loop_count && (!Number.isInteger(params.loop_count) || params.loop_count <= 0)) {
    return false;
  }

  return true;
};

// 使用验证
const createLoop = (params: any) => {
  if (!validateLoopParameters(params)) {
    throw new Error('Invalid loop parameters');
  }

  // 继续处理
};
```

### 8.2 XSS防护

```typescript
// 安全地渲染循环信息
const LoopInfoLabel = ({ loop }) => {
  // 使用textContent而不是innerHTML
  return (
    <div className="loop-info">
      <span>{loop.id}</span>  {/* 安全 */}
      <span dangerouslySetInnerHTML={{ __html: loop.id }}></span>  {/* 危险！ */}
    </div>
  );
};
```

## 9. 总结

循环节点系统的开发应该遵循以下核心原则：

1. **类型安全优先**：充分利用TypeScript的类型系统
2. **性能考虑**：从设计阶段就考虑性能优化
3. **可测试性**：编写可测试的代码，保持高测试覆盖率
4. **文档同步**：代码更新时同步更新文档
5. **渐进增强**：先实现核心功能，再逐步增强

通过遵循这些最佳实践，可以构建一个健壮、高效、易维护的循环可视化系统。

---

**记住**：代码是写给人看的，顺便让机器执行。保持代码的清晰和可读性是最重要的。