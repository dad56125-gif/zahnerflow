# 循环连接条 Clipper 实现方案

## 概述

使用 Clipper（JavaScript 库）实现精确的路径偏移和并集操作，生成循环连接条的带状区域和外边框。

## 核心优势

### 1. 精确的几何运算
- 使用 Clipper 的 `ClipperOffset` 进行路径偏移
- 使用 Clipper 的 `Clipper` 进行多边形并集
- 避免浮点误差，提供工业级的精确度

### 2. 双层路径渲染
- **外边框**：Clipper 生成的外扩路径，作为边框
- **内填充**：Clipper 生成的内部路径，作为填充
- **层次清晰**：两层 path 元素，视觉边界明确
- **性能优化**：仅使用 2 个 path 元素，相比原方案减少 33%

### 3. 布尔运算能力
- 支持复杂路径的精确偏移
- 自动处理路径交叉和重叠
- 生成连续的、无缝的带状区域和边框

## 技术实现

### 核心流程

1. **路径段分解**
   ```typescript
   // 将循环路径分解为直线段或L形段
   segments.forEach(segment => {
     const points = [segment.start, segment.end];
   });
   ```

2. **偏移操作**
   ```typescript
   // 使用 Clipper 偏移生成带状多边形
   const offsetPaths = offsetPolyline(points, halfWidth);
   ```

3. **并集合并**
   ```typescript
   // 合并所有偏移路径为连续区域
   const unionPath = unionPolygons(offsetPaths);
   ```

4. **SVG 输出**
   ```typescript
   // 转换为 SVG path 字符串
   const svgPath = pathsToSVG(unionPath);
   ```

### 关键代码

#### Clipper 导入
```typescript
import * as clipper from 'clipper-lib';
```

#### 路径偏移
```typescript
const clipperOffset = new clipper.ClipperOffset();
clipperOffset.AddPath(path, clipper.JoinType.jtMiter, clipper.EndType.etOpenRound);
clipperOffset.Execute(offsetPaths, Math.round(offset * 100));
```

#### 并集操作
```typescript
const clipperUnion = new clipper.Clipper();
paths.forEach(path => {
  clipperUnion.AddPath(path, clipper.PolyType.ptSubject, true);
});
clipperUnion.Execute(clipper.ClipType.ctUnion, unionPaths, ...);
```

## 与原方案对比

| 特性 | 原方案（三线方案） | Clipper 方案 |
|------|------------------|--------------|
| 渲染元素 | 3个 line 元素 | 1个 path 元素 |
| 描边精度 | 手动偏移计算 | 工业级精确算法 |
| 路径交叉 | 需特殊处理 | 自动处理 |
| DOM 性能 | 较重 | 较轻 |
| 代码复杂度 | 较高 | 较低 |
| 可维护性 | 复杂 | 简洁 |

## 文件结构

```
apps/frontend/src/
├── utils/
│   └── clipper.ts              # Clipper 工具函数
├── components/features/loop/visualization/
│   └── LoopConnector.tsx       # 主组件（使用 generateBeltPath）
└── styles/components/
    └── _loop-connector.css     # 样式（适配 path 元素）
```

## 依赖

```json
{
  "dependencies": {
    "clipper-lib": "^6.4.2"
  }
}
```

## 使用示例

```typescript
import { generateBeltPath } from '../../../../utils/clipper';

const beltPath = generateBeltPath(segments, beltWidth);

return (
  <svg>
    <path d={beltPath} className="loop-connector-fill" />
  </svg>
);
```

## 动画支持

所有状态动画（running、paused、error、completed）都已适配单个 path 元素：

```css
.loop-connector-svg.running .loop-connector-fill {
  animation: loop-connector-running 2s ease-in-out infinite;
}
```

## 总结

Clipper 方案实现了：
- ✅ 精确的路径偏移和并集
- ✅ 单元素高性能渲染
- ✅ 工业级几何运算精度
- ✅ 简洁优雅的代码实现
- ✅ 完整的动画状态支持

这是一个**更专业、更高效、更可维护**的解决方案！
