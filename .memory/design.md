# 当前设计

本文只描述 ZahnerFlow 当前正在使用的设计逻辑。它是后续修改架构、运行拓扑、数据流、接口契约、设备行为、启动行为和持久化方式时的设计入口。

最近核实：2026-07-10，核对桌面壳、前端应用骨架与 runtime client、Python 运行时、执行语义/计划/引擎/记录器、Zahner 参数与路径适配、Furnace 程序段、用户设置、共享事件与 workflow payload 契约、前端派生选择器和实验记录逻辑。

## 锚点索引

- `[产品-运行拓扑]`：Web 前端、Electron 桌面壳和 Python 运行时的当前组合方式。
- `[桌面-Electron壳]`：Electron 主进程、preload bridge 和桌面运行时边界。
- `[桌面-窗口布局]`：无边框窗口、窗口控制按钮和桌面 chrome 高度。
- `[运行时-Python后端]`：Python 后端进程承载 REST、Socket.IO 和本地运行时。
- `[运行时-AppRuntime]`：`AppRuntime` 是进程内协调对象。
- `[设备-连接路由]`：设备连接入口由连接参数决定。
- `[设备-驱动调用]`：设备驱动由 Python 运行时直接调用。
- `[设备-炉子程序段]`：Furnace 30 个硬件段中，1-27 属于用户程序，28-30 专用于点变温节点。
- `[设备-runtime状态契约]`：设备实时状态统一使用 runtime envelope。
- `[执行-状态机]`：工作流执行是本地、单用户、进程内执行。
- `[执行-计划]`：所有执行相关入口共享同一份后端 ExecutionPlan。
- `[执行-展开与ETA]`：展开、进度、ETA 和报告明细以后端展开事实为准。
- `[工作流-身份]`：工作流定义由节点结构和参数指纹确定。
- `[数据-SQLite]`：SQLite 是本地持久化边界。
- `[接口-前端契约]`：前端通过统一 runtime client 访问后端契约。
- `[接口-事件契约]`：Socket.IO 自定义事件名称由共享契约统一维护并供两端运行时引用。
- `[接口-用户设置]`：用户设置由后端默认值和归一化规则形成完整文档。
- `[前端-应用骨架]`：前端应用由顶栏、左右栏、画布、状态栏和浮层组成。
- `[前端-派生与展示规则]`：执行展示、设备就绪、节点图表能力和参数摘要使用统一选择器或配置表。
- `[前端-浮层系统]`：modal、dropdown、notification 和 chart modal 使用统一浮层边界。
- `[报告-实验记录]`：实验记录以工作流为主轴展示定义、执行、报告和地图。
- `[启动-运行入口]`：开发、桌面开发和发布构建的当前入口。

## [产品-运行拓扑]

当前规则：ZahnerFlow 当前由 React Web 前端、Electron 桌面壳和 Python 后端运行时组成。浏览器开发模式使用 Vite 前端和 Python 后端；桌面模式由 Electron 承载前端页面并管理后端进程。

归属文件：`package.json`、`apps/frontend/package.json`、`apps/desktop/package.json`、`apps/desktop/src/main.ts`、`apps/python_backend/main.py`。

允许变化：可以调整开发脚本、构建脚本或打包资源路径，但必须保持前端、桌面壳和 Python 运行时之间的职责清晰。

禁止事项：前端不得直接承担设备执行、持久化写入或后端展开事实；桌面壳不得承载业务执行状态。

## [桌面-Electron壳]

当前规则：Electron 主进程创建无系统边框 `BrowserWindow`，在开发模式加载 Vite 地址，在打包模式加载前端静态文件。主进程负责启动后端进程、停止后端进程、选择目录、返回运行时基础地址和转发窗口控制状态。

归属文件：`apps/desktop/src/main.ts`、`apps/desktop/src/preload.cts`、`apps/frontend/src/desktopBridge.ts`。

允许变化：可以扩展 preload bridge 的桌面能力，但必须通过显式 IPC 暴露，不能让前端获得 Node 运行时能力。

禁止事项：禁止在 React 组件中直接使用 Electron 或 Node API；禁止绕过 `window.zahnerflowDesktop` 新增第二套桌面桥。

## [桌面-窗口布局]

当前规则：桌面窗口使用无边框壳，窗口控制按钮由前端 `WindowControls` 渲染在主应用根区域。前端通过 `window.zahnerflowDesktop` 判断桌面环境，并在 `documentElement` 上维护 `zf-desktop-window` 和 `zf-desktop-window--expanded`。非展开桌面 chrome 高度为 `28px`，展开状态为 `40px`；这些高度通过 CSS 变量参与应用顶部留白、窗口控制高度、画布顶部和浮层定位。

归属文件：`apps/frontend/src/App.tsx`、`apps/frontend/src/components/WindowControls.tsx`、`apps/frontend/src/styles/_base.scss`、`apps/frontend/src/styles/_layout.scss`。

允许变化：可以调整窗口控制按钮视觉、桌面 chrome 变量或响应式布局，但必须以同一套 CSS 变量驱动普通窗口、展开窗口、主视图和浮层。

禁止事项：禁止在不同模式下维护两套窗口控制结构；禁止用硬编码像素绕开 `--app-chrome-h`、`--window-controls-h` 等桌面布局变量。

## [运行时-Python后端]

当前规则：Python 后端进程承载 REST、Socket.IO、设备协调、执行协调和本地持久化访问，默认监听 `127.0.0.1:3001`。

归属文件：`apps/python_backend/main.py`。

允许变化：可以调整端口来源、健康检查和启动等待逻辑，但前端与桌面壳必须通过明确的 runtime base URL 访问后端。

禁止事项：禁止让前端绕过后端直接写数据库或直接驱动设备。

## [运行时-AppRuntime]

当前规则：`AppRuntime` 是进程内唯一运行时协调器。它持有设备管理器、执行引擎、运行快照、轮询和 Socket.IO 广播。

归属文件：`apps/python_backend/runtime/app_runtime.py`。

允许变化：内部方法可以拆分到更小服务模块，但运行时事实必须仍由 `AppRuntime` 组合和广播。

禁止事项：禁止新增平行运行时协调器来持有另一套设备、执行或快照事实。

## [设备-连接路由]

当前规则：设备连接入口由连接参数决定。Furnace 与 MFC 使用串口参数连接，Zahner 使用主机参数连接；模拟入口也通过同一连接参数体系表达。

归属文件：`apps/python_backend/runtime/device_manager.py`、`apps/python_backend/routers/devices.py`、`apps/frontend/src/components/furnace/FurnaceDeviceModal.tsx`、`apps/frontend/src/components/mfc/MFCModal.tsx`。

允许变化：可以扩展设备连接参数、设备发现和错误提示，但后端必须继续做最终连接判定。

禁止事项：禁止把设备连接事实只保存在 modal 局部状态；禁止让端口占用、连接时间和连接模式脱离后端 runtime status。

## [设备-驱动调用]

当前规则：设备驱动作为 Python 对象由运行时直接调用。设备业务能力由对应设备模块实现，运行时通过 `DeviceManager` 协调连接、断开、状态读取和执行动作。所有 Zahner 真机与模拟测量先经过 `normalize_measurement_parameters`，由它统一别名、默认值、数值类型和 EIS 扫描约束；规范字段与别名同时出现时规范字段优先。EIS 的起始频率由扫描方向确定：`START_TO_MAX` 固定从低频限制开始，`START_TO_MIN` 固定从高频限制开始。输出目录在运行时保持本机逻辑路径，只有调用 Windows Thales EIS API 的边界才转换为 Windows 路径。

归属文件：`apps/python_backend/devices/**/real_device.py`、`apps/python_backend/devices/zahner/logic.py`、`apps/python_backend/devices/zahner/simulator_device.py`、`apps/python_backend/experiment_worker.py`、`apps/python_backend/runtime/device_manager.py`。

允许变化：设备模块可以独立演进硬件细节、协议处理和错误映射。

禁止事项：禁止让 UI 绕过 `DeviceManager` 直接调用设备模块；禁止在真机、模拟器、输出目录或高级节点中再维护一套测量参数别名规则；禁止把 Windows API 路径格式扩散到本机持久化路径。

## [设备-炉子程序段]

当前规则：AI-518P 真机有 30 个硬件程序段。用户程序、程序编辑器、预设和公开 program API 只能读取、写入或手动跳转到 1-27 段；28-30 段是 `change_temperature` 的内部 scratch 区，用 28 段当前温度、29/30 段目标温度把段程序转换为直接点变温。点变温写入 `0x50`、`0x52`、`0x54` 时必须使用设备的 0.1℃ 原始单位，并从第 28 段启动。状态读取仍可报告 1-30，以便界面显示当前处于点变温保留段。

校验规则：用户程序段号为 1-27，温度为 25-1100℃，时间为 `-121`、`0` 或 `1-9999` 的整数；后端 domain 校验是公开写入和预设持久化的最终边界。

归属文件：`apps/python_backend/devices/furnace/limits.py`、`apps/python_backend/runtime/device_manager.py`、`apps/python_backend/runtime/execution_engine.py`、`apps/python_backend/device_data_service.py`、`apps/python_backend/routers/devices.py`、`apps/shared/contracts/furnace.py`、`apps/frontend/src/modules/furnace/temperatureLimits.ts`、Furnace 程序与状态组件。

允许变化：可以调整点变温算法、等待模型或保留段内部编排，但必须继续把公开程序段和内部 scratch 段分开。

禁止事项：禁止公开 program/preset API 覆盖 28-30 段；禁止把硬件总段数 30 误写成用户可编辑段数；禁止对 scratch 温度寄存器按整摄氏度编码。

## [设备-runtime状态契约]

当前规则：设备实时状态统一通过 `RuntimeDeviceStatusEnvelope` 表达，并通过 Socket.IO `deviceStatusUpdate` 与 `/api/devices/{device}/runtime/status` 暴露。Furnace/MFC hooks 在应用挂载时完成一次 runtime status 水合并持续订阅，不依赖打开设备 modal。统一的是 envelope、连接事实、订阅与就绪派生规则；设备业务 payload 保留设备差异。

归属文件：`apps/shared/contracts/runtime_device.py`、`packages/types/src/contracts/runtimeDevice.ts`、`apps/python_backend/runtime/app_runtime.py`、`apps/python_backend/routers/devices.py`、`apps/frontend/src/runtimeClient.ts`、`apps/frontend/src/modules/common/useRuntimeDeviceStatusSubscription.ts`、`apps/frontend/src/modules/common/runtimeDeviceSelectors.ts`、`apps/frontend/src/modules/furnace/useFurnace.ts`、`apps/frontend/src/modules/mfc/useMfc.ts`。

允许变化：可以扩展设备类型、能力字段和 payload 字段。

禁止事项：禁止在业务 hook 中硬编码另一套设备状态事件源；禁止用前端临时状态替代后端 `connectionState`。

## [执行-状态机]

当前规则：执行是本地单用户状态机，同一时间只允许一个活跃执行。`running`、`paused`、`cancelling` 是活跃态，`completed`、`failed`、`cancelled` 是终态；后端状态判断统一由 execution semantics 提供，前端展示统一由 execution selector 派生。暂停、恢复和取消命令必须命中当前 execution id 并符合当前 phase。执行启动必须接收后端生成的 `ExecutionPlan`，执行引擎只消费计划中的步骤，不在执行过程中重新展开工作流。执行创建、取消、重置、运行中快照和刷新接管都以后端为准；快照同时携带 `nodeTimings`，记录每个展开节点的状态、开始时间、结束时间、预计时长和实际耗时，节点属性面板按选中节点读取这组事实；启动失败必须关闭已创建的 SQLite execution 记录，不能遗留 `running`。

归属文件：`apps/python_backend/runtime/execution_semantics.py`、`apps/python_backend/runtime/execution_engine.py`、`apps/python_backend/runtime/app_runtime.py`、`apps/python_backend/runtime/execution_planner.py`、`apps/python_backend/routers/executions.py`、`apps/frontend/src/state/executionStateBridge.ts`、`apps/frontend/src/App.tsx`。

允许变化：可以增强节点执行、取消、暂停、恢复和错误呈现。

禁止事项：禁止用前端本地缓存伪造执行进度、执行状态或刷新恢复事实。

## [执行-计划]

当前规则：`ExecutionPlanner` 是执行规划的唯一入口。`runtime/execution_semantics.py` 的节点注册表统一描述可执行节点的 dispatch、ETA、测量边界、可中断性和时长学习资格；Planner 必须拒绝未注册的源节点或展开步骤。Planner 解析请求中的节点或已保存工作流，调用 `loop_unroller` 完成循环、工作流块和高级节点展开，插入自动测量边界，计算 ETA 和时间线，并校验 `startFromUnrolledIndex`，最终返回 `ExecutionPlan`。工作流预览、ETA 估算、执行启动和 `ExecutionEngine` 必须使用同一份计划。

计划内容：`ExecutionPlan` 持有深拷贝后的节点快照、展开步骤、展开摘要、ETA、时间线、合法起点和为中途开始测量补回的自动 `startup` 步骤索引。`scheduled_start` 在计划阶段只解析一次绝对 `scheduledAt`，ETA 与执行等待消费同一时间；已过期时间在规划阶段拒绝。`/unroll-preview` 只读取步骤和摘要，`/estimate` 只读取 ETA 和时间线，执行创建把同一节点快照写入 execution 记录后将计划对象交给 `ExecutionEngine`；执行引擎不得重新解析、展开或估算。

归属文件：`apps/python_backend/runtime/execution_planner.py`、`apps/python_backend/loop_unroller.py`、`apps/python_backend/runtime/execution_eta.py`、`apps/python_backend/routers/executions.py`、`apps/python_backend/runtime/execution_engine.py`、`apps/python_backend/runtime/app_runtime.py`。

允许变化：可以扩展计划中的摘要、时间线、边界步骤、起点校验和 ETA 字段；可以扩展展开器支持的节点类型，但必须继续由 Planner 统一组合。

禁止事项：禁止预览、估算、启动或执行引擎各自调用 `unroll_loops` 形成第二份步骤事实；禁止前端自行推导展开步骤、自动边界或起始索引；禁止让 ETA 反向控制设备执行。

最近复核：2026-07-10，完成 ExecutionPlanner 整合并通过执行计划、展开、执行状态和工作流身份测试。

## [执行-展开与ETA]

当前规则：`loop_unroller` 负责展开机制，`ExecutionPlanner` 负责把节点解析、展开、自动测量边界、ETA、时间线和起点校验组合成唯一后端计划。循环上下文统一为结构化 `IterationPathEntry[]`；流数据和 EIS 缓存使用 `executionId -> 原节点索引 -> 结构化 iteration key`，不能用可截断字符串或当前快照猜测数据所属迭代。进度、ETA 和报告明细都以该计划及其后续执行事实为准。ETA 只用于显示，不控制执行。

展开浏览规则：`UnrollViewModal` 通过 `runtimeClient` 读取 `/unroll-preview`，`unrollViewModel` 只把后端原序列适配为三栏步骤浏览器，不重新展开、排序或编号。完整计划中的自动 `startup` / `shutdown` 保留为不可选择的系统边界，普通步骤继续使用真实 `unrolledIndex` 作为选择和启动身份；循环和高级步骤按完整结构化上下文分组，工作流块按块路径覆盖其内部全部循环，再以连续 occurrence 区分重复出现。多个收起组重叠时按 `workflow > loop > advanced` 分配精确片段，不允许出现“状态已收起但部分成员仍可见”。启动回调显式返回结果，modal 只有在后端启动成功后关闭；缺少运行信息或启动失败时保留所选起点供再次确认。

时间线规则：计划中的 `timeline.steps` 与 `eta.estimatedTotalSeconds` 来自同一次 `estimate_workflow` 计算。运行时复制计划时间线并在每个实际步骤开始或结束后更新快照；它可以依据执行事实修正剩余显示，但不得为了显示而再次展开工作流或另算一套步骤总数。

归属文件：`apps/python_backend/loop_unroller.py`、`apps/python_backend/runtime/execution_planner.py`、`apps/python_backend/runtime/execution_eta.py`、`apps/python_backend/runtime/execution_recorder.py`、`apps/python_backend/routers/executions.py`、`apps/python_backend/runtime/app_runtime.py`、`apps/frontend/src/components/UnrollViewModal.tsx`、`apps/frontend/src/components/unrollViewModel.ts`、`apps/frontend/src/types/executionControl.ts`、`apps/frontend/src/components/ProgressBar.tsx`。

允许变化：可以扩展估算规则、节点类型和报告字段。

禁止事项：禁止在前端维护另一套展开事实、过滤后重编号或用可见位置替代 `unrolledIndex`；禁止从顶层画布索引反推工作流块内部循环；禁止路由或执行引擎绕过 Planner 单独展开；禁止让 ETA 反向改变执行行为。

## [工作流-身份]

当前规则：工作流定义是不可变执行配置对象，由规范化后的节点顺序、节点类型和节点参数生成 fingerprint。名称、收藏、备注、创建时间、操作人、项目名、样品名和设备连接注入字段不参与身份判断。

归属文件：`apps/python_backend/workflow_identity.py`、`apps/python_backend/routers/workflows.py`、`apps/python_backend/workflow_features.py`。

允许变化：可以扩展 fingerprint 的规范化字段和相似度特征版本，但必须保持身份字段和展示字段分离。

禁止事项：禁止用前端传入的 `workflowId` 覆盖后端按节点计算出的执行归属。

## [数据-SQLite]

当前规则：SQLite 是本地持久化边界，保存工作流定义、执行记录、执行步骤、设备采样、ETA 样本和工作流相似索引。

归属文件：`apps/python_backend/database.py`。

允许变化：可以增加表、索引和轻量迁移。

禁止事项：禁止从前端直接访问 SQLite；禁止让未记录的本地文件成为执行事实来源。

## [接口-前端契约]

当前规则：前端通信主入口是 `apps/frontend/src/runtimeClient.ts`。共享契约先在 Python contract 中定义，再生成或同步到 `packages/types`。

归属文件：`apps/frontend/src/runtimeClient.ts`、`apps/shared/contracts/**`、`packages/types/src/contracts/**`。

允许变化：可以扩展 REST 路由、Socket.IO 事件和共享类型。

禁止事项：禁止绕开 `runtimeClient.ts` 复制一套主通信路径；契约变更禁止只改前端或只改后端。

## [接口-事件契约]

当前规则：Socket.IO 自定义事件名称由 `apps/shared/contracts/events.py` 唯一维护，并生成到 `packages/types/src/contracts/events.ts`。Python 后端和前端运行时代码必须引用这些常量，不得重复硬编码跨端事件字符串。节点状态、重置、循环迭代、IVT 流数据和 EIS 结果 payload 由 `apps/shared/contracts/workflow.py` 定义并生成 TypeScript 类型，运行时载荷必须与这些真实 compact/结构化字段一致。

归属文件：`apps/shared/contracts/events.py`、`apps/shared/contracts/__init__.py`、`apps/shared/contracts/generate.py`、`packages/types/src/contracts/events.ts`、后端 `main.py`/runtime/路由、前端 `src/eventContracts.ts` 和 runtime client/hooks/state。

允许变化：可以新增事件常量或 payload 字段并重新生成 TypeScript 文件。

禁止事项：禁止只修改生成的 TypeScript 契约；禁止在运行时新增与契约并行的事件名或局部 payload 结构；禁止把未定义的事件作为跨端协议使用。

最近复核：2026-07-10，后端和前端运行时代码已统一引用事件常量，节点状态、迭代、IVT 与 EIS payload 已按真实载荷同步共享契约。

## [接口-用户设置]

当前规则：用户设置由后端 `DEFAULT_USER_SETTINGS` 和 `normalize_user_settings` 形成完整文档；读取、整包保存和 section 保存都经过同一默认值/深合并规则，显式 `false` 不得被前端兼容逻辑改回默认值。section API 只接受已知 section。整包保存成功后返回规范设置，前端只同步本地 `UserContext` 缓存，不再紧接着重复写入 `filePath` section。

归属文件：`apps/python_backend/routers/users.py`、`apps/frontend/src/components/shared/UserContext.tsx`、`apps/frontend/src/components/user/UserSettingsModal.tsx`。

允许变化：可以增加已定义的设置字段或 section，并同步后端默认值与前端类型/界面。

禁止事项：禁止在前端加载时改写用户显式布尔值；禁止由 modal 与 context 对同一次保存各发一遍请求；禁止让未知 section 静默进入持久化文档。

## [前端-应用骨架]

当前规则：React 应用骨架由顶栏、左侧节点栏、画布、右侧属性栏、底部状态栏和浮层组成。`App.tsx` 负责组合全局 UI 状态、运行状态接管、设备 modal、模拟控制、实验记录和图表面板。

归属文件：`apps/frontend/src/App.tsx`、`apps/frontend/src/components/TopBar.tsx`、`apps/frontend/src/components/LeftPanel.tsx`、`apps/frontend/src/components/canvas/Canvas.tsx`、`apps/frontend/src/components/property/RightPanel.tsx`、`apps/frontend/src/components/BottomBar.tsx`。

允许变化：可以继续拆分局部组件和 hooks。

禁止事项：禁止让子组件重新创建全局运行事实源；禁止在组件目录外新增平行 UI 根体系。

## [前端-派生与展示规则]

当前规则：执行 phase 的标签、颜色、可重置性和 active/terminal 判断由 `deriveExecutionUiState` 统一派生；React 组件订阅稳定的 store 原始字段后缓存派生结果，Toolbar、ProgressBar 和 BottomBar 不各自解释状态，也不直接订阅每次新建对象的 selector。设备入口是否可用由 runtime device selectors 统一派生。节点是否有 IVT/EIS 图表、属于哪个图表组、显示名称和报告参数摘要由 `NODE_PRESENTATION_SPECS`/`NODE_CONFIGS` 统一定义，RightPanel、Dashboard、DataViewer、MeasurementChart、展开浏览器和报告共同消费；参数摘要对有限浮点数统一去除二进制噪声并保留有效数字，不得把小量级科学参数舍入成零。展开预览的行、组、搜索文本和收起结果由 `unrollViewModel` 统一适配。定时节点的日期转换和 5 分钟至 24 小时选择边界由 `utils/scheduledStart.ts` 统一处理。通知列表和面板开关只保存在 `appStore`。

归属文件：`apps/frontend/src/state/executionStateBridge.ts`、`apps/frontend/src/state/appStore.ts`、`apps/frontend/src/modules/common/runtimeDeviceSelectors.ts`、`apps/frontend/src/types/NodeConfiguration.ts`、`apps/frontend/src/components/unrollViewModel.ts`、`apps/frontend/src/utils/iterationPath.ts`、`apps/frontend/src/utils/scheduledStart.ts` 及其消费组件。

允许变化：可以扩展节点展示配置、状态文案和选择器，但同一业务判断必须继续由一个 selector、helper 或配置表输出。

禁止事项：禁止在页面或组件中重新维护节点类型白名单、执行状态分支、设备就绪组合条件、迭代 key、展开分组身份或定时跨日算法；禁止把每次返回新对象的派生函数直接作为 Zustand 订阅 selector。

## [前端-浮层系统]

当前规则：modal、dropdown、notification、chart modal 等浮层使用统一层级、遮罩、动画和定位边界。桌面 chrome 高度会影响浮层可用区域和顶部定位。

归属文件：`apps/frontend/src/components/shared/OverlayLayer.tsx`、`apps/frontend/src/styles/_advanced-components.scss`、`apps/frontend/src/styles/_chart-modal.scss`、`apps/frontend/src/styles/_report.scss`、`apps/frontend/src/styles/_user-settings.scss`。

允许变化：可以为具体 modal 增加专用布局，但必须遵守统一浮层层级和桌面 chrome 变量。

禁止事项：禁止在 modal 内硬编码与桌面窗口状态冲突的顶部偏移；禁止让浮层遮挡或覆盖窗口控制按钮的交互区域。

## [报告-实验记录]

当前规则：实验记录以工作流为主轴组织定义、执行、报告和相似地图。报告预览只展示后端执行事实、workflow snapshot 和可追溯的派生展示。测量结果先规范为 `MeasurementOutcome`；普通失败/取消、安全停止分别形成明确状态，其中 `stopped_safety` 是“步骤完成但带安全警告”，必须持久化原因、统计、warning 和实际 artifact，且不进入成功时长学习。报告按物理路径去重输出。实验记录 modal 每次打开都失效并重新加载本地 runs、definition、report 和 map 缓存，避免展示上次打开时的旧事实。

归属文件：`apps/python_backend/runtime/execution_semantics.py`、`apps/python_backend/runtime/execution_recorder.py`、`apps/python_backend/routers/executions.py`、`apps/python_backend/routers/workflows.py`、`apps/frontend/src/components/report/ReportGeneratorModal.tsx`、`apps/frontend/src/components/report/reportDataBuilder.ts`、`apps/frontend/src/components/report/WorkflowMapView.tsx`。

允许变化：可以扩展筛选、地图、报告导出和预览字段。

禁止事项：禁止把内部身份字段作为普通用户流程的一部分；禁止把未执行步骤伪造成执行结果。

## [启动-运行入口]

当前规则：开发入口、桌面开发入口和发布构建入口由根 `package.json` 与桌面包脚本定义。普通开发运行 Vite 前端和 Python 后端；桌面开发运行 Vite 前端和 Electron；桌面打包先构建 types、前端、桌面主进程和 Python 后端产物，再交给 `electron-builder`。

归属文件：`package.json`、`apps/desktop/package.json`、`apps/python_backend/zahnerflow-backend.spec`。

允许变化：可以调整脚本命名、构建缓存目录和平台目标。

禁止事项：禁止让发布包缺少前端静态资源、桌面主进程产物或 Python 后端产物。
