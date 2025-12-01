/**
 * VoiceVisualizer - Holographic Sphere
 * Features: 3D rotating geodesic structure with audio-reactive mesh deformation.
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.points = [];
        this.time = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.targetEnergy = 0.0;
        this.energy = 0.0;
        this.mode = 'user';
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initSphere();
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    initSphere() {
        this.points = [];
        const count = 80; // Number of nodes
        for (let i = 0; i < count; i++) {
            // Fibonacci sphere distribution for even spacing
            const y = 1 - (i / (count - 1)) * 2;
            const radius = Math.sqrt(1 - y * y);
            const theta = 2.39996 * i; // Golden angle increment
            
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;
            
            this.points.push({ x, y, z });
        }
    }

    setActive(active) {
        this.active = active;
        this.targetEnergy = active ? 0.2 : 0.0;
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
            this.targetEnergy = mode === 'assistant' ? 0.3 + scaled * 0.8 : 0.25 + scaled * 0.6;
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
        this.time += 0.01;
        const smoothRate = this.mode === 'assistant' ? 0.15 : 0.1;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        if (!this.active && Math.random() < 0.01) this.targetEnergy = Math.random() * 0.1;

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
        const cx = w / 2;
        const cy = h / 2;
        const minDim = Math.min(w, h);
        const baseScale = minDim * 0.35;

        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';

        // Rotation
        const rotX = this.time * 0.5;
        const rotY = this.time * 0.3;

        // Color Palette
        const hue = this.mode === 'assistant' ? 320 : 190; // Pink vs Cyan
        const colorPrefix = `hsla(${hue}, 80%, 60%,`;

        // Project points
        const projected = this.points.map(p => {
            // Apply rotation
            let x = p.x, y = p.y, z = p.z;
            
            // Rotate Y
            let x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
            let z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
            x = x1; z = z1;

            // Rotate X
            let y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
            let z1_2 = y * Math.sin(rotX) + z * Math.cos(rotX);
            y = y1; z = z1_2;

            // Audio reaction: Push out based on energy and position
            // Deform sphere into a spiky shape on high energy
            const noise = Math.sin(p.y * 10 + this.time * 5) * Math.cos(p.x * 10);
            const pulse = 1 + this.energy * (0.3 + noise * 0.3);
            
            // Perspective projection
            const zDist = 2.5 - z;
            const scale = (baseScale * pulse) / zDist * 2; 
            const px = cx + x * scale;
            const py = cy + y * scale;
            
            return { x: px, y: py, z: z, scale, alpha: (z + 1) / 2 }; // alpha based on depth
        });

        // Draw connections
        // Optimization: Batch lines by opacity buckets or just draw them
        // For 80 points, O(N^2) is ~3200 checks. Acceptable.
        
        const maxDist = baseScale * 0.7;
        
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const p1 = projected[i];
                const p2 = projected[j];
                const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                
                if (d < maxDist) {
                    // Opacity based on distance and energy
                    const distFactor = 1 - (d / maxDist);
                    const alpha = distFactor * (0.1 + this.energy * 0.5);
                    
                    if (alpha > 0.05) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `${colorPrefix} ${alpha})`;
                        ctx.lineWidth = 1 + this.energy;
                        ctx.stroke();
                    }
                }
            }
        }

        // Draw nodes
        projected.forEach(p => {
            const size = (2 + this.energy * 5) * (1 / (2.5 - p.z)); 
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `${colorPrefix} ${0.5 + this.energy * 0.5})`;
            ctx.fill();
            
            // Glow for nodes
            if (this.energy > 0.2) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
                ctx.fillStyle = `${colorPrefix} 0.2)`;
                ctx.fill();
            }
        });

        ctx.globalCompositeOperation = 'source-over';
    }
}
