# 教学功能来源登记

状态：当前来源登记。归属：教学功能维护者。来源：当前独立教学分支的实现。复核日期：2026-09-20。

本文限定当前分支教学功能；全项目架构以 [当前设计](../../.memory/design.md) 为准。本分支不引入其他分支的文档整理改动。

| 职责 | 源头 | 消费与派生关系 |
| --- | --- | --- |
| 操作与外观 | 前端既有 Canvas、Toolbar、RightPanel、用户设置、展开预览、图表与报告组件 | 普通操作与 TutorialRunner 使用同一控件和业务处理 |
| 教学视觉引导 | [TutorialRunner.tsx](../../apps/frontend/src/components/tutorial/TutorialRunner.tsx) 与 _tutorial.scss | 逐帧定位真实控件；仅遮罩、描边与光标标注，源组件不缩放，不显示镜像窗；样式基线见 [教学样式](../tutorial-style.md) |
| 课程步骤 | [tutorialLessons.ts](../../apps/frontend/src/components/tutorial/tutorialLessons.ts) | 课程元数据与完整演示步骤；outline 必填并引用 tutorialOutlines.ts 的总结性阶段，目录只读取 outline，演示与验收只读取 steps；不加载视频 |
| SOP 综合课程 | 用户提供的 LAB-ELEC-001 V1.0 与 [课程映射说明](../tutorial-proton-sop.md) | protonSopLessons.ts 定义四章、教学前置模板及操作检查；原文未给定值不能当作已确认实验参数 |
| 教学数据 | [tutorialScenario.json](../../apps/frontend/src/components/tutorial/tutorialScenario.json) | Python 模拟器采集，TutorialRuntime 读取和重放；不是独立执行规划算法 |
| 设备连接与控制 | [deviceLessons.ts](../../apps/frontend/src/components/tutorial/deviceLessons.ts) 与 [课程说明](../tutorial-devices.md) | 使用现有管式炉、MFC 窗口、连接面板和设备 hook；tutorialDeviceScenario.json 存放 Python 模拟器真实路由采集结果，含缺失实验信息的 409 响应 |
| 会话生命周期 | [tutorialSession.ts](../../apps/frontend/src/components/tutorial/tutorialSession.ts) | 切换数据源，保存和恢复既有组件所消费的数据与界面状态 |
| 请求与事件 | [runtimeClient.ts](../../apps/frontend/src/runtimeClient.ts) | 同一通信入口与实际 Socket；教学仅规划接口可访问后端 |
| 步骤规划 | Python ExecutionPlanner | 正常操作和教学请求均调用同一后端预览与 ETA 接口 |

更新规则：改动真实组件后核对教学脚本定位与步骤结果；改动场景、步骤或可见行为后重新验收；录屏仅作开发证据，不随应用发布。验收脚本、截图、录屏原始文件存放忽略目录 `.codex-run/tutorial/`，不进入仓库测试目录。
