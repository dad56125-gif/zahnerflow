#!/usr/bin/env python3
"""
调试FastAPI实时扫描机制
"""
import requests
import json
import time

def test_fastapi_connection():
    """测试FastAPI连接和实时扫描功能"""
    print("=== FastAPI连接和实时扫描测试 ===")

    base_url = "http://127.0.0.1:8010"

    try:
        # 1. 测试FastAPI健康状态
        print("\n1. 测试FastAPI健康状态...")
        health_response = requests.get(f"{base_url}/health", timeout=5)
        print(f"   健康检查: {health_response.status_code}")
        print(f"   响应内容: {health_response.json()}")

        # 2. 测试扫描端点是否支持实时回调
        print("\n2. 测试/scan端点...")
        scan_data = {
            "start": 44,
            "end": 44  # 只扫描地址44，减少测试时间
        }

        print(f"   发送扫描请求: {scan_data}")
        scan_start = time.time()

        scan_response = requests.post(
            f"{base_url}/scan",
            json=scan_data,
            timeout=30
        )

        scan_time = time.time() - scan_start
        print(f"   扫描耗时: {scan_time:.2f}秒")
        print(f"   响应状态: {scan_response.status_code}")

        if scan_response.status_code == 200:
            result = scan_response.json()
            print(f"   扫描结果:")
            print(f"     - 设备数量: {result.get('count', 0)}")
            print(f"     - 扫描范围: {result.get('scan_range', {})}")

            # 检查是否有实时发现记录
            if 'discovered_during_scan' in result:
                discovered = result['discovered_during_scan']
                print(f"     - 实时发现设备: {len(discovered)}")
                for device in discovered:
                    print(f"       * 地址 {device.get('device_address')}: {device.get('gas_type')}")
            else:
                print("     - 实时发现设备: 未找到该字段 (可能使用旧版本FastAPI)")

            if 'devices' in result:
                devices = result['devices']
                print(f"     - 最终设备列表: {len(devices)}")
                for device in devices:
                    print(f"       * 地址 {device.get('device_address')}: {device.get('gas_type')}")
        else:
            print(f"   错误响应: {scan_response.text}")

    except requests.exceptions.ConnectionError:
        print("❌ 连接失败 - FastAPI服务可能没有运行在 http://127.0.0.1:8010")
    except requests.exceptions.Timeout:
        print("❌ 请求超时 - FastAPI服务可能无响应")
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")

if __name__ == "__main__":
    test_fastapi_connection()