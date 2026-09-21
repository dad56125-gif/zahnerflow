import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../state/appStore';

interface ParticleBackgroundProps {
    suspended?: boolean;
}

const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ suspended = false }) => {
    const backgroundPalette = useAppStore(state => state.backgroundPalette);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const suspendedRef = useRef(suspended);
    const controlsRef = useRef<{ start: () => void; stop: () => void } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const palette = getComputedStyle(document.documentElement);
        const background = palette.getPropertyValue('--mesh-base').trim();
        const meshTokens = backgroundPalette === 'mixed'
            ? ['--mesh-blue', '--mesh-mint', '--mesh-pink', '--mesh-apricot', '--mesh-slate', '--mesh-lilac']
            : Array.from({ length: 6 }, (_, index) => `--mesh-${backgroundPalette}-${index + 1}`);
        const meshColors = meshTokens.map(token => palette.getPropertyValue(token).trim());
        // 低分辨率径向色团平滑放大，避免全屏模糊与密集粒子。
        const colorField = document.createElement('canvas');
        colorField.width = 192;
        colorField.height = 128;
        const fieldCtx = colorField.getContext('2d');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let waveTime = 0;
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        let animationFrameId = 0;
        let isRunning = false;
        let lastFrameTime = 0;
        const TARGET_FPS = 24;
        const FRAME_INTERVAL = 1000 / TARGET_FPS;

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            drawFrame(false);
        };

        const drawFrame = (advance: boolean) => {
            // Clear
            ctx.fillStyle = background; // Deep background base
            ctx.fillRect(0, 0, width, height);

            {
                if (advance) waveTime += 1 / TARGET_FPS;
                if (fieldCtx) {
                    const w = colorField.width;
                    const h = colorField.height;
                    fieldCtx.fillStyle = background;
                    fieldCtx.fillRect(0, 0, w, h);
                    const anchors = [[0.16, 0.2], [0.78, 0.24], [0.72, 0.78], [0.32, 0.65], [0.12, 0.86], [0.52, 0.15]];
                    fieldCtx.save();
                    fieldCtx.scale(w, h);
                    meshColors.forEach((color, index) => {
                        const phase = index * Math.PI / 3;
                        const t = waveTime * Math.PI / 24;
                        const x = anchors[index][0] + Math.sin(t + phase) * 0.2;
                        const y = anchors[index][1] + Math.cos(t + phase * 2) * 0.18;
                        const gradient = fieldCtx.createRadialGradient(x, y, 0, x, y, 0.72);
                        gradient.addColorStop(0, color);
                        gradient.addColorStop(1, color + '00');
                        fieldCtx.fillStyle = gradient;
                        fieldCtx.fillRect(0, 0, 1, 1);
                    });
                    fieldCtx.restore();
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(colorField, 0, 0, width, height);
                }
                return;
            }

        };

        const stop = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = 0;
            }
            isRunning = false;
            lastFrameTime = 0;
        };

        // Animation Loop (帧率限制)
        const animate = (currentTime: number = 0) => {
            if (!isRunning || suspendedRef.current || document.hidden) {
                stop();
                return;
            }

            // 帧率限制：30fps
            const delta = currentTime - lastFrameTime;
            if (delta < FRAME_INTERVAL) {
                animationFrameId = requestAnimationFrame(animate);
                return;
            }
            lastFrameTime = currentTime - (delta % FRAME_INTERVAL);

            drawFrame(true);

            animationFrameId = requestAnimationFrame(animate);
        };

        const start = () => {
            if (isRunning || suspendedRef.current || document.hidden || reducedMotion.matches) return;
            isRunning = true;
            // 恢复时从当前时间重新计帧，避免把暂停期间的时间差一次性补算成跳变。
            lastFrameTime = performance.now();
            animationFrameId = requestAnimationFrame(animate);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                stop();
                return;
            }

            start();
        };

        const handleMotionChange = () => {
            if (reducedMotion.matches) stop();
            else start();
        };
        reducedMotion.addEventListener('change', handleMotionChange);
        controlsRef.current = { start, stop };

        window.addEventListener('resize', handleResize);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        drawFrame(false);
        start();

        return () => {
            reducedMotion.removeEventListener('change', handleMotionChange);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stop();
            controlsRef.current = null;
        };
    }, [backgroundPalette]);

    useEffect(() => {
        suspendedRef.current = suspended;

        if (suspended) {
            controlsRef.current?.stop();
            return;
        }

        controlsRef.current?.start();
    }, [suspended]);

    return (
        <canvas
            ref={canvasRef}
            className={`particle-background fixed inset-0 -z-50 pointer-events-none ${suspended ? 'particle-background--suspended' : ''}`}
            style={{
                opacity: (backgroundPalette === 'mint' || backgroundPalette === 'pink') ? 0.75 : 1,
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                background: 'var(--app-background)'
            }}
        />
    );
};

export default ParticleBackground;

