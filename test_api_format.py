#!/usr/bin/env python3
"""
测试FastAPI参数格式问题
"""
import requests
import json

def test_fastapi_scan_endpoint():
    """测试FastAPI /scan端点的参数格式"""
    base_url = "http://127.0.0.1:8010"

    print("=== 测试FastAPI /scan端点参数格式 ===")

    # 测试1: 发送包含address字段的对象（当前实现）
    print("\n1. 测试当前格式 - 发送 {address: 32}")
    try:
        response1 = requests.post(
            f"{base_url}/scan",
            json={"address": 32},
            timeout=5
        )
        print(f"   状态码: {response1.status_code}")
        if response1.status_code != 200:
            print(f"   错误响应: {response1.text}")
    except Exception as e:
        print(f"   请求异常: {e}")

    # 测试2: 直接发送整数（可能的正确格式）
    print("\n2. 测试直接整数格式 - 发送 32")
    try:
        response2 = requests.post(
            f"{base_url}/scan",
            json=32,
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        print(f"   状态码: {response2.status_code}")
        if response2.status_code == 200:
            print(f"   成功响应: {response2.json()}")
        else:
            print(f"   错误响应: {response2.text}")
    except Exception as e:
        print(f"   请求异常: {e}")

if __name__ == "__main__":
    test_fastapi_scan_endpoint()