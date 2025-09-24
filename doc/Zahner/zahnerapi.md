# Zahner API 文档

## ThalesRemoteScriptWrapper 类

### 基础设备控制

#### 设备连接与状态
```python
class ThalesRemoteScriptWrapper(remoteConnection: ThalesRemoteConnection)
```
包装器类，使用 ThalesRemoteConnection 类与设备通信。

**参数:**
- `remoteConnection` - 到 Thales 软件的连接对象

#### 设备状态读取
```python
getCurrent() → float
```
从设备读取测量电流

**返回:**
- 测量电流值

```python
getPotential() → float
```
从设备读取测量电位

**返回:**
- 测量电位值

```python
getVoltage() → float
```
从设备读取测量电位（别名）

**返回:**
- 测量电位值

#### 设备信息
```python
getSerialNumber() → str
```
获取活动设备的序列号

**返回:**
- 设备序列号

```python
getDeviceInformation() → tuple[str, str]
```
获取活动设备的名称和序列号

**返回:**
- 包含所选恒电位仪信息的元组 (名称, 序列号)

```python
getDeviceName() → str
```
获取活动设备的名称

**返回:**
- 设备名称

### 基础设置

#### 电位和电流设置
```python
setCurrent(current: float) → str
```
设置输出电流

**参数:**
- `current` - 要设置的输出电流

**返回:**
- 设备响应字符串

```python
setPotential(potential: float) → str
```
设置输出电位

**参数:**
- `potential` - 要设置的输出电位

**返回:**
- 设备响应字符串

```python
setVoltage(potential) → str
```
设置输出电位（别名）

**参数:**
- `potential` - 要设置的输出电位

**返回:**
- 设备响应字符串

#### 设备配置
```python
setMaximumShunt(shunt: int) → str
```
设置测量的最大分路索引

**参数:**
- `shunt` - 分路编号

**返回:**
- 设备响应字符串

```python
setMinimumShunt(shunt) → str
```
设置测量的最小分路

**参数:**
- `shunt` - 要设置的分路索引

**返回:**
- 设备响应字符串

```python
setShuntIndex(shunt: int) → None
```
设置测量的分路索引

**参数:**
- `shunt` - 分路编号

**返回:**
- 设备响应字符串

```python
setVoltageRangeIndex(vrange: int) → str
```
设置测量的电压范围

**参数:**
- `vrange` - 电压范围索引

**返回:**
- 设备响应字符串

————————————————————————————————————

## 恒电位仪控制

### 恒电位仪模式
```python
enablePotentiostat(enabled: bool = True) → str
```
开启或关闭恒电位仪

**参数:**
- `enabled` - True 开启恒电位仪，False 关闭

**返回:**
- 设备响应字符串

```python
disablePotentiostat() → str
```
关闭恒电位仪

**返回:**
- 设备响应字符串

```python
setPotentiostatMode(potentiostatMode: PotentiostatMode) → str
```
设置恒电位仪的耦合方式

**参数:**
- `potentiostatMode` - 恒电位仪模式

**返回:**
- 设备响应字符串

### 设备校准
```python
calibrateOffsets() → str
```
对设备执行偏移校准

**返回:**
- 设备响应字符串

```python
readSetup() → str
```
读取当前设置的参数

**返回:**
- 包含配置的字符串

————————————————————————————————————

## EIS（电化学阻抗谱）测量

### EIS 参数设置
```python
setFrequency(frequency: float) → str
```
为单频阻抗测量设置输出频率

**参数:**
- `frequency` - 阻抗测量的输出频率

**返回:**
- 设备响应字符串

```python
setAmplitude(amplitude: float) → str
```
设置输出幅度

**参数:**
- `amplitude` - 阻抗测量的输出幅度（伏特或安培）

**返回:**
- 设备响应字符串

```python
setNumberOfPeriods(number_of_periods: Union[int, float])
```
设置一个阻抗测量平均的周期数

**参数:**
- `number_of_periods` - 平均的周期数/波数

**返回:**
- 设备响应字符串

### EIS 频率范围设置
```python
setUpperFrequencyLimit(frequency: float) → str
```
设置 EIS 测量的上限频率

**参数:**
- `frequency` - 上限频率

**返回:**
- 设备响应字符串

```python
setLowerFrequencyLimit(frequency: float) → str
```
设置 EIS 测量的下限频率

**参数:**
- `frequency` - 下限频率

**返回:**
- 设备响应字符串

```python
setStartFrequency(frequency: float) → str
```
设置 EIS 测量的起始频率

**参数:**
- `frequency` - 起始频率

**返回:**
- 设备响应字符串

### EIS 测量参数
```python
setUpperStepsPerDecade(steps: int) → str
```
设置 EIS 测量 66Hz 以上频率范围的每十倍频程步数

**参数:**
- `steps` - 每十倍频程的步数

**返回:**
- 设备响应字符串

```python
setLowerStepsPerDecade(steps: int) → str
```
设置 EIS 测量 66Hz 以下频率范围的每十倍频程步数

**参数:**
- `steps` - 每十倍频程的步数

**返回:**
- 设备响应字符串

```python
setUpperNumberOfPeriods(periods: int) → str
```
设置 EIS 测量 66Hz 以上频率范围的测量周期数

**参数:**
- `periods` - 周期数

**返回:**
- 设备响应字符串

```python
setLowerNumberOfPeriods(periods: int) → str
```
设置 EIS 测量下限频率范围的测量周期数

**参数:**
- `periods` - 周期数

**返回:**
- 设备响应字符串

### EIS 扫描策略
```python
setScanStrategy(strategy: Union[ScanStrategy, str]) → str
```
设置 EIS 测量的扫描策略

**参数:**
- `strategy` - EIS 测量的扫描策略

**返回:**
- 设备响应字符串

```python
setScanDirection(direction: Union[ScanDirection, str]) → str
```
设置 EIS 测量的扫描方向

**参数:**
- `direction` - EIS 测量的扫描方向

**返回:**
- 设备响应字符串

### EIS 输出配置
```python
setEISNaming(naming: Union[str, FileNaming]) → str
```
设置 EIS 测量命名规则

**参数:**
- `naming` - EIS 测量命名规则

**返回:**
- 设备响应字符串

```python
setEISCounter(number: int) → str
```
设置文件名的 EIS 测量当前编号

**参数:**
- `number` - 下一个测量编号

**返回:**
- 设备响应字符串

```python
setEISOutputPath(path: str) → str
```
设置 EIS 测量结果的存储路径

**参数:**
- `path` - 目录路径

**返回:**
- 设备响应字符串

```python
setEISOutputFileName(name: str) → str
```
设置基本的 EIS 输出文件名

**参数:**
- `name` - 文件的基本名称

**返回:**
- 设备响应字符串

### EIS 测量执行
```python
measureEIS() → str
```
执行 EIS 测量

**返回:**
- 设备响应字符串

————————————————————————————————————

## CV（循环伏安法）测量

### CV 电位设置
```python
setCVStartPotential(potential: float) → str
```
设置 CV 测量的起始电位

**参数:**
- `potential` - 起始电位

**返回:**
- 设备响应字符串

```python
setCVUpperReversingPotential(potential: float) → str
```
设置 CV 测量的上限反转电位

**参数:**
- `potential` - 上限反转电位

**返回:**
- 设备响应字符串

```python
setCVLowerReversingPotential(potential: float) → str
```
设置 CV 测量的下限反转电位

**参数:**
- `potential` - 下限反转电位

**返回:**
- 设备响应字符串

```python
setCVEndPotential(potential: float) → str
```
设置 CV 测量的结束电位

**参数:**
- `potential` - 结束电位

**返回:**
- 设备响应字符串

### CV 时间参数
```python
setCVStartHoldTime(time: float) → str
```
设置起始电位的保持时间

**参数:**
- `time` - 起始电位的等待时间（秒）

**返回:**
- 设备响应字符串

```python
setCVEndHoldTime(time: float) → str
```
设置结束电位的保持时间

**参数:**
- `time` - 结束电位的等待时间（秒）

**返回:**
- 设备响应字符串

### CV 扫描参数
```python
setCVScanRate(scanRate: float) → str
```
设置扫描速率

**参数:**
- `scanRate` - 扫描速率 (V/s)

**返回:**
- 设备响应字符串

```python
setCVCycles(cycles: float) → str
```
设置循环次数

**参数:**
- `cycles` - CV 循环次数，至少 0.5

**返回:**
- 设备响应字符串

```python
setCVSamplesPerCycle(samples: int) → str
```
设置每个 CV 循环的测量次数

**参数:**
- `samples` - 每个循环的测量次数

**返回:**
- 设备响应字符串

### CV 电流限制
```python
setCVMaximumCurrent(current: float) → str
```
设置最大电流

**参数:**
- `current` - 测量的最大电流 (A)

**返回:**
- 设备响应字符串

```python
setCVMinimumCurrent(current: float) → str
```
设置最小电流

**参数:**
- `current` - 测量的最小电流 (A)

**返回:**
- 设备响应字符串

### CV 其他参数
```python
setCVOhmicDrop(ohmicdrop: float) → str
```
设置 CV 测量的欧姆降

**参数:**
- `ohmicdrop` - 测量的欧姆降

**返回:**
- 设备响应字符串

### CV 输出配置
```python
setCVNaming(naming: Union[str, FileNaming]) → str
```
设置 CV 测量命名规则

**参数:**
- `naming` - CV 测量命名规则

**返回:**
- 设备响应字符串

```python
setCVCounter(number: int) → str
```
设置文件名的 CV 测量当前编号

**参数:**
- `number` - 下一个测量编号

**返回:**
- 设备响应字符串

```python
setCVOutputPath(path: str) → str
```
设置 CV 测量结果的存储路径

**参数:**
- `path` - 输出目录路径

**返回:**
- 设备响应字符串

```python
setCVOutputFileName(name: str) → str
```
设置基本的 CV 输出文件名

**参数:**
- `name` - 文件的基本名称

**返回:**
- 设备响应字符串

### CV 测量执行
```python
checkCVSetup() → str
```
检查设置的参数

**返回:**
- 设备响应字符串

```python
readCVSetup() → str
```
读取设置的参数

**返回:**
- 设备响应字符串

```python
measureCV() → str
```
执行 CV（循环伏安法）测量

**返回:**
- 设备响应字符串

————————————————————————————————————


## IE（电流阶跃）测量

### IE 电位设置
```python
setIEFirstEdgePotential(potential: float) → str
```
设置第一个边沿电位

**参数:**
- `potential` - 第一个边沿的电位 (V)

**返回:**
- 设备响应字符串

```python
setIESecondEdgePotential(potential: float) → str
```
设置第二个边沿电位

**参数:**
- `potential` - 第二个边沿的电位 (V)

**返回:**
- 设备响应字符串

```python
setIEThirdEdgePotential(potential: float) → str
```
设置第三个边沿电位

**参数:**
- `potential` - 第三个边沿的电位 (V)

**返回:**
- 设备响应字符串

```python
setIEFourthEdgePotential(potential: float) → str
```
设置第四个边沿电位

**参数:**
- `potential` - 第四个边沿的电位 (V)

**返回:**
- 设备响应字符串

### IE 参数设置
```python
setIEPotentialResolution(resolution: float) → str
```
设置电位分辨率

**参数:**
- `resolution` - 测量的分辨率 (V)

**返回:**
- 设备响应字符串

```python
setIEMinimumWaitingTime(time: float) → str
```
设置最小等待时间

**参数:**
- `time` - 等待时间（秒）

**返回:**
- 设备响应字符串

```python
setIEMaximumWaitingTime(time: float) → str
```
设置最大等待时间

**参数:**
- `time` - 等待时间（秒）

**返回:**
- 设备响应字符串

```python
setIERelativeTolerance(tolerance: float) → str
```
设置相对容差标准

**参数:**
- `tolerance` - 等待的容差，0.01 = 1%

**返回:**
- 设备响应字符串

```python
setIEAbsoluteTolerance(tolerance: float) → str
```
设置绝对容差标准

**参数:**
- `tolerance` - 等待的容差，0.01 = 1%

**返回:**
- 设备响应字符串

```python
setIEOhmicDrop(ohmicdrop: float) → str
```
设置 IE 测量的欧姆降

**参数:**
- `ohmicdrop` - 测量的欧姆降

**返回:**
- 设备响应字符串

### IE 扫描模式
```python
setIESweepMode(mode) → str
```
设置扫描模式

**参数:**
- `mode` - 测量的扫描模式

**返回:**
- 设备响应字符串

```python
setIEScanRate(scanRate: float) → str
```
设置扫描速率

**参数:**
- `scanRate` - 扫描速率 (V/s)

**返回:**
- 设备响应字符串

### IE 电流限制
```python
setIEMaximumCurrent(current: float) → str
```
设置最大电流

**参数:**
- `current` - 测量的最大电流 (A)

**返回:**
- 设备响应字符串

```python
setIEMinimumCurrent(current: float) → str
```
设置最小电流

**参数:**
- `current` - 测量的最小电流 (A)

**返回:**
- 设备响应字符串

### IE 输出配置
```python
setIENaming(naming: Union[str, FileNaming]) → str
```
设置 IE 测量命名规则

**参数:**
- `naming` - IE 测量命名规则

**返回:**
- 设备响应字符串

```python
setIECounter(number: int) → str
```
设置文件名的 IE 测量当前编号

**参数:**
- `number` - 下一个测量编号

**返回:**
- 设备响应字符串

```python
setIEOutputPath(path: str) → str
```
设置 IE 测量结果的存储路径

**参数:**
- `path` - 目录路径

**返回:**
- 设备响应字符串

```python
setIEOutputFileName(name: str) → str
```
设置基本的 IE 输出文件名

**参数:**
- `name` - 文件的基本名称

**返回:**
- 设备响应字符串

### IE 测量执行
```python
checkIESetup() → str
```
检查设置的参数

**返回:**
- 设备响应字符串

```python
readIESetup() → str
```
读取设置的参数

**返回:**
- 设备响应字符串

```python
measureIE() → str
```
测量 IE

**返回:**
- 设备响应字符串

————————————————————————————————————

## 通用命令

### 参数设置
```python
setValue(name: str, value: Union[int, float, str, Any]) → str
```
设置 Remote2 参数或值

**参数:**
- `name` - Remote2 参数名称
- `value` - 要设置的参数值

**返回:**
- 设备响应字符串

```python
executeRemoteCommand(command: str) → str
```
直接执行对 Remote Script 的查询

**参数:**
- `command` - 命令查询字符串

**返回:**
- 设备响应字符串

### 系统控制
```python
forceThalesIntoRemoteScript() → str
```
提示 Thales 启动 Remote Script

**返回:**
- 设备响应字符串

```python
hideWindow()
```
隐藏 Thales 窗口

**返回:**
- 设备响应字符串

```python
showWindow()
```
显示 Thales 窗口

**返回:**
- 设备响应字符串

### 版本信息
```python
getThalesVersion(timeout: Optional[float] = None)
```
获取 Thales 版本

**参数:**
- `timeout` - term 必须提供答案的时间（秒）

**返回:**
- 序列号作为字符串

```python
getWorkstationHeartBeat(timeout: Optional[float] = None) → float
```
从 Term 软件查询工作站和相应 Thales 软件的心跳时间

**参数:**
- `timeout` - term 必须提供答案的时间（秒）

**返回:**
- 心跳时间（毫秒）

```python
getSerialNumberFromTerm() → str
```
通过 Term 软件获取工作站的序列号

**返回:**
- 工作站序列号

```python
getTermIsActive(timeout: float = 2) → bool
```
检查 Term 是否仍然响应请求

**参数:**
- `timeout` - term 必须提供答案的时间（秒）

**返回:**
- Term 是否活动的布尔值

————————————————————————————————————

*文档最后更新：2025-09-16*