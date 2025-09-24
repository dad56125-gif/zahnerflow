# ZahnerFlow 节点系统完整文档

## 📖 概述

ZahnerFlow 是一个基于 React 和 NestJS 的电化学工作流设计器，用于可视化配置和执行电化学测量实验。本文档详细说明节点系统的架构、配置和使用方法。

## 🏗️ 系统架构

### 核心文件结构

```
apps/frontend/src/
├── nodes/
│   └── types.ts              # 节点类型定义和配置 (主要数据源)
├── components/
│   └── PropertyPanel.tsx      # 节点参数配置面板
└── App.tsx                    # 主应用组件
```

### 数据流向图

```
nodes/types.ts (NODE_CONFIGS)
    ↓
Sidebar.tsx (节点列表显示)
    ↓
用户拖拽创建节点
    ↓
PropertyPanel.tsx (参数配置)
    ↓
执行引擎 (backend)
```

## 📦 节点类型定义

### 支持的节点类型

#### 1. 设备控制节点

| 节点ID | 名称 | 描述 | 类别 |
|--------|------|------|------|
| `startup` | 启动设备 | 连接Zahner ZENNIUM设备 | device |
| `shutdown` | 停止设备 | 安全断开设备连接 | device |

#### 2. 测量节点

| 节点ID | 名称 | 描述 | 类别 |
|--------|------|------|------|
| `eis_potentiostatic` | 恒电位EIS | 恒电位电化学阻抗谱测量 | basic_measurement |
| `eis_galvanostatic` | 恒电流EIS | 恒电流电化学阻抗谱测量 | basic_measurement |
| `ocp_measurement` | 开路电位 | 开路电位测量 | basic_measurement |
| `chronoamperometry` | 计时安培法 | 计时安培法测量 | basic_measurement |
| `chronopotentiometry` | 计时电位法 | 计时电位法测量 | basic_measurement |
| `voltage_ramp` | 电压斜坡 | 电压斜坡测量（线性扫描伏安法） | basic_measurement |
| `current_ramp` | 电流斜坡 | 电流斜坡测量（电位动态扫描） | basic_measurement |
| `lsv_measurement` | 线性扫描伏安法 | 线性扫描伏安法测量 | basic_measurement |

## ⚙️ 节点配置详细说明

### 设备控制节点

#### startup - 启动设备
**功能**: 连接Zahner ZENNIUM设备
**参数**:
- `host` (string): 设备主机地址，默认值: "localhost"
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

#### shutdown - 停止设备
**功能**: 安全断开设备连接
**参数**:
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

### EIS测量节点

#### eis_potentiostatic - 恒电位EIS
**功能**: 恒电位电化学阻抗谱测量
**参数**:
- `eis_lower_frequency` (number): 低频限制 [Hz]，默认值: 0.2
- `eis_upper_frequency` (number): 高频限制 [Hz]，默认值: 100000
- `eis_start_frequency` (number): 起始频率 [Hz]，默认值: 1000
- `eis_lower_periods` (number): 低频区测量周期数，默认值: 4
- `eis_upper_periods` (number): 高频区测量周期数，默认值: 20
- `eis_lower_steps` (number): 低频区每十倍频程扫描点数，默认值: 5
- `eis_upper_steps` (number): 高频区每十倍频程扫描点数，默认值: 10
- `eis_scan_direction` (enum): 扫描方向，可选值: "START_TO_MAX", "START_TO_MIN"，默认值: "START_TO_MIN"
- `eis_scan_strategy` (enum): 扫描策略，可选值: "SINGLE_SINE", "MULTI_SINE"，默认值: "SINGLE_SINE"
- `eis_amplitude` (number): 交流扰动幅值 [V]，默认值: 0.025
- `eis_potential` (number): 直流偏置电位 [V]，默认值: 0.0
- `enable_dc_bias` (boolean): 启用直流偏置，默认值: false
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

#### eis_galvanostatic - 恒电流EIS
**功能**: 恒电流电化学阻抗谱测量
**参数**:
- `eis_lower_frequency` (number): 低频限制 [Hz]，默认值: 10
- `eis_upper_frequency` (number): 高频限制 [Hz]，默认值: 10000
- `eis_start_frequency` (number): 起始频率 [Hz]，默认值: 100
- `eis_lower_periods` (number): 低频区测量周期数，默认值: 20
- `eis_upper_periods` (number): 高频区测量周期数，默认值: 4
- `eis_lower_steps` (number): 低频区每十倍频程扫描点数，默认值: 10
- `eis_upper_steps` (number): 高频区每十倍频程扫描点数，默认值: 5
- `eis_scan_direction` (enum): 扫描方向，可选值: "START_TO_MAX", "START_TO_MIN"，默认值: "START_TO_MAX"
- `eis_scan_strategy` (enum): 扫描策略，可选值: "SINGLE_SINE", "MULTI_SINE"，默认值: "SINGLE_SINE"
- `eis_amplitude` (number): 交流扰动幅值 [A]，默认值: 0.001
- `eis_current` (number): 直流偏置电流 [A]，默认值: 0.0
- `enable_dc_bias` (boolean): 启用直流偏置，默认值: false
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

### 电位测量节点

#### ocp_measurement - 开路电位
**功能**: 开路电位测量
**参数**:
- `measurement_duration` (number): 测量持续时间 [s]，默认值: 60.0
- `sampling_interval` (number): 采样间隔 [s]，默认值: 1.0
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

#### chronopotentiometry - 计时电位法
**功能**: 计时电位法测量
**参数**:
- `polarization_current` (number): 极化电流 [A]，默认值: 0.01
- `measurement_duration` (number): 测量持续时间 [s]，默认值: 60.0
- `sampling_interval` (number): 采样间隔 [s]，默认值: 0.1
- `min_voltage` (number): 最小电位安全限 [V]，默认值: -4.0
- `max_voltage` (number): 最大电位安全限 [V]，默认值: 4.0
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

### 电流测量节点

#### chronoamperometry - 计时安培法
**功能**: 计时安培法测量
**参数**:
- `polarization_voltage` (number): 极化电压 [V]，默认值: 1.0
- `measurement_duration` (number): 测量持续时间 [s]，默认值: 60.0
- `sampling_interval` (number): 采样间隔 [s]，默认值: 0.1
- `min_current` (number): 最小电流安全限 [A]，默认值: -1.0
- `max_current` (number): 最大电流安全限 [A]，默认值: 1.0
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

### 扫描测量节点

#### voltage_ramp - 电压斜坡
**功能**: 电压斜坡测量（线性扫描伏安法）
**参数**:
- `start_voltage` (number): 起始电位 [V]，默认值: -0.5
- `end_voltage` (number): 结束电位 [V]，默认值: 0.8
- `voltage_reference` (enum): 电位参考模式，可选值: "absolute", "ocv"，默认值: "absolute"
- `measurement_duration` (number): 扫描持续时间 [s]，默认值: 130.0
- `sampling_interval` (number): 采样间隔 [s]，默认值: 1.0
- `min_current` (number): 最小电流安全限 [A]，默认值: -1.0
- `max_current` (number): 最大电流安全限 [A]，默认值: 1.0
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

#### current_ramp - 电流斜坡
**功能**: 电流斜坡测量（电位动态扫描）
**参数**:
- `start_current` (number): 起始电流 [A]，默认值: -0.01
- `end_current` (number): 结束电流 [A]，默认值: 0.01
- `measurement_duration` (number): 扫描持续时间 [s]，默认值: 60.0
- `sampling_interval` (number): 采样间隔 [s]，默认值: 1.0
- `min_voltage` (number): 最小电压安全限 [V]，默认值: -4.0
- `max_voltage` (number): 最大电压安全限 [V]，默认值: 4.0
- `workstation` (string): 工作站类型，默认值: "zahner-zennium"

#### lsv_measurement - 线性扫描伏安法
**功能**: 线性扫描伏安法测量（别名，指向电压斜坡）
**参数**: 与 voltage_ramp 相同

## 🔧 输入增强功能

### 科学计数法支持

系统支持以下科学计数法输入格式：

| 后缀 | 含义 | 乘数 | 示例 |
|------|------|------|------|
| `k` | 千 | ×1000 | `1k` = 1000 |
| `m` | 毫 | ×0.001 | `1m` = 0.001 |
| `M` | 兆 | ×1000000 | `1M` = 1000000 |
| `u`/`μ` | 微 | ×0.000001 | `1u` = 0.000001 |
| `n` | 纳 | ×0.000000001 | `1n` = 0.000000001 |

**示例**:
- 输入 `1k` → 解析为 1000
- 输入 `2.5m` → 解析为 0.0025
- 输入 `10M` → 解析为 10000000
- 输入 `500u` → 解析为 0.0005

### 输入体验优化

1. **禁用滚轮**: 数字输入框禁用滚轮改变数值，防止误操作
2. **文本输入**: 使用文本输入框支持科学计数法
3. **实时解析**: 输入时实时解析科学计数法
4. **格式化显示**: 失去焦点时可格式化显示（待实现）

## 📊 数据类型

### 节点端口类型

| 端口类型 | 描述 | 用途 |
|----------|------|------|
| `flow` | 流程端口 | 连接工作流步骤 |
| `data` | 数据端口 | 传输测量数据 |
| `control` | 控制端口 | 控制信号传输 |

### 输出数据类型

| 数据类型 | 描述 | 对应测量 |
|----------|------|----------|
| `eis_data` | EIS数据 | 恒电位/恒电流EIS |
| `potential_data` | 电位数据 | 开路电位、计时电位法 |
| `current_data` | 电流数据 | 计时安培法 |
| `voltammetry_data` | 伏安法数据 | 电压斜坡、电流斜坡、LSV |
| `device_connection` | 设备连接 | 设备启动/停止 |

## 🎨 节点样式

### 设备节点样式
- **宽度**: 140px
- **高度**: 60px
- **边框圆角**: 8px
- **文字颜色**: #ffffff

#### 启动节点 (startup)
- **背景**: linear-gradient(135deg, #4CAF50, #45a049)
- **边框**: #45a049
- **图标**: 🚀

#### 停止节点 (shutdown)
- **背景**: linear-gradient(135deg, #f44336, #d32f2f)
- **边框**: #d32f2f
- **图标**: 🛑

### 测量节点样式
- **宽度**: 160px
- **高度**: 60px
- **边框圆角**: 8px
- **文字颜色**: #ffffff

#### EIS测量节点
- **背景**: linear-gradient(135deg, #9C27B0, #7B1FA2)
- **边框**: #7B1FA2
- **图标**: 📊

#### 开路电位节点
- **背景**: linear-gradient(135deg, #FF9800, #F57C00)
- **边框**: #F57C00
- **图标**: 🔋

#### 计时安培法节点
- **背景**: linear-gradient(135deg, #2196F3, #1976D2)
- **边框**: #1976D2
- **图标**: ⏱️

#### 计时电位法节点
- **背景**: linear-gradient(135deg, #00BCD4, #0097A7)
- **边框**: #0097A7
- **图标**: ⏰

#### 电压斜坡节点
- **背景**: linear-gradient(135deg, #4CAF50, #388E3C)
- **边框**: #388E3C
- **图标**: 📈

#### 电流斜坡节点
- **背景**: linear-gradient(135deg, #FF5722, #D84315)
- **边框**: #D84315
- **图标**: 📉

#### 线性扫描伏安法节点
- **背景**: linear-gradient(135deg, #795548, #5D4037)
- **边框**: #5D4037
- **图标**: 🔬

## 🔍 开发指南

### 添加新节点类型

1. **在 `types.ts` 中添加节点类型**:
```typescript
export type NodeType =
  | 'existing_type'
  | 'new_type'; // 添加新类型
```

2. **在 NODE_CONFIGS 中添加配置**:
```typescript
new_type: {
  type: 'new_type',
  name: '新节点名称',
  category: 'basic_measurement',
  description: '节点描述',
  icon: '🔬',
  // ... 其他配置
  defaultParameters: {
    // 默认参数
  }
}
```

3. **更新执行服务**:
在 `execution.service.ts` 中添加对应的处理逻辑

### 修改节点参数

1. **修改 `types.ts` 中的 defaultParameters**
2. **确保 PropertyPanel.tsx 能正确处理新参数**
3. **更新后端服务以支持新参数**

### 样式定制

修改节点样式时，更新 `types.ts` 中的 `style` 配置：

```typescript
style: {
  width: 160,
  height: 60,
  background: 'linear-gradient(135deg, #颜色1, #颜色2)',
  borderColor: '#边框颜色',
  borderRadius: '8px',
  textColor: '#ffffff',
  icon: '🎨'
}
```

## 🐛 常见问题


### Q: 如何添加新的测量类型？
A: 需要同时修改:
1. `types.ts` - 添加节点定义
2. `execution.service.ts` - 添加执行逻辑
3. 后端 API - 支持新测量类型

### Q: 参数输入不支持科学计数法？
A: 系统已支持 k, m, M, u, μ, n 等后缀。确保使用最新版本的 PropertyPanel.tsx。

### Q: 如何禁用数字输入框的滚轮？
A: 已在 PropertyPanel.tsx 中通过 `onWheel` 事件禁用滚轮功能。

## 📝 版本历史

### v2.0.0 (当前版本)
- ✅ 移除公共参数 (measurement_type, output_path, filename, naming_mode, counter)
- ✅ 添加科学计数法输入支持
- ✅ 禁用数字输入框滚轮功能
- ✅ 简化参数界面
- ✅ 统一工作站类型配置

### v1.0.0 (初始版本)
- ✅ 基础节点系统
- ✅ 设备控制节点
- ✅ 8种测量节点类型
- ✅ 参数配置面板

## 📚 相关文档

- [后端API文档](../backend/docs/README.md)
- [设备集成指南](../backend/docs/zahner-integration.md)
- [工作流执行引擎](../backend/docs/execution-engine.md)

---

**文档版本**: v2.0.0
**最后更新**: 2025-09-19
**维护者**: ZahnerFlow 开发团队