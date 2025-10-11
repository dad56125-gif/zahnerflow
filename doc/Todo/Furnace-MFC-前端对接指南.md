# Furnace / MFC 前端对接指南（接口与集成说明）

本指南面向前端开发，汇总此次更新后“后端可用接口”的清单与请求/响应约定，并给出页面与组件的最小实现建议。注意区分：
- NestJS 后端对外 API：前端应调用的正式接口（/api/devices/...）。
- FastAPI 设备 I/O：供后端设备层调用的内置服务（只做基础读写，不含预设/存储/历史），前端不要直接调用。

## 1. 总览与约束
- 采样与历史：默认 1s 采样，内存保留 1h，按日 JSONL 落盘；历史查询聚合内存+文件，支持 `from/to/limit/downsample`。
- 预设限流：Furnace 预设相关写入（创建/更新/删除/克隆/应用）5s 限流；命中返回 429。
- 命名与版本：Furnace 预设名称唯一；记录创建/修改时间；允许“创建副本”。
- 类型包：`@zahnerflow/types` 提供共用 DTO（ProgramSegment、FurnacePreset*、Mfc*、FurnaceSample、MfcSample）。

## 2. NestJS 后端对外 API（前端调用）

基址：`/api`（后端默认端口 3001）。

### 2.1 Furnace（加热炉）
- GET `/api/devices/furnace/status`
  - 返回：`{ pv:number, sv:number, mv:number, status:string, segment:number, segmentTime:number, segmentTimeSet:number }`
- POST `/api/devices/furnace/sv` `{ sv:number }`
  - 设置设定温度（℃）。
- POST `/api/devices/furnace/segment/set` `{ segment:number }`
  - 切换程序段（1..30）。
- GET `/api/devices/furnace/program/segments`
  - 返回 `ProgramSegment[]`：`[{ id:number, temperature:number(℃), time:number(秒) }]`
- POST `/api/devices/furnace/program/segments` `ProgramSegment[]`
  - 批量写入程序段（时间以秒传入，后端写入时换算为分钟）。
- 预设管理（名称唯一，5s 限流）
  - GET `/api/devices/furnace/presets` → `FurnacePresetMeta[]`
  - POST `/api/devices/furnace/presets` `{ name, segments, summary? }` → `FurnacePreset`
  - GET `/api/devices/furnace/presets/:name` → `FurnacePreset`
  - PUT `/api/devices/furnace/presets/:name` `{ segments }` → `FurnacePreset`
  - DELETE `/api/devices/furnace/presets/:name` → 204
  - POST `/api/devices/furnace/presets/:name/clone` `{ newName }` → `FurnacePreset`
  - POST `/api/devices/furnace/presets/:name/apply` → `{ changed:boolean, steps:string[] }`
- 历史查询（采样聚合）
  - GET `/api/devices/furnace/logs/temperature?from=ISO&to=ISO&limit=1000&downsample=10`
  - 返回：`FurnaceSample[]`

可选直通（若需要 UI 暴露）
- POST `/api/devices/furnace/connect|disconnect|run|pause|stop`（当前已在后端，按需接入前端按钮）。

### 2.2 MFC（质量流量计）
- POST `/api/devices/mfc/scan` `{ start?:number=32, end?:number=80 }`
  - 返回并缓存 `MfcDeviceInfo[]`：`[{ address, gasType, maxFlowSccm }]`
- GET `/api/devices/mfc/devices`
  - 返回缓存 `MfcDeviceInfo[]`
- GET `/api/devices/mfc/status[?address=A]`
  - 返回：单个或数组形式：
    - `{ address, flowPercent, flowSccm, digitalSetpointPercent, activeSetpointPercent }`
- POST `/api/devices/mfc/setpoint` `{ address:number, sccm:number }`
  - 以 sccm 下发数字设定（后端按满量程换算 UFRAC16）。
- 历史查询（采样聚合）
  - GET `/api/devices/mfc/logs/flow?address=A&from=ISO&to=ISO&limit=1000&downsample=10`
  - 返回：`MfcSample[]`

说明：如需在前端支持 Hold/Follow、Delay、Softstart、Shutoff（已在 FastAPI 设备层实现），后端将增加对应直通路由后再提供对外 API；当前前端仅对接上表接口即可。

## 3. FastAPI 设备 I/O（内部，不给前端调用）

仅列出关键端点，作为后端设备层对接参考。

### 3.1 Furnace FastAPI（AI‑518P）
- 基址（默认）：`http://127.0.0.1:8011`
- 端点：`GET /health`、`GET /ports`、`POST /connect|disconnect|run|pause|stop|sv|segment/set`、`GET|POST /program/segments`

### 3.2 MFC FastAPI（CS100 系列）
- 基址（默认）：`http://127.0.0.1:8010`
- 读：
  - 流量（UFRAC16 → 百分比）：`READ 0x68/0x01/0xB9`
  - 数字设定：`READ 0x69/0x01/0xA4`、当前设定：`READ 0x69/0x01/0xA5`、Hold/Follow：`READ 0x69/0x01/0x05`
  - 满量程：`READ 0x66/0x01/0x03`；气体名：`READ 0x66/0x01/0x01`
- 写：
  - Digital Setpoint（UFRAC16）：`WRITE 0x69/0x01/0xA4`
  - Hold/Follow（UINT8 0/1）：`WRITE 0x69/0x01/0x05`
  - Delay（UINT16）：`WRITE 0x69/0x01/0xA6`
  - Softstart（UFRAC16）：`WRITE 0x6A/0x01/0xA4`
  - Shutoff（UFRAC16）：`WRITE 0x6A/0x01/0xA2`

备注：FastAPI 对不同设备返回帧的解析遵循 GUI 实测：`payload[8:10]` 小端 UInt16；文本按 `length-3` 字节从 `payload[8:]` 解码 ASCII。

## 4. 前端实现建议（页面与组件）

### 4.1 Furnace 面板
- 状态卡片：显示 `pv/sv/mv/status/segment/segmentTime/segmentTimeSet`；按钮：运行/暂停/停止（可选）、切段、设置 SV。
- 程序段编辑器：表格查看/编辑 `ProgramSegment[]`，支持批量提交。
- 预设管理：列表（名称/时间），新建、编辑、删除、克隆、应用；写入类接口注意 429 限流（节流 UI，提示剩余时间）。
- 历史曲线：基于 `/logs/temperature`，支持时间范围、limit、downsample 抽稀；默认自动刷新（如每 2-5s 拉取最近窗口）。

### 4.2 MFC 面板
- 设备列表：调用 `scan` → `devices`，展示 address/gasType/maxFlowSccm。
- 状态卡片：每设备展示 `flowPercent/flowSccm/digitalSetpointPercent/activeSetpointPercent`。
- 设定控件：输入 sccm → `POST /setpoint`；成功后刷新 `status`。
- 历史曲线：`/logs/flow?address=A`，同 Furnace 曲线交互。

### 4.3 API 客户端与类型
- 统一使用 `@zahnerflow/types`：
  - `ProgramSegment`、`FurnacePresetMeta`、`FurnacePreset`、`MfcDeviceInfo`、`MfcStatus`、`MfcSetpointRequest`、`FurnaceSample`、`MfcSample`
- 前端服务层：`furnaceApi.ts`、`mfcApi.ts` 封装上述 HTTP 调用；加入请求节流（预设写 5s）。

## 5. 接口示例

### 5.1 Furnace
- 设置 SV
  - 请求：`POST /api/devices/furnace/sv` body: `{ "sv": 450 }`
  - 响应：`{ ok: true } | { error: string }`
- 预设应用（幂等 + 回滚）
  - `POST /api/devices/furnace/presets/EXP-01/apply`
  - 响应：`{ changed: boolean, steps: string[] }`
- 预设限流示例
  - 命中限流返回：`429 Too Many Requests` body: `{ message: "Rate limited. Retry after 3s." }`

### 5.2 MFC
- 设置流量
  - 请求：`POST /api/devices/mfc/setpoint` body: `{ "address": 33, "sccm": 120.0 }`
  - 响应：`{ address:33, sccm:120.0, percent: 12.0 }`
- 设备扫描
  - `POST /api/devices/mfc/scan` body: `{ "start":32, "end":80 }`
  - 响应：`[{ address:32, gasType:"N2", maxFlowSccm:1000 }, ...]`

## 6. 错误处理与回退
- 429：预设写入命中限流 → 引导等待后重试；前端需节流按钮防抖。
- 超时/离线：`/status` 返回字段缺省或错误时，视为设备离线；UI 显示“未连接/离线”。
- 历史查询：如时间范围过大建议启用 `downsample`，避免大响应。

## 7. TODO（前端）
- [ ] Furnace 状态卡片与 SV/切段操作接入。
- [ ] Furnace 程序段表格查看/编辑与批量提交。
- [ ] Furnace 预设管理（新建/编辑/删除/克隆/应用）与 429 提示。
- [ ] Furnace 温度历史曲线（from/to/limit/downsample）。
- [ ] MFC 扫描与设备列表。
- [ ] MFC 状态卡片与 sccm 设定。
- [ ] MFC 流量历史曲线（address+from/to/limit/downsample）。
- [ ] 公共：API 封装、错误提示、加载状态、自动刷新策略（短轮询）。

## 8. 附录：运行与验证
- 一次性安装：`pnpm install`
- 类型构建：`pnpm --filter @zahnerflow/types build`
- 后端冒烟（非阻塞）：`pnpm --filter backend smoke`
- 开发：
  - 后端：`pnpm --filter backend start:dev`
  - 前端：`pnpm --filter frontend dev`
 
### 8.1 本地启动 FastAPI 设备服务（看到 uvicorn 健康日志）
- Furnace（AI‑518P）：
  - `python -m uvicorn apps.backend.src.modules.Furnace.fastapi.ai518p_device:app --host 127.0.0.1 --port 8011 --log-level info`
- MFC（CS100）：
  - `python -m uvicorn apps.backend.src.modules.MFC.fastapi.mfc_device:app --host 127.0.0.1 --port 8010 --log-level info`
- 后端启动后会在模块初始化时访问这两个服务的 `/health`，你会在相应 uvicorn 控制台看到：
  - `INFO:     127.0.0.1:XXXXX - "GET /health HTTP/1.1" 200 OK`
- 也可手动验证：
  - `curl http://127.0.0.1:8011/health`、`curl http://127.0.0.1:8010/health`
