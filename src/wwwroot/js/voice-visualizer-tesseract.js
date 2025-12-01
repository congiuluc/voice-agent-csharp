/**
 * VoiceVisualizer - Quantum Tesseract
 * Features: A 4D Hypercube (Tesseract) rotating in 3D space.
 * The "4th dimension" rotation and scale are driven by voice energy.
 */
export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.points = [];
        this.angle = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.targetEnergy = 0.0;
        this.energy = 0.0;
        this.mode = 'user';
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initHypercube();
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
    }

    initHypercube() {
        this.points = [];
        // Generate 16 vertices of a tesseract
        // (x, y, z, w) where each is -1 or 1
        for (let i = 0; i < 16; i++) {
            this.points.push({
                x: (i & 1) ? 1 : -1,
                y: (i & 2) ? 1 : -1,
                z: (i & 4) ? 1 : -1,
                w: (i & 8) ? 1 : -1
            });
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
        // Scale RMS to be more visible
        const scaled = Math.min(1, rms * 6);
        if (this.active) {
            this.targetEnergy = 0.2 + scaled * 1.5;
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
        // Base rotation speed
        let speed = 0.02;
        // Speed up significantly when talking
        speed += this.energy * 0.05;
        
        this.angle += speed;
        
        const smoothRate = 0.15;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;
        
        // Idle animation
        if (!this.active && Math.random() < 0.01) {
            this.targetEnergy = Math.random() * 0.15;
        }

        try {
            if (this.canvas) {
                this.canvas.classList.toggle('speaking', this.energy > 0.3);
            }
        } catch (e) {}
    }

    // Matrix multiplication helper
    matmul(v, m) {
        let x = v.x * m[0][0] + v.y * m[1][0] + v.z * m[2][0] + v.w * m[3][0];
        let y = v.x * m[0][1] + v.y * m[1][1] + v.z * m[2][1] + v.w * m[3][1];
        let z = v.x * m[0][2] + v.y * m[1][2] + v.z * m[2][2] + v.w * m[3][2];
        let w = v.x * m[0][3] + v.y * m[1][3] + v.z * m[2][3] + v.w * m[3][3];
        return { x, y, z, w };
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        
        ctx.clearRect(0, 0, w, h);
        
        // Determine color based on mode
        // Assistant: Cyan/Blue, User: Magenta/Purple
        const hue = this.mode === 'assistant' ? 190 : 280;
        
        // Rotation matrices
        const angle = this.angle;
        
        // Rotate ZW plane (The "4D" rotation)
        const rotZW = [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, Math.cos(angle), -Math.sin(angle)],
            [0, 0, Math.sin(angle), Math.cos(angle)]
        ];

        // Rotate XY plane
        const rotXY = [
            [Math.cos(angle * 0.5), -Math.sin(angle * 0.5), 0, 0],
            [Math.sin(angle * 0.5), Math.cos(angle * 0.5), 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ];

        // Project points
        const projected2d = [];
        
        // INCREASED SCALE: 0.15 -> 0.28 (Almost double size)
        const scaleBase = Math.min(w, h) * 0.28;
        const scale = scaleBase * (1 + this.energy * 0.4);

        for (let i = 0; i < this.points.length; i++) {
            let p = this.points[i];
            
            // Apply rotations
            p = this.matmul(p, rotZW);
            p = this.matmul(p, rotXY);

            // 4D to 3D projection
            let distance = 2; // Camera distance in 4D
            let wInv = 1 / (distance - p.w);
            
            let p3 = {
                x: p.x * wInv,
                y: p.y * wInv,
                z: p.z * wInv
            };

            // 3D to 2D projection
            let zInv = 1 / (distance - p3.z);
            let p2 = {
                x: p3.x * zInv * scale * 500 + cx, // 500 is arbitrary zoom factor
                y: p3.y * zInv * scale * 500 + cy
            };
            
            projected2d.push(p2);
        }

        // Draw edges
        // INCREASED LINE WIDTH: 2 -> 5
        ctx.lineWidth = 5 + this.energy * 6;
        ctx.lineCap = 'round';
        
        // Connect vertices that differ by 1 bit
        for (let i = 0; i < 16; i++) {
            for (let j = i + 1; j < 16; j++) {
                // Check if indices differ by exactly power of 2 (1 bit)
                let diff = i ^ j;
                if ((diff & (diff - 1)) === 0) {
                    const p1 = projected2d[i];
                    const p2 = projected2d[j];
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    
                    // INCREASED OPACITY: 0.2 -> 0.7 (Much brighter lines)
                    const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                    grad.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.7 + this.energy * 0.3})`);
                    grad.addColorStop(1, `hsla(${hue + 40}, 100%, 60%, ${0.7 + this.energy * 0.3})`);
                    
                    ctx.strokeStyle = grad;
                    ctx.stroke();
                }
            }
        }

        // Draw vertices (Glowing nodes)
        for (let i = 0; i < projected2d.length; i++) {
            const p = projected2d[i];
            // INCREASED NODE SIZE: 3 -> 7
            const size = 7 + this.energy * 8;
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, 100%, 90%, 1)`;
            // INCREASED GLOW
            ctx.shadowBlur = 25 + this.energy * 30;
            ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;
            ctx.fill();
            ctx.shadowBlur = 0; // Reset
        }
        
        // Inner glow
        // INCREASED GLOW OPACITY AND SIZE
        if (this.energy > 0.01) {
            const glowSize = Math.min(w, h) * 0.45;
            const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
            radGrad.addColorStop(0, `hsla(${hue}, 100%, 50%, ${0.3 + this.energy * 0.5})`);
            radGrad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
            
            ctx.fillStyle = radGrad;
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
    }
}
