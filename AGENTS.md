# AGENTS 指南（面向代码助手）

本仓库采用 pnpm monorepo。请严格遵循以下构建与运行脚本规则，避免在自动化或一次性校验时“常驻进程导致卡住”。

## 基础规则
- Node >= 18，pnpm >= 8。
- 依赖安装：`pnpm install`（一次性在仓库根目录执行）。
- 类型包构建：当调整了共享 DTO/类型时，先执行：`pnpm --filter @zahnerflow/types build`。

## 日常开发
- 同时启动前后端：`pnpm dev`。
  - 仅前端：`pnpm --filter frontend dev`
  - 仅后端：`pnpm --filter backend start:dev`
- 全量构建：`pnpm build`（前后端一起）。
- 质量检查：
  - `pnpm lint`、`pnpm type-check`、`pnpm format:check`
  - 提交前建议执行上述三项。

## 后端运行与“非阻塞冒烟”
- 常驻方式（手工调试用）：
  - `pnpm --filter backend build && node apps/backend/dist/main.js`
- 非阻塞冒烟（推荐用于脚本/CI/本地一次性验证）：
  - 直接脚本：`pnpm --filter backend smoke`
  - 等价环境变量方式：
    - PowerShell: `pnpm --filter backend build; $env:SMOKETEST='1'; node apps/backend/dist/main.js`
    - CMD: `pnpm --filter backend build && set SMOKETEST=1 && node apps\backend\dist\main.js`
    - Bash: `SMOKETEST=1 pnpm --filter backend build && node apps/backend/dist/main.js`
- 说明：`SMOKETEST` 会让后端启动成功后输出就绪标记并立即退出，不会常驻或卡住。

## Windows PowerShell 串行执行小贴士
- 组合命令优先使用脚本块：
  - `& { pnpm --filter backend build; $env:SMOKETEST='1'; node apps/backend/dist/main.js }`
- 避免在 PowerShell 中直接使用 `||`、`&&` 等 Bash 语法。

## 注意事项
- 数据索引层目前使用轻量 JSON（apps/backend/src/db/db.service.ts）以避免原生 sqlite3 绑定引发的运行环境问题；如需回切 sqlite，请在具备 node-gyp 编译链的环境中安装并验证后再改动。
- 文件归档规范与数据库结构约束遵循：`doc/DataBaseNew/简化数据库与文件组织方案.md`。
- 提交 PR 前请确保：能 `pnpm --filter backend smoke` 通过，且已执行 lint/type-check。

