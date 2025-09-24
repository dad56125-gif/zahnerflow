# 控制台显示管理使用指南

## 功能概述

为了解决debug日志过多影响信息获取的问题，我们实现了一个灵活的控制台显示管理系统。

## 核心组件

### 1. ConsoleDisplayManager
位置：`apps/backend/src/common/console-display-manager.service.ts`

功能：
- 全局日志级别控制
- 模块级别日志控制
- 快速模式切换
- REST API接口

### 2. 控制器接口
位置：`apps/backend/src/common/console-display-manager.controller.ts`

API端点：
- `GET /api/console/config` - 获取当前配置
- `POST /api/console/global` - 设置全局日志级别
- `POST /api/console/module/:moduleName` - 设置特定模块日志级别
- `POST /api/console/debug/:enable` - 切换debug模式
- `POST /api/console/quiet` - 启用静默模式
- `POST /api/console/verbose` - 启用详细模式
- `DELETE /api/console/reset` - 重置到默认配置

## 使用方法

### 1. 静默模式（推荐）
```bash
curl -X POST http://localhost:3001/api/console/quiet
```
只显示错误和警告，关闭debug日志。

### 2. 调试模式
```bash
curl -X POST http://localhost:3001/api/console/debug/true
```
启用所有debug日志。

### 3. 仅关闭SimpleEventBus的debug日志
```bash
curl -X POST http://localhost:3001/api/console/module/SimpleEventBus \
  -H "Content-Type: application/json" \
  -d '{"enableDebug": false}'
```

## 默认配置

系统默认关闭以下模块的debug日志：
- SimpleEventBus
- NotificationService

保留以下模块的debug日志：
- ExecutionService

## 前后端节点绑定修复

### 问题
后端执行服务只支持 `zahner-measurement` 和 `delay` 节点，而前端定义了更多节点类型。

### 解决方案
更新了 `ExecutionService` 以支持所有前端定义的节点类型：

1. **设备控制节点**
   - `startup` - 启动设备服务
   - `shutdown` - 关闭设备服务

2. **基础测量节点**
   - `eis_potentiostatic` - 恒电位EIS
   - `eis_galvanostatic` - 恒电流EIS
   - `ocp_measurement` - 开路电位测量
   - `chronoamperometry` - 计时安培法
   - `chronopotentiometry` - 计时电位法
   - `voltage_ramp` - 电压斜坡
   - `current_ramp` - 电流斜坡
   - `lsv_measurement` - 线性扫描伏安法

3. **流程控制节点**
   - `wait_delay` - 等待/延时
   - `loop_start` - 循环开始
   - `loop_end` - 循环结束

### 设备服务扩展
为 `ZahnerZenniumService` 添加了：
- `startup()` 方法
- `shutdown()` 方法

## 事件驱动架构

系统现在支持以下事件：
- `node.started` - 节点开始执行
- `node.completed` - 节点执行完成
- `node.error` - 节点执行错误
- `device.started` - 设备启动
- `device.stopped` - 设备停止

## 建议的配置

对于生产环境，推荐使用静默模式：
```bash
curl -X POST http://localhost:3001/api/console/quiet
```

对于开发调试，可以按需启用特定模块的debug日志：
```bash
curl -X POST http://localhost:3001/api/console/module/ExecutionService \
  -H "Content-Type: application/json" \
  -d '{"enableDebug": true}'
```