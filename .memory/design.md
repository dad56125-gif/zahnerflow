# 当前设计

本文是 ZahnerFlow 当前架构真相。它描述系统现在应该如何运行，不描述旧方案。

## 锚点索引

- `[运行时-单进程]`：一个 Python 后端进程持有运行状态。
- `[运行时-AppRuntime]`：`AppRuntime` 是进程内协调对象。
- `[设备-连接路由]`：模拟器或真机由连接参数决定。
- `[设备-真机驱动]`：真机驱动作为 Python 类导入，不作为 FastAPI 服务启动。
- `[设备-runtime状态契约]`：设备实时状态统一使用 runtime envelope。
- `[执行-状态机]`：工作流执行是本地、单用户、进程内执行。
- `[执行-ETA与事实记录]`：运行时间估算以后端执行事实为基准。
- `[工作流-身份]`：工作流定义由节点结构和参数指纹确定。
- `[数据-SQLite]`：SQLite 是本地持久化边界。
- `[接口-前端契约]`：保留面向前端的 REST 和 Socket.IO 契约。
- `[前端-组件目录]`：所有 UI 组件归入 `src/components/` 按模块组织。
- `[前端-组件拆分]`：模块内子组件的拆分原则和职责边界。
- `[前端-浮层系统]`：modal、dropdown、notification 和 chart modal 的浮层行为边界。
- `[报告-历史预览]`：实验报告以执行历史为入口，预览只展示可追溯事实。
- `[启动-单端口]`：运行时只暴露后端端口 `3001`。
- `[遗留服务]`：旧 NestJS 后端和设备 FastAPI 服务不属于当前运行时。

## [运行时-单进程]

当前规则：ZahnerFlow 的后端行为由一个 Python 后端进程承担。当前运行时没有 worker 子进程、stdin/stdout JSON 协议、命令确认层，也没有按设备拆出的微服务进程。

归属文件：

- `apps/python_backend/main.py`
- `apps/python_backend/runtime/app_runtime.py`
- `apps/python_backend/runtime/device_manager.py`
- `apps/python_backend/runtime/execution_engine.py`

允许变化：阻塞设备调用可以在同一个 Python 进程内使用 `asyncio.to_thread(...)`。

禁止事项：禁止重新引入 `worker_manager.py`、`worker_process.py`、`send_command(...)`、`cmd_*` IPC，或把设备专用后端端口作为正常运行时。

最近复核：2026-06-18，完成单进程后端整合后复核。

## [运行时-AppRuntime]

当前规则：`AppRuntime` 是唯一运行时协调器。它持有设备注册表、执行引擎、缓存状态、Socket.IO 发送、轮询和执行状态。

归属文件：

- `apps/python_backend/runtime/app_runtime.py`

允许变化：内部方法可以在归属清晰的前提下拆分成更小模块。

禁止事项：禁止添加兼容旧 worker 语义的命令桥接层。

最近复核：2026-06-18，移除 worker IPC 后复核。

## [设备-连接路由]

当前规则：模拟器或真机按设备连接参数分别选择：

- 炉子：`port == "COM_SIMULATOR"` 使用模拟器。
- MFC：`port == "COM_SIMULATOR"` 使用模拟器。
- Zahner：`host == "simulator"` 使用模拟器。

串口设备连接由 `DeviceManager` 统一记录当前连接端口和连接开始时间。除 `COM_SIMULATOR` 外，同一个真实串口不能同时被 Furnace 与 MFC 复用；运行时发现端口已被本进程内其他设备占用时必须在连接前拒绝，并提示先断开占用设备。如果 Windows 在打开串口时返回拒绝访问，应作为操作系统/外部进程串口占用或权限问题上报，而不是推断为前后端通信异常。

归属文件：

- `apps/python_backend/runtime/device_manager.py`

允许变化：可以增加更清晰的 UI 标签或参数校验，但后端仍必须由连接参数驱动。

禁止事项：禁止把 `FURNACE_MODE`、`MFC_MODE`、`ZAHNER_MODE` 等全局环境变量作为主要路由机制。

最近复核：2026-07-03，补充真实串口占用校验与连接事实记录后复核。

## [设备-真机驱动]

当前规则：真机硬件驱动是由运行时直接调用的普通 Python 类。它们不创建 FastAPI app，也不启动 `uvicorn`。

归属文件：

- `apps/python_backend/devices/furnace/real_device.py`
- `apps/python_backend/devices/mfc/real_device.py`
- `apps/python_backend/devices/zahner/real_device.py`
- `apps/python_backend/devices/zahner/logic.py`

允许变化：驱动内部可以为硬件正确性继续演进。

禁止事项：正常启动时禁止启动 `8010`、`8011`、`8000`、`8001`、`8012`、`8013` 等旧服务端口。

最近复核：2026-06-18，提取直接驱动包装后复核。

## [设备-runtime状态契约]

当前规则：Furnace、MFC 和 Zahner 的实时状态统一通过 `deviceStatusUpdate` Socket.IO 事件和 `/api/devices/{device}/runtime/status` REST 路由暴露。统一外壳由 `RuntimeDeviceStatusEnvelope` 描述，包含 `device`、`connected`、`mode`、`timestamp`、`payload`、`connectionState`、`capabilities`、`deviceCount` 和 `error`。`payload` 只承载设备专属状态，不在统一外壳中强行抹平设备业务差异。

`connectionState` 是设备连接事实的承载位置。后端应在其中返回当前连接的 `port`、`connectedAt`、`mode` 和模拟器 `profile` 等信息；前端设备面板的连接时长、已选端口恢复等展示应以后端 runtime status 为准，不能用 modal 局部状态伪造连接开始时间。

归属文件：

- `apps/shared/contracts/runtime_device.py`
- `packages/types/src/contracts/runtimeDevice.ts`
- `apps/python_backend/runtime/app_runtime.py`
- `apps/python_backend/runtime/device_manager.py`
- `apps/python_backend/routers/devices.py`
- `apps/frontend/src/runtimeClient.ts`
- `apps/frontend/src/modules/common/useRuntimeDeviceStatusSubscription.ts`
- `apps/frontend/src/modules/furnace/useFurnace.ts`
- `apps/frontend/src/modules/mfc/useMfc.ts`

允许变化：可以为新设备扩展 `RuntimeDeviceKind`、`DEVICE_CAPABILITIES` 和对应 runtime status 路由；可以在设备 hook 内继续维护设备专属状态映射、历史数据和控制动作；可以把重复的协议性订阅规则提取到 `modules/common`。

禁止事项：禁止重新引入 `furnaceStatusUpdate`、`mfcStatusUpdate`、`mfcConnectionUpdate` 或 Furnace/MFC 专用 WebSocket service；禁止为了“统一”而把 Furnace 的温度程序、MFC 的多地址流量设备等业务差异塞进一个大 hook；禁止在业务 hook 中直接硬编码设备状态事件名。

最近复核：2026-07-03，补充 connectionState 连接端口与连接开始时间后复核。

## [执行-状态机]

当前规则：同一时间只允许一个执行任务处于活跃状态。执行引擎在进程内运行，并直接调用 `DeviceManager`。

取消规则：停止工作流是后端执行状态机能力，不是前端本地清空状态。当前主工具栏不提供停止按钮；如果未来有停止入口，必须通过 `DELETE /api/executions/{id}` 请求后端取消当前真实执行。后端必须校验请求的执行 ID 与当前活跃执行一致，随后进入 `cancelling` 活跃态并继续广播 `systemStateSnapshot`。`wait_delay`、`scheduled_start` 和可在循环中检查取消标记的直流测试应尽快中断并把当前节点记为 `cancelled`；EIS 等设备内部交流测试不能被本地运行时强行打断，只能等待当前测试返回，把当前节点保留为已完成，再把后续节点全部跳过并把整轮执行记为 `cancelled`。

定时节点规则：`scheduled_start` 是流程控制节点，参数为 `hour`、`minute` 和 `nextDay`。执行引擎运行到该节点时等待到指定本地时间后继续；如果执行到该节点时目标时间已经过去，该节点必须失败并让本轮执行进入失败状态，不能自动跳过或立即继续。

工作流块规则：`workflow_block` 是流程控制节点，参数至少包含被引用的 `workflowId`。执行启动和执行前 ETA 会在后端展开工作流块，把被引用工作流中的可执行节点内联为真实步骤。v1 不支持工作流块嵌套工作流块；如果子工作流包含 `workflow_block`，前端必须禁用运行，后端预估和启动也必须拒绝。子工作流中的 `startup` 和 `shutdown` 在块展开时默认忽略，不进入 ETA、执行步骤或报告明细。

测量边界规则：`startup` 和 `shutdown` 不再作为节点库中的可选节点展示。后端执行展开时，如果展开后的步骤中存在测量节点，会忽略已有的手动 `startup` / `shutdown` 边界步骤，并自动在第一个测量步骤前插入一次 `startup`、在最后一个测量步骤后插入一次 `shutdown`。自动 `startup` 的连接参数来自执行请求的 `autoStartupConfig`，普通运行默认 `host=localhost`，模拟器运行由前端传入 `host=simulator` 和模拟器 profile；这些自动步骤不写回画布节点，不参与 workflow fingerprint。

刷新接管规则：`systemStateSnapshot` 是执行接管的权威来源。后端运行快照必须携带正在执行的 `nodes`、`workflowId`、`workflowName`、`ownerName`、`workstationType`、当前步骤和 ETA；页面刷新或 Socket 重连后，前端应使用 `running` / `paused` / `cancelling` 快照恢复画布、当前工作流和工作站选择。设备连接状态仍通过设备 runtime status 路由和 `deviceStatusUpdate` 事件恢复，禁止用前端本地存档伪造 Furnace、MFC 或工作站连接状态。

归属文件：

- `apps/python_backend/runtime/execution_engine.py`
- `apps/python_backend/runtime/app_runtime.py`
- `apps/python_backend/loop_unroller.py`
- `apps/python_backend/routers/executions.py`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/components/TopNavbar.tsx`
- `apps/frontend/src/components/Toolbar.tsx`
- `apps/frontend/src/state/executionStateBridge.ts`
- `apps/frontend/src/components/LeftPanel.tsx`
- `apps/frontend/src/types/NodeConfiguration.ts`

允许变化：可以在同一个本地执行模型内增强暂停、取消、节点处理逻辑或刷新接管字段。

禁止事项：除非本地单用户前提改变，否则禁止引入多用户执行队列、隐藏 worker 池或分布式调度；禁止依靠前端本地缓存作为执行恢复事实源。

最近复核：2026-07-01，启动/停止节点改为测量工作流的自动执行边界后复核。

## [执行-ETA与事实记录]

当前规则：执行时间估算由后端负责生成和校正，前端只展示后端 ETA 并在两次后端快照之间做本地倒计时。执行前的画布计划时长也必须通过后端估算接口生成，不能在前端另起一套估算模型。ETA 不影响执行逻辑，不用于提前结束、跳过等待或改变节点行为。

后端职责边界：

1. `apps/python_backend/runtime/execution_engine.py` 只负责按顺序执行节点、处理暂停/取消和向运行时报告执行生命周期事实。
2. `apps/python_backend/runtime/app_runtime.py` 只负责协调运行时状态、组合 `systemStateSnapshot`、发送 Socket.IO 事件和调用专门服务；它不直接写 `execution_steps`。
3. `apps/python_backend/runtime/execution_recorder.py` 只负责持久化执行事实，包括节点开始、节点结束、实际耗时、结果和执行完成状态。
4. `apps/python_backend/runtime/execution_eta.py` 只负责 ETA 规则估算、本机历史学习和参数 hash；它不控制节点执行。
5. `apps/python_backend/database.py` 只负责 SQLite schema 和轻量迁移。

ETA 规则：

- 本机 SQLite 保存历史模型，不依赖外部服务。
- 只有 `completed` 节点参与学习；`failed`、`cancelled` 或异常中断的节点只记录事实，不参与 ETA 模型。
- 历史复用只使用 `node_type + params_hash` 的完全一致匹配，不做相似参数推断。
- 参数 hash 基于后端传入执行的持续时间相关参数；文件路径、项目名、工作流时间戳等不影响运行时长的动态字段不得参与 hash。
- `wait_delay`、`scheduled_start`、温度控制、气体流量和有明确 `measurementDuration` 的节点优先用规则估算；`scheduled_start` 的 ETA 按当前本地时间到目标时间的剩余秒数估算，过时时显示 0，但执行时仍按状态机规则失败；EIS 等无固定时间节点优先用历史完全匹配，没有历史时使用 fallback。
- 后端只在执行开始、节点开始、节点结束和执行结束时推送 ETA 快照；前端运行中按 `updatedAt + estimatedRemainingSeconds` 本地读秒。
- 执行前预估通过 `POST /api/executions/estimate` 完成；前端提交当前画布节点或 workflowId，后端展开循环后复用 `runtime/execution_eta.py` 的同一套规则、历史学习和设备状态读取，只返回计划预估，不创建 execution、不写 `execution_steps`。
- `loop_start` 与 `loop_end` 是控制边界，不是实际执行步骤。后端 `loop_unroller.py` 必须按循环次数展开循环体，ETA、执行进度、`execution_steps.unrolled_index` 和报告明细都以展开后的步骤为准。
- `workflow_block` 在后端展开为被引用工作流的子步骤，展开后的子步骤携带 `blockPath`，用于进度、ETA 和报告追溯块来源。工作流块展开、循环展开、ETA 预估和真实执行必须使用同一套后端展开结果；前端展开视图只能作为预览，不能成为执行事实源。
- 普通工作流和工作流块完成展开后，测量节点会触发自动 `startup` / `shutdown` 边界步骤。ETA、执行进度、`execution_steps.unrolled_index` 和报告明细必须以包含这些自动边界步骤的后端展开结果为准；画布节点数量和 workflow fingerprint 仍以用户定义节点为准。
- 展开步骤的 `iterationPath` 使用对象数组记录循环节点、循环起始索引、当前迭代和总迭代数；运行时进入每次循环迭代时通过 `loopiteration_start` 推送 `loopStartIndex`、`iteration`、`totalIterations` 和循环体节点索引，前端只展示和缓存后端事实。

归属文件：

- `apps/python_backend/runtime/execution_engine.py`
- `apps/python_backend/runtime/app_runtime.py`
- `apps/python_backend/runtime/execution_recorder.py`
- `apps/python_backend/runtime/execution_eta.py`
- `apps/python_backend/routers/executions.py`
- `apps/python_backend/database.py`
- `apps/shared/contracts/workflow.py`
- `apps/frontend/src/components/ProgressBar.tsx`
- `apps/frontend/src/state/executionStateBridge.ts`

允许变化：可以扩展规则估算器、增加新节点类型估算规则、增加更细的置信度算法或报告展示字段；如果将来要做相似参数模型，必须先新增明确设计记录并保持不会影响执行逻辑。

禁止事项：禁止把 ETA 估算重新放回前端作为运行中事实源；禁止执行前和执行中使用两套不同估算规则；禁止让 ETA 反向控制执行；禁止把失败/取消样本写入学习模型；禁止在 `app_runtime.py` 中重新堆积数据库写入细节；禁止按 `original_index` 更新展开后的节点事实。

最近复核：2026-06-30，接入工作流块展开并让 ETA、执行事实和报告共享后端展开结果后复核。

## [工作流-身份]

当前规则：工作流定义是不可变的执行配置对象，由规范化后的节点顺序、节点类型和节点参数共同决定。系统使用后端生成的 `fingerprint` 识别工作流身份；名称、收藏、备注、创建时间、操作人、项目名、样品名、节点数据库 ID 和设备连接注入字段不参与身份判断。前端传入的 `workflowId` 只能作为“用户从哪个工作流继续编辑”的来源线索，不能作为运行归属的最终依据。

运行归属规则：

1. 创建执行时，只要请求携带 `nodes`，后端必须按这些实际节点重新计算 `fingerprint`。
2. 如果 `fingerprint` 已存在，执行记录归属已有 `workflow_id`。
3. 如果 `fingerprint` 不存在，后端自动创建新的 `workflow_id`；如果请求里带有旧 `workflowId`，新工作流记录 `basedOnWorkflowId`。
4. 如果只提供 `workflowId` 而不提供 `nodes`，后端才读取该工作流的持久化定义执行。
5. 执行记录的 `workflow_snapshot` 必须保存本次实际执行的节点和 fingerprint，不能只复制数据库里可能已经过时的工作流定义。
6. 修改工作流名称、收藏和备注只更新展示元数据，不改变 `fingerprint`。
7. 通过工作流更新接口提交节点或参数变化时，不得原地覆盖旧定义，应解析或创建一个新的不可变定义。

公开接口边界：前端不再通过 `POST /api/workflows`、`GET /api/workflows`、`PUT /api/workflows/{id}` 或 `DELETE /api/workflows/{id}` 管理可覆盖的 workflow 文档。工作流定义由执行创建路径内部按 fingerprint 解析或创建；实验记录读取 `summaries`、`executions`、`definition`、单个 definition 详情和实验地图，并允许切换收藏、修改名称等展示元数据。`POST /api/workflows/{id}/name` 只更新已存在 workflow 的名称展示元数据，不修改节点、不改变 fingerprint、不参与执行归属。

相似度规则：工作流还有一套只用于找回和探索的结构化特征，不参与精确身份判断。`feature_json` 记录节点类型序列、节点类型集合、EIS/OCP/温控/气体/等待/循环能力组合、关键数值参数摘要、循环摘要和少量名称关键词。`workflow_similarity_edges` 记录工作流之间的近邻关系和原因，用于实验地图展示。同 fingerprint 仍然只归属同一个 workflow；相似边不能创建重复定义，也不能替代执行记录归属。

工作流块身份规则：父工作流中的 `workflow_block` 只用稳定引用字段参与 fingerprint，当前为 `workflowId`。`workflowName`、`workflowShortId`、`nodeCount` 和嵌套检查缓存等显示字段不参与身份。子工作流重命名不会改变父工作流身份；父工作流切换到另一个子 `workflowId` 才改变身份。

归属文件：

- `apps/python_backend/workflow_identity.py`
- `apps/python_backend/workflow_features.py`
- `apps/python_backend/routers/workflows.py`
- `apps/python_backend/routers/executions.py`
- `apps/python_backend/database.py`

允许变化：可以继续扩展相似度特征、图谱边、搜索索引和 `basedOnWorkflowId` 的展示方式；可以调整不参与 fingerprint 的运行时字段清单，但必须保证同一实验定义不会因为模拟器或设备连接注入字段产生重复工作流。

禁止事项：禁止把前端当前缓存的 `currentWorkflow.id` 直接作为执行归属；禁止原地覆盖已有工作流定义的节点和参数；禁止用工作流名称作为唯一身份；禁止为了“另存为”制造同 fingerprint 的重复定义；禁止用相似度分数替代 fingerprint 做精确归档。

最近复核：2026-06-30，补齐工作流块节点身份规则后复核。

## [数据-SQLite]

当前规则：SQLite 是本地数据库。运行时代码通过现有数据库辅助层直接写入工作流定义、执行、设备采样和报告状态。`workflows.fingerprint` 是不可变工作流定义的去重身份，`workflows.based_on_workflow_id` 记录由旧工作流派生的新定义来源，`workflows.feature_json` 与 `workflow_similarity_edges` 是实验地图的本地派生索引。Furnace 历史预览当前读取 `furnace_metrics_recent` / `furnace_metrics_archive` 中的采样事实；历史活动概览由 `device_data_service.py` 在 SQLite 查询侧按本地日期和固定时段聚合点数、最高温度和运行时长，前端不应为了概览拉取长时间范围原始点。实时采样中的 `status_code` 是当前状态来源。`furnace_events` 当前没有活跃写入者，也不再对前端暴露查询路由，不能把它当作仍在增长的事件流。Furnace 和 MFC 原始采样只保留最近 30 天，新采样写入时会清理更老的原始点，避免本地数据库因连续采样无限增长。

归属文件：

- `apps/python_backend/database.py`
- `apps/python_backend/device_data_service.py`
- `apps/python_backend/runtime/app_runtime.py`
- `apps/python_backend/routers/workflows.py`

允许变化：当小型辅助函数能减少重复时，可以围绕 `db.conn` 增加辅助层；如果重新需要 Furnace 事件流或长期历史压缩，必须先补齐写入路径、幂等归档规则和真实调用入口。未来可以新增降采样历史层，但必须保留可视化需要的最小统计字段，而不是只保存单个温度点。

禁止事项：禁止为本地应用引入第二个持久化服务或多进程写入模型；禁止保留无调用入口、无幂等保证的后台归档脚本作为“已经接入”的维护能力；禁止让设备原始采样无限期增长。

最近复核：2026-06-30，加入实验地图派生索引表后复核。

## [接口-前端契约]

当前规则：
1. 即使后端内部实现变化，当前前端实际使用的 REST 路径和 Socket.IO 事件名也应保持稳定；没有前端调用、没有真实写入或只返回空壳数据的旧路径不属于稳定契约，应优先删除，避免误导为已实现能力。
2. 前端 UI 组件必须遵循 SCSS BEM 命名规范（如 `dropdown__option--workstation` 等）以及 CSS 变量设计令牌（Design Tokens）。严禁在 TSX 中书写硬编码内联样式（例如固定的背景色、物理字号、高斯模糊、外层定位等），应通过 CSS/SCSS 类配合设计变量处理。
3. ECharts 与 Canvas 2D 等数据绘图模块必须使用 `getComputedStyle` 动态读取 DOM 的 CSS 变量（如 `--text-secondary`, `--glass-border` 等），以防在切换主题时产生白字白线隐形缺陷。
4. 前端到 Python 运行时的通信只允许通过 `apps/frontend/src/runtimeClient.ts`。该文件是本地运行时客户端，集中封装 REST 请求和 Socket.IO 连接；不得重新拆出继承式设备 API、弱化 HTTP 客户端或设备专用 WebSocket service。
5. 按钮规范以原生 `<button>` + `.btn` class contract 为核心，不再要求或鼓励额外的 React `Button` 包装组件。标准操作按钮必须复用 `.btn` 基类、既有 modifier（如 `.btn--primary`、`.btn--secondary`、`.btn--sm`、`.btn--md`、`.btn--xs`、`.btn--icon`、`.btn--block`、`.btn--outline`、`.btn--rounded`、`.btn--round`、`.is-prominent`）以及既有子元素结构（如 `.btn-icon`、`.btn-text`）。按钮的 `size` 与 `shape` 必须解耦：`size` 只表达尺寸，默认不写 `shape` 时使用胶囊形；`shape` 必须通过独立 modifier 表达。通知按钮、关闭按钮、图标按钮与缩放按钮都属于 `.btn` 体系，不得再维持平行按钮基类。
6. 输入框规范以原生 `<input>` / `<select>` + `.input` / `.select` class contract 为核心。所有表单输入必须复用 `.input` 基类（文本、数字、日期等），所有下拉选择器必须复用 `.select` 基类。业务专属样式（如 `.segment__input`、`.preset__name-input`）作为叠加 modifier，不得替代基类。size modifier 包括 `.input--sm`、`.input--lg`；状态 modifier 包括 `.input--error`。`_ui-kit.scss` 中 `.input` / `.select` 定义为样式唯一来源，禁止在业务 SCSS 中重复定义输入框基础外观（背景、边框、圆角、focus 态）。
7. 下拉箭头统一使用 SVG inline 矢量（路径 `M -8 -3 L 0 5 L 8 -3`，stroke 使用 `var(--text-secondary)`），通过 `.dropdown__arrow` + `.is-rotated` 控制旋转。`.select` 原生箭头通过 CSS `background-image` data URI 使用同一路径。禁止使用 Unicode 字符 `▼` 作为下拉箭头；禁止在 SVG stroke 中硬编码 `rgba(...)` 颜色值。
8. UI 符号字符必须使用以下固定 Unicode 码点，禁止混用视觉相似的不同字符：
   - 关闭/移除按钮：`✕`（U+2715 HEAVY MULTIPLICATION X），禁止使用 `×`（U+00D7 MULTIPLICATION SIGN）
   - 加号：`+`（U+002B PLUS SIGN）
   - 减号：`−`（U+2212 MINUS SIGN），与加号视觉宽度匹配，禁止使用 `-`（U+002D HYPHEN-MINUS，连字符，视觉过窄）
   - 以下符号禁止混用带 / 不带 variation selector 的版本：`⚠️`、`▶️`、`⏹️`、`⏸️`、`⏭️`、`🔄`、`✏️`、`💾`、`📋`、`⏳`、`🗑️`、`✅`、`❌`、`⛔`
9. 设备 runtime 状态订阅由 `runtimeClient.ts` 和 `useRuntimeDeviceStatusSubscription.ts` 承担。业务 hook 只处理设备专属状态映射，不直接订阅 Socket.IO 原始事件名，不直接暴露 `DEVICE_STATUS_UPDATE` 常量。
10. Furnace 用户可设温度上限统一为 `1100℃`。共享契约的 `ProgramSegment.temperature` 与 `FurnaceConfig.max_temperature`、前端工作流 `targetTemperature` 输入、Furnace 程序段编辑器、后端执行温度节点、程序段写入和预设保存都必须使用同一上限；不得在任一路径保留 `900℃`、`1000℃` 或 `1200℃` 的旧上限。
11. 属性面板的参数默认值操作是“恢复默认值”：当当前可见参数与生效默认值一致时按钮禁用；当存在差异时按钮启用，点击后用生效默认值整体替换当前节点参数。该入口不得再写入新的自定义默认参数。
12. 工作流数值输入允许智能后缀解析：普通数字、科学计数法以及 `k/K`、`m`、`M`、`u/U/μ`、`n/N` 后缀必须在前端归一化为数值后再进入节点配置和后端执行路径。
13. Furnace 设备页的实时采样和历史查询以图形为主视图，前端页面不再展示原始采样表格；用户需要原始数据时，通过当前选中时间范围的导出按钮下载 CSV。历史查询的宽时间范围先通过 `/api/devices/furnace/activity-summary` 展示按天和固定时段聚合的采样活动概览，用于快速判断哪天做过测试；用户选中有采样的日期后，前端才通过 `/api/devices/furnace/samples` 拉取该日期内原始点并展示温度曲线。历史图不能把相隔多天的测试段直接连成一条连续曲线。
14. 工作流循环运行时由后端发送 `loopiteration_start` 事件；`CurrentStep.iterationPath` 和 `ExecutionEtaStep.iterationPath` 是对象数组，不再是只有序号的数字数组。
15. 已归档工作流名称只在实验记录中修改，通过 `POST /api/workflows/{id}/name` 更新后端展示元数据；画布不显示工作流标题输入框，也不维护可写回旧 workflow 的来源绑定。
16. 主工具栏运行控制收敛为一个主按钮：空闲时显示“运行”，执行成功或失败后显示“重置”，重置完成后清空执行状态并回到“运行”；运行过程中不显示停止按钮。定时运行不再是工具栏按钮，而是流程控制节点 `scheduled_start`，其参数页复用同一套翻页钟时间选择控件。
17. 工作流块节点 `workflow_block` 在前端作为流程控制节点出现。属性面板只提供已归档工作流选择、只读预览和“展开到当前位置”；展开时用子工作流的可执行节点替换当前工作流块，并保留父工作流块前后的节点。展开后的节点带顶层 `group` 元数据，选中同一连续分组内任意节点时可收缩回原工作流块。`group` 不属于节点执行参数，不参与 workflow fingerprint。v1 不提供块内直接编辑器，不新增公开保存式 workflow CRUD。当前画布引用的子工作流如果包含 `workflow_block`，主运行按钮必须禁用，原位展开按钮也必须禁用。
18. `startup` 和 `shutdown` 是后端自动测量边界，不在节点库中展示，也不应由用户在新工作流里手动创建。前端启动执行时只通过 `autoStartupConfig` 传递 Zahner 自动启动连接参数；该字段是执行请求上下文，不是节点配置，不参与工作流定义归档或 fingerprint。
19. 用户设置中的文件路径配置是测量输出路径的默认来源。`basePath`、`projectName` 和 `individualName` 随执行请求进入后端执行引擎；测量节点可用显式节点参数覆盖这些默认值。项目名和样品名输入层限制为英文、数字和下划线，但后端在最终构建目录时仍必须清洗每一个路径片段，避免工作流名、时间戳或外部输入中的 Windows 非法字符进入真实目录名。

归属文件：

- `apps/python_backend/routers/devices.py`
- `apps/python_backend/routers/executions.py`
- `apps/python_backend/routers/workflows.py`
- `apps/python_backend/main.py`
- `apps/python_backend/devices/furnace/limits.py`
- `apps/python_backend/runtime/device_manager.py`
- `apps/python_backend/runtime/execution_engine.py`
- `apps/python_backend/device_data_service.py`
- `apps/shared/contracts/furnace.py`
- `apps/frontend/src/runtimeClient.ts`
- `apps/frontend/src/state/currentWorkflowStore.ts`
- `apps/frontend/src/components/Toolbar.tsx`
- `apps/frontend/src/components/ScheduleRunner.tsx`
- `apps/frontend/src/types/NodeConfiguration.ts`
- `apps/frontend/src/components/report/ReportGeneratorModal.tsx`
- `apps/frontend/src/modules/furnace/temperatureLimits.ts`
- `apps/frontend/src/modules/furnace/segmentValidation.ts`
- `apps/frontend/src/components/property/PropertyInputs.tsx`
- `apps/frontend/src/modules/common/useRuntimeDeviceStatusSubscription.ts`
- `apps/frontend/src/styles/main.scss`
- `apps/frontend/src/styles/_tokens.css`
- `apps/frontend/src/styles/_buttons.scss`
- `apps/frontend/src/styles/_ui-kit.scss`

允许变化：路由内部实现可以重写；新组件的 SCSS 类和 CSS 变量可以扩展；数值后缀表可以在前后端契约中继续扩展，但必须保持进入设备执行前是明确数值；Furnace/MFC 可视化可以继续增加异常标记、事件时间线、局部缩放和导出格式，但默认视图仍应优先给出图和结论。

禁止事项：禁止把架构清理的副作用变成当前前端仍在使用的 API 路径破坏；禁止在 TSX 中引入硬编码内联颜色和物理字号；禁止在图表及画布中使用写死的亮色/暗色绘图背景与文本色；禁止重引入 `shared/api.ts`、`services/api/client.ts`、`services/api/zahnerApi.ts`、`BaseDeviceApi.ts`、`BaseWebSocketService.ts`、`furnaceApi.ts`、`mfcApi.ts`、`furnaceWebSocket.service.ts`、`mfcWebSocket.service.ts`、`workflowService.ts` 或 `websocket.service.ts` 作为前端通信入口；禁止新增只做 `.btn` class 映射的薄按钮包装组件；禁止在按钮 TSX 中用视觉内联样式替代 `.btn` 体系；禁止在 `<input>` / `<select>` 上省略 `.input` / `.select` 基类；禁止在业务 SCSS 中重复定义输入框基础外观样式；禁止在 SVG stroke 中硬编码 `rgba(...)` 颜色值；禁止使用 `×`（U+00D7）、`▼` 或带 / 不带 variation selector 混用的 emoji 符号。

最近复核：2026-06-30，工作流块节点接入前端契约、属性面板和运行禁用规则后复核。

## [前端-组件目录]

当前规则：所有 UI 组件必须放在 `src/components/` 下，按功能模块建立子目录。顶层 `src/` 下不允许出现组件目录。`src/components/` 根目录仅放跨模块的容器组件或被多处引用的原子组件；功能内聚的组件按模块归入子目录。

归属文件：

- `apps/frontend/src/components/`

允许变化：可以从顶层目录（如 `src/canvas/`）迁移组件到 `src/components/` 下；可以新增模块子目录。

禁止事项：禁止在 `src/` 顶层新建组件目录；禁止子目录内的组件反向引用其他子目录的内部组件。

最近复核：2026-06-20，前端文件结构规范化后复核。

## [前端-组件拆分]

当前规则：模块内子组件按以下原则拆分。当单组件超过 200 行、存在独立交互区域、或同一组件内有 3 个以上 useState 管理不同关注点时，应拆分子组件。一个子组件对应一个独立的用户操作场景。父组件持有状态、调用 API、处理错误和布局编排；子组件通过 props 接收数据和回调，负责展示和表单校验，不直接读写全局状态，不内部调用父组件已有的 API，不直接修改父组件状态。

归属文件：

- `apps/frontend/src/components/` 下所有模块子目录

允许变化：子组件可以拥有局部 UI 状态（如下拉展开、hover）；共享组件可提升到 `components/` 根目录。

禁止事项：禁止为缩短行数而无职责地拆分 JSX 片段；禁止子组件直接修改父组件状态（应通过 onChange 回调上报）。

最近复核：2026-06-20，settings 模块重构后复核。

## [前端-浮层系统]

当前规则：前端浮层分为“行为层”和“视觉层”。行为层只负责 portal 挂载、打开/关闭生命周期、关闭延迟卸载、`Escape` 关闭、点击外部关闭和触发按钮忽略；视觉层由真实面板自己的 SCSS 类控制。基础浮层不得默认加遮黑、模糊或进出场动画。

归属文件：

- `apps/frontend/src/shared/OverlayLayer.tsx`
- `apps/frontend/src/shared/Dropdown.tsx`
- `apps/frontend/src/shared/Portal.tsx`
- `apps/frontend/src/styles/_overlay-layer.scss`
- `apps/frontend/src/styles/_animations.scss`
- `apps/frontend/src/styles/_advanced-components.scss`
- `apps/frontend/src/styles/_dropdown.scss`
- `apps/frontend/src/styles/_chart-modal.scss`

使用方式：

1. 普通 modal 使用 `ModalLayer`。业务面板通过 render 函数接收 `state` 和 `close`；关闭按钮调用 `close`；外部点击由透明 backdrop 负责。`ModalLayer` 默认 backdrop 视觉透明，默认不 blur。
2. 普通 modal 的真实面板使用 `.modal__content`，或已纳入统一规则的面板类（如 `.settings`、`.workflow-manager`、`.execution-history`、`.report-modal`、`.create-user__dialog`）。打开动画为 `modal_scale_in`，关闭动画为 `modal_scale_out`，动画挂在真实面板上，不挂在 `.overlay-layer__content` 上。
3. anchored dropdown 使用 `Dropdown`，不要套 `ModalLayer` 或 `FloatingLayer`。dropdown 直接 portal 真实 `.dropdown` 节点，并把 trigger 和 menu 都视为内部范围；菜单本体必须保持 `pointer-events: auto`。
4. notification 和 chart modal 使用 `dropdown-in` / `dropdown-out` 这一套位移动画。它们可以借用 `ModalLayer` 的关闭生命周期，但视觉动画仍必须在 `.notification`、`.chart-modal`、`.chart-modal__tab-container` 等真实面板类上。
5. `Portal` 是兼容旧调用点的薄封装，不是新浮层开发的首选入口。新增 modal 应直接用 `ModalLayer`；新增 dropdown 应直接用 `Dropdown`。

允许变化：可以新增业务面板类加入普通 modal 动画规则；可以为特殊业务浮层自定义视觉动画，但必须仍复用统一关闭语义，并显式使用 `state === "closing"` 派发关闭态样式。

禁止事项：禁止在 `OverlayLayer` 或 `.overlay-layer__content` 上重新添加默认视觉动画；禁止让基础 backdrop 默认遮黑；禁止把 dropdown 放进全屏 modal wrapper；禁止把旧 `pointerEvents="none"` 语义传到真实菜单节点；禁止在业务组件里重复实现 `Escape`、外部点击关闭和延迟卸载。

最近复核：2026-06-20，统一 portal、modal、dropdown、notification 和 chart modal 的浮层行为后复核。

## [报告-历史预览]

当前规则：实验记录弹窗是”左侧 workflow 树 + 右侧定义/报告/地图”的两栏浏览器。左侧通过 `GET /api/workflows/summaries` 加载工作流级列表，标题栏可切换只看收藏工作流，也可切到实验地图；每个 workflow 可展开查看最近执行记录（默认 3 条）；点击 workflow 主项显示定义，点击执行记录显示报告。左侧 workflow 主项和右侧定义视图都允许切换收藏，收藏只更新工作流展示元数据，不改变 fingerprint。右侧 definition 模式显示系统摘要、节点流程、参数、执行统计，并提供“重命名”和“加载到画布”：重命名只更新名称展示元数据；加载时只把该定义的节点写入 canvas、清空当前选中节点并设置运行时名称建议，不把旧 workflow id 写回前端执行路径。report 模式复用 `GET /api/executions/{id}/report` 展示完整报告，工作流块展开后的子步骤必须显示其块来源；map 模式使用 `GET /api/workflows/map` 展示 workflow 节点和相似关系边，点击地图节点回到对应 workflow 定义。工具栏只保留一个”实验记录”入口，不再区分”报告”和”工作流历史”。UI 不暴露 fingerprint/hash，不平铺 execution 为一级列表。

后端接口（`apps/python_backend/routers/workflows.py`）：

- `GET /api/workflows/summaries`：工作流级聚合列表，含 shortId、nodeCount、loopCount、executionCount、latestExecution 等。
- `GET /api/workflows/{id}/executions`：某工作流的执行历史，支持 limit/offset 分页。
- `GET /api/workflows/{id}/definition`：工作流定义详情，含节点、统计和最近执行摘要。
- `GET /api/workflows/map`：实验地图数据，含 workflow 节点、执行统计、能力标签和相似关系边，不含 fingerprint/hash；支持 `limit`、`min_score` 和 `edge_limit_per_node` 控制可视密度。
- `POST /api/workflows/{id}/favorite`：切换工作流收藏状态，只影响展示元数据。
- `POST /api/workflows/{id}/name`：更新工作流名称，只影响展示元数据，不改变节点定义和 fingerprint。

可信边界：

1. 报告步骤必须优先消费后端 `unrolledSteps`，按工作流定义节点顺序归位展示展开后的执行事实，禁止按 `originalIndex` 把循环中的多次执行压回一行；如果后端步骤事实缺少失败后未执行的节点，前端必须从 `workflowSnapshot.nodes` 补齐并标记为未执行，保证报告反映完整流程。
2. 报告可以展示 `execution_steps` 中的参数、状态、开始/结束时间、实际耗时、估算耗时、`etaSource`、`iterationPath`、错误和 `result` 中的 `outputFile`、`csvPath`、`outputDir`、`data_points`。
3. 测量输出可以从 `execution_artifacts` 表或 step `result` 派生，但必须作为事实路径展示，不得伪造成已审计的数据解释。
4. Furnace 和 MFC 采样当前没有 `execution_id` 强关联。除非后端新增明确的执行级环境快照或统计，否则报告不得把设备时间窗数据写成确定属于该执行的因果结论。
5. 当用户基于旧工作流修改参数或节点后运行，报告必须绑定新解析出的 `workflow_id`，并保留 `basedOnWorkflowId` 与本次执行节点快照。

归属文件：

- `apps/python_backend/routers/executions.py`
- `apps/python_backend/routers/workflows.py`（summaries / executions / definition 接口）
- `apps/python_backend/runtime/execution_recorder.py`
- `apps/frontend/src/components/report/ReportGeneratorModal.tsx`
- `apps/frontend/src/components/report/reportDataBuilder.ts`
- `apps/frontend/src/components/report/types.ts`
- `apps/frontend/src/components/report/pdfExporter.ts`
- `apps/frontend/src/styles/_report.scss`
- `apps/frontend/src/runtimeClient.ts`
- `apps/frontend/src/state/canvasStore.ts`
- `apps/frontend/src/state/currentWorkflowStore.ts`

允许变化：可以继续增加筛选条件、导出格式、可下载产物、执行级环境统计、后端 summary metrics 和更清晰的加载确认反馈；新增解释性段落必须先有可复算数据来源。

禁止事项：禁止恢复只展示最近一次前端内存执行的报告入口；禁止恢复独立的工作流历史 modal 作为并行主入口；禁止加载历史工作流时把旧 workflow id 写回执行路径；禁止把名称更新接口扩展成节点覆盖或保存接口；禁止把工作流名称编辑入口重新放回画布；禁止在报告 UI 中暴露 `executionId` 作为用户主要选择项；禁止为报告按钮、筛选器、表格和面板重新建立独立样式体系；禁止在缺少执行级关联时写强因果实验解释；禁止在 UI 中暴露 fingerprint/hash；禁止把 run 长 ID 作为主视觉信息。

最近复核：2026-06-30，报告步骤明细补齐工作流块来源显示后复核。

## [启动-单端口]

当前规则：后端监听 `127.0.0.1:3001`。开发阶段 Vite 可以监听 `8083`，但后端和设备运行时不得暴露其他服务端口。

归属文件：

- `package.json`
- `start-all.bat`
- `start-simulator.bat`
- `apps/python_backend/main.py`

允许变化：Electron 打包时可以由 Python 后端服务已构建前端，从而移除开发专用的 `8083`。

禁止事项：禁止把 NestJS 后端或按设备拆分的 FastAPI 服务作为正常启动流程的一部分。

最近复核：2026-06-18，替换启动脚本后复核。

## [遗留服务]

当前规则：旧 NestJS 后端已经从活跃应用目录移出，归档在根目录 `archive/backend`。它只能作为历史素材读取，不能作为当前工作区包、启动目标或运行时依赖。

归属文件：

- `archive/backend/**` 是旧 NestJS 后端归档。
- `apps/python_backend/**` 是当前后端运行时。
- `start-all.bat` 和 `package.json` 定义当前活跃启动方式。

允许变化：可以把归档中的逻辑复制或迁移到 `apps/python_backend`，作为普通 Python 模块使用。

禁止事项：禁止重新在 `apps/backend` 恢复活跃后端；禁止当前应用行为依赖 `archive/backend` 工作目录、`uvicorn.run(...)` 或旧端点进程。

最近复核：2026-06-19，将旧 NestJS 后端移动到根目录 `archive/backend` 后复核。
