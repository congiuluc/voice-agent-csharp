/**
 * Simple Chart Implementation (No external dependencies)
 * Creates basic bar and doughnut charts using Canvas API
 */

class SimpleChart {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        this.width = canvas.width = canvas.offsetWidth * 2; // High DPI
        this.height = canvas.height = canvas.offsetHeight * 2;
        this.ctx.scale(2, 2);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width / 2, this.height / 2);
    }

    destroy() {
        this.clear();
    }

    drawBarChart() {
        const { labels, datasets } = this.config.data;
        const { colors } = this.config.options;
        const padding = 40;
        const width = this.width / 2 - padding * 2;
        const height = this.height / 2 - padding * 2;
        
        this.clear();
        
        // Find max value
        const allValues = datasets.flatMap(d => d.data);
        const maxValue = Math.max(...allValues);
        
        // Draw bars
        const barWidth = width / (labels.length * datasets.length + labels.length);
        const gap = barWidth * 0.3;
        
        labels.forEach((label, i) => {
            datasets.forEach((dataset, j) => {
                const value = dataset.data[i];
                const barHeight = (value / maxValue) * height * 0.8;
                const x = padding + i * (barWidth * datasets.length + gap * 2) + j * barWidth;
                const y = padding + height - barHeight;
                
                // Draw bar
                this.ctx.fillStyle = dataset.backgroundColor;
                this.ctx.fillRect(x, y, barWidth - gap, barHeight);
            });
            
            // Draw label
            this.ctx.fillStyle = colors.text;
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'center';
            const labelX = padding + i * (barWidth * datasets.length + gap * 2) + (barWidth * datasets.length) / 2;
            this.ctx.fillText(label, labelX, padding + height + 20);
        });
        
        // Draw legend
        let legendY = 10;
        datasets.forEach((dataset, i) => {
            this.ctx.fillStyle = dataset.backgroundColor;
            this.ctx.fillRect(padding, legendY, 10, 10);
            this.ctx.fillStyle = colors.text;
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(dataset.label, padding + 15, legendY + 9);
            legendY += 15;
        });
    }

    drawStackedBarChart() {
        const { labels, datasets } = this.config.data;
        const { colors } = this.config.options;
        const padding = 40;
        const width = this.width / 2 - padding * 2;
        const height = this.height / 2 - padding * 2;
        
        this.clear();
        
        // Find max stack value
        let maxStackValue = 0;
        labels.forEach((_, i) => {
            const stackTotal = datasets.reduce((sum, dataset) => sum + (dataset.data[i] || 0), 0);
            maxStackValue = Math.max(maxStackValue, stackTotal);
        });
        
        // Draw stacked bars
        const barWidth = width / (labels.length * 1.5);
        const gap = barWidth * 0.3;
        
        labels.forEach((label, i) => {
            let currentHeight = 0;
            
            datasets.forEach((dataset) => {
                const value = dataset.data[i] || 0;
                const segmentHeight = (value / maxStackValue) * height * 0.8;
                const x = padding + i * (barWidth + gap);
                const y = padding + height - currentHeight - segmentHeight;
                
                // Draw stacked segment
                this.ctx.fillStyle = dataset.backgroundColor;
                this.ctx.fillRect(x, y, barWidth - gap, segmentHeight);
                
                currentHeight += segmentHeight;
            });
            
            // Draw label
            this.ctx.fillStyle = colors.text;
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'center';
            const labelX = padding + i * (barWidth + gap) + barWidth / 2;
            this.ctx.fillText(label, labelX, padding + height + 20);
        });
        
        // Draw legend
        let legendY = 10;
        datasets.forEach((dataset, i) => {
            this.ctx.fillStyle = dataset.backgroundColor;
            this.ctx.fillRect(padding, legendY, 10, 10);
            this.ctx.fillStyle = colors.text;
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(dataset.label, padding + 15, legendY + 9);
            legendY += 15;
        });
    }

    drawDoughnutChart() {
        const { labels, datasets } = this.config.data;
        const { colors } = this.config.options;
        const centerX = this.width / 4;
        const centerY = this.height / 4;
        const radius = Math.min(centerX, centerY) - 60;
        const innerRadius = radius * 0.6;
        
        this.clear();
        
        const dataset = datasets[0];
        const total = dataset.data.reduce((a, b) => a + b, 0);
        let currentAngle = -Math.PI / 2;
        
        // Draw segments
        dataset.data.forEach((value, i) => {
            const sliceAngle = (value / total) * Math.PI * 2;
            
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            this.ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
            this.ctx.closePath();
            this.ctx.fillStyle = dataset.backgroundColor[i];
            this.ctx.fill();
            
            currentAngle += sliceAngle;
        });
        
        // Draw legend
        let legendY = this.height / 2 - 60;
        labels.forEach((label, i) => {
            this.ctx.fillStyle = dataset.backgroundColor[i];
            this.ctx.fillRect(10, legendY, 12, 12);
            this.ctx.fillStyle = colors.text;
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'left';
            const value = dataset.data[i].toFixed(4);
            this.ctx.fillText(`${label}: $${value}`, 28, legendY + 10);
            legendY += 20;
        });
    }

    render() {
        if (this.config.type === 'bar') {
            this.drawBarChart();
        } else if (this.config.type === 'stackedBar') {
            this.drawStackedBarChart();
        } else if (this.config.type === 'doughnut') {
            this.drawDoughnutChart();
        }
    }
}

// Export as Chart for compatibility with admin-dashboard.js
// Note: This is a simple chart implementation for this project
// If you need to use Chart.js in the future, rename this to avoid conflicts
window.Chart = SimpleChart;
