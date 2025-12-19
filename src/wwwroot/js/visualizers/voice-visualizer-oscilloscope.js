/**
 * VoiceVisualizer - Simplex Noise Flow
 * Features: Procedural noise-based wave flow with dynamic color gradients
 */

// Simplex noise implementation
class SimplexNoise {
    constructor(seed = Math.random()) {
        this.p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) this.p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(seed * (i + 1));
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
    }

    noise3D(x, y, z) {
        const perm = this.perm;
        const grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];

        let n0, n1, n2, n3;
        const F3 = 1.0 / 3.0;
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const G3 = 1.0 / 6.0;
        const t = (i + j + k) * G3;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;

        let i1, j1, k1;
        let i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
            else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
        } else {
            if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
            else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
            else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        }

        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;

        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;

        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
            n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0 + grad3[gi0][2] * z0);
        }

        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
            n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1 + grad3[gi1][2] * z1);
        }

        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
            n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2 + grad3[gi2][2] * z2);
        }

        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 < 0) n3 = 0.0;
        else {
            t3 *= t3;
            const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
            n3 = t3 * t3 * (grad3[gi3][0] * x3 + grad3[gi3][1] * y3 + grad3[gi3][2] * z3);
        }

        return 32.0 * (n0 + n1 + n2 + n3);
    }
}

export class VoiceVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.time = 0;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.active = false;
        this.energy = 0.2;
        this.targetEnergy = 0.2;
        this.noise = new SimplexNoise();
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        this.canvas.width = displayWidth * this.pixelRatio;
        this.canvas.height = displayHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);
        this.width = displayWidth;
        this.height = displayHeight;
        this.width_half = this.width / 2;
        this.height_half = this.height / 2;
    }

    setActive(active) {
        this.active = active;
        this.targetEnergy = active ? 1.0 : 0.2;
        if (active) {
            this.start();
        } else {
            this.fadeOut();
        }
    }

    fadeOut() {
        setTimeout(() => {
            if (this.energy < 0.25 && !this.active) {
                this.running = false;
                this.canvas.classList.remove('active');
            }
        }, 800);
    }

    setMode(mode) {
        this.mode = mode;
    }

    ingestRMS(rms, mode = 'user') {
        this.targetEnergy = 0.2 + Math.min(1, rms * 4) * 0.8;
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

    update() {
        this.time += 0.016;
        
        // smooth energy
        const smoothRate = 0.08;
        this.energy += (this.targetEnergy - this.energy) * smoothRate;

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
        const { ctx, width, height, width_half, height_half, noise } = this;
        
        let xCount = 40;
        let yCount = 60;
        let iXCount = 1 / (xCount - 1);
        let iYCount = 1 / (yCount - 1);
        let time = this.time;
        let timeStep = 0.01;
        
        let grad = ctx.createLinearGradient(-width, 0, width, height);
        let t = time % 1;
        let tSide = Math.floor(time % 2) === 0;
        let hueA = tSide ? 340 : 210;
        let hueB = !tSide ? 340 : 210;
        
        const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
        const map = (v, a, b, c, d) => c + (d - c) * ((v - a) / (b - a));
        
        let colorA = hsl(hueA, 100, 50);
        let colorB = hsl(hueB, 100, 50);
        
        const ZERO = 0, THIRD = 1/3, TWO_THIRDS = 2/3, ONE = 1;
        
        grad.addColorStop(map(t, 0, 1, THIRD, ZERO), colorA);
        grad.addColorStop(map(t, 0, 1, TWO_THIRDS, THIRD), colorB);
        grad.addColorStop(map(t, 0, 1, ONE, TWO_THIRDS), colorA);
        
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = map(Math.cos(time), -1, 1, 0.15, 0.3);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        
        ctx.globalAlpha = 1;
        ctx.beginPath();
        
        const TAU = Math.PI * 2;
        
        let drawTime = time;
        for(let j = 0; j < yCount; j++) {
            let tj = j * iYCount;
            let c = Math.cos(tj * TAU + drawTime) * 0.1;
            for(let i = 0; i < xCount; i++) {
                let t = i * iXCount;
                let n = noise.noise3D(t, drawTime, c);
                let y = height_half + n * height_half * this.energy;
                let x = t * (width + 20) - 10;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            drawTime += timeStep;
        }
        
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = 'blur(10px)';
        ctx.strokeStyle = grad;
        ctx.lineWidth = 5;
        ctx.stroke();
        
        ctx.filter = 'none';
        ctx.strokeStyle = hsl(0, 0, 100, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.globalCompositeOperation = 'source-over';
    }
}
