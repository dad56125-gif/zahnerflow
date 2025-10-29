/**
 * 几何计算工具函数
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * 计算凸包 - Graham扫描算法
 * @param points 点集合
 * @returns 凸包顶点（按顺时针或逆时针顺序）
 */
export const calculateConvexHull = (points: Point[]): Point[] => {
  if (points.length < 3) return points;

  // 按x坐标排序，x相同时按y排序
  const sortedPoints = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

  // 计算叉积判断方向
  const cross = (o: Point, a: Point, b: Point) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };

  // 构建下凸包
  const lower: Point[] = [];
  for (const point of sortedPoints) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  // 构建上凸包
  const upper: Point[] = [];
  for (let i = sortedPoints.length - 1; i >= 0; i--) {
    const point = sortedPoints[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  // 移除重复的起点/终点
  lower.pop();
  upper.pop();

  return lower.concat(upper);
};

/**
 * 计算点集合的中心点
 * @param points 点集合
 * @returns 中心点坐标
 */
export const getCenterPoint = (points: Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 };

  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);

  return {
    x: sumX / points.length,
    y: sumY / points.length
  };
};

/**
 * 生成SVG路径字符串
 * @param points 点集合
 * @param close 是否闭合路径
 * @returns SVG路径字符串
 */
export const generateSVGPath = (points: Point[], close: boolean = true): string => {
  if (points.length === 0) return '';

  const pathData = points.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
  }).join(' ');

  return close ? pathData + ' Z' : pathData;
};

/**
 * 计算点集合的边界框
 * @param points 点集合
 * @returns 边界框 {x, y, width, height}
 */
export const getBounds = (points: Point[]): { x: number; y: number; width: number; height: number } => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
};