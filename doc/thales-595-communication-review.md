# Thales XT 5.9.5 与 ZahnerFlow 通信核查

核查日期：2026-09-19。范围：用户提供的安装包、当前驱动及本地安装的官方 Python 库。本文是研究结论和改进清单，不表示以下建议已经实现或经过真机验证。

## 证据与方法

- 输入：`C:/Users/Dushuaijia/Downloads/ThalesXT5.9.5_Setup.exe`，282,353,312 字节。
- SHA256：`03ECCC0C077A03B25FE8926B786EB9C4BBDF84C8B4163AB5F1806BFC6CA0568F`。
- 7-Zip 只读列出 NSIS 载荷，共 5,023 个文件；选择性解包了 9 个手册、脚本和示例文件，没有启动安装程序或仪器。
- 安装包内 `C:\THALES\Manuals\Thales\Remote.pdf`：44 页；本文重点使用 PDF 第 11-16 页（印刷页 8-13）。
- 安装包内 `DevCli.pdf`：11 页；`Sequencer.pdf`：18 页；`EIS.pdf`：74 页。本次没有逐页审计整个 EIS 手册。
- 安装包内 `C:\THALES\script\remote2\source\remote2.is_`、`rules\remote2.ini`，以及 Sequencer 示例 `galpot4.seq`、`sawtooth.seq`。
- 脚本是带特殊编码标记的 ANDI 源文件；只为检索转换换行并以 Latin-1 解码，未执行或修改原文件。以下以过程标签定位，不依赖编码转换后的行号。
- 当前 Python 包：`thales-remote 1.2.8`，其源码声明最低 Thales 版本为 `5.9.3`。安装包名为 5.9.5，只能说明候选版本满足此门槛，不能代替对实际运行的 Term/工作站版本握手。
- 解包和临时验证文件保存在 `%TEMP%/zahner-thales-595-audit`，厂商二进制、手册全文和临时测试没有纳入仓库。

参考官方说明：

- [TCP/IP 协议与系统结构](https://doc.zahner.de/thales_remote/tcpip_protocol/index.html)
- [连接 API](https://doc.zahner.de/thales_remote/connection.html)
- [文件传输 API](https://doc.zahner.de/thales_remote/file_interface.html)
- [官方 Remote2 手册](https://doc.zahner.de/manuals/remote2.pdf)

## 1. 软件的实际分工

通信主路径为：

```text
ZahnerFlow ExecutionPlan / AppRuntime
  -> DeviceManager -> ZahnerDevice / logic.py
  -> thales_remote -> TCP 260 -> 电脑上的 Term
  -> 工作站上的 Thales / Remote2 -> Zennium 测量硬件
```

`host` 指运行 Term 的电脑，不应笼统描述为工作站自身的 IP。Term 负责界面、电脑文件访问及网络通信。ZahnerFlow 当前选择官方 `thales_remote` 是合适的，无须增加独立设备服务或另写 USB 协议。

Remote2 控制连接名固定为 `ScriptRemote`，在线数据连接名为 `Logging`；文件交换可使用独立 `FileExchange` 连接。它们是同一 Term 的不同用途连接，不是新增后端进程。控制连接不能被另一个程序重复占用。

Remote2 命令是带冒号分隔的 ASCII 字符串。普通命令与耗时测量需要不同的等待策略；EIS/CV/IE 后面的命令不能简单拼在同一串里，手册明确说明测量之后的命令不会继续处理。

应继续让官方库承担报文封装，不把 DevCli.dll、Python 库和手写 socket 变成三套平行控制路径。

## 2. 已确定的问题

### P0：EIS 模式设置会清掉前面设置的幅值

位置：`apps/python_backend/devices/zahner/logic.py` 的 `measure_eis()`。

当前顺序是 `setAmplitude()`，然后 `setPotentiostatMode()`。安装包 Remote 手册的 operating mode 和 EIS 章节明确说明，模式命令会把幅值归零，幅值必须在模式之后设置。安装包 `remote2.is_` 的 `token098`、`token099` 也包含 `aMPL=0`。本地 SDK 的模式方法发送 `Gal=...:GAL=...`，并没有保存或恢复幅值。

建议顺序：明确设备及规则文件使用方式，设置模式，设置偏置，设置交流幅值与频率参数，读回配置，再启动 EIS。不要仅仅检查 API 没有抛异常。

单位也要区分：Python `setAmplitude()` 接收 V/A，内部乘以 1000 后写入 Remote2 的 mV/mA 参数。现有 `0.01` 表示 10 mV 或 10 mA，不应再次人为乘以 1000。

### P1：EIS 没有结果文件仍返回成功

同一函数只在本机检查 `.ism`；文件不存在时打印提示，解析异常也仅打印，随后仍返回 `status: success` 和可能为 `None` 的 `eis_data`。

改进应分清“仪器测量已返回”和“结果已传回并可用”。文件缺失、传输失败及解析失败应形成明确错误或明确的部分完成结果，保留已有原始产物与原因，不能把不存在的路径当成成功证据。

### P1：远程控制已经有 host，数据文件仍假设在同一电脑

`DeviceManager.connect_zahner()` 支持远程主机，但 `measure_eis()` 把本机输出目录转换为 Windows 字符串后交给 Term，再从本机同一路径取文件。

两台电脑的 `C:` 不是同一磁盘。官方 `ThalesFileInterface` 就是为远程文件回传设计。应分别表达 Term 侧测量目录与 ZahnerFlow 侧结果目录，按执行和步骤接收文件，再解析及登记产物。官方文件接口说明也明确指出 Term 测量文件不能直接保存到网络盘。

SDK 对 EIS 目录的说明要求使用 Term 电脑上存在的 C 盘目录；路径字符也受限制。中文用户目录、输出目录和文件名应单独验证，不能认为 Windows 本身支持就等于 Remote2 支持。

### P1：连接对象存在不等于设备当前在线

`real_device.py` 的 `connected` 只检查 wrapper；SDK 的 `isConnectedToTerm()` 只判断 socket 句柄不为 None。`DeviceManager.zahner_status()` 返回缓存布尔值，没有读取设备。

连接创建过程中，wrapper 构造、Remote2 切换或校准失败，当前局部 connection 未在统一异常分支中释放。SDK 断开本身包含等待回复，因此不能简单增加一个可能永久阻塞的清理调用就声称解决了问题。

建议由当前 AppRuntime 管理连接代次、带超时的活性确认及错误状态；区分 Term 可响应、Remote2 可用、工作站就绪和正在测量。测量期间的活性检测必须遵守协议通道与命令串行化，不能让状态轮询抢走测量回复。

### P1：斜坡扫描记录中混入设定值

`measure_ramp()` 在恒电位扫描中以 `current_setpoint` 作为 `curr_v`，恒电流扫描中以设定值作为 `curr_i`，再写入与实测量相同的字段并用于阈值判断。

建议分开保存设定值和实测值；电压、电流及安全判定应使用真实读回。读取时刻也要明确，因为依次读取的电压和电流不天然构成同步采样对。

另外，斜坡先 `enablePotentiostat()`，随后才在循环内设置起始值；应在开启输出前确定起始条件。计时测量和斜坡的 finally 块先保存文件，再关闭输出，保存异常可能跳过关闭。应分别保证数据收尾和设备收尾都能被尝试，并保留原始异常。

## 3. 必须真机验证或进一步设计的事项

### EIS 取消

当前执行语义明确将 EIS 标记为 `interruptible=False`；驱动阻塞调用 `measureEIS()`，没有读取取消回调。这是现有边界，不能把工作流“停止请求”理解为当前 EIS 已停止。

本次未证实 5.9.5 上存在可以安全用于生产的即时中断流程。不要臆造 `abortEIS()`，也不要从另一线程向同一回复队列随意发送关闭输出命令。需要用假负载验证停止请求、设备输出、部分文件、远端忙状态和再次测量的完整过程后，才能改变取消契约。

### 无偏置 EIS 和残留配置

无偏置分支只打印 OCP/0A，没有显式建立相应初始状态。是否会继承上一测量的偏置、所选 EPC、FRA 或规则文件，必须在真机确认。

包内 `remote2.ini` 的 `UseRuleFile=0` 只是出厂载荷中的初值；不能证明用户电脑上的运行状态。使用工作流显式参数时应显式关闭规则文件，并读回配置。实际选择主工作站还是 EPC 扩展必须来自真实实验配置。

### 主机轮询与设备序列

现有 OCP/CA/CP/斜坡由 Python 循环计时和读数。Remote 手册指出普通电压、电流读取包含多次平均，给出特定 Zennium PRO 的约 300 ms 单次读取示例；这不是所有型号的固定性能，实际采样上限需要测量。

Sequencer 支持 OCP、恒电位、恒电流、斜坡及采样设置，安装包示例含 `hold_cur`、`hold_pot`、`ocp`、`ramp_pot_t`。对于需要稳定时序的单个电化学节点，可评估由设备序列执行该节点，ZahnerFlow 继续协调炉子、气体和节点顺序。

不要把整个跨设备工作流再次编译成独立循环体系。设备序列仍需映射到现有 execution、步骤、迭代身份、取消及文件归档；其上传、限值、采样时间基准和数据回传都需单独验证。

### EIS 单程扫描

安装包 Remote 手册确认 ScanDirection 的含义是从起点到一个边界，再到另一个边界。这支持当前把起点固定到边界并反向映射枚举的设计，不应按枚举名称表面含义改回。实际频率列表、端点是否重复与 multi-sine 行为仍需取真机 ISM 检查。

## 4. 建议实施顺序与验收

1. **先修测量正确性**：模式/幅值顺序，显式配置与读回，斜坡设定值和实测值区分，异常收尾。用已知假负载验证恒电位和恒电流 EIS 的实际激励与频率序列。
2. **补结果交付闭环**：区分本机和 Term 目录，接收并确认目标文件，保留原始 ISM，解析失败显式报告。验证同机、异机、无权限路径、重名和传输中断。
3. **补连接生命周期**：初始化失败清理、活性和状态分层、命令互斥、超时诊断。验证 Term 未启动、重复 ScriptRemote、断网和 Term 重启；重连不能自动重做已施加输出的测量。
4. **再做序列与中断能力**：先一个短 CA/斜坡节点，比较设定与实测采样周期，再扩展。EIS 即时取消须在厂家机制和真机实验都明确后另行实现。

所有修改继续通过 DeviceManager/AppRuntime 和现有 runtimeClient；新增状态或结果字段时先更新 shared contracts。不引入旧 worker IPC 或第二套运行时。

## 5. 本次验证与交付边界

在 `apps/python_backend` 上下文通过 `uv run` 执行仓库外的录制型替身验证，分别调用恒电位和恒电流 `measure_eis()`：

- 两种模式的调用顺序都是先设置幅值、再设置模式。
- 替身按照厂商已明确的模式清零行为模拟，启动测量时幅值均为 0。
- 两种模式均未生成 ISM，而现有函数仍返回 success。

以上是当前代码行为复现，不是真机测量，也不代表已经测得仪器实际激励为零。没有执行联网控制、校准、输出或固件更新。本次只新增研究文档，运行代码未修改，问题尚未修复。

版本判断：应用 `2.2.1 -> 2.2.1`，不升级；原因是仅新增开发研究文档。后续独立 bug 修复适用 PATCH；新增文件传输配置或设备序列能力需依据最终用户可见范围判断 MINOR。
