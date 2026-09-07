# ZahnerFlow

ZahnerFlow 是面向实验室本地工作站的电化学实验编排与执行软件。研究人员通过可视化节点组织电化学测量、炉温变化、气体流量变化和循环流程，观察实时状态与曲线，并按工作流回查执行记录及结果文件。

当前应用版本以根目录 [VERSION](VERSION) 为准。整体优化完成版本为 **2.2.1**，复核日期 **2026-09-08**；优化前基线为 **1.0.11**。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [项目全局评估报告](doc/project-assessment-2026-09-07.md) | 项目目的、设计风格、代码风格、适用范围和后续修改建议 |
| [整体优化交付报告](doc/optimization-results-2026-09-08.md) | 六项任务结果、Git 回溯节点、验证证据和实际边界 |
| [设计规范](doc/design-system.md) | 固定的视觉令牌、SCSS 模块和组件复用规则 |
| [数据与命名规范](doc/data-contracts.md) | 数据库单一结构来源、迁移与接口映射 |
| [CLI 与 Agent 接入](doc/cli-agent.md) | 能力发现、JSON 命令、执行观察与 App 同步 |
| [当前设计](.memory/design.md) | 架构、运行状态、设备行为、接口和持久化的现行约束 |
| [项目规则](.memory/rules.md) | 文档同步、代码维护和验证纪律 |
| [代理工作指南](AGENTS.md) | 环境、提交、版本管理要求 |
| [应用变更记录](CHANGELOG.md) | 各应用版本的变更 |
| [设计演进记录](.memory/changelog.md) | 按设计锚点查找历史原因，按需读取 |

原评估报告保留优化前的观察；其中已实施事项以交付报告与当前设计为准。未实施建议仍不自动成为产品要求。

## 能力与边界

- 编排恒电位/恒电流 EIS、开路电位、计时测量、电压/电流斜坡及高级切换、阶梯测量。
- 组合炉温、气体流量、等待、定时、循环和工作流块，查看后端展开步骤与 ETA。
- 通过 Python 驱动连接 Zahner/Thales、AI-518P 炉温控制器和当前协议支持的 MFC；三类设备均有模拟实现。
- 展示设备快照、执行进度、IVT/EIS 曲线，保存工作流、执行步骤、警告和结果文件索引。
- 提供实验记录、工作流相似地图及报告导出。
- 通过 `uv run zahnerflow` 接收 CLI/Agent 指令，App 展示同一运行时的外部执行来源、节点和进度。

当前按本地单操作者、同一时间一条活跃执行设计。用户档案用于区分记录和设置，不构成多用户鉴权系统。停止是工作流取消请求；部分测量需要等待当前步骤结束。进程重启会将遗留活跃执行收口为失败，不支持跨进程续跑。

## 代码地图

| 路径 | 职责 |
| --- | --- |
| `apps/frontend` | React、TypeScript、Zustand、ECharts 和 SCSS 界面 |
| `apps/desktop` | Electron 窗口、桌面桥和后端进程管理 |
| `apps/python_backend/main.py` | FastAPI、Socket.IO 和运行时生命周期入口 |
| `apps/python_backend/runtime` | `AppRuntime`、执行计划、执行引擎、记录器、设备管理 |
| `apps/python_backend/devices` | 真机与模拟设备实现 |
| `apps/python_backend/database.py`、`database_schema.py` | SQLite 连接与唯一结构/迁移定义 |
| `apps/zahnerflow_cli` | 标准库 HTTP 命令行客户端 |
| `apps/shared/contracts` | Python 共享契约及 TypeScript 生成器 |
| `packages/types` | 前端和桌面侧可用的共享类型包 |
| `scripts` | 应用版本同步与发布规则检查 |

前端统一通过 `apps/frontend/src/runtimeClient.ts` 访问 REST 和 Socket.IO。后端业务事实由一个 Python 进程中的 `AppRuntime` 协调；阻塞设备调用可在线程中执行，设备驱动不作为独立服务启动。

## 开发入口

环境声明：Node.js ≥ 18、pnpm ≥ 9、Python ≥ 3.11；Python 环境和依赖使用 `uv`。本次验证使用 Node.js 24.18.0、pnpm 11.9.0、uv 0.11.26 和 Python 3.14；没有验证所有最低版本组合。两份依赖锁均纳入版本管理。

在仓库根目录准备依赖：

```powershell
pnpm install --frozen-lockfile
uv sync --locked
```

浏览器开发模式：

```powershell
pnpm dev
```

Vite 配置端口为 `8083`，Python 后端默认为 `127.0.0.1:3001`；Vite 将 `/api` 和 `/socket.io` 代理到后端。`/health` 直接访问后端端口。

桌面开发模式：

```powershell
pnpm desktop:dev
```

Electron 启动并管理自己的 Python 后端，等待健康检查成功后加载前端。浏览器开发模式与桌面开发模式默认使用同一后端端口，应选择一种运行方式。

开发模式默认数据库为仓库 `data/app.db`，可通过 `ZAHNERFLOW_DATA_DIR` 指定数据目录。桌面模式由 Electron 指定 `app.getPath('appData')/ZahnerFlow/data`；以 `/health` 返回的 `data_dir`、`database_path` 核对实际位置。测量输出目录由用户路径配置决定，与 SQLite 所在目录分别管理。

## 验证与构建

```powershell
pnpm version:check
pnpm type-check
pnpm lint
pnpm build
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

分发脚本会先检查版本，再构建前端、桌面壳和 Python 后端。各子包构建入口也执行版本前置检查。安装包验收范围见优化记录。

仓库规则禁止提交测试源码、测试配置和测试目录。已移除指向不存在目录或文件的测试、服务脚本；外部验证可通过 `pnpm exec vitest run --config <外部配置>` 运行。阶段结果见 [整体优化记录](doc/optimization-progress.md)。

## 修改约定

修改前读取 `.memory/rules.md` 和 `.memory/design.md`。接口变化先改共享契约，通信保持单一入口；架构、设备、数据流、启动或持久化变化需要同步设计并追加设计记录。

应用版本由 `VERSION` 唯一维护，通过 `pnpm version:sync` 同步（包括 uv 锁中的根项目版本），再更新 `CHANGELOG.md` 并运行 `pnpm version:check`。完成变更后创建中文 Git 提交。此次 **1.0.11 → 2.2.1** 包含用户与报告接口的不兼容规范化，故跨越 MAJOR；具体阶段见交付报告。
