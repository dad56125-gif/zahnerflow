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

## 检查更新与下载安装包

桌面版点击底部版本号，选择“检查更新”。发现更高的正式版本后，可下载对应 Windows x64 安装包；下载过程支持取消，之后点击“继续下载”使用已保存分片。关闭更新面板不会取消下载；退出应用会中止请求并保留断点。网络错误会明确显示，可重新检查或重试。

安装包校验通过后保存在系统下载目录的 `ZahnerFlow` 子目录，点击“打开所在文件夹”查看，再由用户自行决定何时安装。程序不自动安装、不重启，不修改系统 DNS、hosts 或代理设置。浏览器模式只显示桌面版提示；当前未提供其他平台的应用内安装包下载。

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

本轮正式发布（2026-10-15）：[ZahnerFlow 2.13.1 电脑版](https://github.com/dad56125-gif/zahnerflow/releases/tag/release/v2.13.1) 已公开为 Latest，沿用 Windows x64 NSIS 安装包与 SHA256 两资产方式；旧产物及旧 Release 保留。标签 `release/v2.13.1` 指向 `e019a203cd05e33e3d811962f7f372bfd85bf1b1`，安装包构建源为 `5550c0a428fe34989f98af6cbf298b94c213e550`，两者差异仅为 `INSTALL.md` 发布登记；后续 main 的发布登记不改写标签、不重打包。应用版本沿用此前从 `2.13.0` PATCH 升级的 `2.13.1`，本轮 CI/文档不另升版。

安装包本地位置为 `apps/desktop/release/ZAHNERFLOW Setup 2.13.1.exe`，GitHub 实际资产名为 `ZAHNERFLOW.Setup.2.13.1.exe`，大小 169619949 字节，SHA256 为 `dc6a45930d2ab7f3e1659ab01eca9c1879c171c1d07f022ab6b21106513186be`；同名 `.sha256` 文件记录规范下载名。两个资产的服务器 digest 均已核对本地哈希一致。`pnpm version:check`、覆盖 `origin/main...HEAD` 的 `pnpm release:check` 和实际 `pnpm desktop:dist:win` 通过；[main 完整 CI](https://github.com/dad56125-gif/zahnerflow/actions/runs/38755367783) 与[标签完整 CI](https://github.com/dad56125-gif/zahnerflow/actions/runs/38755370363) 均成功，含全部收尾步骤。旧运行 `37733258801` 的缓存路径错误已通过仅删除无用 `cache: pnpm` 修复，检查和 actions 版本保持原样。

包验收：从 NSIS 安装包直接提取资源，核对桌面/后端版本均为 `2.13.1`、主进程及 228 个前端文件匹配本次构建，后端版本、环境命名、单 CSV 写入和执行模块代码匹配源码。实际启动提取出的后端，在独立 `ZAHNERFLOW_DATA_DIR` 和空闲端口 `54415` 确认 `/health` 为 healthy、`app_version=2.13.1`、运行时已启动且 SQLite 指向隔离目录；本次进程已停止、端口已释放，未访问生产数据库。证据及旧构建目录备份位于已忽略的 `.codex-run/release-2.13.1/`。此前 59+5 项隔离验证与本次包验收分开记录；未连接真机、未验证异机安装。
仓库不提交测试源码、测试配置、夹具或测试目录。外部验证文件放仓库外或已忽略目录；后端验证从 `apps/python_backend` 上下文通过 `uv run ...` 执行，按实际外部路径设置导入上下文。前端外部验证可使用 `pnpm exec vitest run --config <外部配置>`。不要引用不存在的仓库测试目录。

## 2.14.0 发布验收（2026-10-19）

状态：已公开发布为 Latest，发布后检查更新与完整下载验收均通过。[ZahnerFlow 2.14.0 电脑版](https://github.com/dad56125-gif/zahnerflow/releases/tag/release/v2.14.0) 包含 Windows x64 NSIS 安装包和 SHA256 两个资产，旧版本保留。构建源与标签目标均为 `3aeb9c01259c346efdcaa22ca186fbb309914caf`。版本保持 2.14.0（上一轮 2.13.1 → 2.14.0 已按新增功能完成 MINOR 升级，本轮发布不另升版）。

安装包 `ZAHNERFLOW.Setup.2.14.0.exe` 为 169634120 字节，SHA256 为 `7e40d7ae2224068f39ccfb7e78fcbd0271df405355be44546e89a68038621890`，GitHub 资产 ID 为 `655511874`；安装包和校验文件的服务器 digest 均与本地一致。实际 `pnpm desktop:dist:win`、发布规则检查通过；[main CI](https://github.com/dad56125-gif/zahnerflow/actions/runs/39213274140) 与[标签 CI](https://github.com/dad56125-gif/zahnerflow/actions/runs/39213829082) 均成功。

从安装包提取的主进程、preload、版本文件、更新模块与当前构建一致，228 个前端文件逐一匹配；提取后端在隔离目录启动，返回 healthy、app_version=2.14.0、runtime_running=true。真实包内主进程、preload、前端和后端联动，使用隔离启动器设置独立路径，版本面板从 GitHub 读到 2.14.0 并显示当前无需更新。未运行安装程序，未连接真机。证据位于已忽略目录 `.codex-run/release-2.14.0/`。


发布后下载验收：使用安装包提取的生产更新模块，在隔离环境中将当前版本设为 2.13.1，仅用于验证新版本分支；真实 GitHub API 识别 2.14.0。从空缓存开始，通过无应用代理的官方直连下载全部 169634120 字节，中途取消后续传成功，最终 SHA256 与本地构建及 GitHub digest 一致，并经 PowerShell 独立复核。本次耗时 644 秒，仅代表当前网络。2.14.0 自身通过真实版本面板显示“当前无需更新”。2.13.1 原发行版没有此次新增的更新入口，首次升级仍需手动下载安装包。
