# ZahnerFlow 1.0.0 版本归档

本文是 1.0.0 封存后的版本入口。1.0.0 不再作为“开发中版本”描述；后续只允许通过新版本设计继续演进。

## 归档范围

归档来源：

- `.memory/design.md`：已压缩为当前设计基线入口；完整旧版见 `design-current-detail-archive.md`。
- `.memory/changelog.md`：已压缩为设计变更索引；完整旧版见 `changelog-full-history.md`。
- `doc/运行时间估算与倒计时功能设计.md`：ETA 与倒计时专题设计，已进入最终版本。
- `doc/frontend_bem_enforcement_audit.md`：前端 BEM 迁移审计结果。
- `doc/frontend_checkpoint_2026-06-19_bem_pause.md`：BEM 清理暂停点，作为历史检查点保留。
- `archive/backend/`：旧 NestJS 后端归档素材。
- `INSTALL.md`：已更新为 1.0.0 当前安装和启动说明。

## 版本结论

1.0.0 最终解决的是“把早期多服务、旧前端通信和临时报告/工作流模型，收敛成一个本地单用户实验运行时”的问题。

最终稳定下来的产品结构是：

- 单 Python 后端进程持有运行状态；
- `AppRuntime` 统一协调设备、执行、状态快照和 Socket.IO 推送；
- SQLite 作为本地持久化边界；
- 前端通过 `runtimeClient.ts` 访问运行时；
- 工作流定义以 fingerprint 自动归档；
- 实验记录以工作流为主轴浏览定义、执行、报告和相似地图；
- ETA、循环展开、工作流块展开、自动启动停止边界和报告明细都以后端展开事实为准。

## 归档文件

- `design-current-detail-archive.md`：`.memory/design.md` 压缩前的完整详细原文。
- `changelog-full-history.md`：`.memory/changelog.md` 压缩前的完整流水原文。
- `design-archive.md`：最终设计、废弃设计、设想阶段设计和过时文档判断。
- `changelog-summary.md`：1.0.0 变更汇总和 changelog 整理结果。
- `decisions.md`：关键设计决策与原因。
- `lessons-learned.md`：有效方案、失败方案和复盘洞察。
- `next-version-notes.md`：后续版本应继承和避免的问题清单。

## 文档状态

`.memory/design.md` 继续作为当前设计真相，但只保留可执行的基线事实；`.memory/changelog.md` 继续作为按锚点组织的设计变更入口，但只保留会影响后续判断的索引。完整细节进入本文档组，不再堆在 `.memory/` 入口文件里。
