第一部分：初始代码诊断与问题定位
1. 现有代码结构分析
Store 管理：workflowStore.ts（状态管理）、workflowParameterStore.ts（参数暂存）、executionStore.ts（执行状态）。
Service 层：workflowService.ts（API 封装）、workflowExecutionService.ts（包含复杂的同步逻辑）、workflowSyncUtil.ts（同步工具）。
核心管理器：WorkflowManager.ts（包含导入导出、版本管理、CSV 解析等）。
UI 组件：WorkflowManagerUI.tsx（历史记录与模板面板）、WorkflowIdDisplay.tsx。
2. 核心痛点定位
违背单一数据源：services/stores/workflowParameterStore.ts 是为了解决“历史 ID 指向旧参数”与“画布上的新参数”冲突而产生的复杂中间层。
您的判断：这种曲折的实现造成了代码复杂化。既然数据最终都要传给后端，不应在前端产生这种复杂的暂存实现。
临时 ID 废弃：确认 generateTemporaryWorkflowId 及 temp_ 逻辑在新架构下应被彻底废弃，ID 由后端主导。
第二部分：核心数据定义的演进（The Definition）
1. 节点定义（WorkflowNode）
结构：仅包含 id（持久化身份）、type（类型）、data.parameters（业务参数）。
剔除：position（后端不需要）、label（无意义）、next_node_id（指针无意义）。
真理：索引（Index）即执行顺序。
2. 工作流定义（WorkflowDefinition）
剔除：edges（无显式连线）、version（无版本兼容）。
定位：这是前端定义的接口，而非后端数据库结构的直接映射。
3. 最终确立的前端逻辑定义
结构：一个线性的、有序的节点数组 nodes[]。
顺序：数组索引 0 为起始，1 为下一步，以此类推。
特征：无坐标、无连线数据、无标签、无版本号、无显式指针。
第三部分：文件与功能的重构指令（Refactoring Directives）
1. 必须彻底删除的文件
services/stores/workflowParameterStore.ts：违背单一数据源。
services/workflowExecutionService.ts：逻辑已过时。
services/workflowSyncUtil.ts：不再需要计算 Diff。
exportWorkflow / importWorkflow / convertToCSV / parseFromCSV：前端不再处理 IO。
regenerateIds / createWorkflowTemplate：未实现或无用功能。
2. 必须重写的文件：WorkflowManager.ts
指令：删除所有版本兼容逻辑和未实现功能。
保留：createEmpty（只返回空数组 nodes: []，不预设 ID）和 validate。
3. Service 层的限制
禁止在当前重构中补充未提及的 Service 实现细节。
第四部分：交互与生命周期逻辑（Logic & Lifecycle）
1. 按钮策略：三钮分离
另存为（Save As）
更新（Update / Save）
运行（Run）：兼具数据传输与指令触发功能。
2. 运行与创建逻辑（Run = Create if Null）
前端状态：初始 ID 为空。
传递逻辑：用户点击运行，前端将当前画布上的 nodes 数据发送给后端。
后端处理：
若无 ID：后端创建新记录 -> 生成 ID -> 启动执行。
若有 ID：后端使用接收到的 nodes 数据 -> 启动执行。
返回逻辑：后端必须返回 workflowId。
副作用：前端接收 ID 后更新 Store，确立身份。
第五部分：视图与拖拽逻辑（View & Drag Logic）
1. 自动布局（Auto-Drawing）
逻辑：UI 根据 nodes 数组的索引顺序，动态计算坐标并生成视觉连线。
数据流：Store 不存坐标 -> 渲染时计算 -> 显示。
2. 拖拽即排序（Drag is Reorder）
新逻辑：拖拽的本质是改变数组索引（Splice / Move 操作）。
行为：将 node[10] 移到 node[3]，意味着原 node[3] 及后续节点后移。
限制：这属于定义阶段的操作，运行时 UI 将锁定，禁止拖拽。
第六部分：交通层设计（Traffic Layer）
1. 设计原则
所见即所跑：运行接口直接携带数据，不依赖隐式保存。
数据分层：只传输 type 和 parameters，不传输 UI 坐标和配置。
2. API 交互流程
保存/更新 (Update)：
PUT /api/workflows/:id
Body: { nodes: [...] }
运行 (Run)：
POST /api/executions
Body: { workflowId?: "...", nodes: [...] }
逻辑：后端根据是否有 ID 决定是“新建并运行”还是“直接运行”。
停止 (Stop)：
POST /api/executions/stop
Body: { workflowId: "..." }
第七部分：执行状态反馈机制（Execution Feedback）
1. 协议层的变革：索引主导（Index-Based）
核心思想：执行层只关心序列位置（Index），不关心节点 ID，也不需要前端知道 Execution ID。
上下文：通过 WebSocket joinRoom(workflowId) 锁定上下文。
2. WebSocket 通信协议
服务端推送 (Server Push)：
格式：{ i: number, s: string, d?: any }
示例：
{ "i": 3, "s": "run" } （第 4 个节点开始运行）
{ "i": 3, "s": "ok", "d": {...} } （第 4 个节点完成，附带数据）
{ "i": 3, "s": "err" } （出错）
循环/跳转处理：
若节点再次变为 run，直接覆盖之前的 ok 状态。无需额外的重置信号。
3. 前端状态管理 (Store & Render)
Store 结构：executionStore 维护一个简单数组 nodeStatuses: string[]。
更新逻辑：收到 { i, s } -> 执行 nodeStatuses[i] = s。
渲染逻辑：
code
Tsx
<NodeRenderer
  key={index}
  data={node}
  status={executionStore.nodeStatuses[index]} // O(1) 直连，无查找
/>
停止反馈：收到 cancelled 信号后，UI 解锁，按钮恢复为“运行”。