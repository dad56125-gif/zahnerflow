import { useEffect, useRef, useState } from 'react';

/**
 * Canvas实时模糊Hook
 * 通过Canvas API捕获下方内容并应用模糊效果
 *
 * 性能优化策略：
 * 1. 使用requestAnimationFrame控制帧率（最大60fps）
 * 2. 动态帧率调整：根据性能自动降低fps
 * 3. 节流控制：只有变化时才更新
 * 4. Web Worker（进阶）：将模糊计算移到worker线程
 */
export interface CanvasBlurOptions {
  /** 模糊半径（像素） */
  radius?: number;
  /** 背景透明度（0-1） */
  opacity?: number;
  /** 最大帧率（fps） */
  maxFps?: number;
  /** 是否启用降级方案（性能不足时自动降低质量） */
  enableDowngrade?: boolean;
}

export function useCanvasBlur(targetRef: React.RefObject<HTMLElement>, options: CanvasBlurOptions = {}) {
  const {
    radius = 20,
    opacity = 0.4,
    maxFps = 30, // 限制为30fps以节省性能
    enableDowngrade = true
  } = options;

  const [blurredBackground, setBlurredBackground] = useState<string>('');
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(maxFps);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameIntervalRef = useRef<number>(1000 / maxFps);
  const performanceIssuesRef = useRef<number>(0);

  // 初始化Canvas
  useEffect(() => {
    if (!targetRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('Canvas 2D context not supported');
      setIsSupported(false);
      return;
    }

    canvasRef.current = canvas;
    ctxRef.current = ctx;

    // 检测浏览器是否支持Canvas filter
    if (!('filter' in ctx)) {
      console.warn('Canvas filter API not supported, falling back to manual blur');
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [targetRef]);

  // 开始/停止Canvas捕获
  useEffect(() => {
    if (!targetRef.current || !canvasRef.current || !ctxRef.current) {
      return;
    }

    if (!isSupported) return;

    const targetElement = targetRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    let isVisible = true;

    // 监听可见性变化（节省性能）
    const visibilityHandler = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    const captureAndBlur = () => {
      if (!isVisible) {
        animationIdRef.current = requestAnimationFrame(captureAndBlur);
        return;
      }

      const now = performance.now();
      const elapsed = now - lastFrameTimeRef.current;

      // 节流：根据fps限制帧率
      if (elapsed < frameIntervalRef.current) {
        animationIdRef.current = requestAnimationFrame(captureAndBlur);
        return;
      }

      lastFrameTimeRef.current = now;

      const rect = targetElement.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      try {
        // 设置Canvas尺寸
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        // 清空Canvas
        ctx.clearRect(0, 0, width, height);

        // 方案A：尝试捕获下方内容（需要html2canvas或其他方案）
        // 这里使用纯色作为背景，实际项目中需要引入html2canvas
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.fillRect(0, 0, width, height);

        // 方案B：如果未来引入html2canvas，可以这样做：
        // const canvas2 = await html2canvas(document.body, {
        //   x: rect.left,
        //   y: rect.top,
        //   width: width,
        //   height: height,
        //   useCORS: true,
        //   allowTaint: false
        // });
        // ctx.drawImage(canvas2, 0, 0);

        // 应用模糊效果
        applyBlur(ctx, width, height, radius);

        // 转换为DataURL
        const dataUrl = canvas.toDataURL('image/png', 0.8);
        setBlurredBackground(dataUrl);

        // 性能监控：记录帧时间
        const frameTime = performance.now() - now;
        if (frameTime > frameIntervalRef.current * 1.5) {
          performanceIssuesRef.current++;

          // 降级：如果连续性能问题，降低fps
          if (enableDowngrade && performanceIssuesRef.current > 5) {
            const newFps = Math.max(10, Math.floor(fps * 0.8));
            setFps(newFps);
            frameIntervalRef.current = 1000 / newFps;
            performanceIssuesRef.current = 0;
            console.log(`Canvas blur performance issue, reducing FPS to ${newFps}`);
          }
        } else {
          performanceIssuesRef.current = Math.max(0, performanceIssuesRef.current - 1);

          // 如果性能良好，尝试恢复fps
          if (enableDowngrade && fps < maxFps && performanceIssuesRef.current === 0) {
            const newFps = Math.min(maxFps, Math.floor(fps * 1.1));
            setFps(newFps);
            frameIntervalRef.current = 1000 / newFps;
          }
        }
      } catch (error) {
        console.warn('Canvas capture failed:', error);
        setIsSupported(false);
      }

      animationIdRef.current = requestAnimationFrame(captureAndBlur);
    };

    // 开始动画
    animationIdRef.current = requestAnimationFrame(captureAndBlur);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [targetRef, radius, opacity, isSupported, enableDowngrade, maxFps, fps]);

  return { blurredBackground, isSupported, fps };
}

/**
 * 应用模糊效果
 */
function applyBlur(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  // 使用Canvas filter API（现代浏览器）
  if ('filter' in ctx && radius > 0) {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    return;
  }

  // 降级：快速Box Blur（性能较差，但可以工作）
  if (radius > 0) {
    applyFastBoxBlur(ctx, width, height, radius);
  }
}

/**
 * 快速Box Blur算法
 * 使用滑动窗口优化，避免重复计算
 */
function applyFastBoxBlur(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  'use strict';

  // Box Blur passes（3次通过逼近高斯模糊）
  const passes = 3;
  const src = new Uint32Array(data.buffer);
  const tmp = new Uint32Array(src.length);
  const stride = width;

  let a, b, c, d, v;
  const r = radius;
  const vdiv = 1 / (r + r + 1);
  const vmin = Math.min, vmax = Math.max;

  for (let pass = 0; pass < passes; pass++) {
    // 水平方向
    for (let y = 0; y < height; y++) {
      let idx = y * stride;

      v = a = b = c = d = src[idx];
      for (let x = 0; x < r; x++) {
        tmp[idx + x] = v;
      }

      for (let x = 0; x <= r; x++) {
        d += src[idx + vmin(x + r, width - 1)] - a;
        a = src[idx + vmin(x + r, width - 1)];
        v = d * vdiv;
        tmp[idx + x] = v;
      }

      for (let x = r + 1; x < width - r; x++) {
        d += src[idx + x + r] - src[idx + x - r - 1];
        a = src[idx + x - r - 1];
        v = d * vdiv;
        tmp[idx + x] = v;
      }

      for (let x = vmax(width - r, r + 1); x < width; x++) {
        d += src[idx + width - 1] - src[idx + x - r - 1];
        a = src[idx + x - r - 1];
        v = d * vdiv;
        tmp[idx + x] = v;
      }
    }

    // 垂直方向
    for (let x = 0; x < width; x++) {
      let idxv = x;

      v = a = b = c = d = tmp[idxv];
      for (let y = 0; y < r; y++) {
        src[idxv + y * stride] = v;
      }

      for (let y = 0; y <= r; y++) {
        d += tmp[idxv + vmin(y + r, height - 1) * stride] - a;
        a = tmp[idxv + vmin(y + r, height - 1) * stride];
        v = d * vdiv;
        src[idxv + y * stride] = v;
      }

      for (let y = r + 1; y < height - r; y++) {
        d += tmp[idxv + (y + r) * stride] - tmp[idxv + (y - r - 1) * stride];
        a = tmp[idxv + (y - r - 1) * stride];
        v = d * vdiv;
        src[idxv + y * stride] = v;
      }

      for (let y = vmax(height - r, r + 1); y < height; y++) {
        d += tmp[idxv + (height - 1) * stride] - tmp[idxv + (y - r - 1) * stride];
        a = tmp[idxv + (y - r - 1) * stride];
        v = d * vdiv;
        src[idxv + y * stride] = v;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
