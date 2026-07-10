# Frontend Checkpoint - BEM Pause

状态：1.0.0 历史检查点。本文只说明 2026-06-19 暂停时的验证状态，不代表 1.0.0 仍在进行中的计划。

记录时间：2026-06-19

## 当前状态

本记录点用于暂停前端 BEM/SCSS 清理任务，转入前端 TS/TSX 文件结构讨论。

当前已验证：

- `cd apps/frontend && node scripts/audit-bem.mjs --fail` 通过。
- `cd apps/frontend && pnpm build` 通过。
- BEM 审计结果：
  - `mappedBemTargetCount: 0`
  - `oldUnderscoreUseCount: 0`
  - `usedButUnstyledCount: 93`
- Sass `Invalid UTF-8` 报错已处理：
  - 删除 `_layout.scss` 中重复拼回的旧 CSS 片段。
  - 清理 `_utilities.scss` 中损坏注释。
  - 清理 `DataViewer` 及 `components/data/*` 中损坏占位字符和旧 DataViewer 类名。

## 已知非阻塞警告

- Sass `@import` deprecation warning。
- Sass legacy JS API deprecation warning。
- Vite chunk size warning。

这些不是当前 BEM/UTF-8 修复失败。

## 暂停边界

暂停点之后不继续扩大 BEM 修复范围，除非后续讨论明确要求继续。

下一步讨论方向：

- 只从文件名和路径出发，分析 `apps/frontend/src` 下为什么有 100+ 个 TS/TSX 文件。
- 暂不做删除、合并、迁移或架构重构。
