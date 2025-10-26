# MFC设备层变量名变更记录

## 规则说明
- 所有API参数、接口定义、变量命名统一使用 snake_case
- 前端、后端、Python端参数命名必须完全对齐
- 以后端Python脚本为命名源头

## 变更记录

### 响应格式标准化新增字段

#### 统一响应格式字段 (MfcResponse)
- `ok` (bool) - 操作成功状态
- `timestamp` (str) - ISO格式时间戳
- `error_message` (str) - 错误信息
- `error_category` (str) - 错误分类
- `retryable` (bool) - 是否可重试
- `operation` (dict) - 操作追踪信息
  - `code` (int) - 操作代码
  - `value` (any) - 操作值
  - `success` (bool) - 操作成功状态

#### 设备状态响应新增字段
- `connection_status` (str) - 连接状态
- `last_communication` (str) - 最后通信时间
- `device_address` (int) - 设备地址 (保持现有)
- `flow_percent` (float) - 流量百分比 (保持现有)
- `flow_sccm` (float) - 流量sccm值 (保持现有)
- `digital_setpoint_percent` (float) - 数字设定点百分比 (保持现有)
- `active_setpoint_percent` (float) - 活动设定点百分比 (保持现有)

#### 设备信息响应字段
- `device_address` (int) - 设备地址 (保持现有)
- `gas_type` (str) - 气体类型 (保持现有)
- `max_flow_sccm` (int) - 最大流量sccm (保持现有)

### 连接管理新增字段

#### 连接请求 (ConnectRequest)
- `port` (str) - 串口号 (保持现有)
- `baudrate` (int) - 波特率 (保持现有)
- `timeout` (float) - 超时时间 (保持现有)

#### 连接响应
- `connection_id` (str) - 连接ID
- `connected` (bool) - 连接状态
- `device_address` (int) - 设备地址 (可选)
- `error` (str) - 错误信息 (可选)

### 通信日志字段
- `timestamp` (str) - 时间戳
- `direction` (str) - 通信方向 (TX/RX/ERROR)
- `data` (str) - 十六进制数据
- `connection_id` (str) - 连接ID (可选)
- `error` (str) - 错误信息 (可选)
- `error_category` (str) - 错误分类 (可选)

### API端点保持现有命名
所有现有API端点名称保持不变，确保向后兼容：
- `/health`
- `/ports`
- `/connect`
- `/disconnect`
- `/scan`
- `/status`
- `/setpoint`

## 新增API端点

## API端点更新

### 现有端点更新
- `/connect` - 现在使用device_manager，返回标准化响应
- `/disconnect` - 现在使用device_manager，返回标准化响应
- `/scan` - 现在需要连接验证，返回标准化响应
- `/status` - 现在使用依赖注入，返回标准化响应
- `/setpoint` - 现在使用依赖注入，返回标准化响应

### 新增端点
- `/comm-log` (GET) - 获取通信日志
- `/comm-log` (DELETE) - 清空通信日志
- `/connection/info` - 获取连接信息

## 响应格式变更

### 新增统一响应格式
所有API响应现在包含以下标准字段：
- `ok` (bool) - 操作成功状态
- `timestamp` (str) - ISO格式时间戳
- `error_message` (str) - 错误信息（仅错误响应）
- `error_category` (str) - 错误分类（仅错误响应）
- `retryable` (bool) - 是否可重试（仅错误响应）
- `context` (dict) - 错误上下文（仅错误响应）

### 状态响应新增字段
- `device_address` (int) - 设备地址（原address字段保持兼容）
- `connection_status` (str) - 连接状态
- `last_communication` (str) - 最后通信时间

### 连接响应新增字段
- `connection_id` (str) - 连接ID
- `connected` (bool) - 连接状态
- `port` (str) - 串口号（保持现有）

### 扫描响应新增字段
- `devices` (list) - 设备列表
- `count` (int) - 设备数量
- `scan_range` (dict) - 扫描范围

## 错误分类枚举
- `DEVICE` - 设备相关错误
- `TIMEOUT` - 超时错误
- `PROTOCOL` - 协议错误
- `SYSTEM` - 系统错误

## 注意事项
1. 所有新增字段都使用snake_case命名
2. 现有字段名保持不变，确保向后兼容
3. 前端和后端需要同步更新以支持新的响应格式
4. 新增字段为必需字段，现有响应已完全重构
5. API端点现在使用依赖注入，会自动验证连接状态
6. 所有错误都会抛出标准化的MfcError异常

## 迁移建议
1. 前端应适配新的响应格式，检查`ok`字段判断操作成功/失败
2. 使用`error_category`和`retryable`字段实现智能重试逻辑
3. 监控`timestamp`字段实现响应时间追踪
4. 利用新增的通信日志端点进行问题诊断
5. 使用`connection/info`端点检查连接状态