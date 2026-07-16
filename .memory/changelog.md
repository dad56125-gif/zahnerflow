# 设计变更记录

本文只记录会影响当前设计判断的变化。每条记录必须引用 `.memory/design.md` 中存在的锚点，并说明当前系统现在应当如何成立。

## 2026-07-10 - 变更记录改为按需查询并在变更后追加

锚点：[产品-运行拓扑]，[桌面-Electron壳]，[桌面-窗口布局]，[运行时-Python后端]，[运行时-AppRuntime]，[设备-连接路由]，[设备-驱动调用]，[设备-runtime状态契约]，[执行-状态机]，[执行-展开与ETA]，[工作流-身份]，[数据-SQLite]，[接口-前端契约]，[前端-应用骨架]，[前端-浮层系统]，[报告-实验记录]，[启动-运行入口]

原因：任务启动时全文读取演进历史会增加无关上下文；当前设计判断应先以 `design.md` 为入口，需要时再追溯相关记录。

变更：`AGENTS.md`、`.memory/rules.md` 和 `GEMINI.md` 改为要求按锚点或改动主题查询 `changelog.md`，不再要求任务启动时全文读取；需要同步设计的变更完成后必须追加一条精简记录。

设计影响：`design.md` 保持当前设计真相，`changelog.md` 只在需要历史理由时按需检索，同时持续保留可追溯的变更证据。

验证：核对 `AGENTS.md`、`.memory/rules.md`、`GEMINI.md` 的读取与追加规则，并验证本记录的所有锚点均存在于 `.memory/design.md`。

## 2026-07-09 - 当前设计入口改为只描述现行逻辑

锚点：[产品-运行拓扑]，[桌面-Electron壳]，[桌面-窗口布局]，[运行时-Python后端]，[运行时-AppRuntime]，[设备-连接路由]，[设备-驱动调用]，[设备-runtime状态契约]，[执行-状态机]，[执行-展开与ETA]，[工作流-身份]，[数据-SQLite]，[接口-前端契约]，[前端-应用骨架]，[前端-浮层系统]，[报告-实验记录]，[启动-运行入口]

原因：`.memory/design.md` 必须作为当前设计入口，不能混入不参与当前运行的事实；Electron 桌面壳也是当前产品拓扑的一部分，必须进入设计锚点。

变更：`.memory/design.md` 改为只描述当前 Web 前端、Electron 桌面壳、Python 运行时、设备、执行、数据、接口、前端骨架、浮层、实验记录和启动入口；非当前运行素材说明放到 `archive/README.md`。

设计影响：后续架构判断必须从 `.memory/design.md` 的当前锚点出发；不参与当前运行的内容只允许出现在 `archive/` 说明中。

验证：核对 Electron 主进程、preload bridge、前端 desktop bridge、窗口布局变量、Python 后端入口、`AppRuntime`、SQLite schema、执行路由、设备路由、工作流展开和根脚本。

## 2026-07-09 - Electron 桌面壳纳入运行拓扑

锚点：[产品-运行拓扑]，[桌面-Electron壳]，[桌面-窗口布局]，[启动-运行入口]，[接口-前端契约]

原因：当前应用不仅可以在浏览器开发模式运行，也有 Electron 桌面壳负责窗口、后端进程、目录选择和运行时地址桥接。

变更：设计中新增 Electron 主进程、preload bridge、`window.zahnerflowDesktop`、无边框窗口、窗口控制 IPC、桌面 chrome 变量和桌面构建入口。

设计影响：桌面能力必须通过 preload bridge 暴露；前端用 bridge 判断桌面环境；窗口控制和 modal 顶部定位必须服从同一套桌面 chrome 高度变量。

验证：核对 `apps/desktop/src/main.ts`、`apps/desktop/src/preload.cts`、`apps/frontend/src/desktopBridge.ts`、`apps/frontend/src/App.tsx`、`apps/frontend/src/components/WindowControls.tsx`、`apps/frontend/src/styles/_base.scss` 和 `apps/frontend/src/styles/_layout.scss`。

## 2026-07-10 - 统一执行计划生成路径

锚点：[执行-状态机]，[执行-计划]，[执行-展开与ETA]
原因：工作流启动、展开预览、ETA 估算和执行引擎此前分别调用展开逻辑，可能因自动启动配置或展开规则差异产生不同的步骤数量、起始索引和时间线。
变更：新增 `ExecutionPlanner` 和 `ExecutionPlan`，统一解析工作流节点、循环/工作流块/高级节点展开、自动测量边界、ETA、时间线和起点校验；计划显式携带节点快照、步骤、摘要、ETA、时间线、合法起点和补回边界索引。预览、估算和启动路由改为消费 Planner，`ExecutionEngine` 改为直接消费同一份计划，不再自行调用 `unroll_loops`；`AppRuntime` 使用计划携带的时间线；补充 Planner 和执行引擎测试。
设计影响：当前执行事实由一次后端计划生成确定。预览、估算、启动、进度和执行必须共享同一份 `ExecutionPlan`；执行引擎不再拥有第二套展开事实。
验证：在 `apps/python_backend` 上下文运行 `PYTHONPATH=. uv run pytest -q tests`，47 个测试通过；2 个既有 Windows 路径断言在 macOS 环境失败，未涉及本次执行规划改动；`git diff --check` 通过。

## 2026-07-10 - 统一 Socket.IO 事件名称契约

锚点：[接口-事件契约]，[接口-前端契约]

原因：共享事件常量和生成的 TypeScript 文件已经存在，但后端和前端运行时代码仍重复硬编码跨端事件名，事件改名时容易漏改一侧。

变更：补齐连接、工作流加入/离开和执行完成事件常量，重新生成 `events.ts`；后端入口、运行时、执行路由以及前端 runtime client、执行状态、通知、测量和 EIS hooks 改为引用共享常量。

设计影响：自定义 Socket.IO 事件名由 Python 契约源统一维护，TypeScript 只使用生成结果；本次不改变线上事件字符串和 payload。

验证：运行 `uv run python -m apps.shared.contracts.generate` 重新生成契约；检查后端 `sio.emit`/`sio.on` 和前端 `runtimeSocket.on` 已引用常量；后端导入检查通过，后端测试为 47 通过、2 个既有 macOS 路径断言失败；`git diff --check`、共享类型构建和前端类型/构建验证通过。

## 2026-07-10 - 修正 EIS 扫描控制参数映射

锚点：[设备-驱动调用]

原因：前端已经保存 `eisScanDirection` 与 `eisScanStrategy`，但 Zahner 真机逻辑读取的是 `eis_scan_direction` 与 `eis_scan_strategy`。归一化遗漏这两个字段时，真机会回退到 `START_TO_MIN` 和 `SINGLE_SINE`，覆盖用户在界面的选择。

变更：Zahner 参数归一化补齐扫描方向和扫描策略的 camelCase 到 snake_case 映射，并依据方向把起始频率固定为低频或高频限制；前端隐藏可编辑起始频率，展示扫描方向并在切换方向或修改频率边界时自动同步起始端点，同时修正方向中文说明与官方枚举含义相反的问题；新增回归测试。

设计影响：测量配置在进入真机或模拟器前必须完整归一化；EIS 扫描方向、起始频率和频率边界是一组不可拆分的参数，显示、ETA 和设备执行应以同一份归一化参数为基础。

验证：核对 Zahner 官方 `thales_remote` 库对 `START_TO_MAX` 与 `START_TO_MIN` 的定义；运行 EIS 参数归一化测试和后端测试。

## 2026-07-16 - 修正 EIS 单程扫描方向

锚点：[设备-驱动调用]

原因：Thales 的 `ScanDirection` 只描述先从 `Fstart` 扫向哪个边界，随后还会继续扫向另一边界；此前把产品方向直接下发，并把起点放在相反端点，导致低到高和高到低都会完整往返一次。

变更：保留已有工作流中 `START_TO_MAX` 表示低到高、`START_TO_MIN` 表示高到低的产品语义，在 Thales 真机调用边界下发相反的第一段方向枚举，使第一段为零长度、第二段只完成一次全频段扫描；补充两种方向的驱动调用回归测试，并在前端标明单程扫描。

设计影响：EIS 产品方向与 Thales 第一段方向必须在真机边界显式转换，禁止把产品方向枚举直接透传给设备。

验证：EIS 参数与路径、模拟器契约定向测试 65 项通过，后端完整测试 122 项通过；前端 `tsc && vite build` 通过，`git diff --check` 通过。将 ESLint 升级至兼容版本后完整检查已能正常运行，并真实检出仓库既有的 13 个错误和 129 个警告，不再因插件加载崩溃而中断。

## 2026-07-16 - 收敛桌面控制栏间距与拖动职责

锚点：[桌面-窗口布局]

原因：窗口控制按钮在 chrome 内的底部留白与 chrome 到 `TopBar` 的额外全局间距处于同一视觉区域，叠加后显得过宽；窗口拖动职责也应由独立控制栏承担，而不是依赖内容顶栏。

变更：移除桌面根布局在 chrome 高度之外追加的 `--space`，让控制栏内部留白成为唯一间距；控制栏扩展为整行拖动区，按钮保持 `no-drag`，`TopBar` 显式设为 `no-drag`。

设计影响：桌面 chrome 同时负责窗口控制和拖动，`TopBar` 只负责应用内容与交互；chrome 与内容顶栏之间不再存在第二层布局间距。

验证：前端 Vitest 37 项通过，`tsc && vite build` 通过，`git diff --check` 通过；桌面开发窗口中确认 `TopBar` 紧接 chrome 边界，控制栏空白区域可执行拖动且窗口控制按钮保持独立点击命中。构建仅保留既有 Sass 弃用和 bundle 体积警告；开发启动时本机已有进程占用 `3001`，未影响前端/Electron chrome 验证。

## 2026-07-10 - 收敛执行、测量结果与跨端事件语义

锚点：[设备-驱动调用]，[执行-状态机]，[执行-计划]，[执行-展开与ETA]，[数据-SQLite]，[接口-前端契约]，[接口-事件契约]，[报告-实验记录]

原因：测量参数别名、节点可执行性、active/terminal 状态、定时解析、测量结果分类、迭代 key 和事件 payload 分别散落在真机、模拟器、Planner、Engine、UI 与报告中，同一规则需要同步修改多个位置，并已出现用户参数被默认值覆盖、未知节点静默完成、取消/暂停状态回跳、跨执行数据混桶和安全停止结果丢失等风险。

变更：新增 `runtime/execution_semantics.py`，统一节点执行注册表、执行状态谓词、绝对定时解析和 `MeasurementOutcome`；Planner 拒绝未知节点并固化 `scheduledAt`，ETA/Engine/Recorder 共用节点语义；pause/resume/cancel 校验 execution id 与 phase，取消、失败和安全停止分别记录；警告、统计和 artifact 写入 SQLite，安全停止不污染 ETA 学习。Zahner 真机与模拟器共用测量参数规范化，输出目录保持本机路径且仅在 Thales EIS 边界适配 Windows。workflow 契约补齐真实 compact 节点状态、结构化迭代、IVT 和 EIS payload，前端缓存按 execution、原节点索引和结构化迭代路径分桶。

设计影响：可执行节点能力、执行状态、定时事实和测量结果现在各有唯一后端领域入口；前端不再猜测流数据所属迭代；报告只消费持久化执行事实和按物理路径去重的输出。

验证：重新运行共享契约生成；`packages/types` 构建通过；后端完整测试 113 项通过且 `compileall` 通过；前端 Vitest 11 项、TypeScript 与 Vite production build 通过；`git diff --check` 通过。仅保留既有 `datetime.utcnow`、Sass import 和 bundle size 警告。

## 2026-07-10 - 明确 Furnace 保留段并统一前端派生与设置缓存规则

锚点：[设备-炉子程序段]，[设备-runtime状态契约]，[接口-用户设置]，[前端-派生与展示规则]，[报告-实验记录]

原因：Furnace 真机总段数与用户程序段数被混用，后三段点变温技巧缺少明确边界；同时设备就绪、执行展示、节点图表白名单、参数摘要、定时跨日、通知开关、用户设置默认值和实验记录缓存都在多个组件中重复判断。

变更：明确硬件 30 段、公开程序/预设 1-27 段、`change_temperature` 独占 28-30 段；公开读写和手动跳段保护保留段，删除无前端消费者且绕过领域校验的公开 raw parameter write 路由，点变温 scratch 温度寄存器统一按 0.1℃ 原始值写入。Furnace/MFC hooks 在应用挂载时水合 runtime status，设备入口共用 ready selectors；执行 UI 共用 selector，节点图表能力/分组/名称/报告摘要共用 presentation registry，定时选择共用跨日与 5 分钟至 24 小时边界 helper，通知开关收敛到 `appStore`。用户设置由后端默认值与归一化负责，保留显式 `false` 并避免前端整包保存后重复写 section；实验记录每次打开失效 runs、definition、report 和 map 缓存。

设计影响：后三段继续服务于点变温而不会被公开程序覆盖；设备入口、执行 UI、节点展示、用户设置和实验记录刷新不再依赖多个局部判断同步维护。

验证：Furnace 边界、点变温原始寄存器、用户设置、执行语义、事件载荷、测量参数/路径和模拟器回归均包含在后端 113 项测试中；前端定时、迭代、执行与设备 selector 共 11 项测试通过；共享类型、TypeScript、Vite build、`compileall` 与 `git diff --check` 通过。

## 2026-07-10 - 展开步骤改为权威计划浏览器并保留启动起点

锚点：[执行-展开与ETA]，[接口-前端契约]，[前端-派生与展示规则]，[前端-浮层系统]

原因：旧 modal 过滤自动边界后用可见位置编号，循环与高级分组身份会在重复工作流块间碰撞；首次启动若触发运行信息确认，modal 会提前关闭并丢失原 `startFromUnrolledIndex`。Toolbar 还把每次新建对象的派生结果直接作为 Zustand selector，导致 React 运行时无限更新。

变更：新增纯 `unrollViewModel`，保留后端步骤原序列、真实索引和系统边界，以结构化循环路径、覆盖内部循环的工作流块路径、高级父节点和连续 occurrence 生成精确展示组；重叠收起组按优先级切成无遗漏片段。modal 改为三栏步骤浏览器，支持搜索、精确收起、详情和成功后关闭。运行入口增加显式结果协议，缺少信息或失败时保留选择。Toolbar 改为订阅稳定原始字段后缓存执行 UI 派生；runtime client 的展开接口使用生成契约；参数摘要清理浮点显示噪声，同时保留小量级有效值。

设计影响：展开浏览器只适配后端 `ExecutionPlan`，不再形成第二套步骤、编号或边界事实；从某步运行的确认流程始终保留真实起点；前端派生对象不能作为不稳定 Zustand 快照直接订阅。

验证：modal/view-model/Toolbar 定向测试、前端完整 Vitest（26 项）、TypeScript、Vite build、后端完整 pytest（113 项）、`git diff --check` 和浏览器 1280/880/640px 交互检查；实际验证系统边界、精确收起、搜索、选择保留和响应式布局。

## 2026-07-10 - 节点属性面板改为节点级时间状态

锚点：[执行-状态机]，[接口-前端契约]，[前端-派生与展示规则]
原因：右侧栏时间信息此前读取工作流整体状态，选中不同节点时仍显示同一套开始、运行和结束时间，无法说明单个节点的执行进度。
变更：共享工作流契约新增 `NodeTiming` 与 `ExecutionSnapshot.nodeTimings`；`AppRuntime` 在每个展开步骤开始/结束时记录节点状态、开始时间、结束时间、预计耗时和实际耗时；RightPanel 按选中节点的 `nodeId/index` 派生未运行、运行中和终态时间内容，并将基本页顺序固定为类型、节点说明、时间，时间字段复用类型属性组样式。
设计影响：节点级时间展示必须消费后端 `nodeTimings`，不得用工作流总耗时推测节点开始或结束时间；模拟器与真机共用同一执行快照和节点计时路径。
验证：重新生成共享 TypeScript 契约；后端定向测试 34 项通过；`packages/types` 构建、前端 TypeScript/Vite 构建和 `git diff --check` 通过。

## 2026-07-14 - 收敛设备运行时快照与业务计时

锚点：[运行时-AppRuntime]，[设备-连接路由]，[设备-runtime状态契约]，[执行-状态机]，[数据-SQLite]，[接口-前端契约]
原因：Furnace/MFC 的前端显示、物理设备对象、Socket/REST 返回值和持久化记录并非同一状态源；Furnace 总时间曾可由历史样本连续运行区间推算，工作流温度节点还存在绕过 `AppRuntime` 直接写设备寄存器的旁路；MFC session 也会保留过期扫描结果。
变更：新增 `RuntimeDeviceState` 完整快照、单调 `stateVersion`、运行时状态表和生命周期事件表；连接确认、断开、通信错误、轮询和重连使用 connection generation 丢弃旧响应；Furnace 运行/暂停/恢复/停止由后端生命周期累计业务时间，工作流温度节点写入成功后回到 `AppRuntime` 确认；MFC 扫描按当前 session 替换并在空结果时清空；前端只镜像快照，显示时间由后端基线加 `Date.now()` 派生刷新，历史样本仅用于图表。
设计影响：`AppRuntime` 是设备连接、Furnace 程序状态、MFC 当前扫描集合和持久化状态的唯一可信源；前端不能创建第二套运行起点、累计时间或连接事实，重启也不能虚构物理连接和离线期间运行时间。
验证：`uv run python -m compileall -q apps/python_backend`；`PYTHONPATH=. uv run pytest -q`（120 项通过）；新增运行时一致性测试 7 项通过；`pnpm --filter @zahnerflow/types build`；`pnpm --filter zahnerflow-flowgram exec tsc --noEmit`；前端 Vitest 37 项、生产构建和运行时计时测试通过；`git diff --check`。
## 2026-07-16 - 分离 Furnace 程序速率与降温 ETA

锚点：[设备-炉子程序段]，[执行-展开与ETA]

原因：`change_temperature` 把非线性预计降温时间写入了 AI-518P 程序段时间，使 `1100→25℃、3℃/min` 的设定速率被改成约 0.7℃/min；旧 ETA 又在目标等于环境温度时用 0.1℃ 截断对数模型，产生约 1541 分钟的极端估算。

变更：新增独立线性程序时间计算，`0x51` 只写入由温差和设定速率得到的时间；ETA 改为 500℃ 以下的有界分温区冷却能力模型，计算到目标容差带并保留运行时实测斜率修正。温度节点停用缺少起始温度的精确参数历史耗时覆盖。

设计影响：程序时间只控制设备速率，ETA 只预测实际进入容差带的时间，实测温度趋势只影响等待窗口，不再反向改变炉子程序速率。

验证：合并远端仓库删除测试源码的新规则前，温度算法与执行语义定向测试 15 项、后端完整测试 125 项通过；合并后使用仓库外内联场景再次确认 `1100→25℃、3℃/min` 的程序段写入 359 分钟、含 30 秒稳定时间的初始 ETA 约 590.9 分钟；`compileall`、前端 `tsc && vite build` 与 `git diff --check` 通过。
