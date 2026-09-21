# ZahnerFlow 会话交接

日期：2026-09-21。交接目标：接续当前 UI 调整上下文，等待用户下一条具体需求，不自行扩大重构范围。

## 当前代码状态

- 原项目：`C:\Users\Dushuaijia\Documents\Code project\zahnerflow-main`。
- 当前分支 main，应用版本 2.6.4；交接文档前最新提交 d2ce312，工作区干净。
- light-ui、unroll-finder 和教程已整合进主线。旧分支/工作树情况属于历史信息，后续操作前重新核查。
- 新任务默认使用隔离工作树，从 main 开始，避免其他对话切分支干扰。不自动合并、删除分支或启动硬件。

## 最近已完成

1. 3cc1d68：展开视图隐藏启动/停止系统边界，不改变后端计划及原始执行索引；移除完整步骤参数 JSON 折叠区；右侧详情复用 property-group；参数与高级设定值补齐单位。
2. f72db50：右侧详情参数每个一行，不使用竖线分隔。分栏里的紧凑摘要仍保留原格式。
3. 12cca6c：标题改为“执行步骤展开”；去掉 ModalLayer 上额外的全屏 blur，沿用其他 modal 的透明背景层和本体玻璃。
4. bdf85be：统一弹窗、图表及侧栏外框圆角。
5. d2ce312：删除重复 --radius-panel 和无引用 --panel-radius，所有原引用直接使用 --radius，实际尺寸不变。版本保持 2.6.4，因仅变量收敛。

## 已核实的中途启动语义

- runtime/execution_planner.py 的 _boundary_prelude_indices：如果从中途开始且剩余有测量，选取之前最近的自动 startup 作为前置步骤。
- runtime/execution_engine.py 跳过起点前其他步骤，但执行 boundary_prelude_indices。
- startup 调用 connect_zahner；正常运行到 shutdown 调用 disconnect_zahner。
- 从头开始不重复补启动；后面没有测量则不补启动。三条规划断言通过。未为核查启动真实仪器。
- 系统边界仅从展示树隐藏；运行按钮仍传后端 unrolledIndex。

## 关键文件

- apps/frontend/src/components/UnrollViewModal.tsx：分栏弹窗、标题、启动入口。
- apps/frontend/src/components/UnrollStepDetails.tsx：详情分块及逐行参数。
- apps/frontend/src/components/unrollViewModel.ts：展示树过滤系统边界、设定值单位。
- apps/frontend/src/types/NodeConfiguration.ts：summaryFields.unit 统一参数单位元数据。
- apps/frontend/src/styles/_unroll.scss：展开样式。
- apps/frontend/src/styles/_tokens.scss：--radius 圆角；不要重新新增同值面板别名。
- _advanced-components.scss、_chart-modal.scss、_ui-kit.scss、_split-pane-modal.scss 等使用统一圆角。
- doc/reference/design-system.md：当前 UI 决策。

## 用户明确偏好

- 按要求做局部修改，不自创布局或功能。
- 深浅主题保持行为与几何一致；浅色玻璃使用白色遮罩，之前确认 30%。
- 颜色、圆角等复用变量，不散落硬编码，不重复制造别名。
- 工具按钮中性黑灰；节点类型图标保留更鲜明颜色；状态绿统一。
- 背景配色在个人偏好，以渐变胶囊切换；经典极光同时切回深色样式。
- 展开详情仿照属性栏底色分块，参数带单位且每个一行。

## 验证与环境

- 最近 pnpm build、pnpm design:check、版本检查通过；构建有既存大 chunk 提示。
- 展开教程 5 步在详情修改后通过，退出恢复存储。圆角最后修改仅构建/规范检查，尚未获得用户最新截图确认最终视觉。
- 原工作区的 .codex-run 内有临时 Playwright 验证脚本及截图，不受版本管理，新工作树不会携带。
- 上一会话主线预览为 http://127.0.0.1:5186/；5178 是旧隔离目录的预览，不能假设它显示 main。服务仍存活与否需实时核查。
- 后端 3001 之前可能来自旧工作树，涉及运行状态先核查进程路径。不要未经核查重启或连接仪器。

## 下一会话入口

1. 读取 AGENTS.md、.memory/rules.md、.memory/design.md 和本文件。
2. 核对当前工作树/分支/版本，确认继承上述提交。
3. 简短告知交接已接收，然后等待用户新需求；当前无未完成实现任务。
4. 后续 UI 修改需浏览验证，尤其圆角是否与背后栏实际对齐；不要把已通过构建说成视觉确认。

## 项目纪律

文档先行，中文 Git 提交；测试产物放已忽略目录或仓库外。Python 用 uv。可发布变更按 VERSION 单一版本源同步并检查；纯文档/无行为变量重构不必升级。当前交接是纯文档，版本 2.6.4 不变。
