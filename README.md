# ZahnerFlow

ZahnerFlow 是面向实验室本地工作站的电化学实验编排与执行软件。研究人员通过可视化节点组织电化学测量、炉温变化、气体流量变化和循环流程，观察实时状态与曲线，并按工作流回查执行记录及结果文件。

当前应用版本以根目录 [VERSION](VERSION) 为准。本次文档核对版本为 **1.0.11**，核对始于 **2026-09-07**，整理完成于 **2026-09-08**。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [项目全局评估报告](doc/project-assessment-2026-09-07.md) | 项目目的、设计风格、代码风格、适用范围和后续修改建议 |
| [当前设计](.memory/design.md) | 架构、运行状态、设备行为、接口和持久化的现行约束 |
| [项目规则](.memory/rules.md) | 文档同步、代码维护和验证纪律 |
| [代理工作指南](AGENTS.md) | 环境、提交、版本管理要求 |
| [应用变更记录](CHANGELOG.md) | 各应用版本的变更 |
| [设计演进记录](.memory/changelog.md) | 按设计锚点查找历史原因，按需读取 |

评估报告中的建议属于待讨论事项，不自动成为新的产品要求；实现事实与约束仍应核对真实代码和当前设计。

## 能力与边界

- 编排恒电位/恒电流 EIS、开路电位、计时测量、电压/电流斜坡及高级切换、阶梯测量。
- 组合炉温、气体流量、等待、定时、循环和工作流块，查看后端展开步骤与 ETA。
- 通过 Python 驱动连接 Zahner/Thales、AI-518P 炉温控制器和当前协议支持的 MFC；三类设备均有模拟实现。
- 展示设备快照、执行进度、IVT/EIS 曲线，保存工作流、执行步骤、警告和结果文件索引。
- 提供实验记录、工作流相似地图及报告导出。

当前按本地单操作者、同一时间一条活跃执行设计。用户档案用于区分记录和设置，不构成多用户鉴权系统。停止是工作流取消请求；部分测量需要等待当前步骤结束。进程重启会将遗留活跃执行收口为失败，不支持跨进程续跑。

## 代码地图

| 路径 | 职责 |
| --- | --- |
| `apps/frontend` | React、TypeScript、Zustand、ECharts 和 SCSS 界面 |
| `apps/desktop` | Electron 窗口、桌面桥和后端进程管理 |
| `apps/python_backend/main.py` | FastAPI、Socket.IO 和运行时生命周期入口 |
| `apps/python_backend/runtime` | `AppRuntime`、执行计划、执行引擎、记录器、设备管理 |
| `apps/python_backend/devices` | 真机与模拟设备实现 |
| `apps/python_backend/database.py` | SQLite 初始化与结构补齐 |
| `apps/shared/contracts` | Python 共享契约及 TypeScript 生成器 |
| `packages/types` | 前端和桌面侧可用的共享类型包 |
| `scripts` | 应用版本同步与发布规则检查 |

前端统一通过 `apps/frontend/src/runtimeClient.ts` 访问 REST 和 Socket.IO。后端业务事实由一个 Python 进程中的 `AppRuntime` 协调；阻塞设备调用可在线程中执行，设备驱动不作为独立服务启动。

## 开发入口

环境声明：Node.js ≥ 18、pnpm ≥ 8、Python ≥ 3.11；Python 环境和依赖使用 `uv`。这些是仓库声明的最低要求，本次没有验证所有最低版本组合。

在仓库根目录准备依赖：

```powershell
pnpm install
uv sync
```

浏览器开发模式：

```powershell
pnpm dev
```

Vite 配置端口为 `8083`，Python 后端默认为 `127.0.0.1:3001`；Vite 将 `/api` 和 `/socket.io` 代理到后端。`/health` 直接访问后端端口。本次隔离启动验证了 Python 入口，未重新执行全新安装。

桌面开发模式：

```powershell
pnpm desktop:dev
```

Electron 启动并管理自己的 Python 后端，等待健康检查成功后加载前端。浏览器开发模式与桌面开发模式默认使用同一后端端口，应选择一种运行方式。

开发模式默认数据库为仓库 `data/app.db`，可通过 `ZAHNERFLOW_DATA_DIR` 指定数据目录。桌面模式由 Electron 指定 `app.getPath('appData')/ZahnerFlow/data`；以 `/health` 返回的 `data_dir`、`database_path` 核对实际位置。测量输出目录由用户路径配置决定，与 SQLite 所在目录分别管理。

## 验证与构建

```powershell
pnpm version:check
pnpm build
pnpm --filter zahnerflow-flowgram lint
```

`pnpm build` 包括版本检查、共享类型构建和前端 TypeScript/Vite 构建。契约修改从 Python 源开始，在根目录生成后再构建：

```powershell
uv run python -m apps.shared.contracts.generate
```

Windows 安装包入口：

```powershell
pnpm version:check
pnpm desktop:dist:win
```

当前分发脚本会构建前端、桌面壳和 Python 后端，但 `desktop:dist:*` 本身尚未统一内置版本前置检查，操作时应显式先检查。本次没有生成或验证安装包。

仓库规则禁止提交测试源码、测试配置和测试目录。当前部分 `test:*` 脚本仍引用不存在的 `test/`，`setup` 和前端 `serve` 也引用缺失文件；不要将这些脚本视为已经可用的验证或启动流程，详见评估报告 R02。

## 修改约定

修改前读取 `.memory/rules.md` 和 `.memory/design.md`。接口变化先改共享契约，通信保持单一入口；架构、设备、数据流、启动或持久化变化需要同步设计并追加设计记录。

应用版本由 `VERSION` 唯一维护，通过 `pnpm version:sync` 同步，再更新 `CHANGELOG.md` 并运行 `pnpm version:check`。完成变更后创建中文 Git 提交。本次仅初始化开发文档，版本保持 **1.0.11 → 1.0.11**。
