# ECharts + React 高性能实时降采样图表方案（精简重构版）

> 目标：按“现有结构 → CSS样式 → 组件实现 → 迁移方案”的逻辑顺序重组文档，去重合并，保留关键细节，确保可实施。

---

## 1. 现有界面结构分析

### 1.1 整体布局架构（DeviceModal → 主内容区域 → 图表容器）

* **顶层容器：** `DeviceModal`

  * **device-header**：标题、关闭按钮、选项卡导航（监控/编程）
  * **main-content-wrapper**：左右两栏布局

    * **content-main（左侧 2/3）**

      * **status-display**：PV/SV/MV、程序状态
      * **chart-container**

        * **chart-header**：标题、测试数据指示
        * **chart-content**：图表主体（当前为 `TemperatureChart`）
      * **control-panel**：运行/暂停/停止
    * **content-sidebar（右侧 1/3）**：控制台与日志
  * **device-connection-section**：串口选择、连接/断开

### 1.2 功能模块组织

* **选项卡导航**：监控/编程，带激活态样式
* **状态显示**：PV、SV、MV、程序运行状态（运行/暂停/停止）
* **图表展示**：折线渲染为主，移除时间范围、曲线开关、导出等额外控件
* **运行控制**：运行、暂停、停止（按钮状态与禁用态）
* **设备连接**：端口列表、刷新、连接/断开、状态消息

### 1.3 组件树结构图（简版）

> 仅展示 **chart-content（图表区域）** 以下的层级，便于对照迁移与样式绑定。

```
chart-content
└─ RealtimeTemperatureChart（ECharts 容器）
   └─ chart-main            # ECharts 画布（ReactECharts 容器）
      └─ echarts-for-react  # 实际 <canvas> / <div> 渲染
`

---

## 2. CSS 样式系统分析（合并去重）

> 设计语言：**Glassmorphism**（毛玻璃）+ 响应式 + 可访问性；保留变量与关键组件样式，避免重复。

### 2.1 玻璃态设计系统（变量、基础样式）

* **变量文件：** `styles/base/_variables.css`

  * `--glass-bg`、`--glass-border`、`--glass-shadow`、`--blur-*`、`--radius*`、`--transition`
* **用途：** 背景毛玻璃、细边框、阴影与过渡，统一色彩与圆角。

### 2.2 按钮样式系统（基础、状态、颜色变体）

* **文件：** `styles/components/_button.css`
* **核心类：** `.btn`（通用）、`.btn-primary`、`.btn-success`、`.btn-warning`、`.btn-danger`
* **交互：** 悬浮上浮与阴影，`.btn:disabled` 降低不透明度与禁止交互。

### 2.3 图表特定样式（容器、辅助、响应）

* **文件：** `styles/components/_temperature-controller.css`
* **容器类：** `.temperature-chart`（主容器）、`.chart-main`（图表画布高度与圆角）
* **辅助信息：** `.chart-stats`（数据点、最新 PV/SV 显示，若取消展示可在样式中标记待移除）
* **样式精简：** 剔除 `.chart-controls`、`.glass-select` 等外部控制类名依赖，避免孤立样式
* **Recharts 覆盖（迁移后保留语义，选择性精简）：**

  * `.recharts-wrapper` 背景透明、坐标轴与网格线弱化、`.chart-tooltip` 玻璃态弹层
* **响应式断点：** 1024/768/480，收拢布局与降低最小高度

### 2.4 动画效果系统（悬浮、加载、进度）

* **按钮发光流动：** `flowSweep`、`flowParticle`
* **加载旋转：** `.loading-spinner` + `@keyframes spin`
* **建议：** 动画保持，但与图表渲染解耦，避免在高频渲染区域使用复杂阴影。

> **保留的颜色语义：** `.pv-value`（红）、`.sv-value`（蓝）、`.mv-value`（绿）；程序状态色（运行/暂停/停止）。

---

## 3. 当前组件实现方式

### 3.1 核心文件清单（角色/作用）

* **组件**

  * `components/TemperatureChart.tsx`：当前 Recharts 方案（包含时间范围/导出等控制面板，迁移完成后下线）
  * `components/DeviceModal.tsx`：装配图表与操作按钮
* **数据管理**

  * `services/hooks/useFurnace.ts`：轮询状态、实时追加、历史加载
  * `services/api/furnaceApi.ts`：`/logs/temperature` 历史数据接口
* **类型**

  * `types/devices.ts`：`FurnaceSample { timestamp, temperature, sv?, mv? }`

### 3.2 关键函数位置（便于对照修改）

* **实时追加（建议改造点）**：`useFurnace.ts` 约 298–309 行

  * 目前：`historyData = [...prev, sample].slice(-1000)`（**会丢历史**）
  * 迁移后：保留**全量历史**以支持 ECharts LTTB（见 §4.3）
* **历史加载**：`useFurnace.ts` 约 703–719 行 `loadHistoryData`
* **图表装配**：`DeviceModal.tsx` 约 306–310 行

### 3.3 数据流架构（状态管理、数据流向）

* **Source of Truth：** `historyData`（组件/Hook 维护）
* **流向：** Hook 拉取/轮询 → 组件接收 props/state → 图表渲染
* **问题：** Recharts 无内置降采样；1000 点截断；放大后卡顿

### 3.4 交互逻辑处理（用户操作、状态更新）

* **时间范围**、**曲线开关**、**平滑**、**导出**、**刷新**
* **运行控制**：运行/暂停/停止；按钮禁用态与反馈

---

## 4. Recharts → ECharts 迁移方案

### 4.1 技术选型对比（精要）

| 维度    | Recharts         | ECharts                                    |
| ----- | ---------------- | ------------------------------------------ |
| 大数据性能 | 无内置降采样，>2k 点性能下滑 | **内置 `sampling: 'lttb'`**，`large: true` 高效 |
| 交互    | 基础缩放/刷选需手动组合     | **`dataZoom`** 内置缩放/平移/范围控件                |
| 长时运行  | 需自管滑窗/截断         | 可持有全量历史 + 自动降采样                            |
| 复杂度   | 轻                | 附带强大配置但学习曲线略高                              |

> 选择 ECharts 的核心理由：**内置 LTTB 降采样、原生大数据优化、缩放交互完善**。

### 4.2 ECharts 组件设计（新的组件架构）

* **单一组件：** `RealtimeTemperatureChart.tsx`

  * 内部维护/接收 `historyData`（建议以 props 传入，或由组件内轮询）
  * 配置 `dataZoom`、`tooltip`、`legend`、三条折线（PV/SV/MV）
  * 开启 `large: true` + `sampling: 'lttb'` + `showSymbol: false`

**示例（精简核心）**：

```tsx
import React from 'react';
import ReactECharts from 'echarts-for-react';

type Sample = { timestamp: string | number; temperature: number; sv?: number; mv?: number };
export default function RealtimeTemperatureChart({ historyData }: { historyData: Sample[] }) {
  const option = {
    title: { text: '温控仪实时监控' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['PV(实际温度)', 'SV(设定温度)', 'MV(输出功率)'] },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', start: 0, end: 100 }],
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    series: [
      { name: 'PV(实际温度)', type: 'line', data: historyData.map(d => [d.timestamp, d.temperature]), showSymbol: false, large: true, sampling: 'lttb' },
      { name: 'SV(设定温度)', type: 'line', data: historyData.map(d => [d.timestamp, d.sv ?? 0]), showSymbol: false, large: true, sampling: 'lttb' },
      { name: 'MV(输出功率)', type: 'line', data: historyData.map(d => [d.timestamp, d.mv ?? 0]), showSymbol: false, large: true, sampling: 'lttb' },
    ]
  };
  return <ReactECharts option={option} style={{ width: '100%', height: 500 }} />;
}
```

### 4.3 数据流重构（状态管理改造）

* **取消 1000 点截断：** 删除 `slice(-1000)`，避免历史丢失
* **持有全量历史：**

  * 方案 A：在 `useFurnace` 维护全量 `historyData`（内存上限可按小时级分片；策略：当天内存、历史分段懒载）
  * 方案 B：组件内轮询并持有，`DeviceModal` 仅装配（简单、耦合度低）
* **模态关闭保持采集：** `useFurnace` 已提升到应用根组件，关闭设备模态不会析构历史；仅整页刷新时释放缓存
* **内存优化建议：**

  * **分片存储：** 按小时/天分片数组，渲染时拼接当前可视区
  * **对象池化：** 追加点复用对象减少 GC（可选）
  * **时间戳为数值：** `Date.getTime()` 降低解析成本

### 4.4 样式适配方案（保持视觉一致性）

* 保留 `.temperature-chart`、`.chart-main`、`.chart-stats`（如继续显示最新统计）；移除 `.chart-controls`、`.glass-select` 等已废弃控制样式
* 将 **Recharts 覆盖样式** 收敛到 **ECharts 容器**（如 `.echarts-for-react` 外层容器），工具提示 `.chart-tooltip` 样式按需适配
* 颜色语义保持：PV 红、SV 蓝、MV 绿；程序状态色不变

### 4.5 实施步骤计划（Checklist）

1. **安装依赖**：`npm i echarts echarts-for-react`
2. **新增文件**：`apps/frontend/src/components/RealtimeTemperatureChart.tsx`
3. **Hook 改造**：取消 `slice(-1000)`，保证全量历史；时间戳存 `number` 更佳。
4. **DeviceModal 接入**：用 `RealtimeTemperatureChart` 替换 `TemperatureChart` 调用；传入 `furnaceState.historyData`。
5. **历史加载策略：** 启动时加载最近 24h（或用户选定范围），之后**增量追加**
6. **交互策略：** 使用 ECharts 默认缩放/平移体验，无需额外时间范围或曲线开关控件
7. **QA 与性能验证**：

   * 10k/50k/100k 点场景：缩放/平移/tooltip 流畅度
   * 24h 连续运行：内存增长是否稳定、是否产生抖动
   * 移动端断点：高度、触控缩放是否可用
8. **文档与回滚**：保留旧 `TemperatureChart.tsx` 一版；稳定后标记弃用并删除。

### 4.6 文件修改清单（整合）

* **新增**

  * `apps/frontend/src/components/RealtimeTemperatureChart.tsx`
* **修改**

  * `apps/frontend/src/services/hooks/useFurnace.ts`（去截断、可选分片存储）
  * `apps/frontend/src/components/DeviceModal.tsx`（替换组件装配）
* **可删除（稳定后）**

  * `apps/frontend/src/components/TemperatureChart.tsx`

### 4.7 追加单点绘图 API（无需在 React 中管理数组）

> 目标：外部只需调用 `append(point)` 即可增量绘制；历史数据由 **ECharts 实例** 持有，而非 React state。

**核心思路**

* 使用 `echartsInstance.appendData({ seriesIndex, data })` 直接向系列追加点。
* 组件对外暴露 `append(point)` 的 **命令式句柄**（`forwardRef` + `useImperativeHandle`）。
* 初始化时 `series[].data` 为空数组；降采样与大数据优化仍由 ECharts 负责。

**类型定义**

```ts
export type Sample = { ts: number; pv: number; sv?: number; mv?: number };
export type RealtimeChartHandle = { append: (p: Sample) => void };
```

**组件实现（最小可用）**

```tsx
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';

const RealtimeTemperatureChart = forwardRef<RealtimeChartHandle, {}>((props, ref) => {
  const ecRef = useRef<ReactECharts>(null);

  const option = useMemo(() => ({
    title: { text: '温控仪实时监控' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['PV(实际温度)', 'SV(设定温度)', 'MV(输出功率)'] },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', start: 0, end: 100 }],
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    series: [
      { name: 'PV(实际温度)', type: 'line', data: [], showSymbol: false, large: true, sampling: 'lttb' },
      { name: 'SV(设定温度)', type: 'line', data: [], showSymbol: false, large: true, sampling: 'lttb' },
      { name: 'MV(输出功率)', type: 'line', data: [], showSymbol: false, large: true, sampling: 'lttb' },
    ],
  }), []);

  useImperativeHandle(ref, () => ({
    append(p) {
      const ec = ecRef.current?.getEchartsInstance();
      if (!ec) return;
      // 依次向三条曲线追加单点（可按需裁剪某些曲线）
      ec.appendData({ seriesIndex: 0, data: [[p.ts, p.pv]] });
      ec.appendData({ seriesIndex: 1, data: [[p.ts, p.sv ?? 0]] });
      ec.appendData({ seriesIndex: 2, data: [[p.ts, p.mv ?? 0]] });
    }
  }), []);

  return (
    <div className="temperature-chart">
      <div className="chart-main">
        <ReactECharts ref={ecRef} option={option} style={{ width: '100%', height: 500 }} />
      </div>
    </div>
  );
});

export default RealtimeTemperatureChart;
```

**调用方式（外部无需管理数组）**

```tsx
const chartRef = useRef<RealtimeChartHandle>(null);

// 在轮询/订阅回调里：
chartRef.current?.append({ ts: Date.now(), pv, sv, mv });

// JSX
<RealtimeTemperatureChart ref={chartRef} />
```

**注意事项**

* `appendData` 依赖已有 `series`，请确保系列已初始化（即使空数组）
* 当前 `useFurnace` Hook 已提升到应用根组件，关闭设备模态不会卸载图表；刷新整页时才会释放 ECharts 内部历史。若需跨刷新持久化，仍需在外层（或后端）存档
* 交互（缩放/平移）与 **LTTB 降采样** 仍然生效；无需 React 侧维护全量数组。
* 如需限流，可在外层做 `throttle`/`debounce`；或按固定步长合并后再 `append`。

---

## 附：ECharts 关键配置说明（最小必要集合）

| 配置项                   | 值                   | 作用             |
| --------------------- | ------------------- | -------------- |
| `series[].large`      | `true`              | 大数据量加速路径构建     |
| `series[].sampling`   | `'lttb'`            | 基于趋势保真的降采样     |
| `series[].showSymbol` | `false`             | 隐藏散点，降低绘制负担    |
| `dataZoom`            | `inside` + `slider` | 内嵌缩放 + 滑块范围选择  |
| `xAxis.type`          | `time`              | 时间轴（推荐使用毫秒时间戳） |

---

## 本次精简重构要点（与原文差异）

* **合并**：CSS 类说明、动画、响应式统一到“样式系统”一章；代码与文件清单统一到“组件实现”一章。
* **去重**：删去重复的技术选型叙述与多处代码片段；仅保留一处 ECharts 核心示例。
* **重排**：严格按“结构 → 样式 → 实现 → 迁移”的顺序组织。
* **保留**：PV/SV/MV 三曲线、颜色语义、交互项与文件路径、关键行号引用。
* **增强**：加入分片存储与时间戳数值化等内存与性能建议，补充 QA 清单。

---

## 预期效果（验证标准）

* **逻辑清晰**：章节顺序符合实施流程，避免跨章跳转
* **内容精简**：去重后篇幅更短，但信息密度更高
* **细节完整**：包含依赖、文件、代码示例、配置表与检查项
* **易于实施**：按 Checklist 逐步替换即可达成 24h+ 实时流畅渲染
