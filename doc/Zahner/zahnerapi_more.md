# Zahner 本地设备控制 API 文档

本文档专注于纯本地运行环境下的 Zahner 设备控制功能，已移除所有网络相关功能。

————————————————————————————————————

## 异常处理类

### ThalesRemoteError
```python
class ThalesRemoteError(message)
```
Zahner 设备异常类

**用途：**
- 处理设备参数超出范围错误
- 提供错误代码对照表查阅
- 设备通信错误处理
- 调试和故障排除

### TermConnectionError
```python
class TermConnectionError(message: str)
```
Term 连接异常类

**用途：**
- 本地连接错误处理
- 通信中断恢复
- 连接状态管理

————————————————————————————————————

## ThalesRemoteConnection 类

### 连接管理
```python
class ThalesRemoteConnection
```
处理 Zahner 设备本地连接的类

```python
connectToTerm(address: str, connection_name: str = 'ScriptRemote') → bool
```
连接到 Term 软件

```python
disconnectFromTerm() → None
```
关闭与 Term 的连接

```python
isConnectedToTerm() → bool
```
检查与 Term 的连接是否开放

```python
getConnectionName() → str
```
获取连接名称

### 数据传输
```python
sendTelegram(payload: Union[str, bytearray], message_type: int, timeout: Optional[float] = None) → None
```
发送电报（数据）到 Term

```python
waitForBinaryTelegram(message_type: int = 2, timeout: Optional[float] = None) → bytes
```
阻塞直到下一个电报到达

```python
waitForStringTelegram(message_type: int = 2, timeout: Optional[float] = None) → str
```
阻塞直到下一个电报到达

```python
sendStringAndWaitForReplyString(payload: Union[str, bytearray], message_type: int, timeout: Optional[float] = None, answer_message_type: int = None) → str
```
便捷函数：发送电报并等待回复

### 内部工作线程
```python
_telegramListenerJob() → None
```
在单独线程中运行，将传入的数据包推送到队列中

```python
_startTelegramListener() → None
```
启动处理异步传入数据的线程

```python
_stopTelegramListener() → None
```
优雅地停止处理传入数据的线程

### 底层socket操作
```python
_readTelegramFromSocket() → tuple[Optional[str], bytearray]
```
从socket流读取原始电报结构

```python
_closeSocket() → None
```
关闭socket

————————————————————————————————————

## 本地运行核心功能

### 核心组件：
- **ThalesRemoteConnection** - 本地设备通信的核心类
- **ThalesRemoteError** - 设备异常处理
- **TermConnectionError** - 连接异常处理

### 本地使用建议：
1. 连接时使用 `localhost` 作为地址
2. 使用 `ScriptRemote` 作为默认连接类型
3. 文件操作直接使用本地文件系统
4. 合理设置超时时间以避免阻塞

*文档最后更新：2025-09-16*