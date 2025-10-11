# Furnace & MFC 集成方案（合并版）

本文件整合并取代以下文档（内容已合并统一）：
- `doc/Todo/Furnace-MFC-方案.md`
- `doc/Todo/Furnace-MFC-方案-附加修订v4.md`

目标：在保持当前“纯线性”工作流的前提下，集成 Furnace（温控仪 AI‑518P）与 MFC（流量计）。FastAPI 仅提供基础的即时读写与扫描；NestJS 后端负责预设管理（含幂等与回滚、5 秒限流）、采样与历史查询；前端在 Topbar 提供面板与节点（本阶段只提供接口，不做前端实现）。

## 1. 约束与目标
- 纯线性执行：每完成一个节点后进入下一个节点；不引入 Guard/Barrier。
- FastAPI 仅本机访问（127.0.0.1）且严格 CORS；串口超时统一 1s。
- MFC 扫描地址默认十进制 32..80；以 sccm 下发设定；扫描到设备后仅读取一次并缓存元数据（气体类型、满量程）；暂不提供 Hold/Follow 切换。
- 采样与历史查询：纳入本阶段（默认 1s、内存 1h、文件按日归档、后端查询聚合）。
- 预设管理：名称全局唯一，记录 createdAt/updatedAt；支持“创建副本（clone）”；应用预设具备幂等与失败回滚；对预设相关“写入类” API 施加 5 秒限流。

## 2. 目录与环境
- Python FastAPI：
  - `apps/backend/src/modules/Furnace/fastapi/ai518p_device.py`
  - `apps/backend/src/modules/MFC/fastapi/mfc_device.py`
- NestJS 模块与设备服务：
  - `apps/backend/src/modules/furnace/*`，`apps/backend/src/devices/furnace-device.service.ts`
  - `apps/backend/src/modules/mfc/*`，`apps/backend/src/devices/mfc-device.service.ts`
- 环境变量：
  - `FURNACE_FASTAPI_URL=http://127.0.0.1:8011`
  - `MFC_FASTAPI_URL=http://127.0.0.1:8010`

## 3. FastAPI（仅基础能力）

Furnace（AI‑518P）：
- `GET /health`：存活检查
- `GET /ports`：枚举串口
- `POST /connect`：`{ port, baudrate=9600, address=1, stopbits=2, timeout=1.0 }`
- `POST /disconnect`
- `GET /status`：`{ pv, sv, mv, status, segment, segmentTime, segmentTimeSet }`
- `POST /run`、`POST /pause`、`POST /stop`（写 0x15：0/4/12）
- `POST /sv`：`{ sv:number }`（°C，内部 ×10 写 0x00）
- `POST /segment/set`：`{ segment:number }`（写 0x00，切段）
- `GET /program/segments` → `[{ id, temperature, time }]`
- `POST /program/segments`：批量写回 `[{ id, temperature, time }]`

MFC：
- `GET /health`、`GET /ports`、`POST /connect { port, baudrate=19200, timeout=1.0 }`、`POST /disconnect`
- `POST /scan { start?:number=32, end?:number=80 }` → `[{ address, gasType, maxFlowSccm }]`（扫描后元数据仅读一次）
- `GET /status?address=A` → `{ address, flowPercent, flowSccm, digitalSetpointPercent, activeSetpointPercent }`；无参数返回所有已发现设备数组
- `POST /setpoint { address, sccm:number }`（按满量程换算 UFRAC16 写数字设定）

说明：FastAPI 不实现任何预设、采样/历史查询或数据库写入。

## 4. 后端（NestJS）API 与策略

控制器路由（建议小写）：
- Furnace：`/api/devices/furnace/*`
- MFC：`/api/devices/mfc/*`

Furnace（后端对外接口）：
- 透传控制：`POST /connect|disconnect|run|pause|stop`、`GET /status`、`POST /sv`、`POST /segment/set`、`GET|POST /program/segments`
- 预设管理（仅后端）：
  - `GET /presets` → `[{ name, createdAt, updatedAt, summary? }]`
  - `POST /presets` `{ name, segments }`（创建，名称唯一）
  - `GET /presets/:name` → `{ name, createdAt, updatedAt, segments }`
  - `PUT /presets/:name` `{ segments }`（更新）
  - `DELETE /presets/:name`
  - `POST /presets/:name/clone` `{ newName }`
  - `POST /presets/:name/apply`（应用预设到当前设备；具备幂等与失败回滚）
- 历史查询：`GET /logs/temperature?from=ISO&to=ISO&limit=1000&downsample=10`

MFC（后端对外接口）：
- 设备：`POST /scan`（透传且后端维护“已发现设备”缓存）、`GET /devices`（读取缓存）
- 状态/控制：`GET /status[?address=A]`、`POST /setpoint`
- 历史查询：`GET /logs/flow?address=A&from=ISO&to=ISO&limit=1000&downsample=10`

策略：
- 预设写入限流：对创建/更新/删除/克隆/应用预设接口执行 5 秒限流（命中返回 429，提示剩余等待时间）。
- 幂等与回滚（应用预设）：应用前读取当前设备“程序段快照”；基于差异逐段写入并回读校验；任一步失败则按快照逐段写回；全流程记录日志；重复应用预设不会产生额外变更。

## 5. 采样与历史查询（后端实现）
- 采样调度：全局默认间隔 1s；设备在线即采样；内存环形缓冲保留近 1 小时；超出部分滚动写入轻量 JSON 文件；按日归档并建立简易索引（文件名包含日期、设备标识）。
- Furnace 采样点：`{ ts, pv, sv, mv, segment, segmentTime, segmentTimeSet }`
- MFC 采样点：`{ ts, address, flowSccm, flowPercent, digitalSetpointPercent, activeSetpointPercent }`
- 历史查询：聚合内存 + 文件数据；可选 `downsample` 参数用于抽稀。

## 6. 前端 API 契约（供前端调用）

Furnace：
- 状态/控制：`GET /api/devices/furnace/status`、`POST /sv`、`POST /segment/set`、`GET|POST /program/segments`
- 预设：`GET/POST/GET(one)/PUT/DELETE/POST clone/POST apply`
- 历史：`GET /api/devices/furnace/logs/temperature?from&to&limit&downsample`

MFC：
- 设备：`POST /api/devices/mfc/scan`、`GET /api/devices/mfc/devices`
- 状态/控制：`GET /api/devices/mfc/status[?address=A]`、`POST /api/devices/mfc/setpoint`
- 历史：`GET /api/devices/mfc/logs/flow?address=A&from&to&limit&downsample`

## 7. 类型（Types）
- `ProgramSegment`：`{ id:number, temperature:number, time:number }`
- `FurnacePresetMeta`：`{ name:string, createdAt:string, updatedAt:string, summary?:string }`
- `FurnacePreset`：`{ name:string, createdAt:string, updatedAt:string, segments:ProgramSegment[] }`
- `MfcDeviceInfo`：`{ address:number, gasType:string, maxFlowSccm:number }`
- `MfcStatus`：`{ address:number, flowPercent:number, flowSccm:number, digitalSetpointPercent:number, activeSetpointPercent:number }`
- `MfcSetpointRequest`：`{ address:number, sccm:number }`
- 采样点：
  - `FurnaceSample`：`{ ts:string, pv:number, sv:number, mv:number, segment:number, segmentTime:number, segmentTimeSet:number }`
  - `MfcSample`：`{ ts:string, address:number, flowSccm:number, flowPercent:number, digitalSetpointPercent:number, activeSetpointPercent:number }`

## 8. 约束（Constraints）
- 单元测试：每完成一项 TODO，必须补充/更新并通过；涉及设备通讯的测试以 Mock/Stub 方式跳过真实设备能力，聚焦业务逻辑与数据转换。
- 执行日志：每项 TODO 完成后，必须在 `doc/EXECUTION_LOG.md` 追加一条记录（时间、内容、涉及文件、测试状态）。
- 限流：预设相关写入接口（创建/更新/删除/克隆/应用）执行 5 秒限流（命中返回 429）。
- 文档交付：最终提供“新增功能汇总文档”（本文件可作为基础）。

## 9. TODO 清单（按实施顺序）
- [ ] Types：在 `@zahnerflow/types` 增补导出 ProgramSegment、FurnacePresetMeta、FurnacePreset、MfcDeviceInfo、MfcStatus、MfcSetpointRequest、FurnaceSample、MfcSample。
- [ ] FastAPI/Furnace：实现第 3 节 Furnace 端点（仅基础能力）。
- [ ] FastAPI/MFC：实现第 3 节 MFC 端点（仅基础能力）。
- [ ] 后端/Furnace：设备服务与模块桥接；预设 CRUD/clone/apply（含幂等与回滚）；预设写入 5 秒限流。
- [ ] 后端/MFC：设备服务与模块桥接；维护扫描缓存与 `/devices` 接口。
- [ ] 采样调度：Furnace/MFC 1s 采样、内存 1h 保留、JSON 滚动落盘、按日归档与索引。
- [ ] 历史查询：实现 Furnace/MFC 查询端点（from/to/limit/downsample），聚合内存 + 文件数据。
- [ ] 单元测试：为以上各项补充业务逻辑层单测（Mock FastAPI/时间/文件）。
- [ ] 执行日志：每完成一项，在 `doc/EXECUTION_LOG.md` 追加记录。
- [ ] 文档汇总：完善/更新本合并文档，作为“新增功能汇总文档”。

---

如需按该清单开始实施，请确认。完成每项后我将勾选对应条目并在 `doc/EXECUTION_LOG.md` 记录。
