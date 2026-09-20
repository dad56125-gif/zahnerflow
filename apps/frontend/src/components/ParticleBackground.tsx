import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../state/appStore';

interface ParticleBackgroundProps {
    suspended?: boolean;
}

const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ suspended = false }) => {
    const theme = useAppStore(state => state.theme);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const suspendedRef = useRef(suspended);
    const controlsRef = useRef<{ start: () => void; stop: () => void } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const palette = getComputedStyle(document.documentElement);
        const background = palette.getPropertyValue('--app-background').trim();
        const particleRgb = palette.getPropertyValue('--particle-rgb').trim();
        const lightWaveColors = ['--wave-mist', '--wave-lilac', '--wave-warm'].map(token => palette.getPropertyValue(token).trim());
        const waveInks = ['--wave-sage-rgb', '--wave-blue-rgb', '--wave-mauve-rgb'].map(token => palette.getPropertyValue(token).trim());
        // 固定采样位置，避免每帧随机生成造成颗粒闪烁。
        const grainSeeds = Array.from({ length: 1800 }, (_, index) => {
            const noise = (offset: number) => {
                const value = Math.sin((index + 1) * 127.1 + offset * 311.7) * 43758.5453;
                return value - Math.floor(value);
            };
            return { x: noise(0), depth: noise(1), size: noise(2), drift: noise(3) };
        });
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let waveTime = 0;
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        let animationFrameId = 0;
        let isRunning = false;
        let lastFrameTime = 0;
        const TARGET_FPS = 30;
        const FRAME_INTERVAL = 1000 / TARGET_FPS;

        // === CONFIGURATION (性能优化版) ===
        // 1. Constellation Config
        const PARTICLE_COUNT = 50; // 优化：减少粒子数量
        const CONNECTION_DISTANCE = 150;
        const MOUSE_DISTANCE = 250;
        const PARTICLE_SPEED = 0.4;

        // === STATE INITIALIZATION ===

        // Particle Interface
        interface Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
        }

        const particles: Particle[] = [];

        const initParticles = () => {
            particles.length = 0;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * PARTICLE_SPEED,
                    vy: (Math.random() - 0.5) * PARTICLE_SPEED,
                    size: Math.random() * 2 + 1,
                });
            }
        };

        initParticles();

        // Wave Interface
        interface Wave {
            yOffsetProportion: number;
            amplitude: number;
            frequency: number;
            speed: number;
            phase: number;
            baseHue: number;
            hueRange: number;
            hueSpeed: number;
            huePhase: number;
        }

        const waves: Wave[] = [
            {
                yOffsetProportion: 0.3,
                amplitude: 150,
                frequency: 0.002,
                speed: 0.002,      // 2x for 30fps compensation
                phase: 0,
                baseHue: 200, // Cyan/Blue
                hueRange: 40,
                hueSpeed: 0.004,   // 2x
                huePhase: 0
            },
            {
                yOffsetProportion: 0.5,
                amplitude: 180,
                frequency: 0.0015,
                speed: 0.003,      // 2x
                phase: 2,
                baseHue: 260, // Purple
                hueRange: 50,
                hueSpeed: 0.003,   // 2x
                huePhase: 1
            },
            {
                yOffsetProportion: 0.7,
                amplitude: 200,
                frequency: 0.001,
                speed: 0.0016,     // 2x
                phase: 4,
                baseHue: 320, // Pink/Red/Orange
                hueRange: 40,
                hueSpeed: 0.002,   // 2x
                huePhase: 2
            }
        ];

        // Interaction
        let mouseX = 0;
        let mouseY = 0;

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            initParticles();
            drawFrame(false);
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const drawFrame = (advance: boolean) => {
            // Clear
            ctx.fillStyle = background; // Deep background base
            ctx.fillRect(0, 0, width, height);

            if (theme === 'light') {
                if (advance) waveTime += 0.005;
                const wash = ctx.createLinearGradient(0, 0, width, height);
                lightWaveColors.forEach((color, index) => wash.addColorStop(index / 2, color));
                ctx.fillStyle = wash;
                ctx.fillRect(0, 0, width, height);

                const crest = (x: number, band: number) => height * (
                    0.38 + band * 0.19
                    + Math.sin(x * Math.PI * 2.2 + waveTime + band * 1.8) * 0.12
                    + Math.sin(x * Math.PI * 4.6 - waveTime * 0.6 + band) * 0.035
                );
                waveInks.forEach((ink, band) => {
                    // 曲面内部由细丝叠成，边缘保留空气感，不填充厚重色块。
                    for (let strand = 0; strand < 38; strand++) {
                        const depth = strand / 37;
                        ctx.beginPath();
                        for (let x = 0; x <= width + 10; x += 10) {
                            const u = x / width;
                            const y = crest(u, band) + depth * height * 0.16
                                + Math.sin(u * 9 + depth * 4 + waveTime) * depth * 18;
                            if (x === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        }
                        ctx.lineWidth = strand % 5 === 0 ? 1 : 0.65;
                        ctx.strokeStyle = `rgba(${ink}, ${0.035 + Math.sin(depth * Math.PI) * 0.08})`;
                        ctx.stroke();
                    }
                    // 竖向短丝穿过波面，呼应参考图的纤维和测量信号质感。
                    for (let column = 0; column < 150; column++) {
                        const u = column / 149;
                        const y = crest(u, band);
                        const length = 10 + (0.5 + 0.5 * Math.sin(column * 2.4 + band)) * height * 0.055;
                        ctx.beginPath();
                        ctx.moveTo(u * width, y - length);
                        ctx.bezierCurveTo(u * width, y, u * width + 5, y + 20, u * width + 13, y + 36);
                        ctx.strokeStyle = `rgba(${ink}, 0.12)`;
                        ctx.lineWidth = 0.75;
                        ctx.stroke();
                    }
                });
                grainSeeds.forEach((seed, index) => {
                    const band = index % 3;
                    const x = seed.x * width + Math.sin(waveTime + seed.drift * 6) * 5;
                    const spread = seed.depth ** 2;
                    const y = crest(x / width, band) - spread * height * 0.15 + 18;
                    ctx.beginPath();
                    ctx.arc(x, y, 0.45 + seed.size * 0.8, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${waveInks[band]}, ${(1 - spread) * 0.25 + 0.025})`;
                    ctx.fill();
                });
                return;
            }

            // === LAYER 1: AURORA WAVES (Background Color Flow) ===
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = 'blur(60px)'; // Heavy blur for aurora effect

            waves.forEach(wave => {
                if (advance) {
                    wave.phase += wave.speed;
                    wave.huePhase += wave.hueSpeed;
                }

                const yOffset = height * wave.yOffsetProportion;

                // Dynamic Gradient Colors
                const currentHueStart = wave.baseHue + Math.sin(wave.huePhase) * wave.hueRange;
                const currentHueEnd = wave.baseHue + wave.hueRange + Math.cos(wave.huePhase) * wave.hueRange;

                const gradient = ctx.createLinearGradient(0, 0, width, 0);
                gradient.addColorStop(0, `hsla(${currentHueStart}, 70%, 50%, 0.25)`);
                gradient.addColorStop(1, `hsla(${currentHueEnd}, 70%, 50%, 0.25)`);

                ctx.beginPath();
                ctx.moveTo(0, height);

                for (let x = 0; x <= width; x += 20) {
                    const y = yOffset + Math.sin(x * wave.frequency + wave.phase) * wave.amplitude
                        + Math.cos(x * wave.frequency * 0.5 + wave.phase) * (wave.amplitude * 0.5);
                    ctx.lineTo(x, y);
                }

                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();

                ctx.fillStyle = gradient;
                ctx.fill();
            });

            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';

            // === LAYER 2: CONSTELLATION PARTICLES (Foreground Structure) ===

            particles.forEach((p, index) => {
                if (advance) {
                    // Movement
                    p.x += p.vx;
                    p.y += p.vy;

                    // Bounce
                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.vy *= -1;

                    // Mouse Interaction
                    const dx = mouseX - p.x;
                    const dy = mouseY - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < MOUSE_DISTANCE) {
                        const force = (MOUSE_DISTANCE - dist) / MOUSE_DISTANCE;
                        const angle = Math.atan2(dy, dx);
                        // Gentle push
                        p.vx -= Math.cos(angle) * force * 0.02;
                        p.vy -= Math.sin(angle) * force * 0.02;
                    }
                }

                // Draw Particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${particleRgb}, 0.6)`; // White particles for contrast against aurora
                ctx.fill();

                // Connect (优化：每隔一个粒子检查连线)
                for (let j = index + 1; j < particles.length; j += 2) {
                    const p2 = particles[j];
                    const dist = Math.hypot(p.x - p2.x, p.y - p2.y);

                    if (dist < CONNECTION_DISTANCE) {
                        const opacity = 1 - (dist / CONNECTION_DISTANCE);
                        ctx.beginPath();
                        ctx.lineWidth = 0.5;
                        ctx.strokeStyle = `rgba(${particleRgb}, ${opacity * 0.3})`; // Subtle white lines
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });
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
        window.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        drawFrame(false);
        start();

        return () => {
            reducedMotion.removeEventListener('change', handleMotionChange);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stop();
            controlsRef.current = null;
        };
    }, [theme]);

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
