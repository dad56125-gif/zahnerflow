#!/usr/bin/env python3
"""
测试改造后的实时扫描功能 - 验证单地址发现即推送
"""
import requests
import json
import time
import threading

def test_realtime_scan_with_events():
    """测试带事件轮询的实时扫描"""
    print("=== 测试改造后的实时扫描功能 ===")

    base_url = "http://127.0.0.1:8010"

    try:
        # 1. 测试事件轮询端点
        print("\n1. 测试/scan-events端点...")
        events_response = requests.get(f"{base_url}/scan-events", timeout=5)
        print(f"   事件端点状态: {events_response.status_code}")
        if events_response.status_code == 200:
            result = events_response.json()
            print(f"   初始事件数量: {result.get('count', 0)}")

        # 2. 启动后台事件轮询线程
        print("\n2. 启动事件轮询监控...")
        discovered_events = []
        polling_active = True

        def poll_events():
            while polling_active:
                try:
                    events_response = requests.get(f"{base_url}/scan-events", timeout=2)
                    if events_response.status_code == 200:
                        result = events_response.json()
                        events = result.get('events', [])
                        if events:
                            print(f"   🎯 立即收到 {len(events)} 个设备发现事件!")
                            for event in events:
                                if event['type'] == 'mfc_device_discovered':
                                    device_data = event['data']
                                    discovered_events.append(device_data)
                                    print(f"       设备地址: {device_data['device_address']}, 气体类型: {device_data['gas_type']}, 量程: {device_data['max_flow_sccm']} SCCM")
                    time.sleep(0.1)  # 100ms轮询间隔
                except Exception as e:
                    print(f"   事件轮询异常: {str(e)}")
                    break

        # 启动事件轮询线程
        poll_thread = threading.Thread(target=poll_events)
        poll_thread.daemon = True
        poll_thread.start()

        # 等待轮询线程启动
        time.sleep(1)

        # 3. 开始扫描（单地址测试）
        print("\n3. 开始扫描测试（地址44-44）...")
        scan_start = time.time()

        scan_data = {"start": 44, "end": 44}
        scan_response = requests.post(
            f"{base_url}/scan",
            json=scan_data,
            timeout=30
        )

        scan_time = time.time() - scan_start
        print(f"   扫描耗时: {scan_time:.2f}秒")
        print(f"   扫描状态: {scan_response.status_code}")

        if scan_response.status_code == 200:
            result = scan_response.json()
            print(f"   扫描结果:")
            print(f"     - 设备数量: {result.get('count', 0)}")
            print(f"     - 实时发现: {len(result.get('discovered_during_scan', []))}")

        # 4. 等待事件轮询完成
        print("\n4. 等待事件轮询完成...")
        time.sleep(2)
        polling_active = False

        # 5. 统计结果
        print("\n5. 测试结果统计:")
        print(f"   - 轮询收到的事件数量: {len(discovered_events)}")
        print(f"   - 扫描返回的设备数量: {scan_response.json().get('count', 0) if scan_response.status_code == 200 else 0}")

        # 验证是否实现立即推送
        if discovered_events:
            print("   ✅ 成功实现单地址发现即推送!")
            for event in discovered_events:
                print(f"       地址 {event['device_address']}: {event['gas_type']} ({event['max_flow_sccm']} SCCM)")
        else:
            print("   ❌ 未收到实时推送事件")

        return len(discovered_events) > 0

    except requests.exceptions.ConnectionError:
        print("❌ FastAPI连接失败")
        return False
    except Exception as e:
        print(f"❌ 测试异常: {str(e)}")
        return False

if __name__ == "__main__":
    print("开始测试改造后的实时扫描功能...")
    success = test_realtime_scan_with_events()

    if success:
        print("\n✅ 实时扫描改造成功 - 单地址发现即推送正常工作!")
    else:
        print("\n❌ 实时扫描改造失败 - 需要进一步调试")

    print("\n测试完成！")