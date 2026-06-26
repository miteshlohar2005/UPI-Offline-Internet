export class NetworkTopology {
    constructor(canvasId, onNodeClick) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.edges = [];
        this.packets = []; 
        this.width = 0;
        this.height = 0;
        this.animationId = null;
        this.onNodeClick = onNodeClick;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Interaction
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check nodes
            for (let n of this.nodes) {
                if (Math.hypot(n.x - x, n.y - y) < n.radius + 10) {
                    if (this.onNodeClick) this.onNodeClick(n);
                    return;
                }
            }
        });
        
        this.startLoop();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.width = rect.width;
        this.height = rect.height;
    }

    updateData(deviceData) {
        const nodeIds = new Set();
        
        deviceData.forEach((d, index) => {
            nodeIds.add(d.deviceId);
            let existingNode = this.nodes.find(n => n.id === d.deviceId);
            
            if (!existingNode) {
                // Determine layout
                const isBridge = d.hasInternet;
                const isAlice = d.deviceId.includes('alice');
                
                let targetX = this.width / 2;
                let targetY = this.height / 2;
                
                // Force Alice to left, Bridge to right for a visual pipeline look
                if (isAlice) {
                    targetX = this.width * 0.2;
                } else if (isBridge) {
                    targetX = this.width * 0.8;
                } else {
                    targetX = this.width * 0.5 + (Math.random() - 0.5) * 100;
                    targetY = this.height * 0.5 + (Math.random() - 0.5) * 150;
                }
                
                existingNode = {
                    id: d.deviceId,
                    x: targetX,
                    y: targetY,
                    vx: 0, vy: 0,
                    radius: 18,
                    pulse: 0
                };
                this.nodes.push(existingNode);
            }
            
            existingNode.hasInternet = d.hasInternet;
            existingNode.packetCount = d.packetCount;
            existingNode.packetIds = d.packetIds;
        });
        
        this.nodes = this.nodes.filter(n => nodeIds.has(n.id));
        
        // Rebuild edges
        this.edges = [];
        for(let i=0; i<this.nodes.length; i++) {
            for(let j=i+1; j<this.nodes.length; j++) {
                // Don't connect everything to everything. Connect Alice->Strangers->Bridge
                const dist = Math.hypot(this.nodes[i].x - this.nodes[j].x, this.nodes[i].y - this.nodes[j].y);
                if (dist < 300) {
                    this.edges.push({source: this.nodes[i], target: this.nodes[j], activity: 0});
                }
            }
        }
    }

    animatePacket(fromId, toId, ttl = 5, color = '#0070f3') {
        const source = this.nodes.find(n => n.id === fromId);
        const target = this.nodes.find(n => n.id === toId);
        
        if (!source || !target) return;
        
        source.pulse = 1; // trigger pulse
        
        // Find edge to light up
        const edge = this.edges.find(e => (e.source === source && e.target === target) || (e.source === target && e.target === source));
        if (edge) edge.activity = 1;
        
        this.packets.push({
            x: source.x,
            y: source.y,
            targetX: target.x,
            targetY: target.y,
            progress: 0,
            color: color,
            active: true,
            ttl: ttl,
            trail: []
        });
    }
    
    startLoop() {
        const loop = () => {
            this.updatePhysics();
            this.draw();
            this.animationId = requestAnimationFrame(loop);
        };
        loop();
    }
    
    updatePhysics() {
        // Very subtle drift
        const cx = this.width / 2;
        const cy = this.height / 2;
        
        this.nodes.forEach(n => {
            // dampen pulse
            if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.05);
        });
        
        this.edges.forEach(e => {
            if (e.activity > 0) e.activity -= 0.02;
        });
        
        // Update packets
        this.packets.forEach(p => {
            if (p.active) {
                p.progress += 0.015; // speed
                if (p.progress >= 1) {
                    p.active = false;
                    const targetNode = this.nodes.find(n => Math.hypot(n.x - p.targetX, n.y - p.targetY) < 1);
                    if (targetNode) targetNode.pulse = 1;
                } else {
                    const ease = p.progress; // linear for packets looks better across lines
                    p.trail.push({x: p.x, y: p.y, life: 1.0});
                    p.x = p.x + (p.targetX - p.x) * ease;
                    p.y = p.y + (p.targetY - p.y) * ease;
                }
            }
            
            // update trails
            p.trail.forEach(t => t.life -= 0.05);
            p.trail = p.trail.filter(t => t.life > 0);
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw edges
        this.edges.forEach(e => {
            this.ctx.beginPath();
            this.ctx.moveTo(e.source.x, e.source.y);
            this.ctx.lineTo(e.target.x, e.target.y);
            
            if (e.activity > 0) {
                this.ctx.lineWidth = 2 + (e.activity * 2);
                this.ctx.strokeStyle = `rgba(0, 112, 243, ${e.activity})`;
            } else {
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            }
            this.ctx.stroke();
        });
        
        // Draw packets and trails
        this.packets.forEach(p => {
            // Trail
            this.ctx.beginPath();
            if (p.trail.length > 0) {
                this.ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for(let i=1; i<p.trail.length; i++) {
                    this.ctx.lineTo(p.trail[i].x, p.trail[i].y);
                }
                this.ctx.strokeStyle = `rgba(0, 112, 243, 0.5)`;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }
            
            if (p.active) {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                this.ctx.fillStyle = p.color;
                this.ctx.shadowColor = p.color;
                this.ctx.shadowBlur = 15;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
                
                // Draw TTL
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '10px JetBrains Mono';
                this.ctx.fillText(`TTL:${p.ttl}`, p.x + 10, p.y - 10);
            }
        });

        // Draw nodes
        this.nodes.forEach(n => {
            this.ctx.beginPath();
            let r = n.radius + (n.pulse * 5); // pulse effect
            this.ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            
            if (n.hasInternet) {
                this.ctx.fillStyle = '#0a0a0a';
                this.ctx.strokeStyle = n.pulse > 0 ? '#17c964' : 'rgba(23, 201, 100, 0.5)';
                this.ctx.lineWidth = 3;
                if (n.pulse > 0) {
                    this.ctx.shadowColor = '#17c964';
                    this.ctx.shadowBlur = 20;
                }
            } else {
                this.ctx.fillStyle = '#000';
                this.ctx.strokeStyle = n.pulse > 0 ? '#0070f3' : 'rgba(255, 255, 255, 0.2)';
                this.ctx.lineWidth = 2;
                if (n.pulse > 0) {
                    this.ctx.shadowColor = '#0070f3';
                    this.ctx.shadowBlur = 20;
                }
            }
            
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.shadowBlur = 0; // reset
            
            // Label
            this.ctx.fillStyle = '#a1a1aa';
            this.ctx.font = '11px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(n.id.replace('phone-', ''), n.x, n.y + 35);
            
            // Packet count
            if (n.packetCount > 0) {
                this.ctx.fillStyle = '#0070f3';
                this.ctx.beginPath();
                this.ctx.arc(n.x + 12, n.y - 12, 9, 0, Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '10px JetBrains Mono';
                this.ctx.fillText(n.packetCount, n.x + 12, n.y - 8);
            }
        });
    }
}
