# API 参考文档

## LayoutService API

### getInstance()

获取LayoutService的单例实例。

```typescript
static getInstance(): LayoutService
```

**返回值**: LayoutService实例

**示例**:
```typescript
const layout_service = LayoutService.getInstance();
```

---

### calculateDynamicLayout()

计算动态布局配置，返回每行的节点数和间距信息。

```typescript
calculateDynamicLayout(nodes: ElectrochemicalNode[], layout_params: LayoutParameters): DynamicLayoutConfig
```

**参数**:
- `nodes`: 节点数组
- `layout_params`: 布局参数

**返回值**: `DynamicLayoutConfig`

```typescript
interface DynamicLayoutConfig {
  nodes_per_row: number;           // 每行节点数
  actual_spacing: number;          // 实际节点间距
  start_x: number;                 // 起始X坐标
  connection_length: number;       // 连接线长度
  total_rows: number;              // 总行数
  layout_type: 'single_row' | 'multi_row'; // 布局类型
}
```

**示例**:
```typescript
const layout_config = layout_service.calculateDynamicLayout(nodes, {
  canvas_width: 1000,
  canvas_height: 600,
  padding: 100,
  top_padding: 100,
  row_height: 150,
  min_node_spacing: 60
});
```

---

### calculateNodePosition()

计算单个节点的位置。

```typescript
calculateNodePosition(params: NodePositionParams): Position
```

**参数**:
```typescript
interface NodePositionParams {
  index: number;                    // 节点索引
  nodes: ElectrochemicalNode[];     // 所有节点数组
  layout_params: LayoutParameters;  // 布局参数
}
```

**返回值**: `Position` - 节点的位置坐标

**示例**:
```typescript
const position = layout_service.calculateNodePosition({
  index: 2,
  nodes: all_nodes,
  layout_params: layout_params
});
console.log(position); // { x: 250, y: 250 }
```

---

### calculateNodeIndex()

根据坐标位置计算节点索引（用于拖拽操作）。

```typescript
calculateNodeIndex(params: ReverseIndexParams): number
```

**参数**:
```typescript
interface ReverseIndexParams {
  position: Position;               // 点击/拖拽位置
  nodes: ElectrochemicalNode[];     // 当前节点数组
  layout_params: LayoutParameters;  // 布局参数
  allow_insert_at_end: boolean;     // 是否允许插入到末尾
}
```

**返回值**: `number` - 目标节点索引

**示例**:
```typescript
const target_index = layout_service.calculateNodeIndex({
  position: { x: 300, y: 200 },
  nodes: current_nodes,
  layout_params: layout_params,
  allow_insert_at_end: true
});
```

---

### calculateAllNodePositions()

批量计算所有节点的位置。

```typescript
calculateAllNodePositions(nodes: ElectrochemicalNode[], layout_params: LayoutParameters): Map<number, Position>
```

**参数**:
- `nodes`: 节点数组
- `layout_params`: 布局参数

**返回值**: `Map<number, Position>` - 节点索引到位置的映射

**示例**:
```typescript
const positions = layout_service.calculateAllNodePositions(nodes, layout_params);
positions.forEach((position, index) => {
  console.log(`节点 ${index}:`, position);
});
```

---

### getDefaultLayoutParams()

获取默认的布局参数。

```typescript
getDefaultLayoutParams(canvas_width: number, canvas_height: number): LayoutParameters
```

**参数**:
- `canvas_width`: 画布宽度
- `canvas_height`: 画布高度

**返回值**: `LayoutParameters`

**示例**:
```typescript
const layout_params = layout_service.getDefaultLayoutParams(1200, 800);
console.log(layout_params);
// {
//   canvas_width: 1200,
//   canvas_height: 800,
//   padding: 100,
//   top_padding: 100,
//   row_height: 150,
//   min_node_spacing: 60
// }
```

---

### clearCache()

清除布局计算缓存。

```typescript
clearCache(): void
```

**示例**:
```typescript
layout_service.clearCache();
```

## ConnectionBindingService API

### getInstance()

获取ConnectionBindingService的单例实例。

```typescript
static getInstance(): ConnectionBindingService
```

**返回值**: ConnectionBindingService实例

---

### updateNodes()

更新节点数据并重新计算布局。

```typescript
updateNodes(nodes: ElectrochemicalNode[], layout_params: LayoutParameters): void
```

**参数**:
- `nodes`: 节点数组
- `layout_params`: 布局参数

**事件触发**:
- `layout-recalculated`: 布局重新计算完成
- `connection-paths-updated`: 连接线路径更新完成

**示例**:
```typescript
connection_service.updateNodes(new_nodes, layout_params);
```

---

### updateNodePosition()

更新单个节点的位置（用于拖拽预览）。

```typescript
updateNodePosition(node_index: number, new_position: Position): void
```

**参数**:
- `node_index`: 节点索引
- `new_position`: 新的位置坐标

**事件触发**:
- `node-position-changed`: 节点位置变化
- `connection-paths-updated`: 连接线路径更新

**示例**:
```typescript
connection_service.updateNodePosition(2, { x: 350, y: 250 });
```

---

### getConnectionPaths()

获取当前所有连接线的路径信息。

```typescript
getConnectionPaths(): ConnectionPath[]
```

**返回值**: `ConnectionPath[]`

```typescript
interface ConnectionPath {
  start_node_index: number;         // 起始节点索引
  end_node_index: number;           // 结束节点索引
  start_position: Position;         // 起始位置（节点边缘）
  end_position: Position;           // 结束位置（节点边缘）
  path_points: Position[];          // 路径关键点
  connection_type: 'straight' | 'curved'; // 连接类型
  row_span: number;                 // 跨越的行数
}
```

**示例**:
```typescript
const paths = connection_service.getConnectionPaths();
paths.forEach(path => {
  console.log(`连接线: ${path.start_node_index} -> ${path.end_node_index}`);
});
```

---

### getNodePosition()

获取指定节点的当前位置。

```typescript
getNodePosition(node_index: number): Position | undefined
```

**参数**:
- `node_index`: 节点索引

**返回值**: `Position | undefined` - 节点位置，如果不存在返回undefined

**示例**:
```typescript
const position = connection_service.getNodePosition(1);
if (position) {
  console.log('节点1的位置:', position);
}
```

---

### getAllNodePositions()

获取所有节点的当前位置。

```typescript
getAllNodePositions(): Map<number, Position>
```

**返回值**: `Map<number, Position>` - 所有节点的位置映射

**示例**:
```typescript
const positions = connection_service.getAllNodePositions();
positions.forEach((position, index) => {
  console.log(`节点 ${index}:`, position);
});
```

## 事件系统

ConnectionBindingService继承自EventEmitter，支持以下事件：

### 'layout-recalculated'

布局重新计算完成时触发。

```typescript
connection_service.on('layout-recalculated', (positions: Map<number, Position>) => {
  console.log('布局重新计算完成:', positions);
});
```

### 'connection-paths-updated'

连接线路径更新时触发。

```typescript
connection_service.on('connection-paths-updated', (paths: ConnectionPath[]) => {
  setConnectionPaths(paths);
});
```

### 'node-position-changed'

单个节点位置变化时触发。

```typescript
connection_service.on('node-position-changed', (node_index: number, new_position: Position) => {
  console.log(`节点 ${node_index} 位置变化:`, new_position);
});
```

## 类型定义

### Position

```typescript
interface Position {
  x: number;
  y: number;
}
```

### LayoutParameters

```typescript
interface LayoutParameters {
  canvas_width: number;      // 画布宽度
  canvas_height: number;     // 画布高度
  padding: number;           // 左右边距
  top_padding: number;       // 顶部留白
  row_height: number;        // 行间距
  min_node_spacing: number;  // 最小节点间距
}
```

### ElectrochemicalNode

```typescript
interface ElectrochemicalNode {
  id: string;
  name: string;
  type: NodeType;
  position: Position;
  style: {
    width: number;
    height: number;
    [key: string]: any;
  };
  data: NodeData;
  // ... 其他属性
}
```

## 错误处理

### 常见错误类型

1. **索引越界错误**
```typescript
// 当传入的节点索引超出范围时
const position = layout_service.calculateNodePosition({
  index: 999,  // 超出节点数组范围
  nodes: actual_nodes,
  layout_params
});
// 位置: 不会抛出错误，但结果可能不准确
```

2. **参数验证错误**
```typescript
// 当传入的画布尺寸无效时
const layout_params = layout_service.getDefaultLayoutParams(0, 0);
// 处理: 服务会使用最小有效值
```

3. **缓存相关错误**
```typescript
// 缓存键冲突时，服务会自动清除旧缓存
layout_service.clearCache(); // 手动清除缓存
```

### 最佳实践

1. **参数验证**
```typescript
// 在调用API前进行参数验证
if (canvas_width <= 0 || canvas_height <= 0) {
  throw new Error('画布尺寸必须大于0');
}

const layout_params = layout_service.getDefaultLayoutParams(canvas_width, canvas_height);
```

2. **错误处理**
```typescript
try {
  const position = layout_service.calculateNodePosition(params);
  return position;
} catch (error) {
  console.error('计算节点位置失败:', error);
  return { x: 0, y: 0 }; // 返回默认位置
}
```

3. **事件监听清理**
```typescript
// 在组件卸载时清理事件监听
useEffect(() => {
  const handler = (paths) => setConnectionPaths(paths);
  connection_service.on('connection-paths-updated', handler);

  return () => {
    connection_service.off('connection-paths-updated', handler);
  };
}, []);
```

---

**文档版本**: 1.0
**最后更新**: 2025-11-01