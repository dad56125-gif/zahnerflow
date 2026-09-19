# ZahnerFlow 安装与启动

状态：当前使用说明。归属：启动与打包模块维护者。复核日期：2026-09-20（脚本静态核对，不代表本次重新安装或打包）。

步骤来源：[根脚本](package.json)、[桌面脚本](apps/desktop/package.json)、[Python 项目](pyproject.toml)、[Vite 配置](apps/frontend/vite.config.ts)、[后端入口](apps/python_backend/main.py)、[桌面入口](apps/desktop/src/main.ts)。这些定义变化时更新本文。当前版本查看 [VERSION](VERSION)，完整文档入口见 [目录](doc/README.md)。

## 环境与安装

项目声明 Node.js ≥ 18、pnpm ≥ 9、Python ≥ 3.11。Python 环境与命令统一使用 `uv`。Windows 是桌面与设备使用的目标环境；最低版本声明不等于本次已测试所有组合。

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
uv sync --locked
```

两份依赖锁随仓库维护。不要单独安装前端而遗漏 workspace 共享类型。

## 开发启动

| 模式 | 根目录命令 | 后端由谁启动 |
| --- | --- | --- |
| 浏览器开发 | `pnpm dev` | 根脚本同时启动前端和 Python |
| Electron 开发 | `pnpm desktop:dev` | 桌面壳启动并管理 Python |
| 仅后端 | `uv run python apps/python_backend/main.py` | 当前命令 |

默认前端端口 `8083`、后端 `127.0.0.1:3001`。前端代理 `/api` 和 `/socket.io`，健康检查直接访问后端 `/health`。默认配置下选择一种启动模式，避免重复占用后端端口。

运行拓扑是一个 Python 运行时与进程内设备类调用。当前设计详见 [.memory/design.md](.memory/design.md) 的 `[产品-运行拓扑]` 和 `[启动-运行入口]`。

## 数据位置

开发默认数据库为仓库 `data/app.db`；`ZAHNERFLOW_DATA_DIR` 可指定目录。Electron 使用 `app.getPath('appData')/ZahnerFlow/data` 并传给后端。以 `/health` 返回的 `data_dir`、`database_path` 为实际运行位置依据。测量输出目录由用户路径配置控制，与 SQLite 位置分别管理。

## 验证、生成与构建

按改动范围选择验证，不把列出的命令当作本次全部执行过的结果：

```powershell
pnpm version:check
pnpm type-check
pnpm lint
pnpm build
```

契约变更先改 `apps/shared/contracts/` 中的定义，再生成并检查差异：

```powershell
uv run python -m apps.shared.contracts.generate
```

生成范围和仍需手工同步的部分见 [来源登记](doc/architecture/source-of-truth.md)。`pnpm build` 构建共享类型和前端；不等同于重新生成所有契约源文件。

| 构建范围 | 命令 |
| --- | --- |
| 后端可执行产物 | `pnpm backend:dist` |
| 桌面目录包 | `pnpm desktop:build` |
| Windows 安装包 | `pnpm desktop:dist:win` |

构建及发布脚本包含版本前置检查。版本需要变化时修改 `VERSION`，运行 `pnpm version:sync`，维护根 `CHANGELOG.md`，再执行 `pnpm version:check`；完整升级规则由 [AGENTS.md](AGENTS.md) 维护。

仓库不提交测试源码、测试配置、夹具或测试目录。外部验证文件放仓库外或已忽略目录；后端验证从 `apps/python_backend` 上下文通过 `uv run ...` 执行，按实际外部路径设置导入上下文。前端外部验证可使用 `pnpm exec vitest run --config <外部配置>`。不要引用不存在的仓库测试目录。
