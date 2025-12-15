# 测量文件智能命名 - 环境上下文集成

## 功能概述

Zahner 测量文件名现在可以包含执行测量时的环境信息（Furnace 温度、MFC 气体流量），便于后续数据追溯。

### 文件名示例

| 场景 | 文件名 |
|------|--------|
| 无环境信息 | `EIS_OCV_091500.ism` |
| 仅 Furnace 温度 | `EIS_OCV_500C_091500.ism` |
| 仅 MFC 流量 | `EIS_OCV_100sccmAr_50sccmH2_091500.ism` |
| 完整环境 | `EIS_OCV_500C_100sccmAr_50sccmH2_091500.ism` |

---

## 当前实现：方案 1 - NestJS 主导

### 架构

```
用户触发测量
    ↓
NestJS ExecutionService
    ├── collectEnvironmentContext()
    │   ├── FurnaceService.health() → 获取温度
    │   └── MfcService.status() → 获取激活设备流量
    ↓
environment_context: {
  furnace_temp: 500,      // 整数，℃
  mfc_flows: { Ar: 100 }  // 整数，sccm
}
    ↓
Zahner FastAPI (parameters.environment_context)
    ↓
logic.py build_filename()
    ↓
"EIS_OCV_500C_100sccmAr_091500"
```

### 核心代码

#### NestJS: `execution.service.ts`

```typescript
private async collectEnvironmentContext(): Promise<{
  furnace_temp?: number;
  mfc_flows?: Record<string, number>;
}> {
  const context = {};

  // 1. Furnace 温度
  const furnaceHealth = await this.furnaceService.health();
  if (furnaceHealth?.device_connected) {
    const historyData = await this.furnaceService.get_history_data({
      range: { start: new Date(Date.now() - 10000).toISOString() }
    });
    if (historyData?.samples?.length > 0) {
      context.furnace_temp = Math.round(historyData.samples.at(-1).temperature);
    }
  }

  // 2. MFC 激活设备流量
  const statusArray = await this.mfcService.status();
  const activeDevices = statusArray.filter(d => d.flow_sccm > 0);
  if (activeDevices.length > 0) {
    context.mfc_flows = {};
    for (const device of activeDevices) {
      const gasName = device.gas_type || `MFC${device.device_address}`;
      context.mfc_flows[gasName] = Math.round(device.flow_sccm);
    }
  }

  return context;
}
```

#### Python: `logic.py`

```python
def build_filename(measurement_type: str, params: dict) -> str:
    # ... 构建 base_name ...
    
    # 解析环境上下文
    env_parts = []
    env_ctx = params.get("environment_context", {})
    
    if env_ctx.get("furnace_temp") is not None:
        env_parts.append(f"{int(env_ctx['furnace_temp'])}C")
    
    mfc_flows = env_ctx.get("mfc_flows", {})
    for gas_name in sorted(mfc_flows.keys()):
        env_parts.append(f"{int(mfc_flows[gas_name])}sccm{gas_name}")
    
    if env_parts:
        return f"{base_name}_{'_'.join(env_parts)}_{timestamp}"
    else:
        return f"{base_name}_{timestamp}"
```

### 优点

- ✅ 数据流清晰，单向依赖
- ✅ Zahner FastAPI 不需要知道其他设备
- ✅ 易于扩展（添加更多环境信息）
- ✅ 实现简单（~100 行代码）

### 缺点

- ❌ 每次测量都需要查询设备状态
- ❌ 如果设备通信失败，文件名不包含环境信息

---

## 备选方案：方案 2 - 全局执行上下文

### 架构

```
工作流开始
    ↓
创建 ExecutionContext（全局状态对象）
    ├── workflowId
    ├── executionId
    ├── environment: {
    │     furnace: { temp, sv },
    │     mfc: { Ar: { flow, setpoint } }
    │   }
    ↓
每个节点执行前，更新 environment 快照
    ↓
测量节点访问 context.environment
```

### 数据结构

```typescript
interface ExecutionContext {
  workflowId: string;
  executionId: string;
  startTime: Date;
  
  // 环境状态快照（实时更新）
  environment: {
    furnace?: {
      temp: number;
      sv: number;
      status: 'run' | 'pause' | 'stop';
    };
    mfc?: Record<string, {
      flow: number;
      setpoint: number;
      gas: string;
    }>;
    // 扩展：可添加更多设备
  };
  
  // 节点执行历史
  nodeResults: Map<string, any>;
}
```

### 实现思路

1. **创建 `ExecutionContextService`**：
   - 管理全局 `ExecutionContext` 实例
   - 提供 `getContext(executionId)` 方法

2. **设备状态订阅**：
   - FurnaceGateway/MfcGateway 推送状态更新
   - `ExecutionContextService` 监听并更新 `environment`

3. **节点执行时**：
   - `dispatchNodeLogic()` 将 `context` 注入每个节点
   - 节点可以访问 `context.environment.furnace.temp`

### 优点

- ✅ 语义清晰：上下文是工作流级别的概念
- ✅ 避免重复查询设备状态（使用缓存）
- ✅ 记录测量时的精确环境状态
- ✅ 便于日志/回溯/调试
- ✅ 扩展性强（可添加更多上下文维度）

### 缺点

- ❌ 实现复杂度更高（~200+ 行代码）
- ❌ 需要维护全局状态的一致性
- ❌ 需要处理设备断连时的状态失效

---

## 方案对比

| 维度 | 方案 1（当前） | 方案 2（备选） |
|------|---------------|---------------|
| 复杂度 | 🟢 低 | 🟡 中 |
| 代码量 | ~100 行 | ~250 行 |
| 性能 | 每次测量查询设备 | 使用缓存，更高效 |
| 可扩展性 | 良好 | 优秀 |
| 调试能力 | 一般 | 强（完整上下文记录） |
| 适用场景 | 简单工作流 | 复杂/长时间工作流 |

---

## 迁移至方案 2 的条件

当以下情况出现时，建议升级到方案 2：

1. 工作流执行时间很长（数小时），需要减少设备查询开销
2. 需要记录每个节点执行时的完整环境快照
3. 需要在节点之间共享状态（如：前一个节点的测量结果影响后一个节点的参数）
4. 需要支持"从任意节点开始执行"功能（需要恢复上下文）

---

## 后续扩展

- [ ] 添加更多环境信息（如：时间戳、操作者）
- [ ] 用户可配置哪些信息包含在文件名中
- [ ] 支持自定义文件名模板
