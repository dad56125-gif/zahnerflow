# 日志配置管理

## 功能概述

本项目提供了一个日志配置管理界面，可以动态调整各个模块的日志输出级别。

## 启动方式

### 1. 启动主应用
```bash
cd apps/backend
npm run start:dev
```

### 2. 访问日志配置页面
打开浏览器访问: `http://localhost:3001/log-config.html`

## 功能特性

### 全局配置
- 控制所有模块的默认日志级别
- 提供快速模式切换（静默模式、详细模式）

### 模块配置
- 针对特定模块进行精细的日志级别控制
- 支持的模块：
  - SimpleEventBus
  - ExecutionService
  - ExecutionNotificationService
  - WorkflowGateway
  - ZahnerZenniumService
  - ZahnerDeviceService

### 日志级别说明
- **ERROR** (红色) - 严重错误，需要立即处理
- **WARN** (黄色) - 警告信息，可能存在问题
- **LOG** (蓝色) - 一般业务日志
- **DEBUG** (灰色) - 调试信息，开发时使用
- **VERBOSE** (紫色) - 详细信息，通常关闭

## API 接口

### 获取配置
```http
GET /api/console/config
```

### 设置全局配置
```http
POST /api/console/global
Content-Type: application/json

{
  "enableError": true,
  "enableWarn": true,
  "enableLog": true,
  "enableDebug": false,
  "enableVerbose": false
}
```

### 设置模块配置
```http
POST /api/console/module/{moduleName}
Content-Type: application/json

{
  "enableError": true,
  "enableWarn": true,
  "enableLog": true,
  "enableDebug": false,
  "enableVerbose": false
}
```

### 快速模式
```http
POST /api/console/quiet        # 静默模式（仅ERROR和WARN）
POST /api/console/verbose      # 详细模式（显示所有日志）
DELETE /api/console/reset      # 重置为默认配置
```

## 注意事项

1. 日志配置页面集成在主应用中，通过主应用的端口3001访问
2. 配置更改会立即生效，无需重启应用
3. 日志级别设置在应用重启后不会保留
4. 建议在生产环境中谨慎使用DEBUG和VERBOSE级别