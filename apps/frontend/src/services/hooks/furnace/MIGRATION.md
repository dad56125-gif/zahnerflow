# Furnace Hook 重构迁移指南

## 概述

原始的 `useFurnace.ts` 文件存在严重的代码质量问题，包括：
- 860行单体代码违反单一职责原则
- 内存泄漏风险
- 依赖数组闭包陷阱
- 重复键错误
- 性能问题
- 类型安全隐患

新的模块化架构将功能拆分为专门的子Hook，提高了可维护性、可测试性和性能。

## 主要改进

### 1. 修复的问题
- ✅ 修复了重复键错误 (`operationState` 重复定义)
- ✅ 解决了依赖数组闭包陷阱
- ✅ 添加了内存泄漏防护
- ✅ 统一了错误处理
- ✅ 优化了轮询策略

### 2. 架构改进
- 🏗️ 模块化设计：将860行拆分为10个专门Hook
- 🔄 统一状态管理：避免状态不一致
- ⚡ 性能优化：智能缓存、防抖节流
- 🛡️ 类型安全：运行时类型检查和验证

## 新的Hook架构

### 核心状态管理Hooks

| Hook | 职责 | 文件 |
|------|------|------|
| `useFurnaceConnection` | 连接状态管理 | `useFurnaceConnection.ts` |
| `useFurnaceStatus` | 设备状态轮询 | `useFurnaceStatus.ts` |
| `useFurnaceProgram` | 程序段管理 | `useFurnaceProgram.ts` |
| `useFurnacePresets` | 预设管理 | `useFurnacePresets.ts` |
| `useFurnaceHistory` | 历史数据管理 | `useFurnaceHistory.ts` |
| `useFurnaceLogs` | 日志管理 | `useFurnaceLogs.ts` |

### 工具和优化Hooks

| Hook | 职责 | 文件 |
|------|------|------|
| `useFurnaceErrorHandler` | 统一错误处理 | `useFurnaceErrorHandler.ts` |
| `useFurnacePolling` | 智能轮询管理 | `useFurnacePolling.ts` |
| `useFurnaceOptimization` | 性能优化工具 | `useFurnaceOptimization.ts` |
| `useFurnaceTypes` | 类型安全工具 | `useFurnaceTypes.ts` |

## 迁移步骤

### 阶段1：保持兼容性（推荐）

继续使用原有接口，但切换到重构后的实现：

```typescript
// 原来的用法（保持不变）
import { useFurnace } from './useFurnace';

// 新的用法（向后兼容）
import { useFurnaceRefactored as useFurnace } from './useFurnaceRefactored';
```

### 阶段2：逐步迁移到子Hook

如果需要更细粒度的控制，可以直接使用子Hook：

```typescript
import {
  useFurnaceConnection,
  useFurnaceStatus,
  useFurnaceProgram,
  // ... 其他hooks
} from './furnace';

function MyComponent() {
  const [connectionData, connectionControls] = useFurnaceConnection();
  const [statusData, statusControls] = useFurnaceStatus();
  const [programData, programControls] = useFurnaceProgram();

  // 使用各自的控制方法
  // ...
}
```

## 性能优化

### 1. 智能缓存

```typescript
import { useFurnaceCache } from './furnace';

function MyComponent() {
  const cache = useFurnaceCache(5000); // 5秒TTL

  // 使用缓存
  const cachedData = cache.get('furnace_status');
  if (!cachedData) {
    const freshData = await fetchFurnaceStatus();
    cache.set('furnace_status', freshData);
  }
}
```

### 2. 防抖和节流

```typescript
import { useFurnaceDebounce, useFurnaceThrottle } from './furnace';

function MyComponent() {
  const debouncedUpdate = useFurnaceDebounce(updateTemperature, 300);
  const throttledPoll = useFurnaceThrottle(pollStatus, 1000);
}
```

### 3. 内存监控

```typescript
import { useFurnaceMemoryMonitor } from './furnace';

function MyComponent() {
  const { recordRender, getStats } = useFurnaceMemoryMonitor();

  useEffect(() => {
    recordRender();
    console.log('内存统计:', getStats());
  });
}
```

## 类型安全

### 运行时类型检查

```typescript
import {
  validateAndCreateFurnaceStatus,
  isValidFurnaceStatus
} from './furnace';

// 自动验证和修复数据
const safeStatus = validateAndCreateFurnaceStatus(rawData);

// 手动验证
if (isValidFurnaceStatus(data)) {
  // TypeScript 知道这里的 data 是 FurnaceStatus
  console.log(data.pv);
}
```

### 防御性编程

```typescript
import {
  safeNumber,
  clampTemperature,
  defensiveCast
} from './furnace';

const temperature = clampTemperature(safeNumber(rawValue));
```

## 错误处理改进

### 统一错误处理

```typescript
import { useFurnaceErrorHandler } from './furnace';

function MyComponent() {
  const [errorData, errorControls] = useFurnaceErrorHandler();

  const handleError = useCallback((error) => {
    errorControls.handleApiError(error);

    if (errorData.rateLimitInfo.isLimited) {
      // 处理限流
      setTimeout(() => {
        retry();
      }, errorData.rateLimitInfo.retryAfter * 1000);
    }
  }, [errorControls, errorData]);
}
```

## 注意事项

### 1. 内存泄漏防护
- 所有定时器都会在组件卸载时自动清理
- 限流定时器会自动替换，避免累积
- 采样定时器会智能清理，避免重复创建

### 2. 性能考虑
- 轮询频率已经优化，避免过度请求
- 使用了批量状态更新，减少重渲染
- 智能缓存减少重复计算

### 3. 向后兼容性
- `useFurnaceRefactored` 保持与原Hook完全相同的接口
- 现有代码无需修改即可享受性能提升
- 可以逐步迁移到更细粒度的Hook

## 测试建议

新的模块化架构使得单元测试更加容易：

```typescript
// 测试连接管理
test('useFurnaceConnection should handle connection state', () => {
  const { result } = renderHook(() => useFurnaceConnection());
  // 测试逻辑
});

// 测试特定功能
test('useFurnaceStatus should validate status data', () => {
  const { result } = renderHook(() => useFurnaceStatus());
  // 测试逻辑
});
```

## 故障排除

### 常见问题

1. **状态不同步**: 确保使用正确的控制方法，避免直接修改状态
2. **性能问题**: 检查是否正确使用了缓存和防抖
3. **内存泄漏**: 确保组件卸载时清理了所有定时器

### 调试工具

```typescript
// 启用性能监控
import { useFurnacePerformanceMonitor } from './furnace';

const { measureAsync } = useFurnacePerformanceMonitor();

// 测量异步操作性能
const result = await measureAsync('api_call', async () => {
  return await api.call();
});
```