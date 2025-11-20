1. 项目重构综述 (Project Refactoring Overview)
核心目标：解决 MFC 模块状态管理混乱、前后端逻辑割裂、代码过度设计（Over-engineering）及用户体验断层问题。
执行结果：完成从“臃肿中间件模式”到“精简驱动+状态机模式”的架构转型。后端代码量缩减约 60%，Python 驱动层缩减约 70%，前端实现“无感连接”与“所见即所得”的状态同步。
2. 架构设计原则重塑 (Architecture Principles)
单一数据源 (Single Source of Truth)：确立 Node.js 后端 为状态唯一持有者。前端 Modal 仅作为状态的“渲染器”与指令的“发射器”，禁止前端组件持有独立的、持久的连接状态。
去伪解耦 (True Decoupling)：废弃基于字符串的 passthrough 透传模式，建立基于 Interface 的强类型直接调用链路。Controller 直接调用 Service 具体方法，Service 调用 Device 抽象层。
驱动层轻量化 (Thin Driver Layer)：剥离 Python 端复杂的会话管理（Session）、事件队列与定时器。将业务逻辑循环（Loop Control）上移至 Node.js，Python 仅负责原子化的串口指令收发。
并发模型确认：确认 MFC 与 Furnace 采用独立的 WebSocket 通道与 Service 实例。MFC 采用 串行轮询（Serial Polling） 机制（Node.js for 循环 + await），利用 Node.js 事件循环处理高并发，无需复杂的 Python 多线程锁。
3. 后端核心重构实施 (Backend Implementation)
3.1 核心业务层 (mfc.service.ts)
移除冗余逻辑：彻底删除 RealtimeScan（实时扫描会话）及其相关的所有 Session 管理、事件轮询代码。删除 passthrough 及其 20+ 行 switch 语句。
逻辑简化：将扫描逻辑统一为 _performAsyncScan，采用“发现即推送”模式（WebSocket device_discovered），无需维护会话 ID。
接口补全：显式实现 health、get_available_ports、read_gas_name、read_active_setpoint 等方法，供 Controller 直接调用。
类型修复：在 setFlowRateControl 返回对象中显式添加 error?: string 定义，解决 execution.service.ts 编译报错问题。
防御性编程：在工作流调用入口增加 try-catch 及连接状态检查，防止未连接状态下运行工作流导致的崩溃。
3.2 控制层 (mfc.controller.ts)
强类型改造：将所有 API 端点从 passthrough('method') 改为直接调用 this.mfcService.method()。
Bug 修复：修复了 getGasName 和 getActiveSetpoint 因 passthrough 缺失 Case 导致的运行时错误。
接口清理：移除了不再支持的 realtime-scan 相关路由。
3.3 设备通信层 (mfc-device.service.ts)
死代码清洗：删除了 scan_devices（批量扫描）及所有兼容性 Alias 方法（如 ports() 调用 get_available_ports()）。
核心保留：仅保留 Axios 实例配置及原子操作封装（scan_single_address, connect_device, read_status 等）。
3.4 错误处理层 (mfc-error-handler.service.ts)
去熔断器化：移除了复杂的 Circuit Breaker 状态机（Open/Closed/Half-Open）、失败计数阈值及重置逻辑。
功能保留：保留了统一的 handleError 日志记录、错误分类（Error Categorization）及 Axios 错误格式化功能。保留了空方法签名以维持兼容性。
3.5 网关层 (mfc.gateway.ts)
类型定义修正：在 MfcConnectionUpdateMessage 和 MfcStatusUpdateMessage 接口中补全 status 类型定义，显式添加 'connecting' 状态，解决类型不匹配警告。
4. Python 驱动层重构 (mfc_device.py)
代码缩减：从 ~1100 行缩减至 ~370 行。
逻辑剥离：移除了所有 ScanSession、threading.Event、BackgroundWorker 等复杂并发逻辑。
真实交互实现：
read_gas_name: 实现发送 0x66, 0x01, 0x01 指令读取真实气体名称（原为硬编码 "N2"）。
scan_address: 逻辑闭环，扫描时自动尝试读取流量、满量程及气体名称，失败则使用默认值 fallback。
规范化：
引入 Pydantic 模型（ConnectRequest, ScanRequest）替代 body.get()，增强参数校验。
修复 Optional 类型提示，解决 Pylance 静态检查报错。
实现 _parse_string 方法解析 ASCII 串口响应。
5. 前端逻辑与体验重构 (Frontend Implementation)
5.1 状态管理 Hook (useMfc.ts)
智能初始化 (ensureConnection)：
Sync First：组件加载时，优先调用 MfcApi.getConnectionStatus() 同步后端真实状态。
Branch Logic：
若后端已连接：设置状态为 connected -> 自动调用 refreshDevices() 拉取设备列表。
若后端未连接：设置状态为 disconnected -> 自动调用 get_available_ports() 拉取端口列表。
逻辑闭环：
connect()：成功后自动触发设备刷新。
disconnect()：成功后自动清空设备列表并重新拉取端口。
5.2 API 服务 (mfcApi.ts)
新增接口：添加 getConnectionStatus 静态方法，对接后端 /connection/status 路由。
5.3 交互面板 (MFCConnectionPanel.tsx)
UI 减负：删除了“刷新端口”按钮（改为自动加载）。
安全逻辑：删除了“列表加载即自动选中第一个端口”的危险逻辑，强制用户手动选择端口。
状态反馈：按钮增加 connecting 状态（禁用并显示 loading），防止重复点击。
6. 待优化项与后续路线图 (Pending & Roadmap)
6.1 遗留架构清理 (Legacy Cleanup)
Furnace 模块重构：目前 Furnace 模块仍运行旧版架构（包含复杂的 CircuitBreaker 和可能的 passthrough）。
Action: 参照 MFC 重构方案，对 furnace.service.ts, furnace-error-handler.service.ts 进行同样的“减肥”操作。
双重初始化修复 (Double Instantiation)：
Issue: 日志显示 MfcGateway, WorkflowGateway 被初始化了两次。
Action: 检查 app.module.ts 及各子模块的 imports，消除重复引用，确保单例模式。
6.2 日志系统优化 (Logging Strategy)
现状：控制台日志包含大量 undefined 噪音，且在启动时打印巨大的 JSON 对象，严重拖慢 I/O 性能。
目标：实现“分流日志（Flight Recorder Pattern）”。
Action: 修改 ConsoleDisplayManager 或 SimpleEventBus：
Console: 仅输出极简摘要（时间戳 + 级别 + 标题）。
File: 将完整 JSON 异步写入 logs/app-YYYY-MM-DD.log 文件。
Fix: 增加空值检查，消除 undefined 打印。
6.3 生产环境准备
数据持久化：目前 mfc-data.service.ts 使用内存数组存储历史数据。生产环境需迁移至 SQLite 或 InfluxDB。