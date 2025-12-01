/**
 * VoiceVisualizer - Cortana Style
 * Features: Iconic concentric circles with breathing animation and deep blue/cyan glow.
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
        this.targetEnergy = active ? 0.3 : 0.1; 
        if (active) this.start();
        else this.fadeOut();
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.mode = mode;
        const scaled = Math.min(1, rms * 4);
        if (this.active) {
            this.targetEnergy = 0.3 + scaled * 0.7;
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
        this.time += 0.05;
        const smoothRate = 0.15;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        if (!this.active) {
            // Idle breathing
            this.targetEnergy = 0.15 + Math.sin(this.time * 0.1) * 0.05;
        }

        try {
            if (this.canvas) {
                this.canvas.classList.toggle('speaking', this.energy > 0.35);
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
        
        // Cortana Blue: #0078D7 or lighter #00A4EF
        const r = this.mode === 'assistant' ? 255 : 0;
        const g = this.mode === 'assistant' ? 64 : 164;
        const b = this.mode === 'assistant' ? 129 : 239;
        const color = `rgb(${r},${g},${b})`;
        
        // Base radius
        const baseR = 45;
        
        // Inner Circle
        // Reacts directly to energy
        const innerR = baseR + this.energy * 40;
        
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        // Inner glow
        ctx.shadowBlur = 30;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Outer Ring
        // Reacts with a delay or offset
        const outerR = innerR + 20 + Math.sin(this.time * 2) * 5;
        
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b}, 0.6)`;
        ctx.lineWidth = 6;
        ctx.stroke();
        
        // Second Outer Ring (Faint)
        const outerR2 = outerR + 15 + this.energy * 10;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b}, 0.3)`;
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}
