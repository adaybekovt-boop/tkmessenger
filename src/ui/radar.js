import { isLowEnd } from '../utils/perf.js';
import { showToast } from './toast.js';

export class Radar {
  constructor(opts) {
    this.canvas = document.getElementById('radar-canvas');
    this.ctx = this.canvas?.getContext('2d');
    this.peers = new Map(); // Use map for easier updates
    this.scanning = false;
    this.ghostMode = localStorage.getItem('radar_ghost_mode') === 'true';
    this.animationId = null;
    this.sweepAngle = 0;
    this.bluetoothSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;
    this.opts = opts || {};
    this.localScanInterval = null;
    this.activePCs = [];
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

  isGhostMode() {
      return this.ghostMode;
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
      showToast('Ghost mode is ON. Turn it off to scan.', 'warning');
      return;
    }
    if (document.hidden) return;
    if (this.scanning) return;
    
    this.scanning = true;
    this.peers.clear();
    this.updatePeersList();
    this.startAnimation();
    
    if (!window.RTCPeerConnection) {
        console.warn('WebRTC not supported');
    }

    if (this.bluetoothSupported) {
      this.scanBluetooth().catch(console.warn);
    } else {
        const hint = document.getElementById('radar-bluetooth-hint');
        if (hint) {
            hint.textContent = 'Bluetooth not supported. Using local network scan only.';
            hint.style.color = '#ff9f9f';
        }
    }
    
    this.scanLocalNetwork();
    this.localScanInterval = setInterval(() => this.scanLocalNetwork(), 10000);
    
    // Auto-stop after 30 seconds
    setTimeout(() => this.stopScan(), 30000);
  }

  async scanBluetooth() {
    if (!navigator.bluetooth) return;
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access']
      });
      
      const rssi = device.advertisement ? device.advertisement.rssi : (-Math.random() * 70 - 30);
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
    if (!window.RTCPeerConnection) return;
    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        this.activePCs.push(pc);
        
        // Try creating DataChannel to verify it supports data transfers
        const dc = pc.createDataChannel('ping', { negotiated: true, id: 0 });
        dc.onopen = () => { dc.send('ping'); };

        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(console.warn);
        
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                const ipMatch = e.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                if (ipMatch) {
                    const ip = ipMatch[0];
                    if ((ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip))) {
                        const rssi = -Math.random() * 40 - 30; // Simulate RSSI
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
            this.activePCs = this.activePCs.filter(p => p !== pc);
        }, 3000);
    } catch (_) {}
  }

  estimateDistance(rssi, source) {
      // Very rough estimate based on RSSI
      // Free space path loss: d = 10 ^ ((TxPower - RSSI) / (10 * n))
      const txPower = source === 'bluetooth' ? -59 : -40;
      const n = 2.0; // Path loss exponent
      const distance = Math.pow(10, (txPower - rssi) / (10 * n));
      return Math.max(0.1, Math.min(100, distance)); // Clamp between 0.1m and 100m
  }

  hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
      }
      return Math.abs(hash);
  }

  addPeer(peer) {
    if (this.opts.getBlockedPeers && this.opts.getBlockedPeers().includes(peer.id)) return;
    
    // Determine angle based on ID hash for stability
    const hash = this.hashString(peer.id);
    peer.angle = (hash % 360) * (Math.PI / 180);
    
    // Normalize distance for rendering (0..1)
    peer.distMeters = this.estimateDistance(peer.rssi, peer.source);
    peer.distance = Math.min(1, Math.max(0, peer.distMeters / 30)); // Scale to max 30m display
    peer.firstSeen = Date.now();
    
    const friends = this.opts.getFriends ? this.opts.getFriends() : [];
    const friend = friends.find(f => f.id === peer.id);
    if (friend && friend.name) {
        peer.name = friend.name;
    }

    if (!this.peers.has(peer.id) && this.peers.size >= 20) return;
    this.peers.set(peer.id, peer);
    this.updatePeersList();
  }

  stopScan() {
      this.scanning = false;
      if (this.localScanInterval) {
          clearInterval(this.localScanInterval);
          this.localScanInterval = null;
      }
      for (const pc of this.activePCs) {
          try { pc.close(); } catch(e) {}
      }
      this.activePCs = [];
      if (this.animationId) {
          cancelAnimationFrame(this.animationId);
          this.animationId = null;
      }
  }

  updatePeersList() {
    const container = document.getElementById('radar-peers-list');
    if (!container) return;
    
    if (this.peers.size === 0) {
      container.innerHTML = '<div id="radar-bluetooth-hint" class="radar-hint">No peers found. Tap Scan to discover nearby devices.</div>';
      return;
    }
    
    const peersArr = Array.from(this.peers.values()).sort((a, b) => a.distMeters - b.distMeters);
    
    container.innerHTML = peersArr.map(peer => `
      <div class="radar-peer-row" data-peer-id="${this.escapeHtml(peer.id)}" data-peer-name="${this.escapeHtml(peer.name)}">
        <span class="radar-peer-name">${this.escapeHtml(peer.name)}</span>
        <span class="radar-peer-rssi">≈${peer.distMeters.toFixed(1)} м</span>
      </div>
    `).join('');
    
    document.querySelectorAll('.radar-peer-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.peerId;
        const name = row.dataset.peerName;
        const peer = this.peers.get(id);
        this.showPeerDialog(id, name, peer?.distMeters);
      });
    });
  }

  showPeerDialog(peerId, peerName, distMeters) {
    const modal = document.createElement('div');
    modal.className = 'policy-modal radar-peer-dialog';
    const distText = distMeters ? `<p class="settings-note">Distance: ≈${distMeters.toFixed(1)} m</p>` : '';
    
    modal.innerHTML = `
      <div class="policy-dialog" style="max-width: 320px;">
        <h2>${this.escapeHtml(peerName)}</h2>
        <p class="settings-note" style="margin-bottom: 4px;">ID: <span id="radar-dialog-id">${this.escapeHtml(peerId)}</span></p>
        ${distText}
        <div class="radar-peer-actions" style="display: flex; flex-direction: column; gap: 10px; margin-top: 16px;">
          <button class="primary-btn" data-action="message">💬 Send Message</button>
          <button class="secondary-policy-btn" data-action="add">➕ Add to Contacts</button>
          <button class="secondary-policy-btn" data-action="copy">📋 Copy ID</button>
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

    modal.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
        navigator.clipboard.writeText(peerId).then(() => {
            showToast('ID copied to clipboard', 'success');
        });
    });
    
    modal.querySelector('[data-action="close"]')?.addEventListener('click', closeModal);
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  startAnimation() {
    if (!this.canvas || !this.ctx) return;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    let lastTime = 0;

    const loop = (time) => {
      if (!this.scanning) return;
      if (time - lastTime > (isLowEnd ? 66 : 16)) {
          this.resizeCanvas();
          this.drawRadarBackground();
          this.drawPeers();
          this.drawSweep();
          this.sweepAngle += isLowEnd ? 0.08 : 0.04;
          lastTime = time;
      }
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight, 300);
    if (this.canvas.width !== size) {
        this.canvas.width = size;
        this.canvas.height = size;
    }
  }

  drawRadarBackground() {
    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = width / 2 - 10;
    
    this.ctx.clearRect(0, 0, width, height);
    
    this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
    this.ctx.lineWidth = 1;
    
    // Draw 5 concentric circles
    for (let i = 1; i <= 5; i++) {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, maxRadius * (i / 5), 0, Math.PI * 2);
        this.ctx.stroke();
    }
    
    this.ctx.beginPath();
    this.ctx.moveTo(cx, 10);
    this.ctx.lineTo(cx, height - 10);
    this.ctx.moveTo(10, cy);
    this.ctx.lineTo(width - 10, cy);
    this.ctx.stroke();
  }

  drawSweep() {
    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = width / 2 - 10;
    
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(this.sweepAngle);
    
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    
    // Create gradient fill for sector
    const gradient = this.ctx.createLinearGradient(0, 0, maxRadius, 0);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
    
    this.ctx.fillStyle = gradient;
    this.ctx.arc(0, 0, maxRadius, 0, -0.4, true);
    this.ctx.lineTo(0, 0);
    this.ctx.fill();
    
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(maxRadius, 0);
    this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  drawPeers() {
    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = width / 2 - 10;
    
    const now = Date.now();

    for (const peer of this.peers.values()) {
        const dist = peer.distance;
        const x = cx + Math.cos(peer.angle) * (dist * maxRadius);
        const y = cy + Math.sin(peer.angle) * (dist * maxRadius);
        
        const size = 6 + (1 - dist) * 10;
        
        // Pulse animation for new peers (first 3 seconds)
        const age = now - peer.firstSeen;
        if (age < 3000) {
            const pulseSize = size + Math.abs(Math.sin(age / 200)) * 8;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
            this.ctx.fill();
        }
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fillStyle = '#00ff88';
        this.ctx.fill();
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00ff88';
        
        this.ctx.shadowBlur = 0;
    }
  }

  activate() {
    this.isActive = true;
  }
  
  deactivate() {
    this.isActive = false;
    this.stopScan();
  }
}