# Furnace状态管理Hook使用指南

## 概述

本项目提供了三个不同版本的Furnace状态管理Hook，旨在简化前端状态管理，提高性能，并确保严格遵循snake_case参数命名规范。

## 版本对比

| 版本 | 文件 | 行数 | 特点 | 适用场景 |
|------|------|------|------|----------|
| 原始版本 | `useFurnace.ts` | 986 | 功能完整但复杂 | 现有项目，需要兼容性 |
| 简化版本 | `useFurnaceSimplified.ts` | ~600 | 兼容性好，减少复杂性 | 逐步迁移 |
| **优化版本** | `useFurnaceOptimized.ts` | ~450 | 高性能，最小化状态 | 新项目，性能优先 |
| **最终版本** | `useFurnaceFinal.ts` | ~400 | **推荐使用**，严格snake_case | **生产环境** |

## 推荐使用最终版本

强烈推荐使用 `useFurnaceFinal.ts`，它具有以下优势：

### 🚀 性能优化
- **最小化状态变量**：从15+个状态减少到11个核心状态
- **批量状态更新**：减少React重渲染次数
- **智能缓存**：WebSocket事件处理器使用useMemo缓存
- **数据量限制**：自动限制日志(200条)和历史数据(1000条)

### 🔧 功能简化
- **完全基于WebSocket**：移除轮询，使用实时更新
- **统一错误处理**：简化错误处理逻辑
- **精简进度管理**：统一的操作进度显示
- **自动资源清理**：组件卸载时自动清理WebSocket连接

### 📝 命名规范
- **严格snake_case**：所有参数和方法名遵循snake_case规范
- **类型安全**：完整的TypeScript类型定义
- **一致性**：与后端Python API命名完全对齐

## 使用方法

### 基本导入

```typescript
import { useFurnaceFinal } from '../services/hooks/useFurnaceFinal';
// 或者使用别名（推荐）
import { useFurnaceFinal as useFurnace } from '../services/hooks/useFurnaceFinal';
```

### 类型导入

```typescript
import type {
  FinalFurnaceState as FurnaceState,
  FinalFurnaceControls as FurnaceControls
} from '../services/hooks/useFurnaceFinal';
```

### 基本使用

```typescript
function FurnaceComponent() {
  const [state, controls] = useFurnaceFinal();

  // 连接设备
  const handleConnect = async () => {
    await controls.connect({
      port: 'COM1',
      baudrate: 9600,
      timeout: 5000
    });
  };

  // 设置温度
  const handleSetTemperature = async (temp: number) => {
    await controls.set_temperature(temp);
  };

  // 运行程序
  const handleRun = async () => {
    await controls.run();
  };

  return (
    <div>
      <div>连接状态: {state.connection_status}</div>
      <div>设备状态: {state.device_status?.status}</div>
      <div>当前温度: {state.device_status?.pv}°C</div>
      <div>设置温度: {state.device_status?.sv}°C</div>

      <button onClick={handleConnect} disabled={state.loading}>
        {state.loading ? '连接中...' : '连接设备'}
      </button>

      <button onClick={() => handleSetTemperature(100)}>
        设置100°C
      </button>

      <button onClick={handleRun}>
        运行程序
      </button>
    </div>
  );
}
```

## 状态结构

### 设备状态

```typescript
interface FinalFurnaceState {
  // 核心设备状态
  device_status: FurnaceStatus | null;           // 设备详细状态
  connection_status: 'connected' | 'disconnected'; // 连接状态
  operation_status: DeviceOperationStatus;        // 操作状态

  // 数据
  segments: ProgramSegment[];                     // 程序段数据
  presets: FurnacePresetMeta[];                   // 预设列表
  selected_preset: FurnacePreset | null;           // 当前选中的预设
  history_data: Array<{                          // 历史数据
    timestamp: string;
    temperature: number;
    sv: number;
    mv: number;
  }>;
  history_params: HistoryQueryParams;             // 历史数据查询参数
  logs: LogEntry[];                               // 日志条目

  // UI状态
  loading: boolean;                               // 全局加载状态
  error: DeviceError | null;                      // 错误信息

  // 操作进度
  operation_progress: {                          // 操作进度显示
    active: boolean;
    type: 'reading' | 'writing' | null;
    progress: number;
  };
}
```

## 控制方法

### 设备连接管理

```typescript
// 连接设备
await controls.connect({
  port: 'COM1',
  baudrate: 9600,
  timeout: 5000
});

// 断开设备
await controls.disconnect();
```

### 基本设备控制

```typescript
// 设置温度
await controls.set_temperature(100);

// 设置程序段
await controls.set_segment(5);

// 程序控制
await controls.run();
await controls.pause();
await controls.stop();
```

### 程序段操作

```typescript
// 读取程序段
await controls.load_segments();

// 写入程序段
const segments = [...]; // ProgramSegment数组
await controls.write_segments(segments);
```

### 预设管理

```typescript
// 加载预设列表
await controls.load_presets();

// 选择预设
await controls.select_preset('预设名称');

// 创建预设
await controls.create_preset({
  name: '新预设',
  description: '预设描述',
  segments: [...]
});

// 更新预设
await controls.update_preset('预设名称', segments);

// 删除预设
await controls.delete_preset('预设名称');

// 克隆预设
await controls.clone_preset('源预设', '新预设');

// 应用预设
await controls.apply_preset('预设名称');
```

### 数据管理

```typescript
// 加载历史数据
await controls.load_history_data({
  start_time: '2023-01-01T00:00:00Z',
  end_time: '2023-01-02T00:00:00Z',
  limit: 1000
});

// 更新历史查询参数
controls.update_history_params({
  limit: 500
});

// 刷新日志
await controls.refresh_logs();

// 清除日志
controls.clear_logs();

// 添加操作日志
controls.add_log('success', '操作成功完成');
```

### 状态管理

```typescript
// 重置所有状态
controls.reset();

// 清除错误
controls.clear_error();
```

## 命名规范对照表

| 原始命名 | 标准命名 | 说明 |
|----------|----------|------|
| `isLoading` | `loading` | 加载状态 |
| `connectionState` | `connection_status` | 连接状态 |
| `operationState` | `operation_status` | 操作状态 |
| `lastUpdate` | `last_update` | 最后更新时间 |
| `segmentOperation` | `segment_operation` | 程序段操作 |
| `selectedPreset` | `selected_preset` | 选中预设 |
| `historyData` | `history_data` | 历史数据 |
| `historyParams` | `history_params` | 历史参数 |
| `setTemperature` | `set_temperature` | 设置温度 |
| `loadSegments` | `load_segments` | 加载程序段 |
| `writeSegments` | `write_segments` | 写入程序段 |
| `loadPresets` | `load_presets` | 加载预设 |
| `createPreset` | `create_preset` | 创建预设 |
| `deletePreset` | `delete_preset` | 删除预设 |
| `applyPreset` | `apply_preset` | 应用预设 |
| `loadHistoryData` | `load_history_data` | 加载历史数据 |
| `refreshLogs` | `refresh_logs` | 刷新日志 |
| `clearLogs` | `clear_logs` | 清除日志 |
| `addOperationLog` | `add_log` | 添加日志 |

## 性能优化特性

### 1. 批量状态更新
```typescript
// 单次更新多个状态，减少重渲染
update_state({
  loading: false,
  error: null,
  data: new_data
});
```

### 2. 智能缓存
```typescript
// WebSocket事件处理器缓存，避免重复创建
const web_socket_handlers = useMemo(() => ({
  on_status_update: (data) => { /* ... */ },
  on_sampling_data: (data) => { /* ... */ },
}), [dependencies]);
```

### 3. 数据量限制
```typescript
// 自动限制数据量，防止内存泄漏
logs: [...prev.logs, new_log].slice(-200)
history_data: [...prev.history_data, sample].slice(-1000)
```

### 4. 统一错误处理
```typescript
// 所有设备操作使用统一的错误处理
const execute_device_operation = async (operation, message) => {
  try {
    await operation();
    if (message) add_log('info', message);
  } catch (error) {
    handle_error(error);
  }
};
```

## 迁移指南

### 从原始版本迁移

1. **更新导入**：
```typescript
// 旧版本
import { useFurnace } from '../services/hooks/useFurnace';
import type { FurnaceState, FurnaceControls } from '../services/hooks/useFurnace';

// 新版本
import { useFurnaceFinal as useFurnace } from '../services/hooks/useFurnaceFinal';
import type { FinalFurnaceState as FurnaceState, FinalFurnaceControls as FurnaceControls } from '../services/hooks/useFurnaceFinal';
```

2. **更新状态访问**：
```typescript
// 旧版本
state.isLoading
state.connectionState.status
state.selectedPreset
state.historyData

// 新版本
state.loading
state.connection_status
state.selected_preset
state.history_data
```

3. **更新方法调用**：
```typescript
// 旧版本
controls.setTemperature(100);
controls.loadSegments();
controls.createPreset(preset);

// 新版本
controls.set_temperature(100);
controls.load_segments();
controls.create_preset(preset);
```

### 自动迁移

使用提供的迁移助手脚本：
```bash
node migration-helper.js
```

脚本会自动：
- 更新导入语句
- 替换状态属性名
- 替换方法调用
- 生成迁移报告

## 最佳实践

### 1. 错误处理
```typescript
try {
  await controls.set_temperature(100);
} catch (error) {
  console.error('设置温度失败:', error);
  // 错误信息已自动存储在 state.error 中
}
```

### 2. 加载状态管理
```typescript
// 全局加载状态
<button disabled={state.loading}>
  {state.loading ? '处理中...' : '执行操作'}
</button>

// 操作进度显示
{state.operation_progress.active && (
  <div>
    <div>操作类型: {state.operation_progress.type}</div>
    <div>进度: {state.operation_progress.progress}%</div>
  </div>
)}
```

### 3. 状态监听
```typescript
useEffect(() => {
  // 监听连接状态变化
  if (state.connection_status === 'connected') {
    console.log('设备已连接');
  }
}, [state.connection_status]);

useEffect(() => {
  // 监听设备状态变化
  if (state.device_status) {
    console.log('设备状态:', state.device_status.status);
  }
}, [state.device_status]);
```

### 4. 资源清理
```typescript
useEffect(() => {
  // 组件卸载时自动清理WebSocket连接
  return () => {
    // 由Hook内部处理，无需手动清理
  };
}, []);
```

## 故障排除

### 常见问题

1. **WebSocket连接失败**
   - 检查WebSocket服务是否启动
   - 确认网络连接正常
   - 查看浏览器控制台错误信息

2. **状态更新不及时**
   - 确认WebSocket订阅成功
   - 检查事件处理器是否正确注册
   - 验证数据格式是否正确

3. **内存泄漏**
   - 确认组件卸载时清理了定时器
   - 检查是否有循环引用
   - 验证事件监听器是否正确移除

4. **类型错误**
   - 确认TypeScript类型定义正确
   - 检查导入路径是否正确
   - 验证snake_case命名是否一致

### 调试技巧

1. **启用详细日志**
```typescript
// 在Hook中添加调试日志
console.log('WebSocket状态:', web_socket_status.current);
console.log('当前状态:', state);
```

2. **监控性能**
```typescript
// 使用React DevTools Profiler
// 监控重渲染次数和持续时间
```

3. **网络监控**
```typescript
// 使用浏览器开发工具监控WebSocket连接
// 检查Network面板中的WebSocket消息
```

## 支持与反馈

如有问题或建议，请：
1. 查看本指南的故障排除部分
2. 检查相关类型定义
3. 提交Issue或Pull Request

---

**注意**: 本Hook严格遵循项目的snake_case命名规范，确保与后端API的一致性。