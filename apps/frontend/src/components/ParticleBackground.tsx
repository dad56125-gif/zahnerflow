import React, { useEffect, useRef } from 'react';

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

        // === CONFIGURATION ===
        // 1. Constellation Config
        const PARTICLE_COUNT = 100; // Balanced number for network
        const CONNECTION_DISTANCE = 150;
        const MOUSE_DISTANCE = 250;
        const PARTICLE_SPEED = 0.4;

        // 2. Aurora Wave Config
        const WAVE_COUNT = 3;

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
                speed: 0.001,
                phase: 0,
                baseHue: 200, // Cyan/Blue
                hueRange: 40,
                hueSpeed: 0.002,
                huePhase: 0
            },
            {
                yOffsetProportion: 0.5,
                amplitude: 180,
                frequency: 0.0015,
                speed: 0.0015,
                phase: 2,
                baseHue: 260, // Purple
                hueRange: 50,
                hueSpeed: 0.0015,
                huePhase: 1
            },
            {
                yOffsetProportion: 0.7,
                amplitude: 200,
                frequency: 0.001,
                speed: 0.0008,
                phase: 4,
                baseHue: 320, // Pink/Red/Orange
                hueRange: 40,
                hueSpeed: 0.001,
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
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        // Animation Loop
        const animate = () => {
            // Clear
            ctx.fillStyle = '#0f172a'; // Deep background base
            ctx.fillRect(0, 0, width, height);

            // === LAYER 1: AURORA WAVES (Background Color Flow) ===
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = 'blur(60px)'; // Heavy blur for aurora effect

            waves.forEach(wave => {
                wave.phase += wave.speed;
                wave.huePhase += wave.hueSpeed;

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

                // Draw Particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // White particles for contrast against aurora
                ctx.fill();

                // Connect
                for (let j = index + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dist = Math.hypot(p.x - p2.x, p.y - p2.y);

                    if (dist < CONNECTION_DISTANCE) {
                        const opacity = 1 - (dist / CONNECTION_DISTANCE);
                        ctx.beginPath();
                        ctx.lineWidth = 0.5;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.3})`; // Subtle white lines
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 -z-50 pointer-events-none"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: -1,
                background: '#0f172a'
            }}
        />
    );
};

export default ParticleBackground;
