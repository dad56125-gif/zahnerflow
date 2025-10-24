# 熔炉设备API重构文档

## 概述

本文档描述了熔炉系统设备层API的重构，旨在解决全局状态问题，实现无状态设计和线程安全的设备操作。

## 重构目标

1. **移除全局变量**：消除全局控制器实例和通信日志缓冲区
2. **实现无状态设计**：每个控制器实例独立管理状态
3. **连接池管理**：支持多连接并发操作
4. **线程安全**：确保多线程环境下的操作安全性
5. **连接生命周期管理**：自动检测和清理死亡连接

## 核心组件

### 1. CommLogManager（通信日志管理器）
- **线程安全**：使用互斥锁保护日志操作
- **连接隔离**：支持按连接ID分离日志
- **自动清理**：保持最多500条日志记录
- **向后兼容**：提供统一的日志接口

```python
# 添加日志
comm_log.add_log('TX', cmd.hex(), connection_id=connection_id)

# 获取日志
logs = comm_log.get_logs(connection_id)
```

### 2. ConnectionPool（连接池管理器）
- **多连接支持**：支持同时管理多个设备连接
- **自动重连**：检测连接失败时自动尝试重连
- **健康检查**：定期检查连接状态
- **生命周期管理**：自动清理死亡连接

```python
# 创建连接
connection_id = connection_pool.create_connection(port='COM4', baudrate=9600)

# 获取控制器（自动健康检查）
with connection_pool.get_controller(connection_id) as controller:
    result = controller.get_all_status()
```

### 3. AI518PController（无状态控制器）
- **无状态设计**：每个实例独立管理串口连接
- **线程安全**：使用互斥锁保护串口操作
- **错误处理**：完善的异常处理和错误日志
- **原子化操作**：确保每个操作的原子性

## API接口变更

### 新增接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/connection` | 创建新连接 |
| DELETE | `/connection/{connection_id}` | 删除连接 |
| GET | `/connections` | 获取所有连接信息 |
| GET | `/connection/stats` | 获取连接统计信息 |
| POST | `/connection/cleanup` | 清理死亡连接 |
| GET | `/connection/{connection_id}/health` | 检查连接健康状态 |

### 修改接口

原有接口现在需要包含`connection_id`参数：

| 方法 | 旧路径 | 新路径 | 描述 |
|------|--------|--------|------|
| GET | `/status` | `/status/{connection_id}` | 获取设备状态 |
| POST | `/run` | `/{connection_id}/run` | 启动程序 |
| POST | `/pause` | `/{connection_id}/pause` | 暂停程序 |
| POST | `/stop` | `/{connection_id}/stop` | 停止程序 |
| POST | `/sv` | `/{connection_id}/sv` | 设置温度 |
| POST | `/segment/set` | `/{connection_id}/segment/set` | 设置程序段 |
| GET | `/program/segments` | `/{connection_id}/program/segments` | 获取程序段 |
| POST | `/program/segments` | `/{connection_id}/program/segments` | 设置程序段 |

### 更新的接口

| 方法 | 路径 | 更新内容 |
|------|------|----------|
| GET | `/comm-log` | 支持`connection_id`参数过滤 |
| GET | `/health` | 保持不变 |
| GET | `/ports` | 保持不变 |

## 使用示例

### 1. 创建连接
```python
import requests

# 创建连接
response = requests.post("http://localhost:8011/connection", json={
    "port": "COM4",
    "baudrate": 9600,
    "address": 1
})
connection_id = response.json()["connection_id"]
```

### 2. 获取设备状态
```python
# 获取状态
response = requests.get(f"http://localhost:8011/status/{connection_id}")
status = response.json()
```

### 3. 设置程序段
```python
# 设置程序段
segments = [
    {"id": 1, "temperature": 25.0, "time": 60},
    {"id": 2, "temperature": 100.0, "time": 120}
]
response = requests.post(f"http://localhost:8011/{connection_id}/program/segments", json=segments)
```

### 4. 清理连接
```python
# 删除连接
requests.delete(f"http://localhost:8011/connection/{connection_id}")
```

## 线程安全保证

1. **连接池锁**：保护连接池的并发访问
2. **控制器锁**：保护每个控制器的串口操作
3. **日志锁**：保护日志的并发写入
4. **上下文管理器**：确保资源的正确获取和释放

## 连接生命周期管理

### 自动重连
- 当检测到连接不可用时，自动尝试重新连接
- 重连失败时记录错误日志并抛出异常
- 重连过程对用户透明

### 健康检查
- 定期检查串口连接状态
- 通过读取测试验证连接可用性
- 自动识别和清理死亡连接

### 资源清理
- 连接删除时自动关闭串口
- 清理相关日志记录
- 释放系统资源

## 参数命名规范

严格按照snake_case规范：
- 所有API参数使用下划线命名
- 与后端Python脚本命名完全一致
- 前端、后端、Python端参数命名对齐

## 错误处理

### 连接错误
- 连接失败时返回详细的错误信息
- 自动重连机制减少临时连接问题
- 提供连接健康检查接口

### 操作错误
- 设备操作失败时记录详细日志
- 返回标准化的错误响应
- 保持连接状态一致性

## 性能优化

1. **连接复用**：避免频繁创建和销毁连接
2. **并发支持**：支持多个连接同时操作
3. **自动清理**：定期清理无效连接和日志
4. **异步操作**：串口操作不阻塞其他请求

## 监控和调试

### 日志系统
- 详细的通信日志记录
- 支持按连接ID过滤
- 自动日志轮转

### 统计信息
- 连接数量和状态统计
- 健康/不健康连接数量
- 死亡连接清理统计

### 健康检查
- 单连接健康状态检查
- 整体连接池状态监控
- 自动诊断和修复

## 迁移指南

### 从旧版本迁移

1. **更新客户端代码**：所有设备操作API现在需要`connection_id`
2. **连接管理**：使用新的连接管理接口
3. **错误处理**：适应新的错误响应格式
4. **日志查看**：使用新的日志接口

### 向后兼容性

- 部分接口保持向后兼容（如`/health`, `/ports`）
- 通信日志接口支持可选的连接过滤
- 参数命名保持一致的snake_case规范

## 总结

这次重构彻底解决了全局状态问题，实现了：

✅ **无状态设计**：消除了全局变量依赖
✅ **线程安全**：多线程环境下安全操作
✅ **连接池管理**：支持多连接并发
✅ **自动重连**：提高系统可靠性
✅ **生命周期管理**：自动资源清理
✅ **标准化API**：统一的RESTful接口
✅ **完善监控**：详细的日志和统计信息

重构后的系统具有更好的可扩展性、可靠性和可维护性，完全满足生产环境的需求。