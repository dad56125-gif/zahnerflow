# 1.0.0 设计归档

## 已实现并进入最终版本的设计

1. 单进程运行时：后端由一个 Python 进程承担，`AppRuntime` 是唯一运行时协调器。
2. 直接设备运行时：Furnace、MFC 和 Zahner 驱动作为 Python 类直接调用，不作为独立服务启动。
3. 连接路由：模拟器或真机由连接参数决定，真实端口发现接口不默认暴露模拟入口。
4. 设备 runtime 状态契约：统一使用 `RuntimeDeviceStatusEnvelope`、`deviceStatusUpdate` 和 `/api/devices/{device}/runtime/status`。
5. 本地执行状态机：同一时间只允许一个活跃执行；取消、刷新接管、定时节点和运行前元数据确认都由后端状态机处理。
6. 后端事实驱动 ETA：执行前估算、运行中 ETA、历史学习和执行记录统一由后端负责。
7. 工作流 fingerprint 自动归档：工作流定义不可变，名称和收藏只是展示元数据。
8. 工作流块：v1 支持引用已归档工作流、展开到当前位置、收缩为分组，并禁止嵌套工作流块。
9. 自动测量边界：`startup` / `shutdown` 不再是普通节点库项，而是后端围绕测量节点插入的自动边界。
10. 实验记录：以 workflow 树为入口，右侧展示定义、报告和实验地图；不暴露 fingerprint/hash，也不把 execution 长 ID 作为主视觉信息。
11. Furnace 历史视图：宽范围先看活动概览，选中日期后再拉取原始曲线；页面不再展示大表格。
12. 前端 UI 契约：BEM、设计令牌、`.btn`、`.input`、`.select`、SVG 下拉箭头和固定符号码点成为稳定规范。
13. 浮层系统：`OverlayLayer` / `ModalLayer` / `Dropdown` 只负责行为语义，视觉由真实业务面板控制。
14. 当前启动方式：开发阶段只需要 Python 后端 `3001` 和 Vite `8083`；旧 NestJS 后端归档在 `archive/backend/`。

## 已调整或废弃的设计

1. 旧 worker IPC：已由进程内 `AppRuntime` 和执行引擎替代。
2. 旧 NestJS 后端：已移动到 `archive/backend/`，只作为历史素材。
3. 独立设备 FastAPI 服务：已废弃，设备驱动直接导入 Python 运行时。
4. 前端多通信入口：`shared/api.ts`、设备 API facade、设备专用 WebSocket service 和旧 workflow service 已废弃，统一收敛到 `runtimeClient.ts`。
5. 前端运行时间估算：已废弃，运行中时间事实由后端 ETA 快照提供。
6. 保存式工作流 CRUD：已废弃，工作流定义由 fingerprint 自动归档，公开接口收敛到实验记录读取、收藏和重命名。
7. 工具栏定时运行：已废弃，定时变成 `scheduled_start` 工作流节点。
8. 用户手动放置 `startup` / `shutdown`：已废弃，测量工作流由后端自动插入边界。
9. 最近一次前端内存报告：已废弃，报告必须从 SQLite 执行历史读取。
10. Furnace 表格主视图：已废弃，改为曲线理解和按需 CSV 导出。
11. 兼容旧 UI 类名和样式 alias：已废弃，BEM 迁移要求直接替换到最终类名。

## 只停留在设想或后续方向的设计

1. ETA 相似参数模型：1.0.0 只支持完全一致参数历史复用；相似参数估算留给后续版本。
2. ETA 置信度展示：已有 `etaSource`，但更细的置信度 UI 仍是后续增强。
3. 执行级环境快照与强因果报告解释：1.0.0 没有把 Furnace/MFC 采样和 execution 建立强关联，报告不能写确定因果解释。
4. 长期降采样历史层：1.0.0 只保留近期原始采样和活动概览，不建立长期历史仓库。
5. 工作流块内直接编辑器：v1 明确不做，后续如需要必须重开设计。
6. 工作流块嵌套：v1 明确禁止，后续如支持必须重新定义展开、报告和 fingerprint 语义。
7. Electron 打包后由 Python 后端服务静态前端：设计允许未来移除开发专用 `8083`，但 1.0.0 开发拓扑仍保留 Vite。

## 过时文档与历史信息处理

1. `INSTALL.md` 原先描述 NestJS、FastAPI 设备服务和 PostgreSQL，已经与 1.0.0 最终拓扑冲突；本次已改为当前安装和启动说明。
2. `doc/frontend_checkpoint_2026-06-19_bem_pause.md` 是暂停点，不应作为当前未完成计划理解；其价值是记录 BEM 清理阶段的验证状态和非阻塞警告。
3. `doc/frontend_bem_enforcement_audit.md` 是 2026-06-19 审计快照，剩余事项应进入后续版本技术债，而不是 1.0.0 未完成需求。
4. `doc/运行时间估算与倒计时功能设计.md` 已从方案文档转为已实现专题设计，后续扩展方向应按新版本重新立项。
5. `archive/backend/` 是旧服务历史源码，不能作为当前运行时的一部分。

## 冲突点与归档处理

| 冲突点 | 当前证据 | 归档处理 |
| --- | --- | --- |
| `INSTALL.md` 旧文档描述 `apps/backend`、NestJS、FastAPI、PostgreSQL | `.memory/design.md` 明确当前是单 Python 后端、旧 NestJS 在 `archive/backend/` | 已更新 `INSTALL.md`，旧拓扑只作为历史设计记录 |
| `apps/frontend/package.json` 版本为 `2.0.0`，根包、桌面包、types 和 Python 包为 `1.0.0` | package metadata 不一致 | 不在本次归档中改包版本；记录为后续版本发布流程债 |
| changelog 中多处使用“实验历史”，当前用户口径偏向“实验记录” | `.memory/design.md` 当前规则用“实验记录”，完整历史仍有旧称 | `.memory/changelog.md` 只保留变更索引；完整原文在 `changelog-full-history.md` 中保留旧称，归档中统一说明当前术语为“实验记录” |
| BEM 文档仍写“暂停点”“后续讨论方向” | 这是 2026-06-19 的检查点，不是当前计划 | 标记为历史检查点，后续事项进入 `next-version-notes.md` |
