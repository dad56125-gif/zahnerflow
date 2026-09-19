# ZahnerFlow

ZahnerFlow 是面向实验室本地工作站的电化学实验编排与执行软件。研究人员通过可视化节点组织电化学测量、炉温变化、气体流量变化和循环流程，观察实时状态与曲线，并按工作流回查执行记录及结果文件。

当前应用版本以根目录 [VERSION](VERSION) 为准。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [统一文档目录](doc/README.md) | 文档层级、归属、架构图与新增维护规则 |
| [安装与启动](INSTALL.md) | 环境、启动、构建与验证命令 |
| [当前设计](.memory/design.md) | 现行架构与稳定设计锚点 |
| [功能源头与派生关系](doc/architecture/source-of-truth.md) | 定义文件、生成和调用链、冲突核查 |
| [代理工作指南](AGENTS.md) | 项目维护入口 |
| [应用变更记录](CHANGELOG.md) | 版本发布历史 |

使用说明、专题规范、设备研究和历史报告统一从文档目录进入。历史建议与设备研究结论不自动成为当前产品要求。

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

## 开发与维护

环境要求、启动模式和构建操作统一维护在 [安装与启动](INSTALL.md)。版本同步、契约生成及来源变更的影响范围见 [功能源头与派生关系](doc/architecture/source-of-truth.md)。

修改前读取 [项目维护规则](.memory/rules.md) 和 [当前设计](.memory/design.md)。新增或移动文档遵循 [文档维护流程](doc/README.md)。架构、设备、数据流、启动或持久化变化需要同步设计并追加设计记录；完成变更后按项目规则创建中文 Git 提交。
