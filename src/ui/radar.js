// radar.js – Full implementation

export class Radar {
  constructor(opts) {
    this.canvas = document.getElementById('radar-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.peers = [];
    this.scanning = false;
    this.ghostMode = localStorage.getItem('radar_ghost_mode') === 'true';
    this.animationId = null;
    this.sweepAngle = 0;
    this.bluetoothSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    this.opts = opts || {};
    this.initUI();
  }

  initUI() {
    const ghostBtn = document.getElementById('radar-ghost-mode');
    const scanBtn = document.getElementById('radar-scan-btn');
    
    if (ghostBtn) {
      ghostBtn.textContent = this.ghostMode ? '👻 Ghost Mode: ON' : '👻 Ghost Mode: OFF';
      if (this.ghostMode) ghostBtn.classList.add('active');
      ghostBtn.addEventListener('click', () => this.toggleGhostMode());
    }
    
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.startScan());
    }
  }

  toggleGhostMode() {
    this.ghostMode = !this.ghostMode;
    localStorage.setItem('radar_ghost_mode', String(this.ghostMode));
    const btn = document.getElementById('radar-ghost-mode');
    if (btn) {
      btn.textContent = this.ghostMode ? '👻 Ghost Mode: ON' : '👻 Ghost Mode: OFF';
      if (this.ghostMode) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (this.ghostMode && this.scanning) {
      this.stopScan();
    } else if (!this.ghostMode && this.isActive) {
      this.startScan();
    }
  }

  async startScan() {
    if (this.ghostMode) {
      this.showToast('Ghost mode is ON. Turn it off to scan.', 'warning');
      return;
    }
    if (this.scanning) return;
    
    this.scanning = true;
    this.peers = [];
    this.updatePeersList();
    this.startAnimation();
    
    // Try Web Bluetooth first
    if (this.bluetoothSupported) {
      await this.scanBluetooth();
    } else {
        const hint = document.getElementById('radar-bluetooth-hint');
        if (hint) {
            hint.textContent = 'Bluetooth not supported. Using local network scan only.';
            hint.style.color = '#ff9f9f';
        }
    }
    
    // Always scan local network as fallback / supplement
    this.scanLocalNetwork();
    
    // Auto-stop after 30 seconds
    setTimeout(() => this.stopScan(), 30000);
  }

  async scanBluetooth() {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access']
      });
      
      // RSSI is not directly available in Web Bluetooth API, but we can estimate
      const rssi = -Math.random() * 70 - 30; // Simulate -100 to -30 dBm
      this.addPeer({
        id: device.id || Date.now().toString(),
        name: device.name || 'Unknown Device',
        rssi: rssi,
        source: 'bluetooth'
      });
    } catch (err) {
      console.log('Bluetooth scan failed:', err);
    }
  }

  scanLocalNetwork() {
    try {
        // Create a dummy RTCPeerConnection to gather local IPs
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('ping');
        pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(console.warn);
        
        pc.onicecandidate = (e) => {
        if (e.candidate) {
            const ipMatch = e.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (ipMatch) {
            const ip = ipMatch[0];
            if ((ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) && !this.peers.find(p => p.id === ip)) {
                // Simulate RSSI based on local network (better = closer)
                const rssi = -Math.random() * 40 - 30;
                this.addPeer({
                id: ip,
                name: `Local: ${ip}`,
                rssi: rssi,
                source: 'lan'
                });
            }
            }
        }
        };
        
        setTimeout(() => {
            try { pc.close(); } catch(e) {}
        }, 3000);
    } catch (_) {}
  }

  addPeer(peer) {
    if (this.peers.some(p => p.id === peer.id)) return;
    if (this.peers.length >= 20) return; // Limit displayed peers
    
    // Calculate distance from RSSI (stronger signal = closer = smaller distance)
    // RSSI range: -100 (far) to -30 (close)
    const distance = Math.min(1, Math.max(0, (peer.rssi + 100) / 70));
    peer.distance = distance;
    peer.angle = Math.random() * Math.PI * 2;
    this.peers.push(peer);
    this.updatePeersList();
  }

  updatePeersList() {
    const container = document.getElementById('radar-peers-list');
    if (!container) return;
    
    if (this.peers.length === 0) {
      container.innerHTML = '<div id="radar-bluetooth-hint" class="radar-hint">No peers found. Tap Scan to discover nearby devices.</div>';
      return;
    }
    
    container.innerHTML = this.peers.map(peer => `
      <div class="radar-peer-row" data-peer-id="${peer.id}" data-peer-name="${peer.name}" data-peer-rssi="${peer.rssi}">
        <span class="radar-peer-name">${this.escapeHtml(peer.name)}</span>
        <span class="radar-peer-rssi">${Math.round(peer.rssi)} dBm</span>
      </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.radar-peer-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.peerId;
        const name = row.dataset.peerName;
        this.showPeerDialog(id, name);
      });
    });
  }

  showPeerDialog(peerId, peerName) {
    const modal = document.createElement('div');
    modal.className = 'policy-modal radar-peer-dialog';
    modal.innerHTML = `
      <div class="policy-dialog" style="max-width: 320px;">
        <h2>${this.escapeHtml(peerName)}</h2>
        <p class="settings-note">ID: ${this.escapeHtml(peerId)}</p>
        <div class="radar-peer-actions" style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
          <button class="primary-btn" data-action="message">💬 Send Message</button>
          <button class="secondary-policy-btn" data-action="add">➕ Add to Contacts</button>
          <button class="secondary-policy-btn" data-action="close">❌ Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    const closeModal = () => modal.remove();
    
    modal.querySelector('[data-action="message"]')?.addEventListener('click', () => {
      closeModal();
      if (this.opts.onSendMessage) this.opts.onSendMessage(peerId);
    });
    
    modal.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      closeModal();
      if (this.opts.onAddContact) this.opts.onAddContact(peerId);
    });
    
    modal.querySelector('[data-action="close"]')?.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  startAnimation() {
    if (!this.canvas || !this.ctx) return;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    let lastTime = 0;
    const isLowPerf = document.documentElement.classList.contains('low-perf');

    const animate = (time) => {
      if (!this.canvas || !this.ctx) return;
      if (!this.scanning && this.peers.length === 0) return;
      
      if (isLowPerf && time - lastTime < 33) {
          this.animationId = requestAnimationFrame(animate);
          return;
      }
      lastTime = time;

      this.resizeCanvas();
      this.drawRadarBackground();
      this.drawPeers();
      this.drawSweep();
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    this.animationId = requestAnimationFrame(animate);
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect && (this.canvas.width !== rect.width || this.canvas.height !== rect.height)) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  drawRadarBackground() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.4;
    
    this.ctx.clearRect(0, 0, w, h);
    
    // Draw concentric circles
    this.ctx.strokeStyle = 'rgba(0, 255, 65, 0.2)';
    this.ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius * (i / 4), 0, Math.PI * 2);
      this.ctx.stroke();
    }
    
    // Draw crosshair
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - radius, centerY);
    this.ctx.lineTo(centerX + radius, centerY);
    this.ctx.moveTo(centerX, centerY - radius);
    this.ctx.lineTo(centerX, centerY + radius);
    this.ctx.stroke();
  }

  drawPeers() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.min(w, h) * 0.4;
    
    for (const peer of this.peers) {
      const distance = Math.min(0.95, Math.max(0.05, peer.distance || 0.5));
      const radius = maxRadius * distance;
      const angle = peer.angle;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Size based on signal strength (stronger = bigger)
      const size = 6 + (1 - distance) * 8;
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(0, 255, 65, 0.9)';
      this.ctx.fill();
      
      // Label
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '10px monospace';
      this.ctx.fillText(peer.name.substring(0, 12), x + 8, y - 4);
    }
  }

  drawSweep() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.45;
    
    this.sweepAngle = (this.sweepAngle + 0.03) % (Math.PI * 2);
    
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    this.ctx.arc(centerX, centerY, radius, this.sweepAngle - 0.3, this.sweepAngle);
    this.ctx.fillStyle = 'rgba(0, 255, 65, 0.15)';
    this.ctx.fill();
    
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    const endX = centerX + Math.cos(this.sweepAngle) * radius;
    const endY = centerY + Math.sin(this.sweepAngle) * radius;
    this.ctx.lineTo(endX, endY);
    this.ctx.strokeStyle = '#00FF41';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  stopScan() {
    this.scanning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      // Draw static empty radar
      if (this.canvas && this.ctx) {
          this.drawRadarBackground();
      }
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 20px;border-radius:20px;z-index:9999;font-size:14px;border:1px solid rgba(255,255,255,0.1);';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  activate() {
      this.isActive = true;
      if (!this.ghostMode) this.startScan();
  }

  deactivate() {
      this.isActive = false;
      this.stopScan();
  }
}
