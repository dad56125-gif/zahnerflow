# MFC API 功能清单

## 连接管理功能
- health_check() - 健康检查
- get_available_ports() - 获取可用串口列表
- connect_device(port, baudrate, timeout) - 连接MFC设备
- disconnect_device() - 断开MFC设备连接
- get_connection_info() - 获取连接信息

## 设备管理功能
- scan_devices(start, end) - 扫描MFC设备地址
- get_device_status(address) - 获取MFC设备状态
- set_device_flow(address, sccm) - 设置MFC流量设定点

## 数据管理功能
- get_communication_log() - 获取通信日志
- clear_communication_log() - 清空通信日志

## WebSocket消息类型
- status_update - 设备状态更新
- sampling_data - 设备采样数据
- connection_update - 连接状态更新
- notification - 系统通知

## 核心数据字段
- device_address - 设备地址
- flow_sccm - 实际流量值
- setpoint_sccm - 设定流量值
- gas_type - 气体类型
- max_flow_sccm - 最大流量
- connection_status - 连接状态
- last_communication - 最后通信时间

## 请求参数
- port - 串口号
- baudrate - 波特率
- timeout - 超时时间
- start - 扫描起始地址
- end - 扫描结束地址
- address - 设备地址
- sccm - 流量值

## 响应参数
- ok - 操作成功状态
- timestamp - 时间戳
- error_message - 错误信息
- error_category - 错误分类
- retryable - 是否可重试
- connection_id - 连接ID
- devices - 设备列表
- count - 设备数量
- logs - 日志列表