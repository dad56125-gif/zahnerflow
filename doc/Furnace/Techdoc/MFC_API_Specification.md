# MFC设备API规范

## 核心设计原则

### 1. 命名规范
- 所有API参数、接口定义、变量命名统一使用 **snake_case**
- 以后端Python脚本为命名源头，确保与设备API完全一致
- 前端React、NestJS后端、FastAPI硬件层参数命名必须完全对齐
- 严格禁止使用camelCase命名

### 2. 单位规范
- 完全移除percent相关功能，统一使用sccm单位
- 移除hold/follow等复杂模式控制
- 保持纯sccm控制：专注流量设定和读取功能

## API端点

### 连接管理

#### GET /health
检查API服务状态

#### GET /ports
获取系统中可用的串口列表

#### POST /connect
建立与MFC设备的串口连接
```json
{
  "port": "COM1",
  "baudrate": 19200,
  "timeout": 1.0
}
```

#### POST /disconnect
断开与MFC设备的连接
```json
{
  "connection_id": "conn_123456"
}
```

### 设备管理

#### POST /scan
扫描指定地址范围内的MFC设备
```json
{
  "start": 32,
  "end": 80
}
```

#### GET /status
获取所有已连接设备的当前状态

#### POST /setpoint
设置指定设备的流量设定点
```json
{
  "device_address": 1,
  "sccm": 350.0
}
```

### 日志和监控

#### GET /comm-log
获取设备通信日志
- `limit` (可选): 限制返回条目数
- `start_time` (可选): 开始时间
- `end_time` (可选): 结束时间

#### DELETE /comm-log
清空所有通信日志

#### GET /connection/info
获取当前连接的详细信息

## 参数规范

### 连接管理参数
- `port` (str): 串口号，必填字段
- `baudrate` (int): 波特率，默认19200
- `timeout` (float): 超时时间，默认1.0秒
- `connection_id` (str): 连接唯一标识符
- `connected` (bool): 连接状态
- `connection_status` (str): 连接状态描述

### 设备核心参数
- `device_address` (int): 设备地址，1-255
- `flow_sccm` (float): 实际流量值（sccm单位）
- `setpoint_sccm` (float): 设定流量值（sccm单位）
- `sccm` (float): 流量设定值（请求参数）
- `gas_type` (str): 气体类型
- `max_flow_sccm` (int): 最大流量值（sccm单位）

### 设备状态参数
- `last_communication` (str): 最后通信时间，ISO格式
- `device_count` (int): 已连接设备数量
- `connected_devices` (list): 已连接设备地址列表

### 扫描参数
- `start` (int): 扫描起始地址，默认32
- `end` (int): 扫描结束地址，默认80
- `devices` (list): 发现的设备列表
- `count` (int): 发现的设备数量
- `scan_range` (dict): 扫描范围信息

### 统一响应格式参数
- `ok` (bool): 操作成功状态，必须字段
- `timestamp` (str): ISO格式时间戳，必须字段
- `error_message` (str): 错误信息（错误响应时）
- `error_category` (str): 错误分类（错误响应时）
- `retryable` (bool): 是否可重试（错误响应时）
- `context` (dict): 错误上下文（错误响应时）
- `operation` (dict): 操作追踪信息（可选）

## 错误处理

### 错误分类
- `DEVICE`: 设备相关错误（设备未响应、地址错误等）
- `TIMEOUT`: 超时错误（通信超时、响应超时等）
- `PROTOCOL`: 协议错误（数据格式错误、校验失败等）
- `SYSTEM`: 系统错误（串口占用、权限问题等）

### 错误响应格式
```json
{
  "ok": false,
  "error_message": "详细错误描述",
  "error_category": "DEVICE|TIMEOUT|PROTOCOL|SYSTEM",
  "retryable": true|false,
  "context": {},
  "timestamp": "2025-10-26T10:00:00.000Z"
}
```

## WebSocket消息格式

### 状态更新消息
```json
{
  "type": "status_update",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "data": [
    {
      "device_address": 1,
      "flow_sccm": 250.5,
      "setpoint_sccm": 300.0,
      "gas_type": "N2",
      "max_flow_sccm": 1000,
      "connection_status": "connected",
      "last_communication": "2025-10-26T10:00:00.000Z"
    }
  ]
}
```

### 采样数据消息
```json
{
  "type": "sampling_data",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "data": [
    {
      "device_address": 1,
      "timestamp": "2025-10-26T10:00:00.000Z",
      "flow_sccm": 248.7,
      "setpoint_sccm": 300.0
    }
  ]
}
```

### 连接状态消息
```json
{
  "type": "connection_update",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "data": {
    "status": "connected",
    "device_count": 2,
    "connection_id": "conn_123456"
  }
}
```

### 通知消息
```json
{
  "type": "notification",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "data": {
    "level": "info|warning|error",
    "title": "通知标题",
    "message": "通知消息内容",
    "source": "mfc_system"
  }
}
```

## 数据约束

### 移除的字段和功能
- `flow_percent` ❌
- `digital_setpoint_percent` ❌
- `active_setpoint_percent` ❌
- `percent` ❌
- hold/follow模式控制 ❌
- 复杂的状态机逻辑 ❌

### 保留的核心字段
- `device_address` ✅
- `flow_sccm` ✅
- `setpoint_sccm` ✅
- `sccm` ✅
- `gas_type` ✅
- `max_flow_sccm` ✅

## 三端对齐要求

### 前端React层
- 组件props: 使用snake_case命名
- API调用: 参数名与后端完全一致
- 状态管理: 变量名遵循snake_case规范

### NestJS后端层
- DTO定义: 使用snake_case属性名
- Controller参数: 与前端完全对齐
- Service层: 内部变量使用snake_case

### FastAPI硬件层
- Pydantic模型: 使用snake_case字段名
- 设备通信协议: 保持原有的snake_case
- 数据转换: 统一转换为sccm单位