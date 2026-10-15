# 数据与命名规范

状态：当前规则。归属：共享契约与持久化维护者。来源：下表所列契约及迁移定义。来源复核：2026-09-20。文中数值是定义的摘录，协议或迁移更新时必须复核，不在本文独立修改。

## 单一来源

| 数据 | 定义来源 | 边界 |
| --- | --- | --- |
| 应用版本 | `VERSION` | `pnpm version:sync` 同步各包 |
| API 与报告协议 | `apps/shared/contracts/protocol.py` | API 4.1.0、报告 3.0，独立于应用版本 |
| 数据库列和索引 | `apps/python_backend/database_schema.py` | 列定义只维护一次，新建与补列共用 |
| 数据库迁移定义 | `apps/python_backend/database_schema.py` | 定义迁移目标与执行逻辑；`PRAGMA user_version` 只记录某个数据库已应用的迁移版本，不能当作迁移定义。禁止与 SQLite 内部 `schema_version` 混用 |
| 用户档案、设置与默认值 | `apps/shared/contracts/settings.py` | Python 校验并生成 TypeScript 文档类型及初始路径值 |
| 执行报告 | `apps/shared/contracts/report.py` | 后端 `report_service.py` 输出，前端直接消费生成类型 |
| 工作流和设备状态 | `apps/shared/contracts/workflow.py`、`runtime_device.py` | 实际运行事实由 `AppRuntime` 持有 |

## 命名与单位

数据库物理列、Python 局部变量使用 `snake_case`；业务 JSON 和 TypeScript 使用 `camelCase`。必要的边界转换只做一次，不能同时在响应中复制两份字段，再让每个消费方反复猜测。

| 含义 | 数据库存储 | 业务输出 | 说明 |
| --- | --- | --- | --- |
| 执行 ID | `executions.id`、外键 `execution_id` | `executionId` | 报告、运行状态、命令均引用真实执行 ID |
| 工作流 ID | `workflow_id` | `workflowId` | 定义身份与某次执行身份分开 |
| 原节点位置 | `original_index` | `originalIndex` | 0 起始，不等同于展开位置 |
| 展开位置 | `unrolled_index` | `unrolledIndex` | 0 起始，展示序号可加 1，筛选不得改写身份 |
| 步骤耗时 | `actual_seconds` | `actualSeconds` | 秒；缺失保留空值，不能当作实测 0 秒 |
| 执行耗时 | `executions.duration` | 报告 `durationMs` | 毫秒；保留现有物理列以避免无意义数据搬迁 |
| 执行起止 | `start_time`、`end_time` | 报告 `startedAt`、`endedAt` | 实时执行快照保留其既有 `startTime`、`endTime` 契约，禁止在同一载荷复制别名 |
| 操作者 | 每次执行的 `workflow_snapshot.ownerName` | `ownerName` | 同一工作流可由不同操作者执行，不得继承定义创建者 |
| 用户档案 | `users.id`、`username`、`created_at` | `id`、`user`、`createdAt` | 仅档案出口做 username → user 映射，前端不生成业务身份 |
| 数据点数量 | 新结果 JSON 的 `dataPoints` | `dataPoints` | 0 是有效值；旧 `data_points` 等只在历史读边界归一化 |

`/health` 是运维响应，保留现有下划线字段，并新增 `schema_version` 用于报告应用迁移版本。设备协议寄存器、物理量与驱动参数各有实际含义，不能仅因名字相似就合并；协议别名由对应设备适配边界处理。

## 测量输出文件命名复核

状态：自定义文件名残留已清理并验证；高级节点单文件方案待用户审阅，实施暂停。复核日期：2026-10-15。来源：`experiment_worker.py`、`runtime/node_executors.py`、`loop_unroller.py`、`devices/zahner/logic.py`、`real_device.py`、`simulator_device.py`、`ism_parser.py`。本次只删除未使用的自定义文件名映射、缺省及对应展示标签，并提交完整拟议表头；四种阶梯/切换节点的单文件写入与报告读取尚未修改。

### 输出目录

工作流执行的基础路径、项目和样品优先采用节点配置，其次采用执行上下文路径配置；基础路径最终缺省为 `C:\data\archive`。`build_output_path` 决定目录：

- 项目和样品齐全：`基础路径/项目/样品/测量类型/`。
- 仅项目齐全：`基础路径/项目/_unnamed/测量类型/`。
- 项目缺失：`基础路径/_unassigned/工作流ID/步骤调用时间/测量类型/`；此分支不会单独采用样品名，时间也不是整次执行固定的开始时间。
- 测量类型目录：EIS 为 `eis`，OCP 为 `ocp`，恒电位为 `ca`，恒电流为 `cp`，电压扫描为 `lsv`，电流扫描为 `gsv`，未匹配类型为 `general`。

高级节点再追加目录：阶梯扫描为 `ChronoRamp_起值-终值_step步长_保持秒数s_时间`，切换为 `ChronoSwitch_第一值-第二值_第一保持秒数s-第二保持秒数s_cycles_次数_时间`。这些目录在每个展开后的测量子步骤执行时重新计算，未按父节点缓存；子步骤跨秒开始会生成不同目录。高级目录使用 UTC，普通文件名及执行器注入的时间使用操作系统本地时间；在 UTC+8 系统中相差八小时。

### 文件名

`build_filename` 供真机和模拟器共用，格式为 `测量类型_关键参数_[温度C]_[流量sccm气体...]_YYMMDD_HHMMSS`，环境字段缺失时省略。它在测量开始前生成，时间精度为秒。

| 测量 | 文件名前缀示例 | 参数来源 |
| --- | --- | --- |
| 恒电位 EIS，无直流偏置 | `EIS_OCV` | `enable_dc_bias=false` |
| 恒电位 EIS，有直流偏置 | `EIS_500mV` | `eis_potential` |
| 恒电流 EIS | `EIS_10mA` | `eis_current`；命名未检查偏置开关 |
| 开路电位 | `OCP_60s` | `measurement_duration` 转整数 |
| 恒电位 | `CA_800mV` | `polarization_voltage` |
| 恒电流 | `CP_-20mA` | `polarization_current` |
| 电压扫描 | `LSV_OCVtoOCV-500mV` | 起止电压及各自 absolute / ocv 参考 |
| 电流扫描 | `GSV_0mAto10mA` | 起止电流 |

电压、电流自动选取整数 V/mV/uV 或 A/mA/uA/nA，保留符号，按选定单位四舍五入。完整示例：`EIS_OCV_700C_100sccmH2_50sccmN2_261015_102030.ism`。直流测量写 `.csv`；真机 EIS 的 `.ism` 由 Thales 输出，存在时解析为同名 `.csv`；模拟 EIS 的 `.ism` 是文字占位文件，同时写同名 `.csv`，不能作为真机二进制文件使用。

环境来源是测量前读取的实际状态：Furnace `pv` 四舍五入成整数，MFC 使用 `flowSccm` 并在文件名中截断小数，气体按名称排序；不采用炉温或流量设定值。设备未连接时省略对应环境字段。

### 核查结论更正与验证边界

- 上轮固定时钟下的直接函数调用只能证明人为构造同名时的保存行为，不能证明正常串行实验会在同秒产生重名；撤回将其列为当前实际问题的判断，不增加防重名机制。
- 同名气体的多通道假设不符合用户当前样品场景，不作为本次问题或修改范围。
- 高级节点的同一父节点可能分散到多个时间目录；已对同一配置分别固定两个子步骤开始时间，确认输出目录不同。文件和高级目录的本地时间 / UTC 混用已在固定 UTC+8 时钟下复现。
- 当前 `NodeConfiguration.ts` 的节点参数没有自定义文件名入口。已按用户要求删除 `outputFileName → filename`、`filename=measurement` 缺省与属性名称标签，重新生成共享别名表。源码及生成类型无该别名残留；参数归一化与自动命名冒烟检查、共享类型及前端生产构建通过。真实文件名局部变量和测量结果中的 filename 仍表示自动生成的文件名。应用版本 `2.12.7 → 2.12.7`，仅清理未接入代码，不升级。
- 数值取整损失文件名精度，不同参数可得到相同标签；例如 `1.0004 V` 和 `1.00049 V` 均为 `1000mV`。原始测量参数不因命名取整而变化。
- 恒流 EIS 的命名分支只读 `eis_current`，驱动另读 `enable_dc_bias`；人为传入 false 才能进入两者不一致的分支。当前恒流 EIS 界面没有该开关，归一化默认 true，正常界面路径按所设电流命名和执行。撤回将异常参数分支直接列为当前界面故障的判断，不修改 EIS 行为。

既有验证仅覆盖隔离函数、模拟器和执行器，不证明现场发生重名、重复气体通道或恒流偏置开关误操作。高级节点改造须待用户确认方案和表头后再实施，未连接真机。

### 高级节点单文件拟议表头（待用户确认，未实施）

每次高级节点执行拟输出一份 CSV；以下按实际拟议列序列出全部表头，不包含隐藏列。

| 列序 | 恒流阶梯 | 恒压阶梯 | 恒流切换 | 恒压切换 |
| --- | --- | --- | --- | --- |
| 1 | `Time (s)` | `Time (s)` | `Time (s)` | `Time (s)` |
| 2 | `Step time (s)` | `Step time (s)` | `Step time (s)` | `Step time (s)` |
| 3 | `Step` | `Step` | `Step` | `Step` |
| 4 | `Set current (A)` | `Set potential (V)` | `Cycle` | `Cycle` |
| 5 | `Potential (V)` | `Potential (V)` | `Phase` | `Phase` |
| 6 | `Current (A)` | `Current (A)` | `Set current (A)` | `Set potential (V)` |
| 7 | 无此列 | 无此列 | `Potential (V)` | `Potential (V)` |
| 8 | 无此列 | 无此列 | `Current (A)` | `Current (A)` |

`Time` 为该高级测试累计时间，不随步骤重置；`Step time` 为当前步骤内时间。`Step`、`Cycle` 从 1 开始；切换 `Phase` 使用 1/2，分别对应配置的第一/第二个保持阶段。`Set current` / `Set potential` 为当前行对应的下发设定，`Potential` / `Current` 为实测值。保持 A、V、s 原始单位，不加入功率、面积归一化或其他派生列。此处只供审阅，不代表已改写 CSV 或报告读取。

## 历史数据库升级

未版本化数据库（`user_version=0`）在一个事务中创建缺失表、补齐允许为空或有默认值的列，再创建索引，最后写入迁移版本 1。已有字段、业务记录、测量文件路径保持不变；必填列或主键异常会报错并回滚，未来版本拒绝降级打开。

后续结构变更必须增加迁移阶段与数据保留验证。不得把更新应用版本作为迁移，也不能修改已经执行过的迁移行为来偷偷改变旧库。

报告结果别名集中在 `report_service.normalize_stored_result`。这是读取已存在实验数据的明确边界，不是提供第二套公开协议。前端不再接受旧报告字段；外部消费者需根据 API 4.1.0 和报告 3.0 更新。历史工作流节点参数与设备协议仍有各自的兼容读取，不能把报告规范化理解为所有设备参数都已强类型化。

产物来源与文件展示分开：后端补齐时按执行、节点、路径避免重复补入，并保留各节点的来源关联；前端展示按物理路径去重。同一个目录被多个步骤引用，不代表多份物理文件。

## 验证约定

涉及本规范的修改应验证：基线库数据保留、重复打开、迁移失败回滚、未来版本拒绝、空值与 0/false、真实档案身份、报告字段唯一性，以及由实际 Python 响应生成的前端消费检查。测试夹具和脚本放在仓库外或已忽略目录。
