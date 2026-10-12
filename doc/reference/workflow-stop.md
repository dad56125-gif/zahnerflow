# 工作流停止与节点扩展

当前约束由 [执行设计](../../.memory/design.md) 的 `[执行-状态机]` 管理；本文用于维护节点。复核：2026-10-12。

## 公共停止流程

```text
停止请求（校验 executionId）
  → 本次 ExecutionControl 置位、解除边界暂停
  → cancelling，继续等待当前处理器及其设备清理
  → 引擎禁止后续步骤，统一结束为 cancelled 或 failed
  → 后端快照发布终态
  → 界面允许显式重置，重置成功后才能清空或再次运行
```

停止命令的应答只确认请求已接受。设备线程未退出时不能用超时、前端解锁或丢弃 Task 假装停止成功。公共执行状态只能由引擎和 AppRuntime 维护；节点的失败/取消结果是步骤事实，不直接改变工作流 phase。

每次执行拥有新的控制令牌和固定身份上下文。令牌永不清零或转借，新执行不会改变旧设备回调看到的 executionId。暂停只阻止进入下一步骤，不冻结正在运行的设备操作或等待；取消立即解除边界暂停。

## 新增节点只需实现什么

1. 在 `runtime/execution_semantics.py` 的 `NODE_EXECUTION_SPECS` 注册节点，必填 `stop_policy`。
2. 在 `runtime/node_executors.py` 的 `NODE_EXECUTORS` 注册对应异步处理器；同类节点可以复用已有处理器。
3. 在处理器内实现自身的停止检查、设备清理和驱动超时。阻塞设备调用必须通过 `context.control.run_in_thread` 执行；异步等待使用可取消的控制方法。
4. 按下表验证本节点。新增节点所需的配置、规划展开与 ETA 等正常功能仍由对应模块维护，停止流程无需增加节点名称分支。

规划阶段拒绝缺失处理器或非法策略的节点；这保证注册契约完整，不证明驱动一定能在某个时间内停止。

| 策略 | 处理器责任 | 当前节点 |
| --- | --- | --- |
| `cooperative` | 在安全边界检查令牌；收到请求后执行本地清理，清理成功才抛出 `WorkflowCancelled` | 等待、预约、温度、气路、直流测量 |
| `finish_current` | 等待当前不可中断调用退出；保留结果或真实错误；引擎阻止进入后续步骤 | Zahner 连接/断开、EIS |

异步协作处理器示例（注册到现有执行器表）：

```python
async def execute_new_node(executor, node, step, params, spec):
    control = executor.control
    control.check_cancelled()
    try:
        await control.run_in_thread(start_device_operation, params)
        while not device_operation_finished():
            await control.sleep(0.1)
    finally:
        if control.cancel_requested:
            await control.run_in_thread(stop_and_confirm_device)
    control.check_cancelled()
```

示例中的操作与清理函数由新节点实现；状态读取若会阻塞，也必须放入 `run_in_thread`。线程内部用 `check_cancelled()` 或 `wait_for_cancel(timeout)` 检查令牌；设备已经启动后，把取消检查放进覆盖清理的 `try/finally`。不能让检查异常绕过设备清理。完成当前操作策略不把取消令牌交给不支持中断的驱动。

取消必须有明确异常或结果，不能仅因“停止标志已置位”就把任意设备异常改成取消。清理、通信、落盘失败照常失败并保留诊断。不要修改 `ExecutionEngine.status`，不要读可重置的全局取消布尔量，不要自行创建无人等待的设备线程。

## 验收边界

| 场景 | 必须成立 |
| --- | --- |
| 正常执行 | 当前步骤和工作流正常结束，清理与结果符合设备约定 |
| 执行前/执行中停止 | 不进入后续步骤；重复停止不重复下发设备清理 |
| 暂停后停止 | 不因边界暂停永久卡住 |
| 不可中断调用 | 退出前保持 cancelling，禁止重置和新执行 |
| 清理或通信失败 | failed，保留真实错误；不能误报 cancelled |
| 等待 Task 被取消 | 先等待底层线程和清理退出，再发布终态 |
| 重置再运行 | 新令牌、新身份；旧回调不污染新执行 |
| 循环/工作流块 | 展开后的每步遵守相同停止边界 |
| 界面收敛 | 停止后快照到达终态；重置成功才能清空、再运行 |

验证脚本按仓库规则放在外部或已忽略目录，不提交测试源码。共享控制机制修改时覆盖整张表；增加节点时重点验证该节点的策略、清理、超时和结果，再检查它经过公共流程。真机取消能力、通信超时与物理停止确认需在设备上单独验收；等待当前 EIS 返回不能描述为扫描已被即时中断。
