# Thales文件筛选结果

上一轮728个是检查范围，不是用途筛选。现在按直接通讯、EIS、LSV、OCV及偏移校准的目标，明确缩小下一步研究范围。

- 03_本轮排除：**555个**。
- 02_有问题再查：**151个**。
- 01_现在研究：**22个**。

[打开筛选入口](../archive/thales-xt-5.9.5-research/focus/README.md)。22个优先原文件已另复制成工作集，每份大小和哈希与原件一致；其余不混入工作集。

## 22个优先文件及用途

| 文件 | 为什么留下 |
|---|---|
| `C_/FLINK/Term131.exe` | 研究Term如何连接设备，定位需要替代的部分 |
| `C_/FLINK/FTDIHAL.dll` | 研究现在的USB通讯与卡死相关处理 |
| `C_/FLINK/usb.ini` | 确认软件选择了什么通讯方式和等待设置 |
| `C_/FLINK/ftd2xx.dll` | 对照旧Term实际配套的通讯库 |
| `C_/THALES/usb/FTDI/ftd2xx.h` | 直接调用通讯库的接口说明 |
| `C_/THALES/usb/FTDI/amd64/ftd2xx64.dll` | 64位程序直接通讯的候选库 |
| `C_/THALES/usb/FTDI/Static/amd64/ftd2xx.lib` | 把通讯代码编入程序的候选材料 |
| `C_/THALES/script/remote2/source/remote2.is_` | EIS、IE及电位读取等远程命令的处理过程 |
| `C_/THALES/script/remote2/rules/remote2.ini` | 远程命令的参数与保存路径 |
| `C_/THALES/script/meas/meas141.is_` | 已找到偏移校准和采样函数的源码代表；不是已证明的当前运行版本 |
| `C_/THALES/script/checkcell/cc_nosin13.is_` | 校准检查与校准文件读写流程的源码代表 |
| `C_/THALES/im5.rtm` | 当前安装包测量核心，对照源码与实际模块依赖 |
| `C_/THALES/script/sequencer/source/sequencer.is_` | 斜坡、保持、开路电位等设备序列的实现 |
| `C_/THALES/script/sequencer/rules/sequencer.ini` | 设备序列的采样和限制设置 |
| `C_/THALES/script/sequencer/examples/ocptest.seq` | 开路电位步骤的具体例子 |
| `C_/THALES/script/sequencer/examples/sawtooth.seq` | 电位扫描步骤的具体例子 |
| `C_/THALES/Manuals/Thales/Remote.pdf` | 远程命令说明 |
| `C_/THALES/Manuals/Thales/DevCli.pdf` | 通讯等待、心跳与返回状态说明 |
| `C_/THALES/Manuals/Thales/ANDIBasic.pdf` | 读懂设备脚本和硬件操作的说明 |
| `C_/THALES/Manuals/Thales/EIS.pdf` | EIS参数与工作方式说明 |
| `C_/THALES/Manuals/Thales/IE.pdf` | 电流电位扫描参数说明 |
| `C_/THALES/Manuals/Thales/Sequencer.pdf` | 扫描、保持和开路步骤的语法说明 |

备用材料只有遇到具体问题再查；本轮排除材料不再继续分析。排除是针对本次目标，不是永久无用或可删除的判断。这份清单也不是已经验证的程序运行依赖表。

原始728个文件未删除，便于有证据时恢复个别依赖；后续默认只围绕22个工作集推进。

仅研究文档与本地材料整理，版本2.2.1 → 2.2.1，不升级。
