/**
 * VoiceVisualizer - Neon Pulse Wave
 * Features: High-fidelity 2D scrolling waveform with smooth curves, 
 * dynamic gradients, and particle effects.
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.dataPoints = [];
        this.particles = [];
        this.maxPoints = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.mode = 'user';
        this.hue = 280; // Default hue
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
        
        // Higher density for smoother curves
        this.maxPoints = Math.ceil(displayWidth / 4) + 5;
        
        if (this.dataPoints.length === 0) {
            this.dataPoints = new Array(this.maxPoints).fill(0);
        }
    }

    setActive(active) {
        this.active = active;
        if (active) this.start();
        else this.fadeOut();
    }

    setMode(mode) {
        this.mode = mode;
        // Target hues: Assistant (Cyan: 180), User (Purple: 280)
        this.targetHue = mode === 'assistant' ? 180 : 280;
    }

    ingestRMS(rms, mode = 'user') {
        this.setMode(mode);
        
        // Smooth hue transition
        this.hue += (this.targetHue - this.hue) * 0.1;

        // Non-linear scaling for better dynamics
        // Small sounds get boosted, loud sounds don't clip
        let value = Math.pow(rms, 0.8) * 2.5;
        value = Math.min(1, value);
        
        this.dataPoints.push(value);
        
        // Emit particles on high energy
        if (value > 0.3) {
            this.emitParticles(value);
        }

        if (this.dataPoints.length > this.maxPoints) {
            this.dataPoints.shift();
        }
    }

    emitParticles(intensity) {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cy = h / 2;
        // Emit from the right edge
        const count = Math.floor(intensity * 3);
        for(let i=0; i<count; i++) {
            this.particles.push({
                x: w,
                y: cy + (Math.random() - 0.5) * h * intensity * 0.8,
                vx: -(2 + Math.random() * 3), // Move left
                vy: (Math.random() - 0.5) * 2,
                life: 1.0,
                size: 1 + Math.random() * 3
            });
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
        const checkStop = setInterval(() => {
            const maxEnergy = Math.max(...this.dataPoints);
            if (maxEnergy < 0.01 && !this.active && this.particles.length === 0) {
                this.running = false;
                this.canvas.classList.remove('active');
                clearInterval(checkStop);
            }
        }, 100);
    }

    update() {
        // Idle noise
        if (!this.active) {
            this.dataPoints.push((Math.random() - 0.5) * 0.05);
        }
        
        if (this.dataPoints.length > this.maxPoints) {
            this.dataPoints.shift();
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        try {
            if (this.canvas) {
                const recentAvg = this.dataPoints.slice(-10).reduce((a,b)=>a+b,0) / 10;
                this.canvas.classList.toggle('speaking', recentAvg > 0.1);
            }
        } catch (e) {}
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cy = h / 2;
        
        ctx.clearRect(0, 0, w, h);
        
        // Dynamic Background Grid
        this.drawGrid(w, h);

        const step = w / (this.maxPoints - 1);
        
        // 1. Draw Filled Area (Gradient)
        // We draw a mirrored shape for a "sound wave" look
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `hsla(${this.hue}, 100%, 50%, 0)`);
        grad.addColorStop(0.5, `hsla(${this.hue}, 100%, 60%, 0.2)`);
        grad.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 0)`);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, cy);

        // Top curve
        for (let i = 0; i < this.dataPoints.length; i++) {
            const x = i * step;
            const y = cy - (this.dataPoints[i] * h * 0.35);
            // Simple line to for fill
            ctx.lineTo(x, y);
        }
        
        // Right edge
        ctx.lineTo((this.dataPoints.length - 1) * step, cy);

        // Bottom curve (Mirrored)
        for (let i = this.dataPoints.length - 1; i >= 0; i--) {
            const x = i * step;
            const y = cy + (this.dataPoints[i] * h * 0.35);
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();

        // 2. Draw The Main Line (Smoothed)
        ctx.strokeStyle = `hsl(${this.hue}, 100%, 70%)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${this.hue}, 100%, 50%)`;

        ctx.beginPath();
        // We'll just draw the top line for the "EKG" look, but smoothed
        // Using quadratic curves between points
        if (this.dataPoints.length > 1) {
            ctx.moveTo(0, cy - this.dataPoints[0] * h * 0.35);
            for (let i = 1; i < this.dataPoints.length - 2; i++) {
                const xc = (i * step + (i + 1) * step) / 2;
                const yc = (cy - this.dataPoints[i] * h * 0.35 + cy - this.dataPoints[i+1] * h * 0.35) / 2;
                ctx.quadraticCurveTo(i * step, cy - this.dataPoints[i] * h * 0.35, xc, yc);
            }
            // Last two points
            if (this.dataPoints.length > 2) {
                const i = this.dataPoints.length - 2;
                ctx.quadraticCurveTo(
                    i * step, 
                    cy - this.dataPoints[i] * h * 0.35, 
                    (i+1) * step, 
                    cy - this.dataPoints[i+1] * h * 0.35
                );
            }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 3. Draw Particles
        ctx.globalCompositeOperation = 'lighter';
        this.particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${this.hue}, 100%, 80%, ${p.life})`;
            ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';

        // 4. Leading "Spark"
        if (this.dataPoints.length > 0) {
            const lastIdx = this.dataPoints.length - 1;
            const lastX = lastIdx * step;
            const lastY = cy - (this.dataPoints[lastIdx] * h * 0.35);
            
            // Bright core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Big glow
            const glow = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, 30);
            glow.addColorStop(0, `hsla(${this.hue}, 100%, 80%, 0.8)`);
            glow.addColorStop(1, `hsla(${this.hue}, 100%, 50%, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 30, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawGrid(w, h) {
        const ctx = this.ctx;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `hsla(${this.hue}, 50%, 50%, 0.15)`;
        
        // Center line
        ctx.beginPath();
        ctx.moveTo(0, h/2);
        ctx.lineTo(w, h/2);
        ctx.stroke();

        // Vertical grid lines (moving left slightly to simulate speed?)
        // Let's keep them static for stability
        const gridSize = 60;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }
}
