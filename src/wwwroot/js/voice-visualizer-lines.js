/**
 * VoiceVisualizer - Aurora Wave
 * Features: Flowing, multi-colored sine waves creating a smooth, organic waveform effect.
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.time = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.targetEnergy = 0.0;
        this.energy = 0.0;
        this.mode = 'user'; // 'user' or 'assistant'
        
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
        this.targetEnergy = active ? 0.5 : 0.1;
        if (active) this.start();
        else this.fadeOut();
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.mode = mode;
        const scaled = Math.min(1, rms * 5);
        if (this.active) {
            this.targetEnergy = 0.2 + scaled * 1.0;
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
        const checkStop = setInterval(() => {
            if (this.energy < 0.05 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
                clearInterval(checkStop);
            }
        }, 100);
    }

    update() {
        this.time += 0.02;
        const smoothRate = 0.1;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        if (!this.active) {
            // Gentle idle wave
            this.targetEnergy = 0.1 + Math.sin(this.time) * 0.05;
        }

        try {
            if (this.canvas) {
                this.canvas.classList.toggle('speaking', this.energy > 0.3);
            }
        } catch (e) {}
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cy = h / 2;
        
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 3;

        const lines = 5;
        // Colors: Cyan/Blue for user, Purple/Pink for assistant
        const baseHue = this.mode === 'assistant' ? 290 : 190;
        
        for (let i = 0; i < lines; i++) {
            ctx.beginPath();
            const hue = baseHue + i * 15;
            // Opacity reacts to energy
            const alpha = (0.4 + this.energy * 0.6) * (1 - Math.abs(i - 2) * 0.15);
            ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${alpha})`;
            
            // Amplitude varies by line index to create a "bundle" look
            const lineAmpFactor = 1 - Math.abs(i - 2) * 0.2; 
            const amplitude = (h * 0.15 + this.energy * h * 0.35) * lineAmpFactor;
            
            const frequency = 0.003 + i * 0.0005;
            const speed = this.time * (3 + i * 0.5);
            const phase = i * 0.5;
            
            for (let x = 0; x <= w; x += 5) {
                const normX = x / w;
                // Envelope function to taper the waves at the edges (0 at ends, 1 in middle)
                // Using a sine window or similar
                const envelope = Math.sin(normX * Math.PI); 
                
                // Combine sine waves for organic motion
                const y = cy + Math.sin(x * frequency + speed + phase) * amplitude * envelope;
                
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            
            // Add a glow effect
            if (this.energy > 0.3) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = `hsla(${hue}, 85%, 60%, 0.5)`;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }
}
