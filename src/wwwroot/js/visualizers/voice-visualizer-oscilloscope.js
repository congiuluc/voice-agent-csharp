/**
 * VoiceVisualizer - Modern Transparent Oscilloscope
 * Features: High-fidelity oscilloscope visualization with transparent background.
 * Uses destination-out compositing for true transparency trails.
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.active = false;
        this.energy = 0.0;
        this.targetEnergy = 0.0;
        this.mode = 'user';
        this.time = 0;
        
        this.pixelRatio = window.devicePixelRatio || 1;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    setActive(active) {
        this.active = active;
        if (active) this.start();
        else this.fadeOut();
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.mode = mode;
        const value = Math.min(1, rms * 4);
        if (this.active) {
            this.targetEnergy = value;
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
            if (this.energy < 0.01 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                clearInterval(checkStop);
            }
        }, 100);
    }

    update() {
        this.time += 0.15;
        
        // Snappy attack, smooth decay
        if (this.targetEnergy > this.energy) {
            this.energy += (this.targetEnergy - this.energy) * 0.5;
        } else {
            this.energy += (this.targetEnergy - this.energy) * 0.1;
        }

        if (!this.active) {
            this.targetEnergy = 0.0; // Silence when inactive
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cy = h / 2;

        // 1. Fade out previous frame to TRANSPARENCY
        // This is the key for "no background" trails
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Adjust alpha for trail length
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // 2. Draw Wave
        // Reset composite operation to default
        ctx.globalCompositeOperation = 'source-over';

        const color = this.mode === 'assistant' ? '#00e5ff' : '#ff0055'; // Cyan vs Magenta
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Strong Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;

        // Draw multiple lines for a "thick" modern feel
        this.drawWaveLine(ctx, w, cy, 1.0, 0);
        
        // Secondary "echo" line (thinner, lower opacity)
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        this.drawWaveLine(ctx, w, cy, 0.8, 2);
        ctx.globalAlpha = 1.0;
    }

    drawWaveLine(ctx, w, cy, amplitudeScale, phaseOffset) {
        ctx.beginPath();
        
        const points = 100; // Resolution
        const step = w / (points - 1);

        for (let i = 0; i < points; i++) {
            const x = i * step;
            
            // Normalized X (-1 to 1) for math
            const nx = (i / points) * 2 - 1;
            
            // Window function (Hanning) to pin ends to zero
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * (i / (points - 1))));
            
            // Wave synthesis
            let yOffset = 0;
            
            // Main frequency
            yOffset += Math.sin(nx * 4 + this.time + phaseOffset) * 1.0;
            // Harmonics
            yOffset += Math.sin(nx * 9 - this.time * 1.5) * 0.5;
            
            // Apply Energy
            // Base amplitude + dynamic energy
            const currentAmp = (this.energy * 100 + 5) * amplitudeScale;
            
            const y = cy + yOffset * currentAmp * window;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        
        ctx.stroke();
    }
}
