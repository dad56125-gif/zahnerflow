# 引擎对接与代码级核对（基于当前仓库）

本说明基于实际代码审阅结果，给出“绑定循环的 Hook 插入节点”最小侵入式落地方案与改造清单，指向具体文件与函数位置，便于实施时逐条对齐。

## 0. 现状核对（关键点）
- 执行器：顺序遍历 nodes，尚未实现真正的循环控制与指令队列。
  - 入口：`apps/backend/src/modules/execution/execution.service.ts:211` `private async executeNodes(...)`
  - 节点执行：`apps/backend/src/modules/execution/execution.service.ts:255` `private async executeNode(...)`
  - 循环节点：`loop_start/loop_end` 仅打印日志，无循环语义
    - `apps/backend/src/modules/execution/execution.service.ts:384` `executeLoopStart`
    - `apps/backend/src/modules/execution/execution.service.ts:390` `executeLoopEnd`
- 工作流定义：后端持久化为 JSON，nodes 内含 `loop_start/loop_end`，通过 `loop_id` 成对出现（前端侧也有可视化标注）。
  - 示例：`apps/backend/data/workflows/workflows.json:1750+` 可见 `loop_start/loop_end` 与 `loop_id: "nano"`/`loop_count`
- 数据库/事件：已存在 JSON 索引服务与 SSE 事件流，可直接复用以推送 Hook 事件。
  - 事件流：`apps/backend/src/db/db.service.ts:104` `getEvents()`、`apps/backend/src/db/db.service.ts:108` `pushEvent()`
  - SSE 控制器：`apps/backend/src/db/db.controller.ts:117` `@Sse('events/stream')`
  - 内置 UI：`apps/backend/public/db-ui.html`（可后续加 Hooks 面板，非必需）

结论：当前执行器未支持循环语义与“运行时插入”。要实现“与循环绑定的 Hook 插入”，建议在 ExecutionService 内部引入“指令队列 + 循环栈（LoopStack）”与“HookEvaluator”，并保持改动集中在 `execution.service.ts`。

## 1. 最小侵入改造总览
- 引入运行时指令队列（ExecutionQueue）：
  - 将 `executeNodes()` 的 `for` 循环改为 `while (ip < queue.length)` 形式，`queue` 初始为 `definition.nodes` 的浅拷贝（或包装后的 RuntimeNode）。
  - 在处理 `loop_start/loop_end` 时，不再仅日志，而是使用栈式循环帧控制指令指针跳转与迭代计数。
- 维护 LoopStack（最多 5 层）：
  - 帧结构：`{ loopNodeId: string; depth: number; startIp: number; endIp: number; iteration: number; total: number }`
  - 在遇到 `loop_start` 时压栈，记录 `total=loop_count`；在首次扫描时可解析匹配的 `endIp`（依据相同 `loop_id` 与嵌套次序）。
  - 在到达 `endIp` 时递增 `iteration` 并决定是否跳回 `startIp+1`（进入下一轮），或弹栈继续向后。
- HookEvaluator：
  - 触发点：在 `executeNode()` 前/后分别调用（对应 `before_node/after_node`）。
  - 匹配：
    1) 在 LoopStack 中查找与 `rule.loopBinding.loopNodeId` 匹配的帧 `L`；
    2) 校验 `cycle.every/offset` 是否命中 `L.iteration`；
    3) 校验 `trigger.nodeSelector`（按 id/type 匹配当前节点）；
    4) 去重：维度 `(runId, loopNodeId, iteration, ruleId|tag)`；
  - 插入：将 `nodeTemplate` 物化为 RuntimeNode（`origin='hook'`），并根据 `placement` 在 `ip` 后（或前）插入到 `queue`。
  - 事件：通过 DbService `pushEvent(...)` 推送 `hook_insert_*`。
- 非递归：插入的 RuntimeNode 带 `origin='hook'`，在 HookEvaluator 中直接跳过规则评估。

## 2. 代码落点与修改细节
- 修改 `executeNodes`（替换 for 循环）：
  - 文件：apps/backend/src/modules/execution/execution.service.ts:211
  - 要点：
    - `const queue = wrap(definition.nodes)`；`let ip = 0;`
    - `while (ip < queue.length) { const node = queue[ip]; ... ip++; }`
    - 维护 `loopFrames: Frame[]` 与 `insertedMarks: Set<string>`（去重）。
    - 在 `loop_start/loop_end` 分支处理指令跳转与迭代计数。
- 在 `executeNode` 前/后加入 Hook 评估：
  - 文件：apps/backend/src/modules/execution/execution.service.ts:255
  - 要点：
    - `await evalHooks('before_node', ctx, node, queue, ip)`；
    - `await this.executeNode(...)`；
    - `await evalHooks('after_node', ctx, node, queue, ip)`；
    - `ctx` 含 `runId(executionId)`, `workflowId`, `loopStack快照`, `insertedMarks`。
- 新增内部帮助方法（同文件内，保持最小范围）：
  - `buildLoopBoundaries(nodes): Map<startIp, endIp>`：一次性扫描，基于 `loop_id` 与嵌套找到配对。
  - `materializeNode(template): RuntimeNode`：从 `nodeTemplate` 构造最小执行所需节点结构（`id` 生成器、`type`、`data.parameters`）。
  - `pushHookEvent(type, payload)`：调用 DbService 的事件流（见下）。

> 以上均可先在 `ExecutionService` 内部实现，不必立即抽出独立类文件（后续再重构）。

## 3. 与 DB/SSE 的对接
- 事件推送：
  - 使用 `DbService` 的事件能力：`apps/backend/src/db/db.service.ts:104` `getEvents()`、`apps/backend/src/db/db.service.ts:108` `pushEvent(type, payload)`（私有）
  - 方式 A（推荐）：在 `ExecutionService` 通过注入 `DbService`，新增一个公共方法供执行器调用：
    - `apps/backend/src/db/db.service.ts` 增加 `emit(type: string, payload: any)`（内部转调 `pushEvent`），保持封装性。
  - 方式 B（过渡）：暂时通过 `SimpleEventBus` 发出领域事件，然后由一个事件处理器转调 DbService 推送到 SSE（需要新增 Handler）。

## 4. DTO/API 对接（后续迭代）
- 新增 HooksController/Service（与 DbController 相邻模块风格一致）：
  - `GET /api/hooks`、`POST /api/hooks`、`PUT /api/hooks/:id`、`DELETE /api/hooks/:id`、`GET /api/workflows/:id/hooks`
  - 存储：可复用 `DbService` 的 JSON 索引文件（加一张 `hooks` 表）或新建 `data/hooks/index.json`（简化实现）。
  - 校验：创建/更新时检查 `loopNodeId` 是否存在且为 `loop_start`（可在 `WorkflowService.getWorkflow` 后扫描 nodes 校验）。

## 5. 伪代码（核心循环与 Hook 评估）
```
// executeNodes (while + 队列)
queue = wrap(definition.nodes)
ip = 0
frames = [] // LoopStack
marks = new Set() // 幂等
bounds = buildLoopBoundaries(queue)
while (ip < queue.length) {
  node = queue[ip]
  ctx = { runId, workflowId, loopStack: snapshot(frames), insertedMarks: marks }
  if (node.origin !== 'hook') await evalHooks('before_node', ctx, node, queue, ip)
  await executeNode(runId, node)
  if (node.origin !== 'hook') await evalHooks('after_node', ctx, node, queue, ip)
  // 循环控制
  if (node.type === 'loop_start') pushFrame(node, ip, bounds)
  if (node.type === 'loop_end')   { if (incAndShouldRepeatTopFrame()) ip = top.startIp + 1; else popFrame() }
  ip++
}

// evalHooks(triggerType, ...)
for (rule of enabledRules) {
  const frame = frames.find(f => f.loopNodeId === rule.loopBinding.loopNodeId)
  if (!frame) continue
  if (!nodeSelectorMatch(rule.trigger.nodeSelector, node)) continue
  const it = frame.iteration
  const off = rule.cycle.offset || 0
  if (((it - off) % rule.cycle.every) !== 0) continue
  const key = `${runId}|${frame.loopNodeId}|${it}|${rule.id}|${rule.action.tag||''}`
  if (marks.has(key)) { emit('hook_suppressed', {...}); continue }
  emit('hook_insert_planned', {...})
  const tmp = materializeNode(rule.action.nodeTemplate)
  tmp.origin = 'hook'; tmp.meta = { tag: rule.action.tag, fromRule: rule.id }
  insertIntoQueue(queue, ip, tmp, rule.action.placement)
  marks.add(key)
  emit('hook_insert_applied', {..., insertedNodeId: tmp.id })
}
```

## 6. 测试策略（覆盖范围）
- 单元测试（Loop/Hook 逻辑）：
  - `buildLoopBoundaries` 嵌套 1~5 层配对正确；
  - `evalHooks` 命中/去重/offset/every 语义；插入位置（before/after）；
- 集成测试（ExecutionService）：
  - 小图：`[loop_start(count=2), Chrono, loop_end]` + Hook（after Chrono）→ 每迭代仅插一次 EIS，顺序紧邻；
  - 嵌套：外层绑定，内层也有 Chrono → 仅在外层第 5、10… 轮触发；
  - 边界：Chrono 为循环体最后节点 → 仍在本迭代内插入执行；
- 端到端（含 SSE）：
  - 启动后执行包含循环的工作流，订阅 `/api/db/events/stream` 验证 `hook_*` 事件顺序与载荷；

## 7. 渐进式实施步骤
1) 在 ExecutionService 内实现 while+队列与 LoopStack（替换 `executeNodes` 的 for 循环，保持外部接口不变）。
2) 实现最小版 HookEvaluator（内存规则，可直接从硬编码/配置加载，先不暴露 REST）。
3) 打通 DbService 事件推送，推送 `hook_insert_planned/applied/suppressed`。
4) 用测试工作流与规则做端到端验证（不改前端）。
5) 若稳定，再抽出 HookRegistry/Controller，持久化规则与管理；可选为 `db-ui.html` 增加 Hooks 面板。

## 8. 注意事项
- 生成临时节点 ID 可沿用 `WorkflowService.generateNodeId()` 的风格，但为了去耦，建议在执行器内实现 `generateTempNodeId()`。
- 插入节点的 `type` 与 `params` 需与 `executeMeasurement` 或相应分支兼容（例如 `EIS` 与现有 `eis_potentiostatic/eis_galvanostatic` 的映射关系）。
- 若要将插入节点的执行结果写入 `data_file`，可在设备服务回调 `measurement.completed` 时附带 `origin='hook'` 的上下文，用于后续溯源。
