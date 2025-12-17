import React, { useEffect, useRef } from 'react';

/**
 * 优化版粒子背景
 * - 移除 Canvas blur 滤镜（改用 CSS 渐变）
 * - 粒子数量 50（原100）
 * - 帧率限制 30fps（原60）
 */
const ParticleBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        let animationFrameId: number;
        let lastFrameTime = 0;
        const TARGET_FPS = 30;
        const FRAME_INTERVAL = 1000 / TARGET_FPS;

        // === CONFIGURATION (优化版) ===
        const PARTICLE_COUNT = 50; // 减少粒子数量
        const CONNECTION_DISTANCE = 120;
        const MOUSE_DISTANCE = 200;
        const PARTICLE_SPEED = 0.3;

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
                    size: Math.random() * 1.5 + 0.5,
                });
            }
        };

        initParticles();

        let mouseX = -1000;
        let mouseY = -1000;

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            initParticles();
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        const animate = (currentTime: number) => {
            // 帧率限制
            const delta = currentTime - lastFrameTime;
            if (delta < FRAME_INTERVAL) {
                animationFrameId = requestAnimationFrame(animate);
                return;
            }
            lastFrameTime = currentTime - (delta % FRAME_INTERVAL);

            // 清除（透明，让CSS背景显示）
            ctx.clearRect(0, 0, width, height);

            // === 粒子绘制 ===
            particles.forEach((p, index) => {
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
                    p.vx -= Math.cos(angle) * force * 0.015;
                    p.vy -= Math.sin(angle) * force * 0.015;
                }

                // Draw Particle (使用渐变提升视觉效果)
                const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Connect (只检查后续粒子的一半，进一步减少计算)
                const step = 2;
                for (let j = index + 1; j < particles.length; j += step) {
                    const p2 = particles[j];
                    const connDist = Math.hypot(p.x - p2.x, p.y - p2.y);

                    if (connDist < CONNECTION_DISTANCE) {
                        const opacity = 1 - (connDist / CONNECTION_DISTANCE);
                        ctx.beginPath();
                        ctx.lineWidth = 0.5;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });

            if (!document.hidden) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                cancelAnimationFrame(animationFrameId);
                lastFrameTime = 0;
                animationFrameId = requestAnimationFrame(animate);
            }
        };

        animationFrameId = requestAnimationFrame(animate);

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <>
            {/* CSS 渐变背景（替代 Canvas blur，零性能开销） */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: -2,
                    background: `
                        radial-gradient(ellipse 80% 50% at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 80% 70%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
                        radial-gradient(ellipse 70% 60% at 50% 90%, rgba(236, 72, 153, 0.08) 0%, transparent 50%),
                        linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)
                    `,
                }}
            />
            {/* 粒子 Canvas（透明底，只绘制粒子） */}
            <canvas
                ref={canvasRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: -1,
                    pointerEvents: 'none',
                }}
            />
        </>
    );
};

export default ParticleBackground;
