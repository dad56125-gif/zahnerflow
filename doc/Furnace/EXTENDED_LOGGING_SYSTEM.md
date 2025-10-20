# Furnace 扩展日志系统文档

## 版本信息
- **版本**: 3(扩展日志系统)
- **日期**: 2025-10-19
- **作者**: Claude Code Assistant

## 概述

本文档描述了Furnace设备扩展日志系统的完整实现，该系统支持**操作日志**和**16进制通信日志**的混合显示，为用户提供完整的设备操作透明度和调试能力。

## 功能特性

### 1. 混合日志显示
- **操作日志**: 用户友好的操作状态信息，带图标和颜色区分
- **通信日志**: 详细的16进制Modbus RTU通信数据
- **统一时间线**: 两种日志按时间顺序混合显示

### 2. 操作日志类型
- ✅ **Success**: 成功操作（绿色，✓图标）
- ℹ **Info**: 信息提示（白色，ℹ图标）
- ⚠ **Warning**: 警告信息（黄色，⚠图标）
- ✗ **Error**: 错误信息（红色，✗图标）

### 3. 通信日志功能
- **TX/RX区分**: 发送(TX)蓝色，接收(RX)绿色
- **毫秒时间戳**: 精确到毫秒的时间记录
- **16进制显示**: 原始通信数据的十六进制表示

### 4. 缓存管理
- **容量**: 最多500条日志记录
- **自动清理**: 超出容量时自动删除最旧记录
- **分层缓存**: 后端通信日志 + 前端混合日志

## 类型定义

### 核心类型 (`apps/frontend/src/types/devices.ts`)

```typescript
// 日志类型枚举
export type LogType = 'comm' | 'operation';

// 通信日志
export interface CommLog {
  timestamp: string;     // HH:MM:SS.sss
  direction: 'TX' | 'RX';  // 发送/接收方向
  data: string;          // 16进制数据
}

// 操作日志
export interface OperationLog {
  timestamp: string;     // HH:MM:SS
  level: 'success' | 'info' | 'warning' | 'error';
  message: string;       // 操作描述
}

// 统一日志条目
export interface LogEntry {
  id: string;            // 唯一标识
  timestamp: string;     // 时间戳
  type: LogType;         // 日志类型
  data: CommLog | OperationLog;  // 具体数据
}
```

## 文件结构和实现

### 后端实现

#### 1. FastAPI设备层 (`apps/backend/src/modules/furnace/fastapi/ai518p_device.py`)

**核心函数**:
```python
# 通信日志缓冲区
comm_log = []  # 最多保存500条

def add_comm_log(direction: str, data_hex: str, timestamp=None):
    """添加通信日志到缓冲区"""
    # 实现日志记录和容量管理

def _send(self, cmd: bytes):
    """发送命令并记录TX/RX日志"""
    add_comm_log('TX', cmd.hex())  # 发送日志
    # ... 通信逻辑 ...
    add_comm_log('RX', response.hex())  # 接收日志

@app.get("/comm-log")
def get_comm_log():
    """获取通信日志API端点"""
    return {"logs": comm_log, "total": len(comm_log)}
```

#### 2. NestJS后端层
- **Controller** (`apps/backend/src/modules/furnace/furnace.controller.ts`): `/comm-log`端点
- **Service** (`apps/backend/src/modules/furnace/furnace.service.ts`): 日志转发逻辑
- **Device Service** (`apps/backend/src/devices/furnace-device.service.ts`): FastAPI调用

### 前端实现

#### 1. API客户端 (`apps/frontend/src/services/api/furnaceApi.ts`)
```typescript
static async getCommLog(): Promise<{ logs: CommLog[], total: number }> {
  return apiRequest<{ logs: CommLog[], total: number }>('/comm-log');
}
```

#### 2. Hook状态管理 (`apps/frontend/src/services/hooks/useFurnace.ts`)

**核心方法**:
```typescript
// 添加操作日志
const addOperationLog = useCallback((
  level: 'success' | 'info' | 'warning' | 'error',
  message: string
): void => {
  const logEntry: LogEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleTimeString(),
    type: 'operation',
    data: { timestamp, level, message } as OperationLog
  };
  updateState({ logs: [...state.logs, logEntry].slice(-500) });
}, [updateState]);

// 刷新通信日志
const refreshLogs = useCallback(async (): Promise<void> => {
  const response = await FurnaceApi.getCommLog();
  const commLogEntries = response.logs.map(log => ({
    id: `comm_${log.timestamp}_${Math.random()}`,
    timestamp: log.timestamp,
    type: 'comm' as LogType,
    data: log
  }));
  // 合并操作日志和通信日志
  updateState({
    logs: [...operationLogs, ...commLogEntries].slice(-500)
  });
}, [updateState]);
```

**操作日志记录点**:
```typescript
// 连接成功
addOperationLog('success', `设备已连接到 ${config.port}`);

// 温度设置
addOperationLog('info', `温度设置为 ${sv}°C`);

// 程序控制
addOperationLog('success', '程序已开始运行');
addOperationLog('info', '程序已暂停');
addOperationLog('info', '程序已停止');
```

#### 3. UI组件 (`apps/frontend/src/components/DeviceModal.tsx`)

**混合日志渲染**:
```typescript
{furnaceState.logs.map((log) => (
  <div key={log.id} className={`console-log ${log.type} ${log.type === 'comm' ?
    (log.data as CommLog).direction.toLowerCase() :
    (log.data as OperationLog).level}`}>
    <span className="log-timestamp">{log.timestamp}</span>
    {log.type === 'comm' ? (
      <>
        <span className="log-direction">{(log.data as CommLog).direction}:</span>
        <span className="log-data">{(log.data as CommLog).data}</span>
      </>
    ) : (
      <span className="log-message">
        {/* 操作日志图标和消息 */}
        {(log.data as OperationLog).level === 'success' && '✓ '}
        {(log.data as OperationLog).message}
      </span>
    )}
  </div>
))}
```

#### 4. 样式定义 (`apps/frontend/src/styles/components/_temperature-controller.css`)

**操作日志样式**:
```css
/* 操作日志级别颜色 */
.console-log.operation.success .log-message { color: #2ecc71; }
.console-log.operation.error .log-message { color: #e74c3c; }
.console-log.operation.warning .log-message { color: #f39c12; }
.console-log.operation.info .log-message { color: rgba(255, 255, 255, 0.8); }

/* 日志类型区分边框 */
.console-log.comm.tx { border-left-color: #2196F3; }
.console-log.comm.rx { border-left-color: #4CAF50; }
.console-log.operation.success { border-left-color: #2ecc71; }
.console-log.operation.error { border-left-color: #e74c3c; }
```

## 显示效果

### 操作日志示例
```
14:32:15  ✓ 设备已连接到 COM4
14:32:20  ℹ 温度设置为 450°C
14:32:30  ✓ 程序已开始运行
14:32:35  ℹ 程序已暂停
14:32:40  ℹ 程序已停止
```

### 通信日志示例
```
14:32:15.123  TX: 01031100000A65
14:32:15.145  RX: 010311000A6401D201
14:32:20.234  TX: 01031101000A64
14:32:20.256  RX: 010311010A6402D301
```

### 混合显示示例
```
14:32:15  ✓ 设备已连接到 COM4
14:32:15.123  TX: 01031100000A65
14:32:15.145  RX: 010311000A6401D201
14:32:20  ℹ 温度设置为 450°C
14:32:20.234  TX: 01031101000A64
14:32:20.256  RX: 010311010A6402D301
14:32:30  ✓ 程序已开始运行
```

## 未来扩展方案

### 1. 新增操作类型
```typescript
// 在控制方法中添加
const applyPreset = useCallback(async (name: string): Promise<void> => {
  try {
    await FurnaceApi.applyPreset(name);
    addOperationLog('success', `已应用预设: ${name}`);
  } catch (error) {
    addOperationLog('error', `预设应用失败: ${error.message}`);
  }
}, [addOperationLog]);
```

### 2. 错误日志增强
```typescript
// 在catch块中添加详细错误日志
catch (error) {
  addOperationLog('error', `操作失败: ${error.message}`);
  // 可选：记录错误详情
  if (error.details) {
    addOperationLog('warning', `错误详情: ${error.details}`);
  }
}
```

### 3. 日志过滤和搜索
```typescript
// 添加日志过滤功能
const [logFilter, setLogFilter] = useState<'all' | 'operation' | 'comm'>('all');
const [searchTerm, setSearchTerm] = useState('');

const filteredLogs = useMemo(() => {
  return logs.filter(log => {
    const matchesType = logFilter === 'all' || log.type === logFilter;
    const matchesSearch = searchTerm === '' ||
      (log.type === 'operation' ?
        (log.data as OperationLog).message.toLowerCase().includes(searchTerm.toLowerCase()) :
        (log.data as CommLog).data.toLowerCase().includes(searchTerm.toLowerCase())
      );
    return matchesType && matchesSearch;
  });
}, [logs, logFilter, searchTerm]);
```

### 4. 日志导出功能
```typescript
const exportLogs = useCallback(() => {
  const logText = logs.map(log => {
    if (log.type === 'operation') {
      const opLog = log.data as OperationLog;
      return `[${log.timestamp}] ${opLog.level.toUpperCase()}: ${opLog.message}`;
    } else {
      const commLog = log.data as CommLog;
      return `[${log.timestamp}] ${commLog.direction}: ${commLog.data}`;
    }
  }).join('\n');

  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `furnace-logs-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
}, [logs]);
```

## MFC设备日志类比实现

### 1. 类型定义扩展
```typescript
// MFC专用日志类型
export interface MFCOperationLog extends OperationLog {
  device?: string;        // MFC设备地址
  gasType?: string;       // 气体类型
  flowRate?: number;      // 流量值
}

// MFC通信日志（如果需要）
export interface MFCCommLog extends CommLog {
  deviceAddress: number;  // MFC设备地址
}
```

### 2. 后端实现类比
```python
# MFC FastAPI服务 (假设文件: mfc_device.py)
mfc_comm_log = []  # MFC通信日志

def add_mfc_comm_log(direction: str, data_hex: str, device_address: int, timestamp=None):
    """添加MFC通信日志"""
    log_entry = {
        'timestamp': timestamp or datetime.now().strftime('%H:%M:%S.%f')[:-3],
        'direction': direction,
        'data': data_hex.upper(),
        'device_address': device_address
    }
    mfc_comm_log.append(log_entry)
    if len(mfc_comm_log) > 500:
        mfc_comm_log.pop(0)

@app.get("/mfc/comm-log")
def get_mfc_comm_log():
    """获取MFC通信日志"""
    return {"logs": mfc_comm_log, "total": len(mfc_comm_log)}
```

### 3. 前端Hook实现类比
```typescript
// useMFC.ts Hook
export interface MFCState {
  // ... 现有状态
  logs: LogEntry[];  // 复用相同的日志结构
}

export interface MFCControls {
  // ... 现有控制方法
  setFlow: (address: number, flow: number) => Promise<void>;
  readStatus: (address: number) => Promise<void>;
  refreshLogs: () => Promise<void>;
  clearLogs: () => void;
  addOperationLog: (level: 'success' | 'info' | 'warning' | 'error', message: string, device?: string) => void;
}

// 操作日志实现
const addOperationLog = useCallback((
  level: 'success' | 'info' | 'warning' | 'error',
  message: string,
  device?: string
): void => {
  const logEntry: LogEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleTimeString(),
    type: 'operation',
    data: {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      device
    } as MFCOperationLog
  };
  updateState({ logs: [...state.logs, logEntry].slice(-500) });
}, [updateState]);

// MFC操作日志记录
const setFlow = useCallback(async (address: number, flow: number): Promise<void> => {
  try {
    await MFCApi.setFlow(address, flow);
    addOperationLog('success', `MFC${address} 流量设置为 ${flow} SCCM`, `MFC${address}`);
  } catch (error) {
    addOperationLog('error', `MFC${address} 流量设置失败: ${error.message}`, `MFC${address}`);
  }
}, [addOperationLog]);
```

### 4. UI组件复用
```typescript
// 复用相同的日志显示组件
const MFCDeviceModal = () => {
  const [mfcState, mfcControls] = useMFC();

  return (
    <div className="device-modal">
      {/* ... MFC控制界面 ... */}

      {/* 复用相同的日志组件 */}
      <div className="console-section">
        <div className="console-header">
          <h4>MFC设备日志</h4>
          <div className="console-controls">
            <button onClick={() => mfcControls.refreshLogs()}>刷新通信</button>
            <button onClick={() => mfcControls.clearLogs()}>清空</button>
          </div>
        </div>
        <div className="console-content">
          {/* 复用相同的日志渲染逻辑 */}
          <LogDisplay logs={mfcState.logs} />
        </div>
      </div>
    </div>
  );
};
```

### 5. 通用日志组件抽象
```typescript
// 创建可复用的日志显示组件
const LogDisplay = ({ logs }: { logs: LogEntry[] }) => {
  return (
    <div className="log-list">
      {logs.map((log) => (
        <LogEntryComponent key={log.id} log={log} />
      ))}
    </div>
  );
};

// 通用日志条目组件
const LogEntryComponent = ({ log }: { log: LogEntry }) => {
  return (
    <div className={`console-log ${log.type} ${getLogClass(log)}`}>
      <span className="log-timestamp">{log.timestamp}</span>
      {renderLogContent(log)}
    </div>
  );
};
```

## 总结

Furnace扩展日志系统提供了一个完整的设备操作透明度和调试解决方案：

1. **混合日志显示**: 操作日志 + 通信日志的统一展示
2. **可扩展架构**: 类型安全、模块化设计
3. **用户体验**: 图标、颜色、时间线的友好展示
4. **调试价值**: 既有操作概览，又有详细通信数据
5. **复用性**: 可轻松扩展到MFC等其他设备

该系统为用户提供了完整的设备操作可见性，同时保持了良好的性能和用户体验。通过类型定义和模块化设计，可以轻松扩展到其他设备类型。