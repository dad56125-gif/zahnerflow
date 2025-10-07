# Hook 节点规则规范（DTO + API + 事件）

## 1. DTO 规范（建议放入 packages/types）
- HookRule
  - `id: string`
  - `name: string`
  - `enabled: boolean`
  - `loopBinding: { loopNodeId: string }` 必填，绑定循环起始节点（loop_start）
  - `trigger: { type: 'after_node' | 'before_node'; nodeSelector: { id?: string; type?: string } }`
  - `cycle: { every: number; offset?: number }` 以绑定循环的迭代计数为基准
  - `limit?: { perIteration?: number; perRun?: number }` 默认 `perIteration=1`
  - `action: { type: 'insert_node'; placement: 'after' | 'before'; nodeTemplate: { type: string; params: Record<string, any> }; tag?: string; priority?: number }`

- HookEvent（SSE/DB 事件负载）
  - `type: 'hook_insert_planned' | 'hook_insert_applied' | 'hook_suppressed'`
  - `ts: string`
  - `payload: {
      ruleId: string;
      workflowId: string;
      targetNodeId: string;
      loopContext: { loopNodeId: string; depth: number; iteration: number };
      insertedNodeId?: string;
      reason?: string; // 对 suppressed 的补充说明
    }`

## 2. 校验规则
- 创建/更新 HookRule（POST/PUT）：
  - 缺少 `loopBinding.loopNodeId` → 400
  - `loopNodeId` 不存在或对应节点不是 `loop_start` → 400
  - `cycle.every` 非正整数 → 400
  - `trigger.nodeSelector` 至少指定 `id` 或 `type` 之一 → 400（建议）

## 3. REST API（与现有风格一致）
- `GET /api/hooks`
  - Query：`workflowId?`, `enabled?`
  - Resp：`{ items: HookRule[], total: number }`
- `POST /api/hooks`
  - Body：`HookRule`（服务端生成 `id`）
  - Resp：`HookRule`
- `PUT /api/hooks/:id`
  - Body：部分或全部字段；用于启停规则或修改细节
  - Resp：`HookRule`
- `DELETE /api/hooks/:id`
  - Resp：`{ success: true }`
- `GET /api/workflows/:id/hooks`
  - Resp：`HookRule[]`

> 事件流仍复用 `/api/db/events/stream`，不新增端点。

## 4. 示例（与场景一致）
- POST `/api/hooks` Body：
```json
{
  "name": "每5次循环在 Chrono 后插入 EIS",
  "enabled": true,
  "loopBinding": { "loopNodeId": "loop_top_main" },
  "trigger": { "type": "after_node", "nodeSelector": { "type": "ChronoCCCycle" } },
  "cycle": { "every": 5 },
  "limit": { "perIteration": 1 },
  "action": {
    "type": "insert_node",
    "placement": "after",
    "nodeTemplate": {
      "type": "EIS",
      "params": { "freqStart": 10000, "freqEnd": 0.1, "points": 10 }
    },
    "tag": "hook:eis"
  }
}
```

## 5. 事件示例
- `hook_insert_planned`
```json
{
  "type": "hook_insert_planned",
  "ts": "2025-10-05T01:23:45.678Z",
  "payload": {
    "ruleId": "hook_abc",
    "workflowId": "workflow_xxx",
    "targetNodeId": "node_chrono_1",
    "loopContext": { "loopNodeId": "loop_top_main", "depth": 1, "iteration": 10 }
  }
}
```
- `hook_insert_applied`
```json
{
  "type": "hook_insert_applied",
  "ts": "2025-10-05T01:23:45.789Z",
  "payload": {
    "ruleId": "hook_abc",
    "workflowId": "workflow_xxx",
    "targetNodeId": "node_chrono_1",
    "insertedNodeId": "node_tmp_eis_123",
    "loopContext": { "loopNodeId": "loop_top_main", "depth": 1, "iteration": 10 }
  }
}
```
- `hook_suppressed`
```json
{
  "type": "hook_suppressed",
  "ts": "2025-10-05T01:23:46.000Z",
  "payload": {
    "ruleId": "hook_abc",
    "workflowId": "workflow_xxx",
    "targetNodeId": "node_chrono_1",
    "loopContext": { "loopNodeId": "loop_top_main", "depth": 1, "iteration": 10 },
    "reason": "perIteration limit reached"
  }
}
```

## 6. 保证与限制
- 零破坏：不改动既有前端；后端仅新增 Hook 相关 API 与事件。
- 运行期插入：插入节点只影响当前执行，不回写到工作流定义（可通过事件/执行轨迹查看）。
- 嵌套循环：通过 LoopStack 精准绑定；同名循环模板复用时以 `loopNodeId` 唯一定位。
