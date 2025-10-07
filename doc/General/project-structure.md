# ZahnerFlow 项目结构文档

## 项目概述

ZahnerFlow 是一个基于 pnpm monorepo 架构的电化学工作流管理系统，主要用于控制和监控电化学测量设备（如 Zahner Zennium等）的自动化实验流程。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Socket.io-client
- **后端**: NestJS + TypeScript + Socket.io + Express + SQLite (sqlite3)
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

### 后端架构

- 核心模块
  - `WorkflowModule`: 工作流 CRUD、校验与复制；存储采用“双轨制”（JSON + DB 索引）。
    - `WorkflowService`: 业务编排，负责验证、复制、批量参数更新等；在创建/更新/批量更新后调用 DB 展平 `nodes[*].config` → `node/node_param`。
    - `WorkflowStorageService`: 文件型存储，路径 `data/workflows/workflows.json`，提供 Map<id, Workflow> 的持久化与加载。
  - `FilesModule`: 数据文件登记与生成归档路径。
    - `FilesService`: 落盘至 `archive/[owner]/[individual]/[testType]/[prefix]-[cycle]-[YYYYMMDD-HHMMSS].ext`，并记录 `data/files/index.json` 与 DB 的 `data_file`。
    - `FilesController`: `POST /api/files/register`。
  - `DbModule`: 轻量 SQLite 服务，用于结构化索引与查询（非替代 JSON）。
    - `DbService`: 运行时迁移（建表与索引），并提供 `upsertWorkflow`（展平节点配置）、`insertDataFile`、`getStats` 等。
  - 其余：`GatewayModule`/`NotificationModule`/`CommonModule` 保持原有职责。

- 存储层设计
  - JSON 存储：`data/workflows/workflows.json` 持久化完整工作流定义（含 `nodes/edges`）。
  - 数据库（SQLite）：提供快速检索与聚合统计，表结构与约束遵循《doc/DataBaseNew/简化数据库与文件组织方案.md》。
    - 表：`workflow(id, owner_name, individual_name, title, description, tags, created_at, updated_at)`
      - 唯一约束：`UNIQUE(owner_name, individual_name, title)`；索引：`(owner_name, individual_name)`。
    - 表：`node(id, workflow_id, node_key, node_type, display_name, sort_order, enabled, position_json)`
      - 唯一约束：`UNIQUE(workflow_id, node_key)`。
    - 表：`node_param(id, node_id, key, value_text, value_num, value_json, value_type, updated_at)`
      - 唯一约束：`UNIQUE(node_id, key)`。
    - 表：`data_file(id, owner_name, individual_name, test_type, prefix, cycle, ts, filename, rel_path, size, sha256, workflow_id?, node_id?)`
      - 唯一约束：`UNIQUE(owner_name, individual_name, test_type, filename)`；索引：`(owner_name, individual_name, test_type)`。

- API 概览（后端）
  - 工作流：
    - `POST /api/workflows` 创建；`PUT /api/workflows/:id` 更新（透传 `ownerName/individualName`）。
    - `GET /api/workflows/:id` 查询；`GET /api/workflows` 列表（分页）。
    - `POST /api/workflows/:id/validate` 校验；`POST /api/workflows/:id/duplicate` 复制。
    - `POST /api/workflows/:id/params/batch-update` 批量更新节点参数，并同步 DB（展平写入 `node/node_param`）。
  - 数据文件：
    - `POST /api/files/register` 生成归档路径并可选创建文件，同时登记至 `data_file` 与 `data/files/index.json`。
  - DB 统计：
    - `GET /api/db/stats` 返回 `workflow/node/node_param/data_file` 行数。

### 数据持久化策略（简化方案）

- 归档目录：`archive/`，路径规范 `archive/[owner_name]/[individual_name]/[test_type]/[prefix]-[cycle]-[YYYYMMDD-HHMMSS].扩展名`。
- 工作流存储：JSON 为准，数据库用于结构化检索与聚合；两者同步由 `WorkflowService` 保证。
- 参考：`doc/DataBaseNew/简化数据库与文件组织方案.md`。

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
