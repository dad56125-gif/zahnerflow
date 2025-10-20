结论与根因

根因在于轮询钩子提前触发：useFurnace 内用到的 useConditionalPolling 会在挂载时通过底层的 usePolling 立即 start 并马上调用一次 fetchData（默认 immediate: true），从而触发 FurnaceApi.getStatus()。一旦返回成功，useFurnace 就将 connectionState.status 设置为 'connected'，导致 UI 在未执行“选择串口→连接”前就显示“已连接”。
绑定逻辑本身是对的：在 apps/frontend/src/components/DeviceModal.tsx 中，端口下拉选中即执行 handlePortSelection，调用 furnaceControls.connect(...) 完成连接，符合“选择串口→自动连接”的预期。但因为上面的提前轮询，把状态提前置为了 connected，掩盖了真实流程。
关键代码位置

连接 UI 与选择逻辑：apps/frontend/src/components/DeviceModal.tsx:410 起（右侧“设备连接”区域），选择端口后会调用 handlePortSelection，内部执行 furnaceControls.connect({...})。
提前置连的来源：apps/frontend/src/services/hooks/useFurnace.ts:193 起，useConditionalPolling 的回调中每次 getStatus 成功都会：
更新 status
将 connectionState.status 设为 'connected'
轮询默认立即执行：apps/frontend/src/services/hooks/usePolling.ts:314 定义 useConditionalPolling，底层 usePolling 默认 immediate: true 并在挂载 effect 中 start()，致使未连时也会先发起一次状态请求。
已做修复

禁止条件轮询在挂载时立即拉取：将 useConditionalPolling 调用 usePolling 时的 immediate 改为 false，避免首次渲染就触发取数，把“开始轮询”的时机完全交给 shouldPoll() 判断（即已连接后才开始轮询）。
变更位置：apps/frontend/src/services/hooks/usePolling.ts:322
修改前：immediate: true
修改后：immediate: false

我查明“未执行连接就显示已连接”的第二个根因，并做了更彻底的修复：之前仅把条件轮询的 immediate 关掉还不够，因为还有两处会导致误判。

关键问题

轮询自动启动：usePolling 在挂载时会自动 start()，而 useFurnace 给 useConditionalPolling 传了 immediate: true，且状态获取成功时会把 connection_state 强行置为 connected。即使没点连接，也可能被一次成功的 /status 响应“误连”。
连接状态由“状态获取”决定：useFurnace 在拉取 /status 成功后，直接把 connection_state.status 改为 connected。如果后端在未连接时仍返回 200（比如默认/模拟数据），就会把前端状态误置为已连接。
已修改内容

停止条件轮询的自动启动
新增可选参数 auto_start（snake_case，默认 true）以控制挂载时是否自动 start()。
文件: apps/frontend/src/services/hooks/usePolling.ts
PollingOptions<T> 增加 auto_start?: boolean;
依赖变化时的 effect 只在 auto_start === true 时 start()。
可见性恢复时（visibilitychange）恢复轮询也只在 auto_start === true 时触发。
useConditionalPolling 中强制覆盖：immediate: false 且 auto_start: false。这样除非我们显式调用 controls.start()，否则不会在挂载/可见性变化时偷跑一次轮询。
去掉“获取状态 = 已连接”的误判
文件: apps/frontend/src/services/hooks/useFurnace.ts
在状态轮询成功时，不再修改 connection_state；只更新 status、operation_state、last_update。
在 connect() 成功后，直接设置 connection_state 为 connected（并写入 last_connected），再手动 status_controls.refresh() 拉一次状态。这样“已连接”的唯一来源就是显式的连接成功，避免未连接时被 /status 误判。
为何现在应当正确

打开 Modal 时不再自动轮询 /status，不会再因为一次成功响应而把状态变为 connected。
只有执行 connect() 并成功返回，connection_state 才会设置为 connected，随后才开始轮询。
如果后端在未连接状态下依然返回 200 的 /status，也不会影响连接状态显示。