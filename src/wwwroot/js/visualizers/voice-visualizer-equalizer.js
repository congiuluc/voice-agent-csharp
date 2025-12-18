/**
 * VoiceVisualizer - 80's Stereo Equalizer
 * Features: Retro LED-style vertical bars with peak indicators and classic color gradient.
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
        
        // Equalizer specific properties
        this.barCount = 16;
        this.bars = [];
        this.peaks = [];
        this.initBars();
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    initBars() {
        this.bars = new Array(this.barCount).fill(0);
        this.peaks = new Array(this.barCount).fill(0);
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
        this.targetEnergy = active ? 0.3 : 0.05;
        if (active) this.start();
        else this.fadeOut();
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.mode = mode;
        const scaled = Math.min(1, rms * 6);
        if (this.active) {
            this.targetEnergy = 0.1 + scaled * 0.9;
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
            if (this.energy < 0.01 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                clearInterval(checkStop);
            }
        }, 100);
    }

    update() {
        this.time += 0.05;
        const smoothRate = 0.15;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        if (!this.active) {
            this.targetEnergy = 0.05 + Math.sin(this.time * 2) * 0.02;
        }

        // Update individual bars with some randomness based on overall energy
        for (let i = 0; i < this.barCount; i++) {
            // Create a bell-curve like distribution
            const centerDist = Math.abs(i - (this.barCount - 1) / 2) / (this.barCount / 2);
            const factor = 1.0 - centerDist * 0.5;
            const targetBar = this.energy * factor * (0.7 + Math.random() * 0.6);
            
            this.bars[i] += (targetBar - this.bars[i]) * 0.2;
            
            // Update peaks
            if (this.bars[i] > this.peaks[i]) {
                this.peaks[i] = this.bars[i];
            } else {
                this.peaks[i] -= 0.01; // Peak drop speed
            }
            this.peaks[i] = Math.max(0, this.peaks[i]);
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
        
        ctx.clearRect(0, 0, w, h);
        
        const padding = 4;
        const totalPadding = padding * (this.barCount + 1);
        const barWidth = (w - totalPadding) / this.barCount;
        const segmentCount = 12;
        const segmentPadding = 2;
        const segmentHeight = (h - (segmentCount + 1) * segmentPadding) / segmentCount;

        for (let i = 0; i < this.barCount; i++) {
            const x = padding + i * (barWidth + padding);
            const barValue = Math.min(1, this.bars[i]);
            const activeSegments = Math.floor(barValue * segmentCount);
            
            for (let j = 0; j < segmentCount; j++) {
                const y = h - segmentPadding - (j + 1) * (segmentHeight + segmentPadding);
                
                // Determine segment color
                let color;
                const isAssistant = this.mode === 'assistant';
                
                if (j < segmentCount * 0.6) {
                    // Bottom 60%: Green (User) or Blue (Assistant)
                    color = isAssistant ? '#00d2ff' : '#00ff00';
                } else if (j < segmentCount * 0.85) {
                    // Middle 25%: Yellow (User) or Purple (Assistant)
                    color = isAssistant ? '#9d50bb' : '#ffff00';
                } else {
                    // Top 15%: Red (User) or Pink (Assistant)
                    color = isAssistant ? '#ff0080' : '#ff0000';
                }

                const isActive = j < activeSegments;
                ctx.fillStyle = color;
                ctx.globalAlpha = isActive ? 1.0 : 0.15;
                
                // Draw segment
                this.roundRect(ctx, x, y, barWidth, segmentHeight, 1);
                ctx.fill();
            }

            // Draw peak indicator
            const peakValue = Math.min(1, this.peaks[i]);
            if (peakValue > 0) {
                const peakJ = Math.floor(peakValue * segmentCount);
                const peakY = h - segmentPadding - (peakJ + 1) * (segmentHeight + segmentPadding);
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, peakY, barWidth, 2);
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // Helper for rounded rectangles
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}
