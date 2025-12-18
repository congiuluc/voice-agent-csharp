/**
 * VoiceVisualizer - Quantum Vortex Effect
 * Features: Swirling particle system with dynamic energy response and 3D depth perception
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.particles = [];
        this.time = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.targetEnergy = 0.2;
        this.energy = 0.2;
        this.lastRms = 0;
        this.mode = 'user'; // 'user' or 'assistant'
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initParticles();
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    initParticles() {
        this.particles = [];
        const particleCount = 180;
        // Vibrant palette
        const colors = ['#00ffff', '#29b6f6', '#7e57c2', '#ff4081', '#e040fb', '#64ffda'];
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                angle: Math.random() * Math.PI * 2,
                // Distribute particles in a donut shape
                baseRadius: 40 + Math.random() * 80,
                radius: 0,
                // Varied speeds for depth effect
                speed: (0.02 + Math.random() * 0.03) * (Math.random() < 0.5 ? 1 : -1),
                size: 1.5 + Math.random() * 2.5,
                color: colors[Math.floor(Math.random() * colors.length)],
                // Vertical spread for 3D volume
                yOffset: (Math.random() - 0.5) * 60,
                // Phase for pulsing
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    setActive(active) {
        this.active = active;
        this.targetEnergy = active ? 1.0 : 0.1;
        this.mode = 'user';
        if (active) {
            this.start();
        } else {
            this.fadeOut();
        }
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.lastRms = rms;
        this.mode = mode;
        // Amplify input for visual impact
        const scaled = Math.min(1, rms * 5); 
        
        if (this.active) {
            if (mode === 'assistant') {
                this.targetEnergy = 0.3 + scaled * 0.9;
            } else {
                this.targetEnergy = 0.3 + scaled * 0.7;
            }
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas.classList.add('active');
        
        const loop = () => {
            if (!this.running) return;
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    fadeOut() {
        if (!this.running) this.start();
        
        // Check periodically if we can stop
        const checkStop = setInterval(() => {
            if (this.energy < 0.15 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
                clearInterval(checkStop);
            }
        }, 100);
    }

    update() {
        this.time += 0.016;
        
        // Dynamic smoothing
        const smoothRate = this.mode === 'assistant' ? 0.12 : 0.08;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        // Idle breathing
        if (!this.active && Math.random() < 0.01) {
            this.targetEnergy = 0.15 + Math.random() * 0.1;
        }

        // Update speaking class
        try {
            if (this.canvas) {
                if (this.energy > 0.35) {
                    this.canvas.classList.add('speaking');
                } else {
                    this.canvas.classList.remove('speaking');
                }
            }
        } catch (e) {}
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        
        ctx.clearRect(0, 0, w, h);
        
        // Enable additive blending for glowing effect
        ctx.globalCompositeOperation = 'lighter';
        
        // Draw central core glow
        const coreRadius = 20 + this.energy * 40;
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 2);
        const coreColor = this.mode === 'assistant' ? '255, 64, 129' : '64, 196, 255';
        
        coreGrad.addColorStop(0, `rgba(${coreColor}, ${0.8 * this.energy})`);
        coreGrad.addColorStop(0.5, `rgba(${coreColor}, ${0.3 * this.energy})`);
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = coreGrad;
        ctx.fillRect(0, 0, w, h);

        // Draw particles
        this.particles.forEach(p => {
            // Calculate dynamic radius based on energy
            const expansion = this.energy * 80;
            const currentRadius = p.baseRadius + expansion + Math.sin(this.time * 2 + p.phase) * 10;
            
            // Update angle based on speed and energy
            // Higher energy = faster rotation
            const speedMult = 1 + this.energy * 4;
            p.angle += p.speed * speedMult;
            
            // 3D projection (flattened Y)
            const x = cx + Math.cos(p.angle) * currentRadius;
            const y = cy + Math.sin(p.angle) * (currentRadius * 0.4) + p.yOffset * (1 + this.energy);
            
            // Size modulation
            const size = p.size * (0.8 + this.energy * 1.2);
            
            // Opacity modulation
            const alpha = 0.4 + this.energy * 0.6;
            
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
            
            // Draw trails for high energy
            if (this.energy > 0.4) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                // Trail point
                const tx = cx + Math.cos(p.angle - 0.1 * speedMult) * currentRadius;
                const ty = cy + Math.sin(p.angle - 0.1 * speedMult) * (currentRadius * 0.4) + p.yOffset * (1 + this.energy);
                ctx.lineTo(tx, ty);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = size * 0.5;
                ctx.stroke();
            }
        });
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
    }
}
