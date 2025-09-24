# ZahnerFlow 项目结构文档

## 项目概述

ZahnerFlow 是一个基于 pnpm monorepo 架构的电化学工作流管理系统，主要用于控制和监控电化学测量设备（如 Zahner Zennium等）的自动化实验流程。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Socket.io-client
- **后端**: NestJS + TypeScript + Socket.io + Express
- **设备服务**: Python FastAPI
- **包管理**: pnpm (monorepo)

## 项目架构

### Monorepo 结构
```
ZahnerFlow/
├── apps/                    # 应用程序
│   ├── frontend/           # React前端应用
│   └── backend/            # NestJS后端应用
├── packages/               # 共享包
│   └── types/              # TypeScript类型定义
├── doc/                    # 项目文档
└── 根目录配置文件
```

### 核心目录结构
```
apps/backend/src/
├── modules/               # 业务模块
│   ├── execution/         # 工作流执行
│   ├── zahner-zennium/    # Zahner设备控制
│   ├── workflow/          # 工作流管理
│   └── console/           # 日志配置
├── devices/               # 设备服务层
│   ├── base-device.service.ts      # 基础设备服务
│   └── zahner-device.service.ts    # Zahner设备服务
├── gateways/              # WebSocket网关
├── notification/          # 事件驱动通知系统
├── common/                # 通用服务
└── public/                # 静态资源
```

## 核心架构模式

### 架构层级
```
前端 → StateLinkageManager → ExecutionService → ZahnerZenniumService → ZahnerDeviceService → FastAPI → Zahner硬件
```

### 事件驱动架构
- **SimpleEventBus**: 事件总线，解耦业务逻辑
- **事件处理器**: NotificationEventHandler、MetricsEventHandler、StateEventHandler
- **统一日志管理**: ConsoleDisplayManager提供模块级日志控制

### 两层设备架构
- **BaseDeviceService**: 设备状态管理 (连接、忙闲、错误)
- **ZahnerDeviceService**: 设备控制和HTTP代理
- **简化设计**: 专注单设备场景，移除复杂实例管理

### 数据流
1. 前端发送操作请求
2. ExecutionService 处理执行逻辑
3. ZahnerZenniumService 调用设备服务
4. ZahnerDeviceService 通过HTTP调用FastAPI
5. FastAPI设备服务控制Zahner硬件
6. 事件总线处理状态变更和错误事件
7. ConsoleDisplayManager 统一管理日志输出
8. 通过 WebSocket 实时更新前端状态

## 主要功能

### 前端功能
- 可视化工作流编辑器
- 实时数据监控和图表显示
- 设备连接和控制
- 玻璃态用户界面

### 后端功能
- REST API 接口
- WebSocket 实时通信
- 工作流执行管理
- 事件驱动通知系统
- 统一日志管理

### 设备服务功能
- Zahner设备连接和控制
- EIS测量、电位测量、伏安法测量
- 安全控制和数据输出

## 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Python 3.8+
- Zahner Thales SDK

## 开发脚本

- `pnpm dev`: 并行启动前端和后端
- `pnpm build`: 构建所有应用
- `pnpm test`: 运行测试
- `pnpm lint`: 代码检查

## 详细文档

### 架构设计
- [事件驱动架构实现](./architecture/EVENT_DRIVEN_ARCHITECTURE_IMPLEMENTATION.md)
- [日志管理系统](./LOG_CONFIG_README.md)
- [事件总线与日志管理协作](./事件总线与日志管理协作架构.md)

### 功能模块
- [通知系统设计](./notification-system.md)
- [数据存储与命名系统](./ZAHNERFLOW_DATA_STORAGE_NAMING_SYSTEM_DESIGN.md)
- [延时等待节点实现](./sleep/wait-delay-implementation-plan.md)

### 项目管理
- [完整项目结构详情](./project-structure-full.md) - 详细的目录结构和配置信息
- [常见问题解答](./question.md)

## 版本信息

- **当前版本**: 1.3.0
- **最后更新**: 2025-09-24
- **维护者**: ZahnerFlow Development Team

### v1.3.0 主要改进
- 实现事件驱动架构
- 新增统一日志管理系统
- 简化设备服务架构
- 解决事件处理器与日志管理的架构冲突