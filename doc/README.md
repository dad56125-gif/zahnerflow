# 教学分支文档入口

状态：当前分支文档导航。归属：分支维护者。复核日期：2026-09-20。

本分支保留基线原有文档布局，不合入其他分支的文档搬迁。架构变化同步 `.memory/design.md`，设计原因和验证同步 `.memory/changelog.md`，发布变化同步根 `CHANGELOG.md`。

- [当前设计与教学边界](../.memory/design.md)
- [教学功能来源与派生链](architecture/source-of-truth.md)
- [质子导体 SOP 综合教程](tutorial-proton-sop.md)
- [实验信息与设备控制教程](tutorial-devices.md)
- [教学样式定稿](tutorial-style.md)
- [视觉规范](design-system.md)
- [接口契约](data-contracts.md)
- [CLI 使用](cli-agent.md)

新增文档按职责归属已有主题；定义与派生产物分开，路径相对仓库，验证临时产物放 `.codex-run/`。测试源码、测试配置和夹具不纳入提交。
