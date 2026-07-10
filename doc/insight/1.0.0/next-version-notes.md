# 后续版本提示

## 应继承的稳定结论

1. 保持单进程 Python 运行时和 `AppRuntime` 协调边界，除非产品形态不再是本地单用户程序。
2. 保持 `runtimeClient.ts` 作为前端通信主入口。
3. 保持后端展开事实作为 ETA、执行、报告和展开预览的同一来源。
4. 保持 workflow fingerprint 作为实验定义身份。
5. 保持实验记录按 workflow 组织，隐藏 fingerprint/hash 和 raw execution 长 ID。
6. 保持报告只展示可追溯事实，不写没有数据关联的因果解释。
7. 保持 UI 基础设施契约，不新增并行按钮、输入、浮层或通信体系。

## 应避免的问题

1. 不要重新引入旧 NestJS 后端、设备服务端口或 worker IPC。
2. 不要让前端重新维护运行中 ETA 或展开索引。
3. 不要把工作流名称、收藏或备注纳入 fingerprint。
4. 不要恢复保存式 workflow CRUD 或画布内历史工作流管理。
5. 不要把 `startup` / `shutdown` 重新放回普通节点库。
6. 不要在报告 UI 暴露 fingerprint/hash 或把 execution 长 ID 作为主视觉。
7. 不要为兼容旧样式新增 alias 层。
8. 不要把安装文档重新写回 NestJS / FastAPI / PostgreSQL 拓扑。

## 建议进入下一版本的任务

1. 建立版本发布检查：根包、前端、桌面、types、Python 包版本一致性。
2. 迁移 Sass `@import` 到 `@use` / `@forward`。
3. 拆分前端大 chunk，优先处理报告导出、ECharts 和 PDF 相关模块。
4. 为报告增加执行级环境快照，再考虑解释性摘要。
5. 设计长期历史降采样层，明确保留字段、聚合粒度和导出能力。
6. 扩展 ETA：置信度、偏差统计、更多节点规则和可选相似参数模型。
7. 重新设计工作流块 v2：是否支持嵌套、块内编辑和跨 workflow 参数化。
8. 将 `doc/frontend_bem_enforcement_audit.md` 中剩余非 BEM 事项转为可执行清单。

## 发布前文档检查清单

1. `.memory/design.md` 只描述当前设计，不写愿景。
2. `.memory/changelog.md` 只记录影响设计判断的历史变化，不混入普通待办。
3. `INSTALL.md` 与 `package.json` 脚本、当前端口和真实启动方式一致。
4. `doc/insight/<version>/` 存在版本归档入口、设计归档、changelog 汇总、决策、复盘和后续提示。
5. 如果新增架构或契约变化，先更新 `.memory/design.md`，再用对应锚点更新 `.memory/changelog.md`。
