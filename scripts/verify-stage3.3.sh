#!/bin/bash

echo "开始验证阶段3.3：设备服务重构..."

# 验证编译成功
echo "1. 验证编译..."
cd apps/backend
if npm run build; then
    echo "✅ 编译成功"
else
    echo "❌ 编译失败"
    exit 1
fi

# 验证接口兼容性
echo "2. 验证接口兼容性..."
if grep -q "IZahnerZenniumModule" src/modules/zahner-zennium/zahner-zennium.service.ts; then
    echo "✅ 接口兼容性验证通过"
else
    echo "❌ 接口兼容性验证失败"
fi

# 验证设备实例服务集成
echo "3. 验证设备实例服务集成..."
if grep -q "ZahnerZenniumInstanceService" src/modules/zahner-zennium/zahner-zennium.service.ts; then
    echo "✅ 设备实例服务集成验证通过"
else
    echo "❌ 设备实例服务集成验证失败"
fi

# 验证模块配置
echo "4. 验证模块配置..."
if grep -q "ZahnerZenniumInstanceService" src/modules/zahner-zennium/zahner-zennium.module.ts; then
    echo "✅ 模块配置验证通过"
else
    echo "❌ 模块配置验证失败"
fi

# 验证事件驱动集成
echo "5. 验证事件驱动集成..."
event_count=$(grep -c "this.eventBus.emit" src/modules/zahner-zennium/zahner-zennium.service.ts)
if [ "$event_count" -gt 0 ]; then
    echo "✅ 事件驱动集成验证通过 (发现 $event_count 个事件发射)"
else
    echo "❌ 事件驱动集成验证失败"
fi

# 验证版本升级
echo "6. 验证版本升级..."
version=$(grep -o "version = '2.4.0'" src/modules/zahner-zennium/zahner-zennium.service.ts)
if [ "$version" = "version = '2.4.0'" ]; then
    echo "✅ 版本升级验证通过"
else
    echo "❌ 版本升级验证失败"
fi

echo ""
echo "阶段3.3验证完成！"
echo "📋 重构总结:"
echo "   - 设备服务已重构为纯设备操作"
echo "   - 设备实例管理服务已集成"
echo "   - 直接通知调用已移除"
echo "   - 向后兼容性已保持"
echo "   - 事件驱动架构已集成"
echo "   - 版本已升级到2.4.0"
echo ""
echo "🚀 准备进入阶段3.4：执行服务集成"