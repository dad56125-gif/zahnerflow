# Thales 核心研究范围与专题入口

本次只整理研究资料，不修改设备驱动或运行架构。完整本地入口：[核心阅读目录](../archive/thales-xt-5.9.5-research/focused/README.md)。目录位于已忽略的本地研究包，原始厂商文件不进入 Git。

## 互斥的原文件分类

| 分类 | 文件数 | 意义 |
|---|---:|---|
| 核心必读 | 7 | Term、FTDIHAL、USB 配置、D2XX 头文件、Remote2 源码、Sequencer 源码、IM5 核心二进制 |
| 配套与依赖核验 | 6 | D2XX DLL、测量源码及运行时、Remote2 / Sequencer 配置与 Sequencer 运行时 |
| 待确认 | 621 | 尚未逐项证明与目标功能的依赖关系，暂不进入优先阅读范围 |
| 历史比较 | 36 | 历史版本与版本演进材料 |
| 手册与示例 | 58 | 按具体问题查阅 |
| 合计 | 728 | 每个原文件只属于一个主分类 |

这些是研究优先级，不是部署依赖清单。配套材料的运行时加载关系仍需核验；待确认不等于无用。另存的 SDK / ZahnerFlow 代码快照不计入 728 个安装包文件。

## 十个专题

1. [HAL 初始化](../archive/thales-xt-5.9.5-research/focused/10_hal_init.md)：设备发现、A/B 通道、ABI、窗口与消息泵。
2. [HAL 收发](../archive/thales-xt-5.9.5-research/focused/11_hal_transport.md)：缓冲区、长度编码、返回值、短写与帧边界。
3. [HAL 恢复](../archive/thales-xt-5.9.5-research/focused/12_hal_recovery.md)：阻塞、看门狗、取消、关闭与重连。
4. [Term / Remote2 协议](../archive/thales-xt-5.9.5-research/focused/13_terminal_protocol.md)：握手、消息分派、应答及主机服务。
5. [偏移校准](../archive/thales-xt-5.9.5-research/focused/14_calibration.md)：CALOFFSETS 到 chkcal，当前算法缺口单独跟踪。
6. [EIS 参数与启动](../archive/thales-xt-5.9.5-research/focused/15_eis_setup.md)：设置顺序、限值和测量入口。
7. [EIS 结果](../archive/thales-xt-5.9.5-research/focused/16_eis_results.md)：完成判断、Dev65、文件服务与 ISM 解析。
8. [LSV 两条候选路径](../archive/thales-xt-5.9.5-research/focused/17_lsv.md)：IE 与设备序列斜坡分别验证。
9. [OCV/OCP](../archive/thales-xt-5.9.5-research/focused/18_ocp.md)：开路状态、读数、时间与停止条件。
10. [ZahnerFlow 接入](../archive/thales-xt-5.9.5-research/focused/19_integration.md)：当前驱动边界与最小接口需求。

各专题均列出少量具体阅读入口、范围、待解决问题和接入判断，不以文件拆分代替协议验证。建议先完成 HAL 与 Term 协议专题，再研究最小 OCP 测量链路。

## 验证与版本

逐文件分类、原路径、SHA256 和分类原因保存在本地 `focused/classification.json`；生成脚本为 `tools/build_focused_reading.py`。已验证 728 个文件主分类唯一、原文件哈希一致、专题链接有效。未移动或修改厂商原文件。

版本 `2.2.1 → 2.2.1`：仅研究文档整理，不升级应用版本。
