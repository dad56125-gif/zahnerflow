#!/usr/bin/env python3
"""
测试 Furnace 设备层 API 日志输出的脚本
"""

import requests
import json
import time

# API 基础URL
BASE_URL = "http://127.0.0.1:8011"

def test_health_check():
    """测试健康检查接口"""
    print("=== 测试健康检查 ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        print(f"健康检查响应: {response.status_code} - {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"健康检查失败: {str(e)}")
        return False

def test_connect():
    """测试设备连接"""
    print("\n=== 测试设备连接 ===")
    try:
        connect_data = {
            "port": "COM4",
            "baudrate": 9600,
            "address": 1,
            "stopbits": 2,
            "timeout": 1.0
        }
        response = requests.post(f"{BASE_URL}/connect", json=connect_data, timeout=5)
        print(f"连接响应: {response.status_code} - {response.json()}")
        return response.json().get("connected", False)
    except Exception as e:
        print(f"连接失败: {str(e)}")
        return False

def test_read_program_segments():
    """测试读取程序段"""
    print("\n=== 测试读取程序段 ===")
    try:
        response = requests.get(f"{BASE_URL}/program/segments", timeout=15)
        print(f"读取程序段响应: {response.status_code}")
        if response.status_code == 200:
            segments = response.json()
            print(f"成功读取 {len(segments)} 个程序段")
            # 打印前几个有效段
            valid_segments = [s for s in segments if s.get('temperature', 0) > 0 or s.get('time', 0) > 0]
            if valid_segments:
                print("前几个有效程序段:")
                for seg in valid_segments[:3]:
                    print(f"  段{seg['id']}: 温度={seg['temperature']}°C, 时间={seg['time']}秒")
        return response.status_code == 200
    except Exception as e:
        print(f"读取程序段失败: {str(e)}")
        return False

def test_write_program_segments():
    """测试写入程序段"""
    print("\n=== 测试写入程序段 ===")
    try:
        # 创建测试程序段数据
        test_segments = [
            {"id": 1, "temperature": 25.0, "time": 60},
            {"id": 2, "temperature": 50.0, "time": 120},
            {"id": 3, "temperature": 75.0, "time": 180}
        ]

        print(f"准备写入 {len(test_segments)} 个测试程序段:")
        for seg in test_segments:
            print(f"  段{seg['id']}: 温度={seg['temperature']}°C, 时间={seg['time']}秒")

        response = requests.post(f"{BASE_URL}/program/segments", json=test_segments, timeout=20)
        print(f"写入程序段响应: {response.status_code} - {response.json()}")
        return response.json().get("ok", False)
    except Exception as e:
        print(f"写入程序段失败: {str(e)}")
        return False

def main():
    """主测试函数"""
    print("Furnace 设备层 API 日志测试开始")
    print("=" * 50)

    # 测试健康检查
    if not test_health_check():
        print("设备服务未运行，请先启动 FastAPI 服务")
        return

    # 测试连接（可能会失败，但我们主要看日志输出）
    test_connect()

    # 等待一下让用户看到日志
    time.sleep(1)

    # 测试读取程序段（即使连接失败也会输出日志）
    test_read_program_segments()

    # 等待一下
    time.sleep(1)

    # 测试写入程序段（即使连接失败也会输出日志）
    test_write_program_segments()

    print("\n" + "=" * 50)
    print("测试完成！请查看 FastAPI 服务器的 console log 输出")
    print("应该能看到详细的 [FURNACE API] 日志信息")

if __name__ == "__main__":
    main()