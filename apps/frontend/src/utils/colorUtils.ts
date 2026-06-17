/**
 * 颜色工具函数
 * 用于循环迭代的动态亮度映射
 */

const MIN_LIGHTNESS = 100;  // 基础亮度（最深色）
const MAX_LIGHTNESS = 245;  // 最大亮度（接近白色）

/**
 * 计算所有迭代的亮度值
 * 复杂度: O(n)
 * @param totalIterations 当前总迭代数
 * @returns 每个迭代的亮度值数组 [L0, L1, ..., Ln-1]
 */
export function calculateIterationLightness(totalIterations: number): number[] {
    if (totalIterations <= 1) return [MIN_LIGHTNESS];

    const result: number[] = [];
    const range = MAX_LIGHTNESS - MIN_LIGHTNESS;

    for (let i = 0; i < totalIterations; i++) {
        // 线性插值: 第i次迭代的亮度
        const lightness = MIN_LIGHTNESS + (range * i) / (totalIterations - 1);
        result.push(Math.round(lightness));
    }

    return result;
}

/**
 * 将亮度应用 to HSL 颜色
 * @param baseHue 基础色相 (0-360)
 * @param saturation 饱和度 (0-100)
 * @param lightness 亮度 (0-255，会转换为百分比)
 * @returns RGB 颜色字符串
 */
export function hslToRgb(baseHue: number, saturation: number, lightness: number): string {
    // 将 0-255 的亮度值转换为 0-100 的百分比
    const l = (lightness / 255) * 100;

    const s = saturation / 100;
    const lightnessFraction = l / 100;

    const c = (1 - Math.abs(2 * lightnessFraction - 1)) * s;
    const x = c * (1 - Math.abs((baseHue / 60) % 2 - 1));
    const m = lightnessFraction - c / 2;

    let r = 0, g = 0, b = 0;

    if (baseHue >= 0 && baseHue < 60) {
        r = c; g = x; b = 0;
    } else if (baseHue >= 60 && baseHue < 120) {
        r = x; g = c; b = 0;
    } else if (baseHue >= 120 && baseHue < 180) {
        r = 0; g = c; b = x;
    } else if (baseHue >= 180 && baseHue < 240) {
        r = 0; g = x; b = c;
    } else if (baseHue >= 240 && baseHue < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    const red = Math.round((r + m) * 255);
    const green = Math.round((g + m) * 255);
    const blue = Math.round((b + m) * 255);

    return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * 为迭代生成颜色
 * @param baseHue 基础色相 (蓝色约 210, 橙色约 30)
 * @param iterationIndex 当前迭代索引 (0-based)
 * @param totalIterations 总迭代数
 * @returns RGB 颜色字符串
 */
export function getIterationColor(baseHue: number, iterationIndex: number, totalIterations: number): string {
    const lightnessArray = calculateIterationLightness(totalIterations);
    const lightness = lightnessArray[iterationIndex];
    return hslToRgb(baseHue, 80, lightness);
}

export type IterationSymbol = 'circle' | 'rect' | 'triangle' | 'diamond' | 'roundRect';
export type EisLegendScheme = 'palette' | 'sampleGradient';

const EIS_LEGEND_VISUALS: Array<{ color: string; symbol: IterationSymbol }> = [
    { color: '#ff4d4f', symbol: 'circle' },
    { color: '#40a9ff', symbol: 'rect' },
    { color: '#faad14', symbol: 'triangle' },
    { color: '#52c41a', symbol: 'diamond' },
    { color: '#b37feb', symbol: 'roundRect' },
    { color: '#13c2c2', symbol: 'circle' },
    { color: '#ff7a45', symbol: 'rect' },
    { color: '#eb2f96', symbol: 'triangle' },
    { color: '#9254de', symbol: 'diamond' },
    { color: '#a0d911', symbol: 'roundRect' }
];

const interpolate = (start: number, end: number, t: number) => start + (end - start) * t;

const getSampleGradientColor = (index: number, total: number) => {
    const safeTotal = Math.max(total, 1);
    const t = safeTotal <= 1 ? 0 : Math.max(0, Math.min(1, index / (safeTotal - 1)));
    const hue = t <= 0.5
        ? interpolate(120, 205, t / 0.5)
        : interpolate(205, 275, (t - 0.5) / 0.5);
    const lightness = interpolate(105, 220, t);
    return hslToRgb(hue, 82, lightness);
};

export function getEisLegendVisual(index: number, total = 10, scheme: EisLegendScheme = 'palette') {
    const normalizedIndex = Math.max(0, index);
    if (scheme === 'sampleGradient') {
        return {
            color: getSampleGradientColor(normalizedIndex, total),
            symbol: EIS_LEGEND_VISUALS[normalizedIndex % EIS_LEGEND_VISUALS.length].symbol
        };
    }

    return EIS_LEGEND_VISUALS[normalizedIndex % EIS_LEGEND_VISUALS.length];
}
