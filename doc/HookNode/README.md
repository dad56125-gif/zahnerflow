# Hook（插入）节点设计说明（绑定循环）

- 目标：在不修改工作流设计态拓扑的前提下，于执行期按规则临时插入节点（如在 Chrono 恒电流循环节点之后插入 EIS 节点），并且强制与指定循环节点绑定，确保在正确的循环迭代上下文中触发。
- 适用：最多 5 层嵌套循环；一次迭代默认仅插入一次；插入节点不回写工作流定义，仅作为运行期行为和事件记录。

## 关键约束
- 必须绑定循环：每条 Hook 规则必须绑定到一个循环起始节点（`loop_start`）的实例（`loopNodeId`）。
- 迭代基准：触发频率以绑定循环的当前迭代号为基准（`every/offset`），不再使用“全局次数”。
- 非递归：由 Hook 插入的临时节点不会再次触发同一条规则。
- 幂等：在同一（workflowRunId, loopNodeId, iteration, ruleId|tag）维度默认仅插入一次。

## 规则数据模型（建议 DTO）
- HookRule（必含字段）
  - `id: string`
  - `name: string`
  - `enabled: boolean`
  - `loopBinding: { loopNodeId: string }` 绑定循环节点（工作流定义中的 `loop_start` 节点 ID）
  - `trigger: { type: 'after_node' | 'before_node'; nodeSelector: { id?: string; type?: string } }`
  - `cycle: { every: number; offset?: number }` 迭代触发条件（以绑定循环的迭代计数为基准）
  - `limit?: { perIteration?: number; perRun?: number }` 默认 `perIteration=1`
  - `action: { type: 'insert_node'; placement: 'after' | 'before'; nodeTemplate: { type: string; params: Record<string, any> }; tag?: string; priority?: number }`

- 事件（SSE/DB）：
  - `hook_insert_planned` 命中规则待插入
  - `hook_insert_applied` 已插入并开始执行
  - `hook_suppressed` 因限制或去重被抑制
  - 载荷建议包含：`ruleId, workflowId, targetNodeId, loopContext: { loopNodeId, depth, iteration }, insertedNodeId?`

## 执行期语义
- LoopStack：执行上下文维护 `[{ loopNodeId, depth, iteration }]`（最大 5 层）。
- 匹配流程：
  1) 在节点 `before/after` 钩子触发时，从 LoopStack 中定位 `loopBinding.loopNodeId` 对应的层 `L`。
  2) 计算是否命中触发条件：`(L.iteration - (offset||0)) % every === 0`。
  3) 校验 `nodeSelector`（按 id 或 type 匹配当前节点）。
  4) 去重检查：当次迭代内按 `ruleId|tag` 去重（遵循 `limit`）。
  5) 物化 `nodeTemplate` 为临时节点（`origin='hook'`，附带 `tag`），按 `placement` 在当前执行队列中紧邻插入。
- 插入节点默认不参与该规则再次评估（避免递归触发）。

## 示例（贴合实际需求）
- 语义：绑定“顶层整体循环”节点，每 5 次该循环的迭代中，第一次遇到“Chrono 恒电流循环（如 `ChronoCCCycle`）”节点后，插入一个 EIS 测试节点并立即执行。
- 规则：
```
name: 每5次循环在 Chrono 后插入 EIS
loopBinding: { loopNodeId: 'loop_top_main' }
trigger: { type: 'after_node', nodeSelector: { type: 'ChronoCCCycle' } }
cycle: { every: 5 }
limit: { perIteration: 1 }
action: { type: 'insert_node', placement: 'after', nodeTemplate: { type: 'EIS', params: { freqStart: 1e4, freqEnd: 1e-1, points: 10 } }, tag: 'hook:eis' }
```

## API（建议，与现有风格一致）
- `GET /api/hooks` 列出规则（支持 `workflowId` 过滤）
- `POST /api/hooks` 新增规则（校验 loopBinding 为必填且目标节点为循环）
- `PUT /api/hooks/:id` 修改/启停规则
- `DELETE /api/hooks/:id` 删除规则
- `GET /api/workflows/:id/hooks` 某工作流关联的规则（可选）
- 事件沿用 `/api/db/events/stream` 推送 Hook 事件

## 可观测性与 UI（可选）
- 后端内置 `db-ui.html` 可新增 Hooks 面板，用于：
  - 规则列表、启停
  - 最近命中与插入事件（含循环上下文）
- 非必需，优先保证执行语义与 API 正确。

---

如需更详细的接口字段、验证规则与测试计划，请见同目录 `01-spec.md` 与 `02-engine-integration.md`。
