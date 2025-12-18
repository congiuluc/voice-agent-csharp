/**
 * VoiceVisualizer - Animated canvas visualization matching liveVoiceAgent Python implementation
 * Features: multi-layer wave animation with energy response, mode-based behavior
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.layers = [];
        this.time = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.targetEnergy = 0.2;
        this.energy = 0.2;
        this.lastRms = 0;
        this.mode = 'user'; // 'user' or 'assistant'
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initLayers();
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    initLayers() {
        const colors = [
            ['#0ff', '#29b6f6', '#7e57c2', '#ec407a', '#ff80ab'],
            ['#29b6f6', '#7e57c2', '#ec407a', '#ff80ab', '#80d8ff'],
            ['#7e57c2', '#ec407a', '#ff80ab', '#29b6f6', '#b388ff'],
            ['#ec407a', '#ff80ab', '#7e57c2', '#29b6f6', '#0ff']
        ];
        
        this.layers = colors.map((stops, i) => ({
            baseAmplitude: 18 + i * 10,
            variance: 14 + i * 6,
            speed: 0.4 + i * 0.07,
            noiseSeed: Math.random() * 1000,
            stops,
            alpha: 0.55 - i * 0.08,
            frequency: 1.6 + i * 0.25,
            lobes: 3 + i
        }));
    }

    setActive(active) {
        this.active = active;
        this.targetEnergy = active ? 1.0 : 0.25;
        this.mode = 'user'; // default to user mode
        if (active) {
            this.start();
        } else {
            this.fadeOut();
        }
    }

    setMode(mode) {
        // mode can be 'user' or 'assistant'
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        // rms ~0-1 (microphone amplitude). Smooth & map to targetEnergy.
        this.lastRms = rms;
        this.mode = mode;
        const scaled = Math.min(1, rms * 4); // amplify typical speech amplitudes
        
        // Blend live energy influence: raise targetEnergy baseline when speaking
        if (this.active) {
            // Different response characteristics for user vs assistant
            if (mode === 'assistant') {
                // More dynamic response for assistant speech
                this.targetEnergy = 0.2 + scaled * 0.8;
            } else {
                // Original behavior for user
                this.targetEnergy = 0.35 + scaled * 0.65;
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
        // keep animating but reduce energy; stop after low threshold
        if (!this.running) this.start();
        
        setTimeout(() => {
            if (this.energy < 0.15 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
            }
        }, 800);
    }

    update() {
        this.time += 0.016;
        
        // smooth energy with different rates for user vs assistant
        const smoothRate = this.mode === 'assistant' ? 0.08 : 0.05;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        this.layers.forEach(l => {
            // Vary speed based on mode and energy
            const speedMultiplier = this.mode === 'assistant' ? (1 + this.energy * 0.5) : 1;
            l.noiseSeed += 0.003 * l.speed * speedMultiplier;
        });
        
        // occasional target modulation for subtle breathing when idle
        if (!this.active && Math.random() < 0.005) {
            this.targetEnergy = 0.18 + Math.random() * 0.15;
        }

        // Update speaking CSS class based on energy threshold
        try {
            const speakingThreshold = 0.32;
            if (this.canvas) {
                if (this.energy > speakingThreshold) {
                    this.canvas.classList.add('speaking');
                } else {
                    this.canvas.classList.remove('speaking');
                }
            }
        } catch (e) {
            // ignore
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        
        const midY = h / 2;
        
        this.layers.forEach((l, idx) => {
            const amp = (l.baseAmplitude + l.variance * this.energy);
            const points = [];
            const segments = 220; // smooth curve
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = t * w;
                
                // multi-lobe sine blend
                const sine = Math.sin(t * Math.PI * l.lobes + this.time * l.speed * 2);
                const sine2 = Math.sin(t * Math.PI * 2 + this.time * l.speed * 1.3 + idx);
                const envelope = Math.sin(t * Math.PI); // taper edges
                const y = midY - (sine * 0.7 + sine2 * 0.3) * amp * envelope;
                
                points.push({ x, y });
            }
            
            // Create gradient per layer
            const grad = ctx.createLinearGradient(0, midY, w, midY);
            l.stops.forEach((c, i2) => grad.addColorStop(i2 / (l.stops.length - 1), c));
            
            ctx.beginPath();
            // top path
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            
            // bottom mirrored path
            for (let i = points.length - 1; i >= 0; i--) {
                const p = points[i];
                const yMirror = midY + (midY - p.y);
                ctx.lineTo(p.x, yMirror);
            }
            
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.globalAlpha = l.alpha * (0.6 + 0.4 * this.energy);
            ctx.fill();
        });
        
        // central glow
        const glowGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 3);
        glowGrad.addColorStop(0, 'rgba(255,255,255,' + (0.35 * this.energy) + ')');
        glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, w, h);
        
        // Vertical fade mask (top and bottom)
        const fadeHeight = h * 0.25; // 25% fade zone at top and bottom
        const fadeGradTop = ctx.createLinearGradient(0, 0, 0, fadeHeight);
        fadeGradTop.addColorStop(0, 'rgba(0,0,0,1)');
        fadeGradTop.addColorStop(1, 'rgba(0,0,0,0)');
        
        const fadeGradBottom = ctx.createLinearGradient(0, h - fadeHeight, 0, h);
        fadeGradBottom.addColorStop(0, 'rgba(0,0,0,0)');
        fadeGradBottom.addColorStop(1, 'rgba(0,0,0,1)');
        
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = fadeGradTop;
        ctx.fillRect(0, 0, w, fadeHeight);
        ctx.fillStyle = fadeGradBottom;
        ctx.fillRect(0, h - fadeHeight, w, fadeHeight);
        
        ctx.restore();
    }
}
