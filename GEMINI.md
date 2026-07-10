# ZahnerFlow 项目代理入口

本文件保留为兼容入口，避免历史工具链或其他代理继续引用旧文件名时失效。

项目级代理规则的权威入口已经收敛到：

- `AGENTS.md`

执行任务时的最低要求：

1. 先读 `AGENTS.md`
2. 再按 `AGENTS.md` 要求读取 `.memory/rules.md` 与 `.memory/design.md`
3. 只有需要追溯既有设计决策或判断相近改动边界时，按相关锚点查询 `.memory/changelog.md`
4. 如果任务影响设计，更新 `.memory/design.md` 后必须在 `.memory/changelog.md` 追加一条精简记录

如果本文件与 `AGENTS.md`、`.memory/design.md` 或真实代码冲突，以它们为准。
