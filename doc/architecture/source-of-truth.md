# 教学功能来源登记

状态：当前来源登记。归属：教学功能维护者。来源：当前独立教学分支的实现。复核日期：2026-09-20。

本文限定当前分支教学功能；全项目架构以 [当前设计](../../.memory/design.md) 为准。本分支不引入其他分支的文档整理改动。

| 职责 | 源头 | 消费与派生关系 |
| --- | --- | --- |
| 操作与外观 | 前端既有 Canvas、Toolbar、RightPanel、用户设置、展开预览、图表与报告组件 | 普通操作与 TutorialRunner 使用同一控件和业务处理 |
| 教学视觉引导 | [TutorialRunner.tsx](../../apps/frontend/src/components/tutorial/TutorialRunner.tsx) 与 _tutorial.scss | 逐帧定位真实控件；仅遮罩、描边与光标标注，源组件不缩放，不显示镜像窗；样式基线见 [教学样式](../tutorial-style.md) |
| 课程步骤 | [tutorialLessons.ts](../../apps/frontend/src/components/tutorial/tutorialLessons.ts) | 目录说明、演示脚本与步骤结果检查读取 |
| 教学数据 | [tutorialScenario.json](../../apps/frontend/src/components/tutorial/tutorialScenario.json) | Python 模拟器采集，TutorialRuntime 读取和重放；不是独立执行规划算法 |
| 会话生命周期 | [tutorialSession.ts](../../apps/frontend/src/components/tutorial/tutorialSession.ts) | 切换数据源，保存和恢复既有组件所消费的数据与界面状态 |
| 请求与事件 | [runtimeClient.ts](../../apps/frontend/src/runtimeClient.ts) | 同一通信入口与实际 Socket；教学仅规划接口可访问后端 |
| 步骤规划 | Python ExecutionPlanner | 正常操作和教学请求均调用同一后端预览与 ETA 接口 |
| 片段视频 | [public/tutorial](../../apps/frontend/public/tutorial) | 真实界面演示录屏裁剪，目录 video 元素播放；人工重录派生，无自动同步 |

更新规则：改动真实组件后核对教学脚本定位与步骤结果；改动场景、步骤或可见行为后重新验收并录制片段；禁止直接修改派生视频来冒充业务行为修复。验收脚本、截图、录屏原始文件存放忽略目录 `.codex-run/tutorial/`，不进入仓库测试目录。
