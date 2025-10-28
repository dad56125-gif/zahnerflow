#!/usr/bin/env python3
"""
测试NestJS到FastAPI的HTTP连接
"""
import requests
import json
import time

def test_fastapi_directly():
    """直接测试FastAPI连接"""
    print("=== 直接测试FastAPI连接 ===")

    base_url = "http://127.0.0.1:8010"

    try:
        # 1. 测试健康检查
        print("\n1. 测试FastAPI健康检查...")
        health_response = requests.get(f"{base_url}/health", timeout=5)
        print(f"   健康检查状态: {health_response.status_code}")
        print(f"   健康检查响应: {health_response.json()}")

        # 2. 测试连接状态
        print("\n2. 测试MFC连接状态...")
        connection_response = requests.get(f"{base_url}/connection/info", timeout=5)
        print(f"   连接状态: {connection_response.status_code}")
        print(f"   连接信息: {connection_response.json()}")

        # 3. 测试扫描功能 - 小范围测试
        print("\n3. 测试扫描功能 (地址44-44)...")
        scan_data = {"start": 44, "end": 44}
        print(f"   发送扫描请求: {scan_data}")

        scan_start = time.time()
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
            print(f"     - 发现设备: {len(result.get('discovered_during_scan', []))}")

            # 检查关键字段
            if 'discovered_during_scan' in result:
                print("   ✅ 实时发现字段存在 - FastAPI运行新版本代码")
            else:
                print("   ❌ 实时发现字段缺失 - FastAPI运行旧版本代码")

            return True
        else:
            print(f"   ❌ 扫描失败: {scan_response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print("   ❌ FastAPI连接失败 - 服务可能没有运行")
        return False
    except requests.exceptions.Timeout:
        print("   ❌ FastAPI请求超时")
        return False
    except Exception as e:
        print(f"   ❌ 测试异常: {str(e)}")
        return False

def test_nestjs_fastapi_communication():
    """测试NestJS到FastAPI的通信路径"""
    print("\n=== 测试NestJS到FastAPI通信路径 ===")

    # 这里可以添加NestJS端的测试端点来验证内部调用
    # 但目前我们先验证FastAPI本身的状态
    return test_fastapi_directly()

if __name__ == "__main__":
    print("开始MFC HTTP连接诊断...")
    success = test_nestjs_fastapi_communication()

    if success:
        print("\n✅ FastAPI连接正常，问题可能在NestJS调用层面")
    else:
        print("\n❌ FastAPI连接异常，需要检查FastAPI服务状态")

    print("\n诊断完成！")