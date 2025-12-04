# Bug修复报告：calculateNodeIndex未定义错误

## 🔴 错误信息

```
Uncaught ReferenceError: calculateNodeIndex is not defined
    at Canvas (Canvas.tsx:263:32)
```

## 🔍 错误原因

在 `handleNodeDragEndEnhanced` 的依赖数组中错误地包含了 `calculateNodeIndex`：

```typescript
// ❌ 错误代码 - 第263行
}, [nodes, canvasSize.width, calculateNodeIndex, setNodes]);
```

**问题**: 
- `calculateNodeIndex` 不是在组件作用域中定义的变量
- 它是从 `canvasStore.ts` 中通过 `useCanvasStore.getState().calculateNodeIndex` 获取的
- React Hook的依赖数组只能包含直接作用域中的变量

## ✅ 修复方案

**修改前**:
```typescript
const handleNodeDragEndEnhanced = useCallback((draggedNode, event) => {
  // ...函数体...
  
  // 依赖数组包含未定义的calculateNodeIndex
}, [nodes, canvasSize.width, calculateNodeIndex, setNodes]);  // ❌
```

**修改后**:
```typescript
const handleNodeDragEndEnhanced = useCallback((draggedNode, event) => {
  // ...函数体...
  
  // 在函数内部获取calculateNodeIndex
  const { calculateNodeIndex } = useCanvasStore.getState();
  
  // 依赖数组只包含直接作用域变量
}, [nodes, canvasSize.width, setNodes]);  // ✅
```

## 📊 修改详情

**文件**: `apps/frontend/src/canvas/Canvas.tsx`

**修改位置**: 第247行（添加内部获取）和第264行（修复依赖数组）

```typescript
// 第247行：在函数内部获取calculateNodeIndex
const { calculateNodeIndex } = useCanvasStore.getState();

// 第264行：从依赖数组移除calculateNodeIndex
}, [nodes, canvasSize.width, setNodes]);  // 已移除calculateNodeIndex
```

## ✅ 验证结果

1. **编译检查**: ✅ TypeScript编译通过
2. **运行时检查**: ✅ 无ReferenceError错误
3. **功能测试**: ✅ 拖拽排序正常工作
4. **依赖数组**: ✅ 只包含直接作用域变量

## 🎯 核心原则

**React Hook依赖数组规则**:
- 只能包含在组件作用域中定义的变量
- 外部函数或变量应在运行时获取，而非依赖数组

**修正后代码符合**: ✅ React Hooks最佳实践

## 📝 总结

**错误**: 在useCallback依赖数组中引用了未定义的变量
**修复**: 将calculateNodeIndex改为函数内部运行时获取
**结果**: 拖拽即排序功能正常工作，无编译或运行时错误

**状态**: ✅ 已修复并验证
