# ZahnerFlow 1.0.0 安装与启动说明

本文描述 1.0.0 封存时的当前运行方式。旧的 NestJS 后端、设备 FastAPI 服务和 PostgreSQL 说明已经归档为历史设计，不再属于当前启动拓扑。

## 系统要求

- 操作系统：Windows 10/11 是目标使用环境；开发调试可在 macOS 上运行前端、Electron 和 Python 后端。
- Node.js：18 或更高版本。
- pnpm：8 或更高版本。
- Python：3.11 或更高版本。
- Python 环境管理：必须使用 `uv`。

## 当前运行拓扑

1. Python 后端是单进程运行时，入口为 `apps/python_backend/main.py`。
2. 后端默认监听 `127.0.0.1:3001`。
3. 开发阶段前端由 Vite 监听 `8083`。
4. Electron 桌面壳通过 `apps/desktop` 启动，并直接管理同一 Python 后端。
5. SQLite 是本地持久化边界，默认数据目录由运行环境决定。

当前版本不启动：

- `apps/backend` NestJS 后端；
- 独立设备 FastAPI 服务端口；
- PostgreSQL；
- 旧 worker IPC 进程。

旧 NestJS 后端仅作为历史素材保存在 `archive/backend/`。

## 安装依赖

在仓库根目录执行：

```bash
pnpm install
uv sync
```

如果只需要前端或桌面类型检查，仍应保留根目录依赖安装，因为 `packages/types`、`apps/frontend` 和 `apps/desktop` 通过 workspace 互相引用。

## 开发启动

### Web 开发模式

```bash
pnpm dev
```

该命令会并行启动：

- `pnpm --filter zahnerflow-flowgram dev`
- `uv run python apps/python_backend/main.py`

### Electron 开发模式

```bash
pnpm desktop:dev
```

该命令会并行启动前端开发服务器和 Electron 桌面壳。桌面壳负责启动 Python 后端。

### 仅启动 Python 后端

```bash
uv run python apps/python_backend/main.py
```

## 构建

### 前端与共享类型

```bash
pnpm build
```

### 桌面壳类型编译

```bash
pnpm --filter zahnerflow-desktop build
```

### 后端可执行产物

```bash
pnpm -w backend:dist
```

该命令使用 `uv run pyinstaller ...` 构建 Python 后端产物。

### 桌面打包

```bash
pnpm desktop:build
```

该命令会构建共享类型、前端、桌面壳、Python 后端产物，并执行 Electron Builder 目录打包。

## 验证命令

常用验证：

```bash
pnpm --filter @zahnerflow/types build
pnpm --filter zahnerflow-flowgram build
pnpm --filter zahnerflow-desktop build
uv run python -m compileall apps/python_backend apps/shared/contracts
```

后端测试通常需要从 `apps/python_backend` 上下文运行，或显式设置 `PYTHONPATH`：

```bash
PYTHONPATH=apps/python_backend uv run pytest apps/python_backend/tests
```

## 端口

- Python 后端：`127.0.0.1:3001`
- Vite 开发服务器：`127.0.0.1:8083`

禁止把以下旧端口作为当前正常运行时的一部分：

- 旧设备服务端口：`8000`、`8001`、`8010`、`8011`、`8012`、`8013`
- PostgreSQL 默认端口：`5432`

## 版本归档

1.0.0 的设计、变更和复盘归档位于：

- `doc/insight/1.0.0/README.md`
- `doc/insight/1.0.0/design-archive.md`
- `doc/insight/1.0.0/changelog-summary.md`
- `doc/insight/1.0.0/decisions.md`
- `doc/insight/1.0.0/lessons-learned.md`
- `doc/insight/1.0.0/next-version-notes.md`
