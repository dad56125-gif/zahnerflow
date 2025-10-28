# 实时扫描修复方案

## 问题分析
HTTP请求-响应模式本质上就是批处理的，无法支持真正的实时推送。当前实现中：
- FastAPI的realtime_callback只能在FastAPI进程内部执行
- HTTP请求必须等待整个扫描完成后才返回响应
- 实时发现的信息无法跨越HTTP边界传递给NestJS

## 修复方案

### 方案1: WebSocket实时扫描 (推荐)

**1. FastAPI添加WebSocket扫描端点**
```python
@app.websocket("/scan-realtime-ws")
async def scan_realtime_ws(websocket: WebSocket):
    await websocket.accept()

    async def realtime_callback(device_info: DeviceInfo):
        await websocket.send_json({
            "type": "device_discovered",
            "device": device_info.dict()
        })

    # 接收扫描参数
    data = await websocket.receive_json()
    start, end = data.get("start", 32), data.get("end", 80)

    # 执行实时扫描
    controller = get_active_controller()
    devices = controller.scan(start, end, realtime_callback=realtime_callback)

    # 发送完成信号
    await websocket.send_json({
        "type": "scan_completed",
        "devices": [d.dict() for d in devices]
    })
```

**2. NestJS WebSocket客户端**
```typescript
// 在MfcDeviceService中添加WebSocket扫描方法
async scan_devices_realtime_websocket(request_body: { start?: number; end?: number }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:8010/scan-realtime-ws');
    const discovered_devices = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'device_discovered') {
        discovered_devices.push(data.device);
        // 立即通过NestJS WebSocket推送到前端
        this.gateway.sendMfcDeviceDiscovered({
          type: 'device_discovered',
          data: data.device,
          timestamp: new Date().toISOString()
        });
      } else if (data.type === 'scan_completed') {
        resolve({
          devices: data.devices,
          discovered_during_scan: discovered_devices
        });
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify(request_body));
    };

    ws.onerror = reject;
  });
}
```

### 方案2: Server-Sent Events (SSE)

**FastAPI SSE端点**
```python
@app.get("/scan-sse")
async def scan_sse(start: int = 32, end: int = 80):
    async def event_generator():
        discovered_devices = []

        def realtime_callback(device_info: DeviceInfo):
            discovered_devices.append(device_info.dict())
            yield f"data: {json.dumps({'type': 'device_found', 'device': device_info.dict()})}\n\n"

        # 执行扫描
        controller = get_active_controller()
        devices = controller.scan(start, end, realtime_callback=realtime_callback)

        # 发送完成信号
        yield f"data: {json.dumps({'type': 'completed', 'devices': [d.dict() for d in devices]})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/plain")
```

## 实施建议

1. **立即修复**: 使用方案1 (WebSocket) 替换当前的HTTP扫描机制
2. **保持兼容**: 保留HTTP /scan端点作为备用方案
3. **前端适配**: 前端可以选择使用WebSocket实时扫描或HTTP批处理扫描

## 预期效果

- 实时发现设备后立即推送到前端
- 扫描时间从25秒减少到几秒
- 用户体验显著提升