# 执行变更记录

- 目的：跟踪每次 TODO 变更的文件、函数与逻辑影响，便于回溯。
- 约定：每完成一个 TODO，追加一条“时间/内容/文件/函数/备注”。

## 2025-10-04 初始化
- 内容：建立执行日志与后续 TODO 清单。
- 文件/函数：
  - 新增文档：doc/EXECUTION_LOG.md（本文件）。
- 备注：后续按优先级修复编译错误与路由冲突，逐步处理并发与配置问题。

## 2025-10-04 修复编译阻塞（破损字符串）
- 内容：修复缺失引号/破损字符串，避免 TS 编译失败。
- 文件/函数：
  - apps/backend/src/app.controller.ts: 修复 `getApiInfo()` 中 endpoints 字符串（健康检查等）。
  - apps/backend/src/notification/notification.controller.ts: 重写控制器，修复返回体字符串与结构；保留原有逻辑。
  - apps/backend/src/devices/base-device.service.ts: 修复日志模板字符串（设备状态变化）。
- 逻辑影响：仅修复语法与输出，不改变业务逻辑。

## 2025-10-04 解决重复路由/模块冲突
- 内容：移除重复 GatewayModule 与 Console 控制器，避免路由冲突与混乱。
- 文件/函数：
  - 删除：apps/backend/src/modules/gateway/gateway.module.ts（重复定义）。
  - apps/backend/src/common/common.module.ts: 移除 `ConsoleDisplayManagerController` 控制器导出。
  - 删除：apps/backend/src/common/console-display-manager.controller.ts。
- 逻辑影响：Console 路由统一由 `modules/console/console.controller.ts` 提供，Gateway 只保留 `gateways/gateway.module.ts`。

## 2025-10-04 工作流ID生成去并发化
- 内容：将 `WorkflowService` 的工作流ID从计数器+时间戳改为 `crypto.randomUUID()`。
- 文件/函数：
  - apps/backend/src/modules/workflow/workflow.service.ts: `generateWorkflowId()` 改为随机UUID；`loadWorkflowsFromStorage()` 不再读取计数器。
- 逻辑影响：消除 `counter.txt` 并发条件竞争，ID 更加唯一可靠。

## 2025-10-04 存储I/O异步化
- 内容：将工作流存储读写改为 `fs.promises` 异步 I/O，避免请求路径阻塞事件循环。
- 文件/函数：
  - apps/backend/src/modules/workflow/workflow-storage.service.ts: `saveWorkflow`/`loadAllWorkflows`/`updateWorkflow`/`deleteWorkflow`/`clearStorage`/`getStorageStats` 改为异步读写；启动时目录创建仍为同步一次性调用。
- 逻辑影响：接口行为不变，响应更平滑；保留与旧计数器的兼容方法但不再依赖。

## 2025-10-04 WebSocket 心跳清理
- 内容：在 `WorkflowGateway` 实现 `OnModuleDestroy`，关闭 `healthInterval`，防止内存泄漏。
- 文件/函数：
  - apps/backend/src/gateways/workflow.gateway.ts: 新增 `onModuleDestroy()`，清理定时器。
- 逻辑影响：应用重启或模块销毁时保证计时器清理。

## 2025-10-04 同步工作流顶层字段
- 内容：在更新工作流时同步顶层 `name/description` 与 `definition` 中的同名字段，避免列表与详情不一致。
- 文件/函数：
  - apps/backend/src/modules/workflow/workflow.service.ts: `updateWorkflow()` 增加顶层字段同步逻辑。
- 逻辑影响：提升数据一致性，不改变接口形态。

## 2025-10-04 统一 CORS 策略
- 内容：WebSocket CORS 与 HTTP 保持一致，使用相同的本地白名单并启用 `credentials`。
- 文件/函数：
  - apps/backend/src/gateways/workflow.gateway.ts: `@WebSocketGateway({ cors })` 与 `main.ts` 的 CORS 对齐。
- 逻辑影响：降低跨域风险，前后端本地调试一致。

## 2025-10-04 新增数据文件登记 API
- 内容：新增 Files 模块与接口，用于按规范生成 `archive/[owner]/[individual]/[testType]/[prefix]-[cycle]-[YYYYMMDD-HHMMSS].ext` 路径，并可选创建文件与记录索引。
- 文件/函数：
  - 新增：apps/backend/src/modules/files/files.module.ts
  - 新增：apps/backend/src/modules/files/files.service.ts（`registerDataFile()` 创建目录、文件和索引 data/files/index.json）
  - 新增：apps/backend/src/modules/files/files.controller.ts（POST `api/files/register`）
  - 修改：apps/backend/src/app.module.ts（引入 FilesModule）
- 逻辑影响：后端提供统一的数据文件落盘与登记服务，便于检索与清理。

## 2025-10-04 数据库与文件组织对齐（DataBaseNew）
- 内容：依据《doc/DataBaseNew/简化数据库与文件组织方案.md》完善数据库唯一约束与常用索引；确保批量节点参数更新后，同步写入 DB 的 node/node_param 结构。
- 文件/函数：
  - apps/backend/src/db/db.service.ts：
    - 为 `workflow` 增加唯一索引 `UNIQUE(owner_name, individual_name, title)` 与检索索引 `(owner_name, individual_name)`。
    - 为 `data_file` 增加组合检索索引 `(owner_name, individual_name, test_type)`。
  - apps/backend/src/modules/workflow/workflow.service.ts：
    - 在 `batchUpdateNodeParam(...)` 末尾新增 `await this.db.upsertWorkflow(wf as any);`，将内存与 JSON 改动同步展平落表至 `node/node_param`。
- 逻辑影响：
  - 提升基于归属人/个体/标题与测试类型的检索效率与一致性。
  - 确保批量参数变更后，DB 与 JSON 存储保持一致，便于 SQL 侧统计与批处理。

## 2025-10-04 构建校验
- 内容：后端构建通过，索引/约束由启动迁移自动创建。
- 命令：
  - 构建：`pnpm --filter backend build`
  - 启动：`pnpm --filter backend start:dev`

## 2025-10-05 非阻塞冒烟启动与 Agent 指南
- 内容：为避免脚本执行“卡住”，在后端启动逻辑中加入 `SMOKETEST` 开关；新增 `pnpm --filter backend smoke` 脚本；创建根级 `AGENTS.md`，明确构建/运行/冒烟规则与 Windows PowerShell 组合命令规范。
- 文件/函数：
  - apps/backend/src/main.ts：加入 `SMOKETEST` 分支，启动成功后输出就绪标记并关闭应用，确保非阻塞退出。
  - apps/backend/package.json：新增脚本 `smoke`。
  - AGENTS.md：新增文件，记录脚本构建与冒烟规则，包含 PowerShell/CMD/Bash 示例。
- 验证：
  - PowerShell：`& { pnpm --filter backend build; $env:SMOKETEST='1'; node apps/backend/dist/main.js }` 正常输出并退出码为 0。
  - 脚本：`pnpm --filter backend smoke` 可跨平台执行冒烟，不常驻。

## 2025-10-05 数据库查询与实时事件（API + SSE）
- 内容：为 JSON 索引数据库补齐丰富查表能力与实时查看输入内容：新增分页过滤查询接口与 SSE 事件流；Files/Workflow 写入时发出事件。
- 文件/函数：
  - apps/backend/src/db/db.service.ts：
    - 新增事件流（Subject）与最近事件缓冲；`getEvents()`/`getRecentEvents()`；
    - 新增查询方法：`queryWorkflows`/`queryDataFiles`/`queryNodes`/`queryNodeParams`；
    - 在 `upsertWorkflow`/`insertDataFile` 写入后 `pushEvent()` 发送事件；
    - 支持 `DB_JSON_PATH` 环境变量以便测试隔离。
  - apps/backend/src/db/db.controller.ts：
    - 新增 REST 查询：`GET /api/db/workflows|data-files|nodes|node-params`（支持过滤、排序、分页）。
    - 新增事件：`GET /api/db/events/recent` 与 `SSE /api/db/events/stream`（实时查看输入内容）。
- 影响：
  - 与后端同端口提供查询/事件能力；前端可直接消费 SSE 实时流或拉取最近事件。

## 2025-10-05 测试覆盖（输入/查询/输出）
- 内容：添加单元与集成测试，覆盖输入（写入）、查询（过滤/分页）、输出（事件流）核心路径。
- 文件：
  - test/code/backend/db.service.test.ts：服务层单测（工作流写入、数据文件写入、查询、事件）。
  - test/code/backend/db.controller.test.ts：控制器层集成测（直接调用方法验证返回结构与过滤）。
- 运行：`pnpm test:backend` 全部通过。

## 2025-10-05 前端接入评估与建议
- 结论：非必需。后端已内置 UI（`/db-ui.html`）可直接查看与检索数据库；若追求统一体验，建议在前端追加只读数据浏览面板与事件流视图。
- 建议接入范围（可选）：
  - 数据浏览页：调用 `GET /api/db/workflows|data-files|nodes|node-params`，支持过滤/分页；
  - 实时事件视图：通过 SSE `GET /api/db/events/stream` 展示新写入（workflow/data_file）。
- 前端改动点（最小化）：
  - 新增 API 客户端与 stores：`useDbBrowserStore`（含分页/过滤状态）；
  - 新增页面/组件：`DbBrowserView`（Workflows/DataFiles/Nodes/NodeParams 四个选项卡）、`DbEventsView`（SSE 日志）；
  - 类型沿用 `@zahnerflow/types` 现有结构，纯只读不改后端。
- 验证方式：
  - 本地开发：`pnpm --filter frontend dev`，通过代理访问后端 `/api/db/*`；
  - 或直接打开后端内置页面：`http://localhost:3001/db-ui.html` 进行验收。

## 2025-10-04 启动后端
- 内容：执行构建并启动后端（开发模式）。
- 命令：
  - 构建：`pnpm --filter backend build`
  - 启动：`pnpm --filter backend start:dev`

## 2025-10-04 后端运行与烟囱验证
- 内容：以非阻塞方式启动后端，完成健康检查与 Files API 端到端验证。
- 文件/函数：
  - 运行：node apps/backend/dist/main.js（通过 Start-Process 后台启动）
  - 健康检查：GET http://localhost:3001/health（返回 healthy）
  - 新接口验证：POST http://localhost:3001/api/files/register
    - Body: { ownerName:"alice", individualName:"Cell-01", testType:"eis", prefix:"expA", cycle:5, createEmpty:true, extension:"dat" }
    - 结果：生成文件 archive/alice/Cell-01/eis/expA-005-YYYYMMDD-HHMMSS.dat，并写入 data/files/index.json
- 备注：烟囱验证指选取一条最小端到端路径（接口→服务→文件系统），验证链路整体可用。
## 2025-10-05 Hook（插入）节点方案落地文档与代码核对
- 内容：按“必须与循环节点绑定”的要求，输出 Hook 规则与执行期插入方案文档；基于实际代码完成执行器与循环现状核对，并给出最小侵入改造清单与具体落点。
- 文件/函数：
  - 新增文档：
    - doc/HookNode/README.md（方案总览、约束、示例、API 建议）
    - doc/HookNode/01-spec.md（DTO、API、事件与校验规则）
    - doc/HookNode/02-engine-integration.md（代码级核对与对接点、伪代码、测试策略）
  - 现状核对的关键代码位置：
    - apps/backend/src/modules/execution/execution.service.ts:211（executeNodes 顺序执行，未实现循环）
    - apps/backend/src/modules/execution/execution.service.ts:255（executeNode 节点分派）
    - apps/backend/src/modules/execution/execution.service.ts:384（executeLoopStart 仅日志）
    - apps/backend/src/modules/execution/execution.service.ts:390（executeLoopEnd 仅日志）
    - apps/backend/src/db/db.service.ts:104（getEvents）/108（pushEvent）
    - apps/backend/src/db/db.controller.ts:117（SSE 端点 events/stream）
- 备注：本次仅输出文档与对接点，不改任何代码；后续如同意，将基于 02-engine-integration.md 的清单实施最小改动（while+队列+LoopStack+HookEvaluator），并推送 hook_* 事件到现有 SSE。

## 2025-10-05 实施 Step 1：DbService.emit 封装
- 内容：为统一事件出口，新增 `DbService.emit(type, payload)` 对外封装（内部调用 `pushEvent`）。
- 文件/函数：apps/backend/src/db/db.service.ts: `emit()` 新增。
- 影响：执行器可直接向 `/api/db/events/stream` 推送 `hook_*` 等事件。

## 2025-10-05 实施 Step 2：Execution 注入 DbModule
- 内容：将 `DbModule` 注入 `ExecutionModule`，以便 `ExecutionService` 注入 `DbService`。
- 文件/函数：apps/backend/src/modules/execution/execution.module.ts 引入 `DbModule`。
- 影响：解耦事件推送逻辑，便于后续 HookEvaluator 发送事件。

## 2025-10-05 实施 Step 3：指令队列 + 循环栈（executeNodesV2）
- 内容：新增 `executeNodesV2`，使用 while+队列执行模型并实现 LoopStack（最多5层），支持 `loop_start/loop_end` 的迭代语义；保留原 `executeNodes`，在 `executeWorkflow` 切换调用 V2。
- 文件/函数：
  - apps/backend/src/modules/execution/execution.service.ts：`executeWorkflow()` 调用改为 `executeNodesV2()`；新增 `executeNodesV2()`、`buildLoopBoundaries()`、`getLoopParams()`、`materializeNode()`、`evaluateHooks()`。
- 影响：工作流中的循环开始具备实际迭代效果，后续 Hook 插入可基于迭代上下文生效。

## 2025-10-05 实施 Step 4：HookEvaluator（文件规则加载）
- 内容：在 `onModuleInit()` 加载 `data/hooks/hooks.json`（或 `HOOKS_JSON_PATH`）的规则作为内存 HookRegistry；仅评估 `after_node` 触发；插入节点带 `origin='hook'` 避免递归。
- 文件/函数：apps/backend/src/modules/execution/execution.service.ts：`loadHookRulesFromFile()`、`evaluateHooks()`。
- 影响：当存在规则文件时，将在匹配迭代中对命中节点执行“就近插入”，并通过 `DbService.emit` 推送 `hook_insert_planned/applied/suppressed`。

## 2025-10-05 验证：写入示例规则 + smoke + 双重嵌套运行
- 内容：
  - 写入规则文件：`data/hooks/hooks.json`，绑定外层循环 `loop_id = 'outer'`，在每次命中 `delay` 节点后插入 `delay(10ms)`；周期 `every=2` → 后续改为 `every=1` 便于观测。
  - smoke：`& { pnpm --filter backend build; $env:SMOKETEST='1'; node apps/backend/dist/main.js }` 通过。
  - 运行：启动后端，创建双重嵌套工作流（outer(2) x inner(2) + delay），执行一次并读取结果。
- 命令与结果要点：
  - 创建工作流：POST `/api/workflows` → 返回 `workflow_7be94747-3f6c-42ce-a8f3-631b154aea2a`
  - 执行工作流：POST `/api/executions` → 返回 `results_count=17`（基线应为 16，出现 +1 说明 Hook 已插入临时节点）
  - 尝试读取 SSE 事件 `/api/db/events/recent` 未见 `hook_*` 事件（原因：DbService 在不同模块实例化可能导致 emit 的事件与查询端不在同一缓冲区；建议后续将 DbModule 标记为 @Global 或通过 EventBus 统一转发）
- 结论：
  - Hook 插入行为按预期生效（结果节点数增加），插入位置为命中节点之后；
  - 事件推送需做一次模块级单例化对齐，后续微调（不影响插入语义与执行结果）。

## 2025-10-05 实施 Step 5：DbModule 全局化 + Hook 事件桥接
- 内容：
  - 标记 DbModule 为全局（@Global），确保全局唯一 DbService 实例，避免多实例导致 `events/recent` 观测不到。
  - 在 NotificationModule 中新增 `HookDbBridgeHandler`，桥接 `SimpleEventBus` 上的 `hook.insert.*` 到 `DbService.emit('hook_*')`，保证事件统一进入 SSE。
  - 为便捷验证新增端点：
    - `GET /api/db/events/ping` → 发出 `ping_test` 事件（SSE 可见）
    - `GET /api/db/events/test-hook` → 通过 EventBus 发出 `hook.insert.planned/applied`（SSE 可见）
  - Hook 规则加载增强：`loadHookRulesFromFile()` 增加多路径候选（`HOOKS_JSON_PATH` → `__dirname` 相对仓库根 → `process.cwd()`），并兼容单对象/数组两种 JSON 结构。
- 文件/函数：
  - apps/backend/src/db/db.module.ts：@Global()
  - apps/backend/src/notification/event-handlers/hook-db-bridge.handler.ts（新增）
  - apps/backend/src/notification/notification.module.ts：注册 HookDbBridgeHandler
  - apps/backend/src/db/db.controller.ts：新增 `events/ping`、`events/test-hook`
  - apps/backend/src/modules/execution/execution.service.ts：`loadHookRulesFromFile()` 路径增强、`evaluateHooks()` 同步 EventBus 事件
  - apps/backend/src/modules/execution/hooks.controller.ts：`GET /api/hooks/rules` 查看已加载规则
- 验证：
  - 启动后端 → `GET /api/db/events/ping` → `GET /api/db/events/recent` 能看到 `ping_test`
  - `GET /api/db/events/test-hook` → `GET /api/db/events/recent` 能看到 `hook_insert_planned/applied`
  - `GET /api/hooks/rules` 能看到从 `data/hooks/hooks.json` 载入的规则（若为空，检查进程工作目录或设置 `HOOKS_JSON_PATH` 为绝对路径）
