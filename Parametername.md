# MFC设备参数名规范文档

## 核心规则
- 所有API参数、接口定义、变量命名统一使用 **snake_case**
- 以后端Python脚本为命名源头，确保与设备API完全一致
- 前端、后端、Python端参数命名必须完全对齐
- 禁止使用camelCase命名，违者代码不予接受

## MFC设备API参数名

### 连接管理参数

#### ConnectRequest (连接请求)
| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `port` | str | 必填 | 串口号 |
| `baudrate` | int | 19200 | 波特率 |
| `timeout` | float | 1.0 | 超时时间 |

#### 连接响应参数
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `connection_id` | str | 连接ID |
| `connected` | bool | 连接状态 |
| `port` | str | 串口号 |
| `error` | str | 错误信息（可选） |

### 设备信息参数

#### DeviceInfo (设备信息)
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `address` | int | 设备地址 |
| `gas_type` | str | 气体类型 |
| `max_flow_sccm` | int | 最大流量sccm |

### 设备状态参数

#### 设备状态响应
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `device_address` | int | 设备地址 |
| `flow_percent` | float | 流量百分比 |
| `flow_sccm` | float | 流量sccm值 |
| `digital_setpoint_percent` | float | 数字设定点百分比 |
| `active_setpoint_percent` | float | 活动设定点百分比 |
| `connection_status` | str | 连接状态 |
| `last_communication` | str | 最后通信时间 |

### 流量控制参数

#### 流量设定请求
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `address` | int | 设备地址 |
| `sccm` | float | 流量设定值 |

#### 流量设定响应
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `device_address` | int | 设备地址 |
| `sccm` | float | 设定流量值 |
| `percent` | float | 百分比流量值 |
| `connection_status` | str | 连接状态 |

### 设备扫描参数

#### 扫描请求
| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `start` | int | 32 | 起始地址 |
| `end` | int | 80 | 结束地址 |

#### 扫描响应
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `devices` | list | 设备列表 |
| `count` | int | 设备数量 |
| `scan_range` | dict | 扫描范围 |

### 通信日志参数

#### 日志条目
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `timestamp` | str | 时间戳 |
| `direction` | str | 通信方向 (TX/RX/ERROR) |
| `data` | str | 十六进制数据 |
| `connection_id` | str | 连接ID（可选） |
| `error` | str | 错误信息（可选） |
| `error_category` | str | 错误分类（可选） |

#### 错误统计
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `total_errors` | int | 总错误数 |
| `recent_errors_5min` | int | 最近5分钟错误数 |
| `error_categories` | dict | 错误分类统计 |
| `last_error_time` | str | 最后错误时间 |

### 统一响应格式参数

#### 成功响应
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `ok` | bool | 操作成功状态 |
| `timestamp` | str | ISO格式时间戳 |
| `operation` | dict | 操作追踪信息（可选） |

#### 错误响应
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `ok` | bool | 操作成功状态 (false) |
| `error_message` | str | 错误信息 |
| `error_category` | str | 错误分类 |
| `retryable` | bool | 是否可重试 |
| `context` | dict | 错误上下文 |
| `timestamp` | str | ISO格式时间戳 |

### 操作追踪参数

#### 操作信息
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `code` | int | 操作代码 |
| `value` | any | 操作值 |
| `success` | bool | 操作成功状态 |

### 错误分类枚举

| 分类值 | 说明 |
|--------|------|
| `DEVICE` | 设备相关错误 |
| `TIMEOUT` | 超时错误 |
| `PROTOCOL` | 协议错误 |
| `SYSTEM` | 系统错误 |

## API端点参数

### 现有端点
- `GET /health` - 健康检查
- `GET /ports` - 获取可用串口列表
- `POST /connect` - 连接设备
- `POST /disconnect` - 断开设备
- `POST /scan` - 扫描设备
- `GET /status` - 获取设备状态
- `POST /setpoint` - 设置流量设定点

### 新增端点
- `GET /comm-log` - 获取通信日志
- `DELETE /comm-log` - 清空通信日志
- `GET /connection/info` - 获取连接信息

## MFC服务内部参数

### 轮询管理参数

#### 轮询配置
| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `polling_enabled` | bool | true | 是否启用轮询 |
| `polling_interval` | int | 2000 | 轮询间隔（毫秒） |
| `retry_attempts` | int | 3 | 重试次数 |
| `retry_delay` | int | 1000 | 重试延迟（毫秒） |

#### 轮询状态
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `is_running` | bool | 轮询是否正在运行 |
| `last_poll` | str | 最后轮询时间 |
| `success_count` | int | 成功次数 |
| `error_count` | int | 错误次数 |
| `consecutive_errors` | int | 连续错误次数 |

### 错误处理参数

#### 错误记录
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `error_id` | str | 错误唯一标识 |
| `error_category` | str | 错误分类 (DEVICE/TIMEOUT/PROTOCOL/SYSTEM) |
| `error_severity` | str | 错误严重程度 (low/medium/high/critical) |
| `retryable` | bool | 是否可重试 |
| `resolved` | bool | 是否已解决 |
| `resolved_at` | str | 解决时间 |

#### 熔断器参数
| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `failure_threshold` | int | 5 | 失败阈值 |
| `recovery_timeout` | int | 60000 | 恢复超时（毫秒） |
| `monitoring_period` | int | 300000 | 监控周期（毫秒） |
| `circuit_state` | str | 熔断器状态 (CLOSED/OPEN/HALF_OPEN) |

### 数据管理参数

#### 历史数据查询
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `device_address` | int | 设备地址（可选） |
| `from` | datetime | 开始时间（可选） |
| `to` | datetime | 结束时间（可选） |
| `limit` | int | 返回记录数限制（可选） |
| `downsample` | int | 降采样间隔（可选） |

#### 系统统计
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `total_devices` | int | 总设备数 |
| `active_devices` | int | 活跃设备数 |
| `total_samples` | int | 总采样数 |
| `total_errors` | int | 总错误数 |
| `system_status` | str | 系统状态 (healthy/warning/error) |

### WebSocket消息参数

#### 客户端管理
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `client_id` | str | 客户端ID |
| `connected_at` | datetime | 连接时间 |
| `last_activity` | datetime | 最后活动时间 |
| `is_subscribed_to_mfc` | bool | 是否订阅MFC更新 |

#### 连接状态
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `connection_state` | str | 连接状态 (DISCONNECTED/CONNECTING/CONNECTED/ERROR) |
| `connection_info` | object | 连接信息 |
| `device_busy` | bool | 设备是否忙碌 |
| `busy_operations` | set | 忙碌操作集合 |

#### WebSocket连接参数
| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `reconnect_attempts` | int | 0 | 重连尝试次数 |
| `max_reconnect_attempts` | int | 5 | 最大重连尝试次数 |
| `reconnect_delay` | int | 1000 | 重连延迟（毫秒） |
| `is_connected` | bool | false | 是否已连接 |
| `is_subscribed` | bool | false | 是否已订阅 |

### 设备状态参数

#### 设备状态信息
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `device_address` | int | 设备地址 |
| `connection_status` | str | 连接状态 |
| `last_communication` | str | 最后通信时间 |
| `flow_sccm` | float | 实际流量值 |
| `setpoint_sccm` | float | 设定流量值 |
| `error_message` | str | 错误信息（可选） |

### 前端UI参数

#### Modal参数
| 参数名 | 类型 | 说明 |
|--------|------|------|
| `on_close` | function | 关闭回调函数 |
| `modal_top` | number | 模态框顶部位置 |
| `modal_left` | number | 模态框左侧位置 |
| `modal_width` | number | 模态框宽度 |
| `modal_height` | number | 模态框高度 |
| `web_socket_connected` | bool | WebSocket连接状态 |

