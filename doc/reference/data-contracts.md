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

## 历史数据库升级

未版本化数据库（`user_version=0`）在一个事务中创建缺失表、补齐允许为空或有默认值的列，再创建索引，最后写入迁移版本 1。已有字段、业务记录、测量文件路径保持不变；必填列或主键异常会报错并回滚，未来版本拒绝降级打开。

后续结构变更必须增加迁移阶段与数据保留验证。不得把更新应用版本作为迁移，也不能修改已经执行过的迁移行为来偷偷改变旧库。

报告结果别名集中在 `report_service.normalize_stored_result`。这是读取已存在实验数据的明确边界，不是提供第二套公开协议。前端不再接受旧报告字段；外部消费者需根据 API 4.1.0 和报告 3.0 更新。历史工作流节点参数与设备协议仍有各自的兼容读取，不能把报告规范化理解为所有设备参数都已强类型化。

产物来源与文件展示分开：后端补齐时按执行、节点、路径避免重复补入，并保留各节点的来源关联；前端展示按物理路径去重。同一个目录被多个步骤引用，不代表多份物理文件。

## 验证约定

涉及本规范的修改应验证：基线库数据保留、重复打开、迁移失败回滚、未来版本拒绝、空值与 0/false、真实档案身份、报告字段唯一性，以及由实际 Python 响应生成的前端消费检查。测试夹具和脚本放在仓库外或已忽略目录。
