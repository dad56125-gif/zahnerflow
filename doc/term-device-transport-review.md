# Term 到 Zennium 的底层通信分析

日期：2026-09-19。依据：用户提供的 Thales XT 5.9.5 安装包，选择性解包配置、PE 导入/导出表和厂商手册。没有加载执行 DLL、启动 Term、操作 USB 设备或修改系统驱动。本文记录已证实结构和静态分析边界，不是底层协议完整实现。

## 1. 两段不同的通信

```text
ZahnerFlow / thales_remote
    │ TCP 260：Remote2 客户端协议
    ▼
Windows 电脑上的 Term131.exe
    │ HAL 函数接口
    ├─ FTDIHAL.dll → FTD2XX.dll → Windows FTDI 驱动 → USB
    └─ USB2HAL.dll / Cypress 路径 → Windows Cypress 驱动 → USB
    ▼
Zennium 内部计算机上的 Thales / AMOS / Remote2
    ▼
仪器测量硬件
```

Term 不只是一个参数窗口。它承担工作站程序的电脑端界面、文件访问和外部 TCP/IP 接入。测量软件运行在仪器端；厂商的现行 Zennium/IM7 对比说明也明确：Zennium 由 Windows 上的 Thales 经 USB 控制，不能把 IM7 的 Ethernet/WebSocket 接口套用于 Zennium。

官方资料：[系统结构](https://doc.zahner.de/thales_remote/tcpip_protocol/index.html)、[Zennium 与 IM7 通信区别](https://doc.zahner.de/im7/en/applications/zennium_to_im7/index.html)。

## 2. 安装包中可直接验证的结构

输入包 SHA256：`03ECCC0C077A03B25FE8926B786EB9C4BBDF84C8B4163AB5F1806BFC6CA0568F`。

`C:\FLINK\usb.ini` 的 SETUP 段包含：

```ini
TermVersion=131.26.06.10
ThalesVersion=XT5.9.5
HALDLL=C:\FLINK\FTDIHAL.DLL
FTDIHAL=FTDIHAL.DLL
CypressHAL=USB2HAL.DLL
SERNUM=65535
USBWDTime=5000
USB2BUF=8192
DEVICESUP=on
DEVICESRV=127.0.0.1
```

这是安装载荷的默认配置，不代表实验电脑当前正在使用的驱动或序列号。`SERNUM=65535` 的特殊语义没有在本次证据中确认，不能直接解释成某一台仪器编号。

配置说明列出了旧 ISA、LPT、LPT+COM、TCP/IP remote 和 USB HAL。包内确有 `NetHAL2k.dll`，配置也有 `REMOTEHAL`/`REMOTEIPA`；这是另一种 HAL 路由能力，不足以证明 Zennium 本机提供可直接使用的以太网测量服务。

Term 的静态字符串包含 `HALDLL`、`LinkIOInit`、`LinkIODone`、`ParSendBuffer`、`ParGetBuffer`、`SerSendByte`、`SerGetByte`，同时导入 Windows 动态加载函数。结合配置和 HAL 导出表，可以判断 Term 使用可替换 HAL 边界；具体初始化分支顺序尚未通过反汇编或运行追踪确认。

## 3. HAL 实际暴露什么

FTDIHAL、USB2HAL 共享的一组导出函数包括：

| 函数组 | 已观察到的函数 | 可推断的职责 |
|---|---|---|
| 生命周期 | LinkIOInit、LinkIODone、ResetHAL | 初始化、释放、链路重置 |
| 批量数据 | ParSendBuffer、ParGetBuffer、ParSendBuffer16、ParGetBuffer16 | 缓冲区传输 |
| 字节与就绪 | ParSendByte、ParGetByte、ParDataPresent、ParReadyToSend | 字节传输和就绪查询 |
| 另一组逻辑通道 | SerSendByte、SerGetByte、SerDataPresent、SerReadyToSend | 字节与状态传输 |
| 诊断和控制 | IsTimeOut、GetPerfData、SerNMI、SerGetEEPROM | 超时、性能、底层控制 |

这些职责解释依据函数名，尚无函数签名和调用约定证明；`Par`/`Ser` 也不能据此解释为设备外露的并口/COM 口，更不能映射到未经确认的 USB endpoint。

`FTDIHAL.dll` 的 PE 导入表明确依赖 `FTD2XX.DLL`，导入：

- 枚举和打开：`FT_CreateDeviceInfoList`、`FT_GetDeviceInfoList`、`FT_Open`、`FT_Close`。
- 数据：`FT_Read`、`FT_Write`、`FT_GetQueueStatus`、`FT_GetStatus`。
- 通信配置：`FT_SetTimeouts`、`FT_SetUSBParameters`、`FT_SetLatencyTimer`、`FT_SetEventNotification`、`FT_SetBitMode`。
- 清理和 EEPROM：`FT_Purge`、`FT_EE_Read`、`FT_EE_Program`。

因此，FTDI 路径通过 D2XX API 访问 USB，不能当成只需串口波特率的普通 SCPI 串口协议。导入 `FT_SetBitMode` 不能证明具体使用哪种 bit mode；同理不能仅凭 EEPROM 函数存在就断言每次启动会写 EEPROM。

Cypress 安装 INF 映射 `USB\VID_0547&PID_0080`，并包含另一条带 `USB1` 前缀的 `VID_04B4&PID_8613` 配置。它们只是驱动声明，不是当前已连接设备的硬件 ID。旧 USB HAL 和初始化 DLL 中可以看到 `DeviceIoControl`/`CreateFileA` 导入；具体 IOCTL、端点及设备内帧格式仍未知。

## 4. 一次测量在两段链路上的逻辑

1. Term 根据连接配置选择并初始化 HAL，访问相应 USB 设备。启动手册要求仪器开机且 USB 已连接；精确的启动包、加载流程和握手顺序尚未还原。
2. ZahnerFlow 连接 Term 的 TCP 260，并注册 `ScriptRemote`。这一段是公开 Remote2 协议。
3. 客户端启动 Remote2 并发送例如模式、幅值和 EIS 命令。仪器上的 Remote2 脚本解释测量命令并调用测量过程。
4. Term/HAL 承担中间运输；不能据此认为原始 ASCII 命令可以不加封装直接发给 FTDI USB。
5. 工作站运行测量并与 Term 交换显示、状态、结果等信息。Term 提供电脑文件访问；跨电脑结果再通过独立文件交换连接传回 ZahnerFlow。

这说明绕过 Term 不仅需要知道 `FT_Read/FT_Write`，还需要重现其上层消息、会话、启动和文件/显示服务。当前没有找到这部分完整公开协议，HAL 导出表也不是经过确认的可独立使用 SDK。

## 5. 与偶发卡死直接相关的机制

### USB 看门狗和接收缓冲

默认配置为 `USBWDTime=5000` 和 `USB2BUF=8192`。FTDIHAL 字符串明确包括 `WDTimeout = %d ms.` 和 `USB2BUF = %d byte.`，也包含 `WDTimeOut Thread 1.` 至 `Thread 4.`、`USB-Reconnection`、设备不存在或已占用的错误文本。

这表明 HAL 内有看门狗、缓冲和重连相关逻辑。但静态字符串不能证明超时后一定自动恢复，更不能把 5000 ms 当作 EIS 测量完成超时。本次未改这些设置。

### Term 活性与工作站活性不同

安装包 `DevCli.pdf` 第 8 页说明，HeartBeatTime 是距工作站上次通信的毫秒数。测量时图形数据刷新会重置它；EIS 点间隔依频率变化，测量结束后它也可能持续增长。

因此不能把心跳增加直接判为 USB 断开，也不能把 TCP 连接存在直接判为仪器正常。至少需要联合判断 Term 是否回复、工作站最近通信、当前命令以及测量频率/阶段。

本地 `thales-remote 1.2.8` 提供 `getWorkstationHeartBeat(timeout=...)`；其默认等待无限。`getTermIsActive()` 仅确认 Term 在期限内返回行政通道回复，不检查心跳数值。因此它确认的是电脑端回应能力，不是仪器端就绪。

### 长等待不是硬件故障证据

同一 DevCli 手册第 9 页说明，DLL 的 Busy 状态等待默认可约为一天。这是 DevCli 路径的默认行为，不能套用为 Python 客户端实际超时；当前 Python 的部分等待没有默认期限。

GUI 不动、TCP 无回复、USB 链路不再交换数据、仪器端程序陷入循环，是不同故障。安装包 `Diagnostics_and_Troubleshooting.pdf` 的 program crash 章节明确区分 Windows 电脑侧和仪器 Thales 侧，不支持仅凭窗口卡住就认定硬件损坏或 Term 单独故障。

## 6. 下一步定位应采什么证据

首先读取实际实验电脑的 Term 启动命令、使用的 ini、HALDLL、驱动版本和 USB 硬件 ID，确认走 FTDI 还是 Cypress。

厂商诊断手册说明 `C:\FLINK` 中日志通常与 ini 同名，默认 `usb.log`，记录会话起止和异常；Z-Trace 可查看运行诊断。包内 Term/HAL 还包含 `__FLinkDG.log` 字符串，但不能保证该日志默认生成。

一次卡死需要同时保留：最后发出的 Remote2 命令与时间、Term 窗口响应情况、工作站心跳变化、当前测量条件、USB 设备枚举变化、厂商日志。只有这些时间线对齐后，才能决定修客户端等待、HAL/USB 问题还是仪器端程序。

本机只读检查未发现默认 `C:\FLINK\usb.ini`、`usb.log`、`Term131.exe` 或匹配的 Term 进程；这不排除其他安装位置。本次没有实际实验电脑日志或 USB 抓包，所以不能认定这次偶发卡死的根因。

若需要更深入到 USB 帧级，还需实际设备、已确认的驱动路径和受控通信记录，或厂家 HAL 接口/设备协议说明；不能仅凭安装包声称已经掌握完整协议。

## 7. 验证与版本

选择性解包完成；通过 PE 导入/导出表确认 FTDIHAL 到 FTD2XX 的依赖；核对 usb.ini、驱动 INF、安装及故障诊断手册、DevCli 心跳语义和本地 SDK 实现。解包文件和二进制检查结果位于 `%TEMP%/zahner-thales-595-audit/transport`，不提交厂商文件。

本次只增加分析文档，应用版本 `2.2.1 -> 2.2.1`，不升级；没有更改设备行为、架构或接口。
