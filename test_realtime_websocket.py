#!/usr/bin/env python3
"""
测试WebSocket实时设备发现推送功能
"""
import asyncio
import websockets
import json
import time

async def test_websocket_realtime_discovery():
    """测试WebSocket实时设备发现功能"""
    print("=== 测试WebSocket实时设备发现推送功能 ===")

    try:
        # 连接到WebSocket服务器
        uri = "ws://localhost:8083"  # NestJS WebSocket端口
        print(f"连接到WebSocket服务器: {uri}")

        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket连接成功")

            # 订阅MFC事件
            subscribe_message = {
                "event": "subscribeToMfc"
            }
            await websocket.send(json.dumps(subscribe_message))
            print("✅ 已订阅MFC事件")

            # 启动扫描（通过HTTP API）
            import requests
            scan_data = {"start": 44, "end": 44}
            print(f"🚀 启动扫描: 地址 {scan_data['start']}-{scan_data['end']}")

            try:
                scan_response = requests.post(
                    "http://localhost:8080/mfc/scan",  # NestJS API端口
                    json=scan_data,
                    timeout=5
                )
                if scan_response.status_code == 200:
                    print("✅ 扫描请求已发送（异步模式）")
                    print("   设备将通过WebSocket实时推送...")
                else:
                    print(f"❌ 扫描请求失败: {scan_response.status_code}")
                    return
            except Exception as e:
                print(f"❌ 扫描请求异常: {e}")
                return

            # 监听WebSocket消息
            print("\n📡 监听WebSocket消息（等待10秒）...")
            discovered_devices = []
            start_time = time.time()

            while time.time() - start_time < 10:
                try:
                    # 等待消息，超时1秒
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)

                    print(f"📨 收到消息: {data.get('type', 'unknown')}")

                    if data.get('type') == 'mfcDeviceDiscovered':
                        device_data = data.get('data', {})
                        print(f"🎯 实时发现设备!")
                        print(f"   地址: {device_data.get('device_address')}")
                        print(f"   气体: {device_data.get('gas_type')}")
                        print(f"   量程: {device_data.get('max_flow_sccm')} SCCM")
                        print(f"   状态: {device_data.get('connection_status')}")
                        print(f"   时间: {device_data.get('last_communication')}")
                        discovered_devices.append(device_data)

                    elif data.get('type') == 'mfcConnectionUpdate':
                        print(f"🔗 连接状态更新: {data.get('data', {}).get('status')}")

                    elif data.get('type') == 'mfcNotification':
                        notification = data.get('data', {})
                        print(f"📢 通知: [{notification.get('level')}] {notification.get('title')}")

                except asyncio.TimeoutError:
                    # 超时是正常的，继续循环
                    continue
                except Exception as e:
                    print(f"❌ 接收消息时出错: {e}")
                    break

            # 统计结果
            print(f"\n📊 测试结果统计:")
            print(f"   - 监听时长: 10秒")
            print(f"   - 实时发现设备数量: {len(discovered_devices)}")

            if discovered_devices:
                print("✅ 实时推送功能正常工作!")
                for i, device in enumerate(discovered_devices, 1):
                    print(f"   {i}. 地址 {device['device_address']}: {device['gas_type']} ({device['max_flow_sccm']} SCCM)")
            else:
                print("⚠️  未收到设备发现推送")
                print("   可能原因:")
                print("   - 没有设备在指定地址范围内")
                print("   - 设备未连接")
                print("   - WebSocket配置问题")

    except websockets.exceptions.ConnectionRefused:
        print("❌ WebSocket连接被拒绝 - 请确保NestJS服务正在运行")
    except Exception as e:
        print(f"❌ 测试异常: {e}")

if __name__ == "__main__":
    print("开始WebSocket实时设备发现测试...")
    asyncio.run(test_websocket_realtime_discovery())
    print("\n测试完成！")