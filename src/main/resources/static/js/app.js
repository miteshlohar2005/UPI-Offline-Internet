import { NetworkTopology } from './topology.js';

class App {
    constructor() {
        this.topology = new NetworkTopology('topologyCanvas', (node) => this.handleNodeClick(node));
        this.charts = {};
        this.pollingInterval = null;
        this.timelineEvents = [];
        this.lastTxCount = 0;
        
        // Cache Elements
        this.els = {
            deviceList: document.getElementById('deviceList'),
            accountsTable: document.querySelector('#accountsTable tbody'),
            txTable: document.querySelector('#txTable tbody'),
            timeline: document.getElementById('timeline'),
            headerNodeCount: document.getElementById('headerNodeCount'),
            headerTotalVol: document.getElementById('headerTotalVol'),
            
            // Stats
            statCreated: document.getElementById('statCreated'),
            statSettled: document.getElementById('statSettled'),
            statDropped: document.getElementById('statDropped'),
            statAvgHops: document.getElementById('statAvgHops'),
            statBridgeUploads: document.getElementById('statBridgeUploads'),
            statSuccessRate: document.getElementById('statSuccessRate'),
            
            // Cyber
            cyberCacheSize: document.getElementById('cyberCacheSize'),
            
            // Modals
            packetModal: document.getElementById('packetModal'),
            packetDetailsContent: document.getElementById('packetDetailsContent'),
            
            // Forms
            senderVpa: document.getElementById('senderVpa'),
            receiverVpa: document.getElementById('receiverVpa'),
            amount: document.getElementById('amount'),
            pin: document.getElementById('pin')
        };
        
        // State for routing simulation
        this.simulatedPacketQueue = []; // packets waiting to gossip
        this.bridgeUploadQueue = []; // packets waiting at bridge
        this.currentJourneyState = 0; 
        
        this.init();
    }

    init() {
        this.initCharts();
        this.bindEvents();
        this.refresh();
        this.pollingInterval = setInterval(() => this.refresh(), 2000);
        
        // Update tracker to default
        this.updateJourney(0);
    }

    bindEvents() {
        document.getElementById('btnInject').addEventListener('click', () => this.injectPacket());
        document.getElementById('btnGossip').addEventListener('click', () => this.gossip());
        document.getElementById('btnFlush').addEventListener('click', () => this.flushBridges());
        document.getElementById('btnReset').addEventListener('click', () => this.resetMesh());
        document.getElementById('closeModal').addEventListener('click', () => {
            this.els.packetModal.classList.remove('active');
            gsap.to(this.els.packetModal, {opacity: 0, duration: 0.2});
        });
    }

    initCharts() {
        Chart.defaults.color = '#a1a1aa';
        Chart.defaults.font.family = 'Inter';
        Chart.defaults.plugins.legend.display = false;
        
        const createLineChart = (id, color, label) => new Chart(document.getElementById(id).getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color+'22', tension: 0.4, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });
        
        const createBarChart = (id, color, label) => new Chart(document.getElementById(id).getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label, data: [], backgroundColor: color, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: true }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } } }
        });

        this.charts.settlement = createLineChart('chartSettlement', '#17c964', 'Settled');
        this.charts.distribution = createBarChart('chartDistribution', '#0070f3', 'Packets');
        this.charts.hops = createBarChart('chartHops', '#6366f1', 'Hops');
        
        this.charts.duplicates = new Chart(document.getElementById('chartDuplicates').getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Settled', 'Duplicate/Dropped'], datasets: [{ data: [0, 0], backgroundColor: ['#17c964', '#f5a623'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });

        this.charts.bridge = createLineChart('chartBridge', '#f5a623', 'Bridge Uploads');
        this.charts.volume = createLineChart('chartVolume', '#6366f1', 'Traffic Volume (₹)');
    }

    addTimelineEvent(text, type = 'info', icon = 'info') {
        const time = new Date().toLocaleTimeString();
        this.timelineEvents.unshift({ time, text, type, icon });
        if (this.timelineEvents.length > 100) this.timelineEvents.pop();
        this.renderTimeline();
    }

    renderTimeline() {
        if (this.timelineEvents.length === 0) return;
        this.els.timeline.innerHTML = this.timelineEvents.map(e => `
            <div class="timeline-item">
                <div class="timeline-icon ${e.type}"><i data-lucide="${e.icon}"></i></div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-title ${e.type === 'error'?'text-danger':(e.type==='success'?'text-success':'')}">${e.text}</span>
                        <span class="timeline-time">${e.time}</span>
                    </div>
                </div>
            </div>
        `).join('');
        lucide.createIcons({root: this.els.timeline});
    }

    async refresh() {
        try {
            const [mesh, accounts, txs] = await Promise.all([
                fetch('/api/mesh/state').then(r => r.json()),
                fetch('/api/accounts').then(r => r.json()),
                fetch('/api/transactions').then(r => r.json())
            ]);

            this.updateMeshUI(mesh);
            this.updateAccountsUI(accounts);
            this.updateTxUI(txs);
            this.updateStatsAndCharts(txs, mesh);
        } catch (e) {
            console.error("Failed to fetch data", e);
        }
    }

    updateMeshUI(mesh) {
        this.topology.updateData(mesh.devices);
        this.els.headerNodeCount.textContent = mesh.devices.length;
        this.els.cyberCacheSize.innerHTML = `<i data-lucide="database"></i> ${mesh.idempotencyCacheSize} entries`;

        this.els.deviceList.innerHTML = mesh.devices.map(d => `
            <div class="device-item" style="border-left: 3px solid ${d.hasInternet?'var(--success)':'var(--panel-border)'}; margin-bottom: 8px; padding: 10px; background: rgba(0,0,0,0.4); border-radius: 6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-family:var(--font-mono); font-size:0.85rem; font-weight:600;">${d.deviceId}</span>
                    <span style="font-size:0.7rem; color:${d.hasInternet?'var(--success)':'var(--text-muted)'};"><i data-lucide="${d.hasInternet?'wifi':'wifi-off'}" style="width:12px;height:12px;"></i></span>
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Packets: <span style="color:var(--text-main); font-weight:bold;">${d.packetCount}</span></div>
            </div>
        `).join('');
        lucide.createIcons({root: this.els.deviceList});
    }

    updateAccountsUI(accounts) {
        this.els.accountsTable.innerHTML = accounts.map(a => `
            <tr>
                <td>${a.vpa}</td>
                <td>${a.holderName}</td>
                <td class="text-right text-success" style="font-weight:500;">₹${parseFloat(a.balance).toFixed(2)}</td>
            </tr>
        `).join('');
    }

    updateTxUI(txs) {
        this.els.txTable.innerHTML = txs.map(t => {
            let statusColor = 'text-success';
            if(t.status === 'DUPLICATE_DROPPED') statusColor = 'text-warning';
            if(t.status === 'REJECTED' || t.status === 'INVALID') statusColor = 'text-danger';
            
            return `
            <tr style="cursor: pointer;" onclick="app.showTxDetails('${t.id}')">
                <td>${t.id.toString().substring(0,8)}</td>
                <td>${t.senderVpa.split('@')[0]}</td>
                <td>${t.receiverVpa.split('@')[0]}</td>
                <td class="text-right">₹${parseFloat(t.amount).toFixed(2)}</td>
                <td class="${statusColor}">${t.status}</td>
            </tr>
        `}).join('');
    }

    updateStatsAndCharts(txs, mesh) {
        const settled = txs.filter(t => t.status === 'SETTLED');
        const dropped = txs.filter(t => t.status === 'DUPLICATE_DROPPED');
        
        let totalHops = 0;
        let totalVol = 0;
        settled.forEach(t => { totalHops += t.hopCount; totalVol += t.amount; });
        const avgHops = settled.length ? (totalHops / settled.length).toFixed(1) : 0;
        
        this.els.headerTotalVol.textContent = `₹${totalVol}`;
        this.els.statCreated.textContent = settled.length + dropped.length + mesh.devices.reduce((acc, d) => acc + d.packetCount, 0); 
        this.els.statSettled.textContent = settled.length;
        this.els.statDropped.textContent = dropped.length;
        this.els.statAvgHops.textContent = avgHops;
        
        const bridgeUploads = txs.length; // rough proxy for demo
        this.els.statBridgeUploads.textContent = bridgeUploads;
        this.els.statSuccessRate.textContent = txs.length ? Math.round((settled.length / txs.length)*100) + '%' : '100%';

        // Only update charts if new txs arrived
        if (txs.length !== this.lastTxCount) {
            this.lastTxCount = txs.length;
            
            // Settlement Trend & Volume
            const timeLabels = [];
            const settledData = [];
            const volData = [];
            let rollingVol = 0;
            let rollingSet = 0;
            
            [...txs].reverse().forEach((t, i) => {
                timeLabels.push(`#${i+1}`);
                if (t.status === 'SETTLED') {
                    rollingSet++;
                    rollingVol += t.amount;
                }
                settledData.push(rollingSet);
                volData.push(rollingVol);
            });
            
            this.updateChart(this.charts.settlement, timeLabels, settledData);
            this.updateChart(this.charts.volume, timeLabels, volData);
            
            // Duplicates
            this.charts.duplicates.data.datasets[0].data = [settled.length, dropped.length];
            this.charts.duplicates.update();
            
            // Hop Distribution
            const hopsMap = {};
            settled.forEach(t => { hopsMap[t.hopCount] = (hopsMap[t.hopCount] || 0) + 1; });
            this.updateChart(this.charts.hops, Object.keys(hopsMap).map(k=>k+' hops'), Object.values(hopsMap));
        }
    }

    updateChart(chart, labels, data) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update();
    }

    /* =========================================================================
       ACTION FLOWS & ANIMATIONS
       ========================================================================= */

    async injectPacket() {
        this.updateJourney(1);
        this.runEncryptionViz();
        this.addTimelineEvent('Payment Created', 'success', 'check');
        this.addTimelineEvent('AES Key Generated & Encrypted', 'info', 'lock');
        
        const body = {
            senderVpa: this.els.senderVpa.value,
            receiverVpa: this.els.receiverVpa.value,
            amount: parseFloat(this.els.amount.value),
            pin: this.els.pin.value,
            ttl: 5,
            startDevice: 'phone-alice'
        };
        
        try {
            const r = await fetch('/api/demo/send', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            }).then(r => r.json());
            
            this.addTimelineEvent('Mesh Packet Created', 'info', 'box');
            this.addTimelineEvent(`Injected into phone-alice`, 'info', 'smartphone');
            
            this.simulatedPacketQueue.push(r.packetId);
            
            this.updateJourney(2);
            document.getElementById('journeyCarrier').textContent = 'phone-alice';
            document.getElementById('journeyTTL').textContent = '5';
            document.getElementById('journeyEst').textContent = '~1 min';

            // Topology pulse
            const aliceNode = this.topology.nodes.find(n => n.id.includes('alice')) || this.topology.nodes[0];
            if (aliceNode) aliceNode.pulse = 1;
            
            this.refresh();
        } catch(e) {
            this.addTimelineEvent('Injection Failed', 'error', 'alert-circle');
        }
    }

    async gossip() {
        this.updateJourney(3);
        
        try {
            const r = await fetch('/api/mesh/gossip', {method: 'POST'}).then(r => r.json());
            this.addTimelineEvent(`Gossip: ${r.transfers} transfers across mesh`, 'warning', 'repeat');
            
            this.updateJourney(4);
            document.getElementById('journeyCarrier').textContent = 'Multiple Nodes';
            document.getElementById('journeyTTL').textContent = 'Decreasing';
            
            // Faked logical routing simulation for the topology Canvas
            if (r.transfers > 0) {
                // Alice -> Strangers
                const alice = this.topology.nodes.find(n => n.id.includes('alice'));
                const strangers = this.topology.nodes.filter(n => !n.hasInternet && !n.id.includes('alice'));
                const bridge = this.topology.nodes.find(n => n.hasInternet);
                
                if (alice && strangers.length > 0) {
                    this.topology.animatePacket(alice.id, strangers[0].id, 4, '#0070f3');
                    setTimeout(() => {
                        this.topology.animatePacket(strangers[0].id, strangers[1]?.id || bridge.id, 3, '#0070f3');
                        if (bridge) this.bridgeUploadQueue.push(bridge.id);
                        this.updateJourney(5); // Bridge found
                        document.getElementById('journeyCarrier').textContent = 'phone-bridge';
                    }, 1500);
                }
            }
            this.refresh();
        } catch (e) {
            this.addTimelineEvent('Gossip Failed', 'error', 'alert-circle');
        }
    }

    async flushBridges() {
        if (this.currentJourneyState < 5) {
            this.addTimelineEvent('No packets at bridge yet', 'warning', 'alert-circle');
        } else {
            this.updateJourney(6); // Uploading Securely
        }

        try {
            // Visualize Bridge Upload (Flash node green, animate to backend)
            const bridges = this.topology.nodes.filter(n => n.hasInternet && n.packetCount > 0);
            bridges.forEach(b => {
                b.pulse = 1;
                gsap.to(b, {radius: 25, duration: 0.3, yoyo: true, repeat: 1});
            });

            this.addTimelineEvent('Bridge node(s) walked outside, got 4G', 'success', 'signal');
            
            const r = await fetch('/api/mesh/flush', {method: 'POST'}).then(r => r.json());
            
            if (r.results && r.results.length > 0) {
                this.addTimelineEvent(`Uploaded ${r.uploadsAttempted} packets to Backend`, 'info', 'upload-cloud');
                
                // Animate Backend settlement
                const backendViz = document.getElementById('backendVisual');
                backendViz.classList.add('flash');
                setTimeout(() => backendViz.classList.remove('flash'), 1000);
                
                this.updateJourney(7); // Bank Verification
                this.runDecryptionViz();
                
                setTimeout(() => {
                    this.updateJourney(8); // Success
                    r.results.forEach(res => {
                        if (res.outcome === 'SETTLED') {
                            this.addTimelineEvent(`Payment Settled: ${res.packetId.substring(0,8)}`, 'success', 'check-circle');
                        } else {
                            this.addTimelineEvent(`${res.outcome}: ${res.packetId.substring(0,8)}`, 'warning', 'alert-triangle');
                        }
                    });
                    this.refresh();
                }, 2000);
            } else {
                this.addTimelineEvent('No packets to upload', 'info', 'info');
                this.refresh();
            }
        } catch(e) {
            this.addTimelineEvent('Upload Failed', 'error', 'alert-circle');
        }
    }

    async resetMesh() {
        await fetch('/api/mesh/reset', {method: 'POST'});
        this.addTimelineEvent('System Reset', 'error', 'trash');
        this.updateJourney(0);
        this.refresh();
    }

    /* =========================================================================
       JOURNEY & PIPELINE ANIMATIONS
       ========================================================================= */

    updateJourney(stepIndex) {
        this.currentJourneyState = stepIndex;
        document.getElementById('journeyProgressText').textContent = `Step ${stepIndex} of 8`;
        const meta = document.getElementById('journeyMeta');
        
        if (stepIndex === 0) {
            meta.style.display = 'none';
        } else {
            meta.style.display = 'flex';
        }

        for (let i = 1; i <= 8; i++) {
            const stepEl = document.getElementById(`step${i}`);
            const icon = stepEl.querySelector('.tracker-icon');
            stepEl.classList.remove('completed', 'active');
            
            if (i < stepIndex) {
                stepEl.classList.add('completed');
                icon.innerHTML = '<i data-lucide="check"></i>';
            } else if (i === stepIndex) {
                stepEl.classList.add('active');
                icon.innerHTML = '<div style="width:8px;height:8px;background:#fff;border-radius:50%;"></div>';
            } else {
                icon.innerHTML = '';
            }
        }
        lucide.createIcons({root: document.getElementById('journeyTracker')});
    }

    runEncryptionViz() {
        const container = document.getElementById('encryptionVizContainer');
        container.style.display = 'block';
        
        const steps = ['enc-json', 'enc-aes-gen', 'enc-aes-enc', 'enc-rsa', 'enc-mesh'];
        const tl = gsap.timeline();
        
        steps.forEach((id, i) => {
            const el = document.getElementById(id);
            tl.to(el, { duration: 0.3, onStart: () => {
                el.classList.add('active');
                if (i > 0) document.querySelectorAll('.enc-arrow')[i-1].classList.add('active');
            }});
            tl.to(el, { duration: 0.2, onStart: () => {
                el.classList.remove('active');
                el.classList.add('completed');
            }}, "+=0.3");
        });
        
        tl.call(() => {
            setTimeout(() => {
                steps.forEach(id => {
                    document.getElementById(id).classList.remove('completed', 'active');
                });
                document.querySelectorAll('.enc-arrow').forEach(a => a.classList.remove('active'));
                container.style.display = 'none';
            }, 3000);
        });
    }

    runDecryptionViz() {
        const container = document.getElementById('decryptionVizContainer');
        container.style.display = 'block';
        
        const steps = ['dec-rsa', 'dec-aes', 'dec-sha', 'dec-replay', 'dec-settle'];
        const tl = gsap.timeline();
        
        steps.forEach((id, i) => {
            const el = document.getElementById(id);
            tl.to(el, { duration: 0.3, onStart: () => {
                el.classList.add('active');
                if (i > 0) container.querySelectorAll('.enc-arrow')[i-1].classList.add('active');
            }});
            tl.to(el, { duration: 0.2, onStart: () => {
                el.classList.remove('active');
                el.classList.add('completed');
            }}, "+=0.3");
        });
        
        tl.call(() => {
            setTimeout(() => {
                steps.forEach(id => {
                    document.getElementById(id).classList.remove('completed', 'active');
                });
                container.querySelectorAll('.enc-arrow').forEach(a => a.classList.remove('active'));
                container.style.display = 'none';
            }, 3000);
        });
    }

    /* =========================================================================
       MODAL LOGIC
       ========================================================================= */

    handleNodeClick(node) {
        if (node.packetCount === 0) return;
        this.addTimelineEvent(`Inspecting ${node.id} (${node.packetCount} packets)`, 'info', 'search');
    }

    showTxDetails(id) {
        fetch('/api/transactions').then(r => r.json()).then(txs => {
            const tx = txs.find(t => t.id == id);
            if (!tx) return;
            
            const badge = document.getElementById('modalStatusBadge');
            badge.textContent = tx.status;
            badge.className = `status-badge ${tx.status}`;

            this.els.packetDetailsContent.innerHTML = `
                <div class="data-group"><label><i data-lucide="hash"></i> Packet ID</label><span>${tx.id}</span></div>
                <div class="data-group"><label><i data-lucide="fingerprint"></i> SHA-256 Hash</label><span style="color:var(--primary)">${tx.packetHash}</span></div>
                <div class="data-group"><label><i data-lucide="user"></i> Sender VPA</label><span>${tx.senderVpa}</span></div>
                <div class="data-group"><label><i data-lucide="user-check"></i> Receiver VPA</label><span>${tx.receiverVpa}</span></div>
                <div class="data-group"><label><i data-lucide="coins"></i> Amount</label><span class="text-success">₹${tx.amount}</span></div>
                <div class="data-group"><label><i data-lucide="clock"></i> Settled At</label><span>${new Date(tx.settledAt).toLocaleString()}</span></div>
                
                <div class="data-group full-width" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--panel-border);">
                    <label style="color:#fff; margin-bottom:8px;"><i data-lucide="shield-check"></i> Cryptographic Proofs</label>
                </div>
                
                <div class="data-group"><label>Encryption Mode</label><span style="font-size:0.75rem;">Hybrid (RSA-OAEP-2048 + AES-256-GCM)</span></div>
                <div class="data-group"><label>Tamper Detection</label><span style="color:var(--success)">GCM Auth Tag Validated</span></div>
                <div class="data-group"><label>Replay Protection</label><span style="color:var(--success)">Nonce & Timestamp Validated</span></div>
                <div class="data-group"><label>Idempotency</label><span>Atomic Hash Claim</span></div>
                
                <div class="data-group full-width" style="margin-top:10px; padding-top:10px; border-top:1px solid var(--panel-border);">
                    <label style="color:#fff; margin-bottom:8px;"><i data-lucide="route"></i> Routing Information</label>
                </div>
                <div class="data-group"><label>Bridge Node Used</label><span>${tx.bridgeNodeId || 'N/A'}</span></div>
                <div class="data-group"><label>Hop Count</label><span>${tx.hopCount || 0}</span></div>
            `;
            lucide.createIcons({root: this.els.packetDetailsContent});
            
            this.els.packetModal.style.display = 'flex';
            gsap.fromTo(this.els.packetModal, {opacity: 0}, {opacity: 1, duration: 0.2});
            gsap.fromTo(this.els.packetModal.querySelector('.modal-content'), {scale: 0.95, opacity: 0}, {scale: 1, opacity: 1, duration: 0.3, ease: "power2.out"});
            this.els.packetModal.classList.add('active');
        });
    }

    copyPacketData() {
        navigator.clipboard.writeText(this.els.packetDetailsContent.innerText);
        this.addTimelineEvent('Packet data copied to clipboard', 'info', 'copy');
    }
}

// Global init
window.app = new App();
