# 设计变更记录

本文记录会影响设计判断的变化。每条记录都必须使用 `design.md` 中的锚点。

## 2026-07-07 - 模拟端口只在开发者模拟状态开启时展示

锚点：[设备-连接路由]，[接口-前端契约]

原因：开发者模式已开启但具体设备模拟状态未开启时，设备端口列表仍能检索到 `COM_SIMULATOR` 或 `simulator`，容易让用户在真实连接路径中误选模拟端口。

变更：Furnace 与 MFC 的 `/ports` 路由只返回真实串口枚举结果并过滤 `COM_SIMULATOR`；Zahner 的 `/ports` 只返回 `localhost`。Furnace 和 MFC 连接面板只有在开发者模式开启且对应设备模拟开关同时开启时，才向端口列表注入 `COM_SIMULATOR`，并在连接时携带模拟 profile。

设计影响：真实端口发现接口不再承载模拟入口；模拟入口属于前端开发者模拟控制状态，必须显式开启后才展示和生效。后端仍保留通过 `COM_SIMULATOR` 或 `host=simulator` 连接模拟器的能力，但不会在普通端口发现中暴露这些值。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_simulator_contracts.py::test_device_port_routes_exclude_simulator_entries -q`、`uv run python -m compileall apps/python_backend`、`../../node_modules/.bin/tsc --noEmit`、`node_modules/.bin/vite build` 通过。

## 2026-07-06 - 展开预览改用后端事实并支持从展开步骤运行

锚点：[执行-状态机]，[执行-ETA与事实记录]，[接口-前端契约]

原因：“展开所有执行步骤”弹窗需要正确展示工作流块子节点，并允许用户选择某个展开步骤后从该步骤开始运行。原弹窗使用前端本地展开器，无法展开已归档工作流块，也不能保证选中的展开索引与后端真实执行步骤一致。

变更：新增 `POST /api/executions/unroll-preview`，由后端 `loop_unroller.py` 返回循环、工作流块、高级节点和自动测量边界展开后的步骤序列。后端高级节点展开为可执行的 `chronoamperometry` / `chronopotentiometry` 子步骤，并保留父高级节点元数据。执行创建请求新增 `startFromUnrolledIndex`，执行器从该展开索引开始跳过前序普通步骤；如果所选起点位于自动 `startup` 之后且后续仍有测量步骤，执行器会先执行最近的自动 `startup` 前置边界，随后从所选步骤继续执行，末尾自动 `shutdown` 仍正常执行。前端弹窗改为读取后端预览结果，隐藏自动 `startup` / `shutdown` 普通卡片，支持选择可见步骤并从所选展开索引运行，同时保留循环、高级和工作流块范围收缩能力；重叠收缩范围中优先显示工作流块摘要。

设计影响：后端展开结果成为展开预览、ETA、执行和报告的统一索引来源。前端不再把本地展开器作为“展开所有执行步骤”的事实源；从某步开始运行必须基于后端预览返回的 `unrolledIndex`。自动启动/停止是执行边界，不是用户可选择的普通展开步骤；隐藏它们不能改变执行时必须启动和停止设备的事实。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=apps/python_backend uv run pytest apps/python_backend/tests/test_loop_unroller.py -q`、`pnpm --filter @zahnerflow/types build`、`pnpm --filter zahnerflow-flowgram build` 和 `git diff --check` 通过。

## 2026-07-06 - Furnace 历史概览改为聚合加载

锚点：[数据-SQLite]，[接口-前端契约]

原因：Furnace modal 打开后后台挂载历史页会立刻拉取最近最多 60 天原始采样点，并在前端计算活动概览和默认曲线，造成实时监控首屏卡顿。历史概览只需要点数、最高温度和运行时长，不应依赖长时间范围原始点加载。

变更：新增 `/api/devices/furnace/activity-summary`，由 `device_data_service.py` 在 SQLite 查询侧按本地日期和 4 小时时段聚合采样点数、最高温度和运行时长。`FurnaceDeviceModal.tsx` 不再后台预挂载历史页；历史 tab 首次激活时只请求聚合概览；下方曲线默认不加载，用户点击有采样的日期后才请求当天原始点。

设计影响：Furnace 历史页的概览路径和曲线路径分离。宽时间范围概览使用聚合接口，日内曲线才使用原始采样接口，避免前端为了概览做大数组扫描和默认 Canvas 绘制。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_simulator_contracts.py::test_furnace_activity_summary_uses_aggregated_slots -q` 通过；执行 `uv run python -m compileall apps/python_backend` 通过；执行 `pnpm --dir apps/frontend build` 通过，仍只有既有 Sass `@import` 弃用提示和 chunk 体积提示。执行 `PYTHONPATH=. uv run pytest tests/test_simulator_contracts.py -q` 时，两个既有输出路径测试仍因把相对路径分隔符 `/` 纳入非法字符检查而失败，本次新增聚合测试已通过。

## 2026-07-03 - 修正测量输出路径与 MFC 打开刷新

锚点：[接口-前端契约]，[执行-状态机]，[设备-runtime状态契约]

原因：执行失败提示 Windows 文件名、目录名或卷标语法不正确，实际路径中包含自动工作流名产生的 `/` 与 `:`。用户设置中项目名和样品名已有输入约束，但测量节点实际构建路径时没有使用用户文件路径配置，而是把工作流名作为项目名兜底；同时 MFC 已连接时每次打开 modal 仍触发一次带 loading overlay 的设备刷新，造成页面整体刷新感。

变更：
1. `experiment_worker.build_output_path()` 新增路径片段清洗，对项目名、样品名、测试类型、工作流名、时间戳和高级节点文件夹名统一替换 Windows 非法字符。
2. 执行创建时把用户文件路径配置传入执行引擎；测量输出路径按“节点显式参数、用户设置、默认值”的顺序取 `basePath`、`projectName` 和 `individualName`。
3. 前端自动工作流名改为不含 `/` 和 `:` 的安全时间格式，避免兜底名称进入路径或历史记录时产生非法目录名。
4. MFC 打开 modal 时仍同步 runtime status，但已连接且 runtime status 已带设备列表时不再额外刷新设备列表；只有缺少设备明细时才静默后台补拉，不显示整面 loading。

设计影响：用户文件路径配置是测量输出目录的默认事实来源，后端路径构建层是最终防线。MFC modal 打开只做状态接管，不应在连接未断开的情况下制造整页刷新感。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=. uv run pytest tests/test_simulator_contracts.py -q`、`pnpm --dir apps/frontend build` 通过；新增测试覆盖项目/样品配置优先生效和未分配工作流名清洗。

## 2026-07-03 - 设备连接状态记录真实端口与连接时间

锚点：[设备-连接路由]，[设备-runtime状态契约]，[接口-前端契约]

原因：Furnace 连接真实串口时出现 Windows `PermissionError(13, 拒绝访问)`，需要区分前后端通信问题与操作系统串口占用/权限问题；同时 MFC modal 关闭后会重建组件，导致本地 `connectedAt` 状态丢失，连接时长被重置。

变更：
1. `DeviceManager` 为 Furnace、MFC 和 Zahner 记录连接事实，包括 `port`、`connectedAt`、`mode` 和模拟器 `profile`。
2. Furnace 与 MFC 连接真实串口前检查本进程内已有设备占用，除 `COM_SIMULATOR` 外禁止两个设备复用同一串口。
3. 真实串口打开失败时包装为更明确的错误信息，提示可能被外部串口工具、另一个 ZahnerFlow 实例或驱动占用，而不是把它归因于前后端通信。
4. 设备 runtime status 的 `connectionState` 返回连接端口和连接开始时间；MFC 前端 hook 从后端状态恢复已选端口和连接开始时间。
5. MFC modal 删除局部 `connectedAt` 状态，连接时长改由后端 `connectionState.connectedAt` 计算，因此关闭并重新打开 modal 不会重置连接时长。

设计影响：串口连接事实由后端运行时统一持有，设备面板只展示后端事实。真实串口拒绝访问属于 OS/驱动/外部进程占用层面的打开失败；前端不应通过重建 modal 改写连接开始时间。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=. uv run pytest tests/test_simulator_contracts.py -q`、`pnpm --dir apps/frontend build` 通过；串口模拟器冒烟确认 MFC 连接后 `connectionState` 包含 `connectedAt` 与 `port`，断开后清空。

## 2026-07-01 - 启动停止改为测量自动边界

锚点：[执行-状态机]，[执行-ETA与事实记录]，[接口-前端契约]

原因：用户要求“启动程序”和“停止程序”不再出现在节点库中；只要工作流存在测量节点，系统应自动在第一个测量节点前加载启动程序，并在最后一个测量节点后加载停止程序，避免用户手动管理仪器程序生命周期。

变更：
1. `apps/frontend/src/types/NodeConfiguration.ts` 的节点库分组移除 `startup` / `shutdown`，`LeftPanel` 额外过滤这两个节点类型，防止旧分组数据把它们重新展示出来。
2. `apps/python_backend/loop_unroller.py` 在循环和工作流块展开后识别测量节点，忽略已有手动 `startup` / `shutdown` 边界，并插入自动 `startup` 和 `shutdown` 展开步骤。
3. 前端执行启动通过 `autoStartupConfig` 传递 Zahner 自动启动连接参数；普通运行使用 `host=localhost`，模拟器运行使用 `host=simulator` 和当前模拟器 profile。该配置只属于执行请求上下文，不写入节点定义。
4. 执行、ETA、执行步骤记录和报告继续使用后端展开结果，因此自动启动/停止会进入真实执行明细，但不会写回画布节点或参与 workflow fingerprint。

设计影响：`startup` / `shutdown` 从用户可选节点变为测量工作流的自动执行边界。节点库不再展示它们；旧工作流中残留的手动边界在含测量节点的执行展开中不会造成重复连接或重复断开。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_loop_unroller.py -q` 通过；执行 `pnpm --dir packages/types build`、`../../node_modules/.bin/tsc --noEmit`、`node_modules/.bin/vite build` 通过，构建仅保留既有 Sass `@import` 弃用提示和 chunk 体积提示。

## 2026-06-30 - 新增工作流块节点

锚点：[执行-状态机]，[执行-ETA与事实记录]，[工作流-身份]，[接口-前端契约]，[报告-历史预览]

原因：用户需要在节点中组合和嵌套已有工作流，形成“工作流块”和可收缩的分组能力。v1 明确不做块内直接编辑器，不新增保存式 workflow CRUD；子工作流变体仍通过展开到画布、修改并运行后按 fingerprint 自动归档。

变更：
1. 共享契约和前端节点配置新增 `workflow_block`，作为流程控制节点出现在节点面板；属性面板可选择已归档工作流、只读预览子节点，并将子工作流可执行节点展开到当前块所在位置。
2. `WorkflowNode` 新增可选顶层 `group` 元数据；工作流块展开后的子节点带同一个分组标记，选中分组内节点时可以把连续分组收缩回 `workflow_block`。
3. 后端 `loop_unroller.py` 支持展开 `workflow_block`：读取被引用 workflow 的节点并内联为真实执行步骤；子工作流里的 `startup` 和 `shutdown` 默认忽略。
4. v1 禁止工作流块嵌套工作流块；前端检测到引用的子工作流包含 `workflow_block` 时禁用运行，后端预估和执行启动也会返回校验错误。
5. 展开后的子步骤携带 `blockPath`，ETA、执行步骤记录和报告明细都以同一套后端展开结果为准，报告中显示子步骤来自哪个工作流块。
6. 工作流 fingerprint 对 `workflow_block` 只纳入稳定的 `workflowId`，不纳入 `workflowName`、`workflowShortId`、`nodeCount` 等显示字段；顶层 `group` 元数据不进入节点参数。

设计影响：工作流块是可执行的组合节点，也是在画布上可展开/收缩的分组。v1 只是引用已归档 workflow 定义，不恢复旧工作流保存管理模型。父工作流身份随子 `workflowId` 改变而改变，子工作流重命名不改变父工作流身份。块内启动/停止节点不会重复影响设备生命周期。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=. uv run pytest tests/test_loop_unroller.py tests/test_workflow_identity.py tests/test_execution_report_payload.py -q`、`pnpm --dir packages/types build`、`../../node_modules/.bin/tsc --noEmit`、`node_modules/.bin/vite build`。

## 2026-06-30 - 定时运行改为工作流节点

锚点：[执行-状态机]，[执行-ETA与事实记录]，[接口-前端契约]

原因：工具栏同时存在“运行”“定时运行”“重置”导致运行控制分散。定时应属于工作流流程本身，而不是工具栏外部状态；用户还要求运行期间不再出现停止按钮，并且定时时间已过时不能自动继续。

变更：
1. 主工具栏删除独立“定时运行”和“停止/重置”按钮，收敛为一个主按钮：空闲显示“运行”，运行中禁用显示“运行中”，成功或失败后显示“重置”。
2. 新增流程控制节点 `scheduled_start`，加入共享 `NodeType`、节点配置、节点卡片参数显示、展开视图和报告标签。
3. 把原 `ScheduleRunner` 的翻页钟时间选择部分提取为 `ScheduleTimePicker`，工具栏不再持有本地定时器，`scheduled_start` 属性页复用该控件。
4. 后端执行引擎执行到 `scheduled_start` 时按本地 `hour`、`minute`、`nextDay` 等待；如果目标时间已经过去，节点失败并让本轮执行失败。
5. ETA 规则为 `scheduled_start` 按目标时间剩余秒数估算，过时时估算为 0，但不改变执行时的失败语义。

设计影响：定时运行成为工作流定义的一部分，随节点结构保存和归档；工具栏只表达运行/重置状态，不再承载独立调度状态。过时定时节点是执行错误，不是空操作。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`PYTHONPATH=apps/python_backend uv run python` 小检查确认过时 `scheduled_start` 抛错、`pnpm --filter @zahnerflow/types build && pnpm --filter zahnerflow-flowgram build`。

## 2026-06-30 - 实验记录中重命名工作流

锚点：[工作流-身份]，[接口-前端契约]，[报告-历史预览]

原因：画布是流程编辑面，不适合承担已归档 workflow 的命名管理。工作流名称是展示元数据，应在实验记录中修改；定义页还需要一个由节点结构和关键参数推导的系统摘要，减少用户必须手写完美名称的压力。

变更：
1. 后端新增 `POST /api/workflows/{id}/name`，只更新 `workflows.json_data.name`、`updatedAt` 和名称相关派生特征，不修改节点、不改变 fingerprint。
2. 前端 `runtimeClient.workflows.updateName` 封装该接口，实验记录的工作流定义面板提供重命名入口，并同步左侧列表、右侧定义和实验地图中的名称。
3. 删除画布上的工作流标题输入框和来源 workflow 绑定逻辑；加载历史 workflow 到画布只恢复节点和运行时名称建议，不把旧 workflow id 写回执行路径。
4. 工作流定义右侧面板新增系统摘要，由节点类型、温度、气体、测量序列、等待时间和循环数量推导，作为用户名称之外的结构化描述。

设计影响：工作流名称仍然只是展示元数据，重命名入口收敛到实验记录。画布不再维护当前 workflow id，也不承担历史 workflow 管理职责；工作流身份和执行归属继续由后端 fingerprint 决定。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_workflow_identity.py -q`、`pnpm --dir apps/frontend build`。

## 2026-06-30 - 实验历史加入工作流相似地图

锚点：[工作流-身份]，[数据-SQLite]，[报告-历史预览]，[接口-前端契约]

原因：工作流已经按 fingerprint 自动归档，但用户几个月后找回实验时，需要按结构、关键参数、同源变体和执行结果探索相似工作流。普通 hash 只能判断精确相同，不能表达“结构相似但参数略变”的关系。

变更：
1. 新增 `workflow_features.py`，从规范化工作流节点中提取 `feature_json`，包括节点类型序列、能力标签、关键数值参数摘要、循环信息和少量名称关键词。
2. `workflows` 表新增 `feature_json` 与 `feature_version`，新增 `workflow_similarity_edges` 表记录近邻工作流、相似分数和原因。
3. `resolve_or_create_workflow()` 在创建新 workflow 时写入特征，并刷新该 workflow 的前若干条近邻关系；已有 fingerprint 命中时只确保特征存在，不制造重复定义。
4. 新增 `GET /api/workflows/map`，返回实验地图所需的 workflow 节点、执行统计、能力标签和相似边，不返回 fingerprint/hash，并支持按相似度和单节点边数控制可视密度。
5. 实验历史 modal 增加“地图”模式，使用 ECharts graph 展示 workflow 之间的相似关系；点击地图节点回到对应工作流定义。

设计影响：fingerprint 仍然只负责精确身份和自动归档；相似度特征和边只是 SQLite 内的派生探索索引，不能参与执行归属，也不能替代 workflow 定义。实验地图属于实验历史入口的一种找回视图，不成为新的主界面。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_workflow_identity.py -q`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、`pnpm --dir apps/frontend build`。

## 2026-06-30 - 后端补齐循环展开与迭代事件

锚点：[执行-ETA与事实记录]，[接口-前端契约]

原因：Python 后端的 `loop_unroller.py` 仍是线性桩实现，导致循环体只计一次，ETA、进度条、执行事实和前端循环边界标签都拿不到真实展开步骤和迭代事件。

变更：
1. `loop_unroller.py` 实现 `loop_start` / `loop_end` 匹配、循环次数读取、递归展开、对象形式 `iterationPath`、展开摘要和每次迭代的 loop event 元数据。
2. `execution_engine.py` 按展开步骤执行真实节点，并在每次循环迭代第一个实际步骤前调用运行时发送 `loopiteration_start`。
3. `app_runtime.py` 新增循环迭代事件转发，前端继续通过既有 Socket.IO 事件名接收。
4. 共享契约把 `CurrentStep.iterationPath` 与 `ExecutionEtaStep.iterationPath` 改为对象数组，并重新生成 `packages/types`。
5. 前端测量流、EIS 数据和测量图表的迭代缓存 key 兼容对象路径，避免循环数据混入同一个缓存桶。

设计影响：循环边界节点仍不是实际执行步骤；后端展开后的步骤列表是 ETA、进度、执行事实和报告明细的唯一依据。前端循环进度显示依赖 `loopiteration_start`，不再需要本地推断循环迭代。

验证：执行 `PYTHONPATH=. uv run pytest tests/test_loop_unroller.py tests/test_execution_report_payload.py tests/test_simulator_contracts.py -q`、`pnpm --filter @zahnerflow/types build && pnpm --filter zahnerflow-flowgram build`。

## 2026-06-29 - 清理旧工作流管理接口残留

锚点：[工作流-身份]，[报告-历史预览]，[接口-前端契约]

原因：工作流身份已经改为后端 fingerprint 自动归档，前端工作流管理入口也收敛到实验历史弹窗。旧的保存式 workflow CRUD 和批量编辑辅助接口没有前端调用方，会让系统看起来仍支持可覆盖文档式工作流管理。

变更：
1. 前端 `runtimeClient.workflows` 删除无调用方的 `create`、`list`、`update`、`delete` 封装，仅保留实验历史和加载到画布实际使用的接口。
2. 后端删除公开的 `POST /api/workflows`、`GET /api/workflows`、`PUT /api/workflows/{id}`、`DELETE /api/workflows/{id}`、`POST /api/workflows/validate`、`POST /api/workflows/{id}/params/batch-update`、`GET /api/workflows/{id}/exists` 和 `POST /api/workflows/{id}/duplicate` 路由。
3. 保留后端内部 `resolve_or_create_workflow()`，执行创建仍通过实际节点 fingerprint 解析或创建不可变工作流定义。
4. 同步删除无消费者的前端类型导出、缓存清理导出、玻璃态实例导出、空目录，以及 `workflow_identity.py` 中未使用的短 ID / 时间辅助函数。

设计影响：当前工作流公开接口只服务实验历史浏览、加载定义、收藏切换和执行归属查询；不再暴露旧的可覆盖 workflow 文档管理面。后端自动归档能力仍由执行创建路径内部调用，不作为前端保存接口。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=. uv run pytest tests/test_workflow_identity.py`、`pnpm --dir apps/frontend build`。

## 2026-06-29 - 实验报告补齐未执行步骤

锚点：[报告-历史预览]，[接口-前端契约]

原因：失败执行的报告预览只展示后端已返回的失败步骤，缺少后续未执行节点，无法反映完整工作流流程；执行摘要使用单列表格占用高度过多。

变更：
1. 前端报告数据构建按工作流定义节点顺序合并 `unrolledSteps`，缺少执行事实的节点从 `workflowSnapshot.nodes` 补齐并标记为未执行。
2. 报告预览的执行摘要改为状态和错误信息整行、普通字段双栏的混合布局。
3. 实验历史弹窗微调顶部内容偏移、统一左侧 workflow 主项和执行记录间距，并压缩工作流定义区域的垂直留白。

设计影响：报告明细现在必须同时反映已执行步骤和失败后未执行步骤；执行事实仍来自后端，未执行节点只作为 workflow snapshot 定义补齐，不伪造成真实执行结果。

验证：执行 `pnpm --dir apps/frontend build`。

## 2026-06-29 - 实验历史补齐工作流操作

锚点：[报告-历史预览]，[工作流-身份]，[接口-前端契约]

原因：报告 modal 和工作流历史 modal 收敛后，统一的实验历史入口只剩定义与报告浏览，丢失了旧工作流历史中的收藏和加载到画布能力。用户需要继续在同一个入口中管理常用工作流并把历史定义恢复到 canvas。

变更：
1. 实验历史左侧 workflow 主项和右侧定义视图补齐收藏切换，复用 `POST /api/workflows/{id}/favorite`。
2. 右侧定义视图新增“加载到画布”，读取 `GET /api/workflows/{id}` 的节点后写入 `canvasStore`，清空选中节点，并只设置 `draftWorkflowName`。
3. 定义视图收紧为工作流操作页：去掉搜索框、隐藏默认时间戳名称和右侧短 ID，把执行统计压缩成一行仪表盘。

设计影响：实验历史是报告浏览和工作流历史操作的统一入口。加载历史工作流只恢复节点和草稿名，不恢复旧 workflow id，也不改变后端 fingerprint 归档规则；收藏仍是工作流展示元数据。

验证：执行 `pnpm --dir apps/frontend build`，并用本地页面检查实验历史弹窗。

## 2026-06-28 - 工作流身份改为 fingerprint 自动归档

锚点：[工作流-身份]，[数据-SQLite]，[报告-历史预览]

原因：旧的“新建 / 保存 / 另存为”把工作流当作可覆盖文档，新的历史与报告设计把工作流当作不可变定义。两套模型混用会导致用户加载旧工作流后修改参数或节点再运行时，执行记录仍挂在旧 `workflow_id` 下，报告快照也可能复制旧定义，破坏历史追溯。

变更：
1. 新增后端 `workflow_identity.py`，按规范化节点顺序、节点类型和参数生成 `fingerprint`，并排除名称、节点 ID、项目、操作人和设备连接注入字段。
2. `workflows` 表新增 `fingerprint` 与 `based_on_workflow_id` 字段和 fingerprint 索引。
3. 创建执行时只要请求携带 `nodes`，后端就重新计算 fingerprint：已存在则归属已有 `workflow_id`，不存在则自动创建新工作流；请求里的旧 `workflowId` 只作为 `basedOnWorkflowId` 来源。
4. 工作流更新接口提交节点变化时不再原地覆盖旧定义，而是解析或创建一个新定义；名称、收藏等展示元数据仍可更新。
5. 执行记录的 `workflow_snapshot` 改为保存本次实际执行节点和 fingerprint，避免报告读取到旧工作流定义。
6. 清空本机旧工作流、执行、步骤、报告产物、警告、ETA 学习样本和 workflow/node 计数器，以新身份规则作为历史基准。

设计影响：工作流身份现在由后端 fingerprint 自动归档决定。前端缓存的 `currentWorkflow.id` 不能作为执行归属的最终事实；相同定义会复用同一个 `workflow_id`，参数或节点变化会生成或接管另一个 `workflow_id`。报告绑定执行记录，并以执行快照追溯实际运行定义。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts`、`PYTHONPATH=. uv run pytest tests/test_workflow_identity.py tests/test_execution_report_payload.py`、`PYTHONPATH=. uv run pytest`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build`。

## 2026-06-28 - 实验历史 modal 收敛

锚点：[报告-历史预览]，[接口-前端契约]

原因：旧报告弹窗只平铺执行历史，无法按工作流维度浏览定义和统计。需要收敛为统一的"实验历史"入口，左侧 workflow 树 + 右侧定义/报告切换。

变更：
1. 后端 `workflows.py` 新增三个只读接口：`GET /api/workflows/summaries`（工作流级聚合列表）、`GET /api/workflows/{id}/executions`（某工作流的执行历史）、`GET /api/workflows/{id}/definition`（工作流定义详情含统计）。
2. 前端 `ReportGeneratorModal.tsx` 重写为实验历史 modal：左侧 workflow 树（可展开查看最近执行），右侧根据选中切换 definition 或 report 模式。
3. 工具栏按钮文案从"报告"改为"实验历史"，不再依赖 `canGenerateReport` 条件，并删除旧 `WorkflowManagerUI` / `useWorkflowHistory` 历史入口。
4. 工作流聚合统计对零执行记录返回 0，不返回空值，也不因无执行记录导致列表加载失败。
5. UI 不暴露 fingerprint/hash，不平铺 execution 为一级列表。

设计影响：实验历史入口统一为"实验历史"按钮。`/api/workflows/summaries` 成为 workflow 级列表的主要数据源。`/api/workflows/{id}/definition` 提供定义视图所需数据。报告导出仅在 report 模式可用。

验证：`PYTHONPATH=. uv run pytest tests/test_workflow_identity.py` 覆盖零执行工作流聚合和定义返回；`pnpm --dir apps/frontend build` 通过，`PYTHONPATH=. uv run python -m compileall apps/python_backend` 通过。

## 2026-06-28 - Furnace 历史查询改为活动概览

锚点：[接口-前端契约]

原因：历史查询选择较长时间范围时，实际采样可能只出现在其中几个测试时段。把整个月直接画成一张温度折线图会产生大量空白或误连线，不利于用户先判断哪天做过测试。

变更：
1. Furnace 历史查询增加按天聚合的采样活动概览，用格子颜色深浅表示当天采样量。
2. 查询后默认选中最近有数据的一天；点击有数据的日期后，下方显示该日期内的温度曲线。
3. 温度曲线保留按查询/选中范围的线性时间轴和长间隔断线能力，避免误连无采样区间。
4. Tooltip 在无数据的大段空白区不再吸附到远处采样点。

设计影响：历史查询的第一目标是定位“哪天有测试”，第二目标才是查看某一天内的温度细节；宽范围默认不再用一张大空白折线图承载全部信息。

验证：执行 `pnpm --dir apps/frontend build`。

## 2026-06-28 - Furnace 历史查看改为曲线与导出

锚点：[接口-前端契约]，[数据-SQLite]

原因：Furnace 设备页原先把实时记录和历史查询展示成表格，用户需要自己在大量行里查找变化点。当前产品方向是以图为主，把数据表格从前端页面移除，只在用户需要时导出选中时间段的数据；同时设备采样不能无限写入本地数据库。

变更：
1. Furnace 设备页的“数据记录”改为“实时曲线”，“历史数据”改为“历史曲线”。
2. 实时和历史页都只展示温度曲线，提供 CSV 导出按钮，不再在页面中展示采样表格和分页。
3. Furnace 历史接口返回程序段相关字段，供曲线 tooltip 和 CSV 导出使用。
4. Furnace 和 MFC 原始采样写入时清理 30 天以前的数据，防止本地 SQLite 因连续采样无限增长。
5. 删除已过时的前端控件目录文档，避免继续记录已经不存在的冗余文件。

设计影响：Furnace 数据查看入口从“表格查询”转为“曲线理解 + 按需导出”。设备原始采样是短期事实缓存，不是无限期历史仓库；长期历史如果需要，必须另建可降采样、可解释、字段完整的历史层。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts`、后端 pytest、`pnpm --dir apps/frontend build`。

## 2026-06-28 - 参数默认值恢复与空壳接口清理

锚点：[接口-前端契约]，[数据-SQLite]，[报告-历史预览]

原因：属性面板中的旧按钮语义是把当前参数保存为默认值，但当前产品需求是判断“当前参数是否等于默认参数”，并在有差异时恢复默认值。后端还残留若干没有前端调用、没有写入路径或只返回空数据的旧路由与维护脚本，会让 Furnace 事件、hooks 规则和独立 artifact 查询被误解为已实现能力。

变更：
1. 属性面板按钮改为“恢复默认”：仅当当前可见参数和生效默认值不一致时可点击，点击后用生效默认值整体替换当前节点参数；移除保存自定义默认值入口。
2. 工作流数值输入支持普通数字、科学计数法和 `k/K`、`m`、`M`、`u/U/μ`、`n/N` 后缀，并在写入节点配置前归一化为数值。
3. 清理前端未使用类型、工具、组件和旧统计文件；`runtimeClient.ts` 只保留当前前端实际调用的运行时入口。
4. 删除未接入的 Furnace 事件查询路由、hooks 规则查询、空 artifact 路由、旧连接状态别名路由和未接入的 Furnace 历史归档脚本；报告产物继续通过 `/api/executions/{id}/report` 返回。
5. `FurnaceDataService` 保留采样读写和段比较辅助，删除已由路由内联替代的 preset apply 方法以及没有写入入口的事件读写方法。

设计影响：当前应用不会再展示或暴露“看起来存在但实际没有写入/没有数据”的后端能力。Furnace 历史仍基于采样表；`furnace_events` 表即使存在，也不是当前活跃事件流。长期历史压缩如果重新需要，必须重新设计接入、幂等和保留字段。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、后端 pytest、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build`。

## 2026-06-27 - Furnace 温度上限统一为 1100℃

锚点：[接口-前端契约]

原因：Furnace 温度上限在不同路径中不一致：共享契约为 `1200℃`，工作流 `targetTemperature` 前端输入为 `1000℃`，程序段编辑器为 `900℃`。用户要求统一为 `1100℃`。

变更：
1. 共享契约中 `ProgramSegment.temperature` 上限和 `FurnaceConfig.max_temperature` 默认值改为 `1100℃`。
2. 前端新增 Furnace 温度限制常量，工作流温度输入和程序段编辑器共同使用 `25-1100℃`。
3. 后端新增 Furnace 温度限制模块，执行温度节点、程序段写入和预设保存都会拒绝超过 `1100℃` 的温度。
4. 同步更新前端控件目录文档中的温度输入范围。

设计影响：Furnace 用户可设温度上限只有 `1100℃` 一个口径。后续不能在契约、前端或后端局部重新保留 `900℃`、`1000℃` 或 `1200℃` 的旧限制。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build` 通过；搜索旧温度上限的代码写法无残留。

## 2026-06-26 - 实验报告改为历史浏览和事实预览

锚点：[报告-历史预览]，[接口-前端契约]，[数据-SQLite]

原因：报告功能原先只依赖前端本次会话捕获的最近一次执行，用户不能从历史工作流或执行记录中选择报告；前端还按 `originalIndex` 合并节点，循环展开后的多次执行会被压成一行；报告样式存在局部 `_report.scss` 与全局 `_report.scss` 双轨覆盖，偏离当前 `.btn`、`.select`、BEM 和设计令牌体系。

变更：
1. `ReportGeneratorModal` 改为左侧执行历史、右侧报告预览。左侧默认以 `scope=workflow` 按工作流展示最近一次执行，也可切换为全部执行和状态筛选；`executionId` 只作为内部请求参数。
2. `reportDataBuilder` 改为优先按 `unrolledSteps` 的 `unrolledIndex` 构建步骤明细，保留原节点编号、循环路径、实际耗时、估算耗时、`etaSource`、输出文件、数据点和错误信息。
3. 后端报告接口在 `unrolledSteps` 中返回 `actualSeconds`、`estimatedSeconds`、`etaSource` 和 `iterationPath`，并从 step `result` 派生测量产物路径，与 `execution_artifacts` 表内记录去重。
4. 报告导出隐藏 `executionId`，导出展开步骤、测量输出和警告明细，并补充 HTML 转义与文件名清洗。
5. 删除组件局部 `components/report/_report.scss`，把报告样式统一收敛到 `styles/_report.scss`，复用全局浮层、按钮、选择器、列表、badge 和设计令牌。

设计影响：实验报告现在是执行历史浏览器，不是最近一次执行的临时弹窗。报告内容必须以 SQLite 执行事实和 step result 为准，输出文件作为事实路径展示；环境解释仍受设备采样未执行级关联的限制。报告 UI 不得重新建立独立样式体系。

验证：执行 `pnpm --dir apps/frontend build` 通过；执行 `PYTHONPATH=. uv run --with pytest pytest tests/test_execution_report_payload.py` 通过，结果为 `2 passed`。

## 2026-06-21 - 工作流停止改为后端取消状态机

锚点：[执行-状态机]，[接口-前端契约]

原因：前端 canvas 停止按钮原先只发起取消请求并乐观结束本地运行态，后端执行引擎只设置取消标记，没有形成可见的 `cancelling` 状态，也没有区分可立即中断的等待/直流测试与不可立即打断的 EIS 设备内部测试。这样会让用户误以为流程已经停掉，但后端或设备仍可能在执行当前节点。

变更：
1. 执行引擎新增 `cancelling` 活跃态；取消请求会立即广播停止中快照，但不提前伪造完成。
2. `wait_delay` 改为分片等待并检查取消标记，可轮询的 OCP、chrono 和 ramp 测试向 Zahner 测量逻辑传入取消检查函数，模拟器也按同一规则中断非 EIS 测试。
3. EIS 节点保持不可立即中断语义：取消后等待当前 `measureEIS` 返回，当前节点按真实完成记录，随后跳过后续节点并把整轮执行记为 `cancelled`。
4. 取消 REST 路由校验请求 ID 必须等于当前活跃执行 ID，避免旧页面或旧执行 ID 误取消。
5. 前端停止按钮新增确认浮层，文案明确即时中断和等待当前 EIS 结束两种行为；`Toolbar`、`ProgressBar`、`StatusBar` 和执行状态桥均显示停止中并等待后端最终 `cancelled` 快照。

设计影响：停止工作流的权威事实来自后端执行状态机。`cancelling` 与 `running`、`paused` 一样属于活跃执行态，不能启动新执行或重置。前端不得在 DELETE 返回后直接把流程视为结束，必须等待后端快照确认最终状态。

验证：执行 `uv run python -m apps.shared.contracts.generate` 同步 `NodeStatus`；执行 `uv run python -m compileall apps/python_backend/routers/executions.py apps/python_backend/runtime apps/python_backend/devices/zahner apps/shared/contracts`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build`、`git diff --check` 通过；API 冒烟确认 20 秒 `wait_delay` 能快速取消，EIS 模拟节点取消后先进入 `cancelling` 且 `endTime` 为 `null`，等待当前 EIS 完成后整轮执行为 `cancelled`，后续 wait 节点未执行。

## 2026-06-21 - 刷新后从后端快照接管运行状态

锚点：[执行-状态机]，[设备-runtime状态契约]，[接口-前端契约]

原因：页面刷新会清空前端内存中的 canvas 节点和工作站选择，但后端可能仍在执行同一个工作流。运行中的 workflow、当前节点、设备连接状态不能靠前端本地缓存恢复，必须以后端运行事实为准。

变更：
1. `systemStateSnapshot` 补充 `nodes`、`workflowName`、`ownerName`、`workstationType`，作为刷新后接管执行的完整运行快照。
2. 启动执行时前端把当前工作站传给后端；后端运行时保存并持续随快照返回。
3. 前端收到 `running` 或 `paused` 快照后，会用后端节点恢复画布、恢复当前工作流记录并恢复工作站选择。
4. `TopNavbar` 的工作站显示改为由 App 传入的状态驱动，避免刷新后导航栏和实际工作站选择不一致。
5. Furnace 与 MFC 仍通过各自 runtime status 路由和统一设备事件恢复连接状态，不改成前端持久化。

设计影响：刷新页面不再代表放弃当前后端执行。前端可以重新接管正在运行的本地执行，但接管依据只来自后端快照和设备 runtime 状态，不能来自前端本地存档。

验证：执行 `uv run python -m compileall apps/python_backend/routers/executions.py apps/python_backend/runtime apps/shared/contracts`、`uv run python -m apps.shared.contracts.generate`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build` 通过。

## 2026-06-21 - 后端事实驱动 ETA 与倒计时

锚点：[执行-ETA与事实记录]，[执行-状态机]，[接口-前端契约]，[数据-SQLite]

原因：前端原有 `timelineCalculator.ts` 只基于画布节点静态估算，运行中 `ProgressBar` 用“前端估算总时长 - 本地墙钟时间”显示剩余时间，不能以后端真实执行为准。后端已有 `executions` 和 `execution_steps` 雏形，但节点事实写入不完整，`node_id`、`node_type`、`params`、`unrolled_index`、实际耗时和 ETA 字段没有形成可靠闭环。

变更：
1. 新增 `runtime/execution_eta.py`，负责规则估算、本机 SQLite 历史学习、参数规范化和 `params_hash` 完全匹配。
2. 新增 `runtime/execution_recorder.py`，负责写入节点开始/结束事实、实际耗时、结果和执行完成状态；成功节点才更新学习模型。
3. `execution_engine.py` 改为报告执行生命周期事实，不直接关心 ETA 存储；执行开始建立 timeline，节点开始/结束通知运行时校正 ETA。
4. `app_runtime.py` 改为组合 `systemStateSnapshot` 中的 `eta`，并移除原本混在运行时里的 `execution_steps` 写库辅助函数。
5. `database.py` 新增 `node_duration_estimates` 表，并为 `execution_steps` 补充 `params_hash`、`iteration_path`、`estimated_seconds`、`eta_source`、`actual_seconds` 等列和 `execution_id + unrolled_index` 唯一身份。
6. `workflow.py` 新增 `ExecutionEtaSnapshot`，并在 `CurrentStep` 与 `ExecutionSnapshot` 中暴露 ETA 字段；TypeScript 类型由生成器同步。
7. `ProgressBar.tsx` 不再用前端 `estimateWorkflowSeconds(nodes)` 作为运行中事实源，改为使用后端 `systemState.eta` 锚点并在本地按秒递减；删除旧前端 `workflow/timelineCalculator.ts`，仅保留通用时间格式化工具。
8. `executionStateBridge.ts` 在 reset/start 时清理旧 snapshot，并从后端 ETA 快照同步进度。
9. 新增执行前估算接口，前端在画布节点变化且未运行时向后端请求计划时长；该接口复用执行中同一套 `runtime/execution_eta.py` 规则、历史学习和设备状态，不创建执行记录。

设计影响：运行中 ETA 的权威来源变为后端执行事实，执行前计划 ETA 的权威来源也变为后端估算接口。历史模型只保存在本机，只复用完全一致参数，失败或取消节点不参与学习。后端只在执行开始、节点开始、节点结束和执行结束推送 ETA 快照；两次快照之间由前端本地倒计时展示。ETA 永远不影响执行逻辑。

验证：执行 `uv run python -m compileall apps/python_backend apps/shared/contracts` 通过；执行最小 `wait_delay` smoke 后确认 `execution_steps` 写入 `node_id/node_type/params/params_hash/estimated_seconds/actual_seconds/eta_source` 且学习表更新，随后清理临时记录；执行 `uv run python -m apps.shared.contracts.generate`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build` 通过；确认临时 `eta_smoke_exec` 数据和对应学习样本已删除。

## 2026-06-21 - 设备 runtime 状态契约统一

锚点：[设备-runtime状态契约]，[接口-前端契约]，[运行时-AppRuntime]

原因：Furnace 和 MFC 的运行时状态曾保留设备专用 Socket.IO 事件和前端专用状态 hook 逻辑。当前应用是本地单进程、单用户仪器控制程序，前后端一起演进时不应保留旧兼容事件或双轨订阅路径；同时 Furnace 与 MFC 的业务差异很大，不应合并成一个大设备 hook。

变更：
1. 新增共享契约 `apps/shared/contracts/runtime_device.py`，生成 TypeScript 文件 `packages/types/src/contracts/runtimeDevice.ts`，定义 `RuntimeDeviceStatusEnvelope`。
2. 后端 `AppRuntime` 统一通过 `deviceStatusUpdate` 发送设备状态，并新增 Furnace、MFC、Zahner 的 `/runtime/status` 路由。
3. 删除旧设备专用事件常量和旧推送路径，包括 `furnaceStatusUpdate`、`mfcStatusUpdate`、`mfcConnectionUpdate` 以及 Furnace/MFC 专用订阅名。
4. `runtimeClient.ts` 统一封装设备 runtime status 请求和 `runtimeSocket.onDeviceStatus(...)` 订阅。
5. 新增 `useRuntimeDeviceStatusSubscription.ts`，只负责设备状态订阅和按 `device` 过滤；`useFurnace.ts` 和 `useMfc.ts` 保留各自业务状态映射、历史数据和控制动作。
6. 删除死代码文件 `useDeviceState.ts`、`usePanelLayout.ts`、`eisOption.ts`、`ivtOption.ts` 及连带孤儿 `styleTokens.ts`，并清理旧类型桶文件中的事件常量转出口。

设计影响：设备实时状态现在只有一个 runtime 状态外壳和一个前端订阅规则。通信层负责 REST/Socket.IO，订阅中间层负责协议性重复，设备 hook 负责业务差异。后续新增设备时应扩展统一 envelope 和 runtime status 路由，而不是新增设备专用 WebSocket service 或旧式兼容事件。

验证：执行 `uv run python -m apps.shared.contracts.generate`、`uv run python -m compileall apps/python_backend apps/shared/contracts`、`pnpm --dir packages/types build`、`pnpm --dir apps/frontend build` 均通过；全仓搜索确认旧事件名和旧订阅名无源码残留；`git diff --check` 通过。

## 2026-06-21 - 前端目录结构规范化：canvas/report/shared 归入 components

锚点：[前端-组件目录]

原因：`src/canvas/`、`src/modules/report/`、`src/shared/` 三个顶层目录违反「所有 UI 组件归入 `src/components/`」的规则。同时删除 6 个 barrel 文件（index.ts）和若干死代码文件。

变更：
1. `src/canvas/*`（11 个文件）→ `src/components/canvas/`
2. `src/modules/report/*`（6 个文件）→ `src/components/report/`
3. `src/shared/{DataTable,Dropdown,OverlayLayer,Portal,glassEffect,loopUnroller,useDropdownPosition,useOnClickOutside}` → `src/components/shared/`
4. 删除 barrel 文件：`modules/common/index.ts`、`modules/furnace/index.ts`、`modules/mfc/index.ts`、`modules/report/index.ts`、`state/index.ts`、`workflow/index.ts`
5. 删除死代码：`shared/glassEffect.ts`、`shared/loopUnroller.ts`、`shared/useDropdownPosition.ts`、`shared/useOnClickOutside.ts`、`modules/common/DeviceConnectionPanel.tsx`
6. 更新 20+ 个组件的 import 路径

设计影响：`src/` 顶层不再有组件目录，所有 UI 组件统一在 `src/components/` 下按模块组织。

验证：`git diff --stat` 确认 55 个文件变更（+77/-432）；`git push` 成功推送到 origin/main。

## 2026-06-20 - UI 符号字符统一

锚点：[接口-前端契约]

原因：审计发现关闭按钮混用 `✕`（U+2715）和 `×`（U+00D7）共 14 处；下拉箭头混用 SVG 矢量、CSS background-image 实心三角、Unicode `▼` 三种方案，且 SVG stroke 颜色有 `var(--text-secondary)` 和 `rgba(255,255,255,0.8)` 两种写法。

变更：在 `design.md` 的 `[接口-前端契约]` 新增第 7 条（下拉箭头统一为 SVG 矢量 + `.dropdown__arrow`）和第 8 条（UI 符号字符 Unicode 码点规范）。7 个文件的 `×` 替换为 `✕`；3 个文件的 SVG stroke 硬编码替换为 `var(--text-secondary)`；UserSettingsModal 的 `▼` 替换为 SVG；`.select` 的 CSS background-image 替换为同路径 SVG data URI。

设计影响：后续新增关闭按钮必须使用 `✕`；下拉箭头必须使用 SVG 矢量；emoji 符号禁止混用带 / 不带 variation selector 的版本。

验证：`grep -rn '×' --include="*.tsx` 无 UI 残留；`grep -rn '▼' --include="*.tsx` 无残留；所有 dropdown__arrow stroke 统一为 `var(--text-secondary)`。

## 2026-06-20 - 输入框 class contract 规范

锚点：[接口-前端契约]

原因：审计发现 5 处 `<input>` / `<select>` 缺少 `.input` / `.select` 基类（FurnaceDeviceModal、ControlBar、StatusPanel、ExecutionHistoryList、UserSelector），另有 `_execution-history.scss` 中 `__filter-select` 使用亮色主题 fallback 与全局设计令牌冲突。按钮已有 `.btn` class contract，输入框缺少对等规范。

变更：在 `design.md` 的 `[接口-前端契约]` 新增第 6 条输入框规范；所有 `<input>` 必须复用 `.input` 基类，所有 `<select>` 必须复用 `.select` 基类，业务专属样式作为叠加 modifier；更新 5 个 TSX 文件补全基类；`_execution-history.scss` 的 `__filter-select` 移除亮色 fallback 由 `.select` 接管；`_furnace.scss` 新增 `.monitoring-segment-input` 和 `.preset__*` 布局样式。

设计影响：后续新增输入框必须使用 `.input` / `.select` 基类；业务 SCSS 不得重复定义输入框基础外观。

验证：`npx sass --no-source-map apps/frontend/src/styles/main.scss /dev/null` 编译通过；grep 确认所有 `<input>`（非 checkbox/radio/hidden）和 `<select>` 均有 `.input` 或 `.select` 基类。

## 2026-06-20 - 前端代码质量检查规则

锚点：[接口-前端契约]

原因：代码审计发现 barrel 文件（index.ts）残留 6 个、console.log 调试语句残留 29 处，违反了此前 `frontend-audit-cleanup-20260609` 的清理目标。需要将这两条检查项固化为持续执行的规则。

变更：在 `.memory/rules.md` 中新增「前端代码质量检查」章节，明确禁止新增 barrel 文件、要求逐步迁移已有 barrel 为直接 import、禁止保留调试用 console 输出。

设计影响：后续前端修改必须遵守 barrel 文件禁令和 console 清理要求，否则不得提交。

验证：检查 `.memory/rules.md` 包含新增的「Barrel 文件」和「Console 调试语句」两个小节。

## 2026-06-20 - 前端浮层行为层收敛

锚点：[前端-浮层系统]，[接口-前端契约]

原因：旧 `Portal` 同时承担 portal、遮罩、点击关闭、定位、穿透和视觉动画，导致 modal、dropdown、notification、chart modal 的用户交互相似但实现分裂。重构过程中曾出现 dropdown 被全屏 wrapper 影响点击、modal 默认遮黑、基础层动画与面板动画叠加等问题，因此需要把浮层基础设施的职责重新界定清楚。

变更：新增 `OverlayLayer`、`ModalLayer` 和 `FloatingLayer` 作为浮层行为层；`Portal` 保留为兼容旧调用点的薄封装；`Dropdown` 改为直接 portal 真实菜单节点，并由 trigger 与 menu 共同定义内部点击范围；基础 backdrop 改为视觉透明，基础 `.overlay-layer__content` 不再提供默认视觉动画；普通 modal 面板使用成对的 `modal_scale_in` / `modal_scale_out`，notification 与 chart modal 保持 `dropdown-in` / `dropdown-out`。

设计影响：当前浮层基础设施只负责挂载、生命周期和关闭语义。遮黑、模糊、进出场动画必须由真实业务面板或显式参数控制。新增 modal 不应重新实现外部点击、`Escape` 和关闭动画卸载；新增 dropdown 不应放入全屏 modal wrapper。

验证：执行 `pnpm --dir apps/frontend build` 通过；使用浏览器打开本地前端验证创建用户 modal 的 backdrop 为透明、wrapper 无动画、面板打开/关闭分别为 `modal_scale_in` / `modal_scale_out`；验证 workstation dropdown 可点击并可外部关闭；验证 notification 使用 `dropdown-in` / `dropdown-out`；验证 chart modal 和 tab 容器使用 `dropdown-in` / `dropdown-out` 且外部点击关闭正常。

## 2026-06-20 - 前端通信层收敛到本地运行时客户端

锚点：[接口-前端契约]，[运行时-AppRuntime]

原因：当前程序是本地单用户仪器控制程序，前端只需要调用单进程 Python 运行时。旧前端中存在多个重复通信入口、继承式设备 API 和设备专用 WebSocket service，容易把本地运行时误判成多后端架构。

变更：新增 `apps/frontend/src/runtimeClient.ts` 作为唯一前端运行时客户端，集中封装 Python 后端 REST 路由和 Socket.IO 连接；迁移用户、文件、工作流、执行、Furnace、MFC、报告和测量流调用点；删除旧 `shared/api.ts`、`services/api/client.ts`、`services/api/zahnerApi.ts`、`BaseDeviceApi.ts`、`BaseWebSocketService.ts`、Furnace/MFC API facade、Furnace/MFC 专用 WebSocket service、`workflowService.ts` 和 `workflow/websocket.service.ts`。

设计影响：前端通信层不再按旧前端结构分层，也不再从旧共享类型推导 API I/O。当前权威契约是 `apps/python_backend/routers/*.py` 和 `runtime/app_runtime.py`，前端通过 `runtimeClient.ts` 直接对接。

验证：静态搜索确认旧通信入口和 deprecated 订阅名在 `apps/frontend/src` 中无残留；执行 `../../node_modules/.bin/tsc` 通过；执行 `node_modules/.bin/vite build` 通过。

## 2026-06-19 - 归档旧 NestJS 后端

锚点：[遗留服务]，[启动-单端口]

原因：旧 NestJS 后端已经完全退出当前运行时，继续留在 `apps/backend` 会让后续维护误判它仍是工作区应用。

变更：创建根目录 `archive/`，并将 `apps/backend` 原样移动到 `archive/backend`。

设计影响：当前 `apps/` 下不再包含旧 NestJS 后端。当前后端运行时仍是 `apps/python_backend`，归档代码只能作为历史素材读取或手动迁移。

验证：检查 `apps/backend` 已不存在，`archive/backend` 已存在；`package.json` 的开发启动命令仍为 `uv run python apps/python_backend/main.py`。

## 2026-06-18 - 单 Python 后端运行时

锚点：[运行时-单进程]，[运行时-AppRuntime]，[启动-单端口]，[遗留服务]

原因：该应用是本地单用户程序。旧设计保留了额外进程边界、worker IPC 和设备服务端口，与这个前提不匹配。

变更：用进程内 `AppRuntime` 替代 worker 子进程模型；删除 `worker_manager.py` 和 `worker_process.py`；重写启动脚本，使正常启动只启动 `3001` Python 后端和开发阶段 `8083` 前端。

设计影响：当前运行时是单 Python 后端进程。旧 NestJS 和按设备拆分的 FastAPI 服务不属于正常运行时。

验证：执行 `uv run python -m compileall apps/python_backend`；后端可通过 `uv run python apps/python_backend/main.py` 启动；端口检查显示后端/设备相关端口中只有 `127.0.0.1:3001` 监听。

## 2026-06-18 - 直接设备运行时

锚点：[设备-连接路由]，[设备-真机驱动]，[接口-前端契约]

原因：设备驱动应该是普通本地对象，而不是单独启动的 FastAPI 服务；模拟器或真机选择应按设备连接参数决定，而不是按全局进程模式决定。

变更：新增炉子、MFC、Zahner 的进程内设备包装。模拟器路由现在对串口设备使用 `COM_SIMULATOR`，对 Zahner 使用 `host=simulator`。Zahner 测量逻辑已复制到 Python 后端包内，并改为包内相对导入。

设计影响：运行时直接持有设备对象，并通过直接路由处理保持前端 API 路径稳定。

验证：炉子、MFC、Zahner 的模拟器连接和状态请求均可通过 `http://127.0.0.1:3001/api/devices/...` 成功返回。

## 2026-06-18 - 本地执行状态机

锚点：[执行-状态机]，[数据-SQLite]，[接口-前端契约]

原因：运行时变为单进程后，工作流执行不再需要命令确认协议。

变更：新增进程内执行引擎，直接调用 `DeviceManager`，通过 `AppRuntime` 发送 Socket.IO 事件，并通过现有辅助层写入 SQLite。

设计影响：同一时间只允许一个活跃执行。执行状态、节点状态、设备采样和完成事件都由本地运行时负责。

验证：向 `/api/executions` 提交最小 delay 工作流后执行完成，SQLite 中对应执行记录状态为 `completed`。

## 2026-06-18 - 前端 UI 样式对齐 SCSS 设计令牌与 BEM 规范

锚点：[接口-前端契约]

原因：早期开发中 TSX 混杂了大量硬编码内联样式（高度、高斯模糊、外层定位等），且因类名与 BEM 命名割裂导致工作站选择、另存为按钮等组件样式瘫塌或部分失效；图表与 Canvas 绘图中的字体和背景色写死白色，导致亮色主题下内容完全隐形。

变更：
1. 重构并修复 `UserSettingsModal.tsx`，剔除 inline 样式并重写 nav、content 和 SMTP 的 BEM 类名，在 `_user-settings.scss` 中补充相应类定义。
2. 统一重构 `UnrollViewModal.tsx`、`FurnaceDeviceModal.tsx`、`MFCModal.tsx`，将冗余的高斯模糊、定位和阴影等内联样式提炼为 `.workspace-device-modal` 公共样式并写入 `_chart-modal.scss`。
3. 对 `MeasurementChart.tsx` 与 `FurnaceTemperatureChart.tsx` 进行自适应主题改造，移除重复的 formatPrecision 和坐标轴范围计算，使用 `getCssVariable` 动态读取 DOM 上的 CSS 变量以自适应亮/暗色主题。
4. 修正截图脚本，重新对主界面及模态窗在重构后状态进行 Playwright 捕获生成 `main_ui_refactored.png` 与 `modal_ui_refactored.png`，更新 `visual_baseline.md` 基准对比文档。

设计影响：前端组件完全解耦硬编码内联样式，统一采用 BEM 与 CSS 设计 Token 控制排版、圆角及过渡效果，图表和 Canvas 绘图层对接全局 `data-theme` 属性实现自动主题色渲染。

验证：
1. 运行 `pnpm --filter zahnerflow-flowgram build` 成功完成 Vite 静态编译打包。
2. 运行 `screenshot_temp.cjs` 自动模拟工作流添加和管式炉弹窗点击，全流程无超时，截图证实另存为按钮样式已恢复，文字和网格自适应暗/亮色主题。
