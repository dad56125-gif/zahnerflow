# CLI 与 Agent 接入

CLI 操作已经运行的 ZahnerFlow 后端。App、CLI 和 Agent 共用一个 `AppRuntime`、一份执行计划、一份 SQLite 数据和同一个设备连接。导入 CLI 不打开数据库，不启动服务，不加载驱动。

## 安装与运行

```powershell
uv sync
uv run zahnerflow --help
uv run zahnerflow --version
uv run zahnerflow health
uv run zahnerflow status
```

先启动 App，或在开发终端运行 `uv run python apps/python_backend/main.py`。默认地址是 `http://127.0.0.1:3001`。指定地址用 `uv run zahnerflow --url http://127.0.0.1:3001 status`，也可设置 `ZAHNERFLOW_URL`。全局 `--url` 和 `--timeout` 放在子命令前。CLI 不自动启动第二个后端。

成功结果直接写 JSON 到 stdout，与 HTTP 载荷一致；错误写单行 `{"error":{"code":...,"message":...,"status":...,"details":...}}` 到 stderr。`--help` 和 `--version` 是文本。`watch` 输出 NDJSON。所有文本使用 UTF-8，文件允许 UTF-8 BOM。

| 退出码 | 含义 |
| --- | --- |
| 0 | 命令成功；普通 watch 完成观察时间 |
| 1 | 后端拒绝命令或当前无执行 |
| 2 | 参数或输入 JSON 错误 |
| 3 | `watch --until-terminal` 观察到 failed/cancelled |
| 4 | 网络/响应错误，或等待终态超时 |
| 130 | 中断客户端；不会自动取消后端实验 |

## 从发现到执行

```powershell
uv run zahnerflow capabilities
uv run zahnerflow schema
uv run zahnerflow devices
uv run zahnerflow users
uv run zahnerflow workflow list
uv run zahnerflow workflow get wf_000001
```

`capabilities` 从真实节点语义表、设备能力表和状态机生成。`schema` 返回运行中的 OpenAPI；执行与预览请求直接使用共享 Pydantic 模型。节点参数统一放在 `config`，不能写成 `parameters`。目前 `config` 在 JSON Schema 中仍是对象，具体参数检查由 Planner 和驱动处理；该入口没有声称提供完整的设备参数 Schema。可从 App 配置并归档的工作流读取经过实际配置的 `nodes`，再调用计划预览核对。

新建 `experiment.json`，使用执行请求结构，例如：

```json
{
  "workflowName": "等待示例",
  "ownerName": "operator",
  "pathConfig": {"projectName": "demo", "individualName": "sample_01"},
  "nodes": [
    {"id": "wait-1", "type": "wait_delay", "config": {"duration": 2}},
    {"id": "wait-2", "type": "wait_delay", "config": {"duration": 3}}
  ]
}
```

```powershell
uv run zahnerflow plan --file experiment.json
uv run zahnerflow estimate --file experiment.json
uv run zahnerflow run --file experiment.json --source agent
uv run zahnerflow watch --until-terminal --duration 60
uv run zahnerflow report
uv run zahnerflow reset
```

`plan`/`estimate` 从同一个文件取 `nodes`、`workflowId` 和 `autoStartupConfig`，没有持久化或设备控制副作用。预览、ETA 和实际执行都调用后端 `ExecutionPlanner`。无效计划在归档工作流之前被拒绝。

也可使用 `--workflow wf_000001` 读取归档定义；`run` 支持 `--owner`、`--project`、`--sample` 覆盖对应元数据。`--from-step 1` 表示后端零基 `unrolledIndex=1`，对应 App 显示的步骤 #2；系统自动边界不允许作为手动起点。缺少实验元数据会明确拒绝，只有显式 `--force-missing-metadata` 才放行。

```powershell
uv run zahnerflow pause exec_...
uv run zahnerflow resume exec_...
uv run zahnerflow cancel exec_...
uv run zahnerflow watch --execution exec_... --until-terminal --duration 120
uv run zahnerflow history --page 1 --limit 20
uv run zahnerflow report exec_...
```

不传执行 ID 时，控制命令先读取当前 ID，再用该 ID 发出命令；后端拒绝陈旧 ID。终态必须显式 `reset` 后才能新开实验。暂停阻止进入下一步骤，不会冻结正在进行的测量或当前等待计时；取消是协作式的，EIS 等不可中断步骤完成当前测量后才响应。

`watch` 首次遇到执行后固定该 ID，因此后续 reset/新执行不会让观察对象悄悄变更。`--until-terminal` 的超时不会取消实验。

## 设备与其他能力

```powershell
uv run zahnerflow device zahner connect --simulate
uv run zahnerflow device furnace connect --simulate
uv run zahnerflow device mfc connect --simulate
uv run zahnerflow device furnace status
uv run zahnerflow device furnace disconnect
```

连接真机必须提供 `--file connection.json`，内容就是对应现有设备连接接口的配置，例如 Furnace/MFC 的 `port`、Zahner 的 `host`。未提供配置时 CLI 不猜测设备端口。使用 `--simulate` 明确选择内置模拟器。

其他已有能力通过统一请求命令访问，例如：

```powershell
uv run zahnerflow request GET /api/devices/furnace/program/segments
uv run zahnerflow request GET /api/devices/furnace/presets
uv run zahnerflow request POST /api/devices/furnace/program/segments --file segments.json
uv run zahnerflow request POST /api/devices/mfc/setpoint --file setpoint.json
```

`--file -` 从 stdin 接收 JSON，适合 Agent 管道调用。CLI 没有另写设备执行逻辑；可用路径和语义仍以运行中接口及 `routers/devices.py` 为准。

MFC 连接后须扫描目标地址，再设置流量。例如内置模拟器的 N2 地址为 32，可把 `{"address":32}` 写入 `scan.json`，调用 `request POST /api/devices/mfc/scan --file scan.json`；流量节点的 `deviceSelection` 应使用扫描得到的地址与气体，例如 `32:N2`。连接成功不代表任意地址已可控制。

## App 显示与重连

外部实验经相同 Socket.IO 事件进入 App，画布恢复对应节点，状态栏显示 `CLI` 或 `Agent` 来源、进度和状态。来源持久化在执行的 `workflow_snapshot.commandSource`，复用工作流时每次执行分别记录，不覆盖工作流创建者。

每份完整执行快照含后端 `runtimeId` 和进程内递增的 `snapshotSequence`。App 以本次连接宣布的进程身份接收快照，拒绝乱序或旧进程数据；即使离线时错过 reset，也能接收当前的新执行。新打开页面也会恢复已完成但尚未 reset 的执行。原始测量曲线的历史恢复仍依赖既有报告/文件，不把快照检查当作测量流回放验证。
