/**
 * Clipper 工具函数 - 用于路径偏移和并集操作
 * 实现循环连接条的精确带状区域生成
 */

import * as clipper from 'clipper-lib';

export interface Point {
  X: number;
  Y: number;
}

/**
 * 将点数组转换为 Clipper 路径格式
 */
export function toClipperPath(points: Array<{ x: number; y: number }>): Point[] {
  return points.map(p => ({
    X: Math.round(p.x * 100), // 放大100倍避免浮点误差
    Y: Math.round(p.y * 100)
  }));
}

/**
 * 将 Clipper 结果转换为标准点数组
 */
export function fromClipperPath(paths: Point[][]): Array<Array<{ x: number; y: number }>> {
  return paths.map(path =>
    path.map(p => ({
      x: p.X / 100, // 缩小回原始比例
      y: p.Y / 100
    }))
  );
}

/**
 * 对折线进行偏移，生成带状多边形
 * @param points 折线的点数组
 * @param offset 偏移距离（像素）
 * @returns 偏移后的多边形路径
 */
export function offsetPolyline(points: Array<{ x: number; y: number }>, offset: number): Point[][] {
  if (points.length < 2) return [];

  const clipperOffset = new clipper.ClipperOffset();
  const path = toClipperPath(points);

  // 添加路径到偏移器，miterLimit 控制尖角处理
  clipperOffset.AddPath(path, clipper.JoinType.jtMiter, clipper.EndType.etOpenRound);

  // 执行偏移
  const offsetPaths = new clipper.Paths();
  clipperOffset.Execute(offsetPaths, Math.round(offset * 100));

  return offsetPaths; // 返回偏移后的多边形
}

/**
 * 合并多个多边形路径
 * @param paths 多边形路径数组
 * @returns 合并后的路径
 */
export function unionPolygons(paths: Point[][]): Point[][] {
  if (paths.length === 0) return [];
  if (paths.length === 1) return paths;

  const clipperUnion = new clipper.Clipper();
  const unionPaths = new clipper.Paths();

  // 添加所有路径到并集操作
  paths.forEach(path => {
    clipperUnion.AddPath(path, clipper.PolyType.ptSubject, true);
  });

  // 执行并集操作
  clipperUnion.Execute(clipper.ClipType.ctUnion, unionPaths, clipper.PolyFillType.pftNonZero, clipper.PolyFillType.pftNonZero);

  return unionPaths;
}

/**
 * 生成 SVG path 字符串
 * @param paths 多边形路径数组
 * @returns SVG path 字符串
 */
export function pathsToSVG(paths: Point[][]): string {
  if (paths.length === 0) return '';

  return paths.map(path => {
    if (path.length === 0) return '';

    let d = `M ${path[0].X / 100} ${path[0].Y / 100}`;
    for (let i = 1; i < path.length; i++) {
      d += ` L ${path[i].X / 100} ${path[i].Y / 100}`;
    }
    d += ' Z'; // 闭合路径
    return d;
  }).join(' ');
}

/**
 * 为折线路径生成带状区域的 SVG path
 * @param segments 路径段数组（包含起始和结束点）
 * @param beltWidth 带宽（像素）
 * @returns SVG path 字符串
 */
export function generateBeltPath(
  segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>,
  beltWidth: number
): string {
  if (segments.length === 0) return '';

  const halfWidth = beltWidth / 2;

  // 为每个段生成偏移路径
  const offsetPaths: Point[][] = [];

  segments.forEach(segment => {
    const points = [segment.start, segment.end];
    const offset = offsetPolyline(points, halfWidth);
    if (offset.length > 0) {
      offsetPaths.push(...offset);
    }
  });

  // 合并所有偏移路径
  const unionPath = unionPolygons(offsetPaths);

  // 转换为 SVG path
  return pathsToSVG(unionPath);
}

/**
 * 生成带外边框的带状区域路径
 * @param segments 路径段数组
 * @param beltWidth 带宽
 * @param borderWidth 边框宽度
 * @returns 包含内路径和边框路径的对象
 */
export function generateBeltPathWithBorder(
  segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>,
  beltWidth: number,
  borderWidth: number = 2
): { fillPath: string; borderPath: string } {
  if (segments.length === 0) {
    return { fillPath: '', borderPath: '' };
  }

  const halfWidth = beltWidth / 2;
  const fullWidth = beltWidth + borderWidth * 2;

  // 为每个段生成偏移路径
  const fillOffsetPaths: Point[][] = [];
  const borderOffsetPaths: Point[][] = [];

  segments.forEach(segment => {
    const points = [segment.start, segment.end];

    // 填充区域偏移
    const fillOffset = offsetPolyline(points, halfWidth);
    if (fillOffset.length > 0) {
      fillOffsetPaths.push(...fillOffset);
    }

    // 整个带状区域偏移（包含边框）
    const borderOffset = offsetPolyline(points, fullWidth / 2);
    if (borderOffset.length > 0) {
      borderOffsetPaths.push(...borderOffset);
    }
  });

  // 合并路径
  const fillUnionPath = unionPolygons(fillOffsetPaths);
  const borderUnionPath = unionPolygons(borderOffsetPaths);

  // 转换为 SVG path
  const fillPath = pathsToSVG(fillUnionPath);
  const borderPath = pathsToSVG(borderUnionPath);

  return { fillPath, borderPath };
}
