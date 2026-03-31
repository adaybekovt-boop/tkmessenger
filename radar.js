/**
 * P2P Radar — BLE (Web Bluetooth) + local ICE discovery, canvas visualization.
 */

const GHOST_KEY = 'orbit_radar_ghost';
const MAX_PEERS = 20;
const APPEAR_MS = 420;

function hashAngle(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    const n = (h >>> 0) / 0xffffffff;
    return n * Math.PI * 2;
}

export class ProximityDiscovery {
    constructor(onPeersChange) {
        this.peers = [];
        this.scanning = false;
        this.ghostMode = false;
        this._icePc = null;
        this._iceTimer = null;
        this._seenKeys = new Set();
        this.onPeersChange = onPeersChange;
        this._loadGhost();
    }

    _loadGhost() {
        this.ghostMode = localStorage.getItem(GHOST_KEY) === '1';
    }

    setGhostMode(on) {
        this.ghostMode = !!on;
        localStorage.setItem(GHOST_KEY, on ? '1' : '0');
        if (on) this._stopScanInternal();
        this.onPeersChange?.();
    }

    getGhostMode() {
        return this.ghostMode;
    }

    getPeers() {
        return this.peers;
    }

    _trimPeers() {
        while (this.peers.length > MAX_PEERS) {
            const removed = this.peers.shift();
            if (removed) this._seenKeys.delete(removed.peerKey);
        }
    }

    rssiToDistance(rssi) {
        const normalized = Math.min(1, Math.max(0, (rssi + 100) / 100));
        return normalized;
    }

    addPeer(name, rssi, stableKey) {
        const peerKey = stableKey || name;
        const idx = this.peers.findIndex((p) => p.peerKey === peerKey);
        const distance = this.rssiToDistance(rssi);
        const angle = hashAngle(peerKey);
        const now = performance.now();
        if (idx >= 0) {
            const prev = this.peers[idx];
            this.peers[idx] = {
                ...prev,
                name,
                peerId: name,
                rssi,
                distance,
                angle,
                updatedAt: now
            };
        } else {
            if (!this._seenKeys.has(peerKey) && this.peers.length >= MAX_PEERS) {
                const oldest = this.peers.shift();
                if (oldest) this._seenKeys.delete(oldest.peerKey);
            }
            const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            this.peers.push({
                id,
                peerKey,
                peerId: name,
                name,
                rssi,
                distance,
                angle,
                appearAt: now,
                appearProgress: 0,
                updatedAt: now
            });
            this._seenKeys.add(peerKey);
        }
        this._trimPeers();
        this.onPeersChange?.();
    }

    _stopScanInternal() {
        this.scanning = false;
        if (this._icePc) {
            try {
                this._icePc.close();
            } catch (_) {}
            this._icePc = null;
        }
        if (this._iceTimer) {
            clearTimeout(this._iceTimer);
            this._iceTimer = null;
        }
    }

    disposeScan() {
        this._stopScanInternal();
    }

    scanLocalNetwork() {
        if (this.ghostMode) return;
        try {
            const pc = new RTCPeerConnection({ iceServers: [] });
            this._icePc = pc;
            pc.createDataChannel('ping');
            pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {});
            pc.onicecandidate = (e) => {
                if (!e.candidate || this.ghostMode) return;
                const m = e.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                const ip = m && m[0];
                if (ip && (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip))) {
                    const label = `Local: ${ip}`;
                    this.addPeer(label, -40 - Math.random() * 35, `lan:${ip}`);
                }
            };
            this._iceTimer = setTimeout(() => {
                this._iceTimer = null;
                try {
                    pc.close();
                } catch (_) {}
                if (this._icePc === pc) this._icePc = null;
            }, 3000);
        } catch (_) {}
    }

    async startScan(bluetoothSupported) {
        if (this.ghostMode) return;
        this.scanning = true;

        if (bluetoothSupported && navigator.bluetooth) {
            try {
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['generic_access']
                });
                const label = device.name || device.id || 'BLE device';
                this.addPeer(label, -30 - Math.random() * 50, `ble:${device.id}`);
            } catch (e) {
                console.log('Bluetooth not available or denied', e);
            }
        }

        this.scanLocalNetwork();
        this.scanning = false;
        this.onPeersChange?.();
    }

    updateAppearAnimations(now) {
        let changed = false;
        for (const p of this.peers) {
            const t = Math.min(1, (now - p.appearAt) / APPEAR_MS);
            if (t !== p.appearProgress) {
                p.appearProgress = t;
                changed = true;
            }
        }
        return changed;
    }
}

class RadarCanvas {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {() => ProximityDiscovery} getDiscovery
     */
    constructor(canvas, getDiscovery) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.getDiscovery = getDiscovery;
        this.sweepAngle = 0;
        this.running = false;
        this._raf = null;
        this.lastTs = 0;
        this._resizeObs = null;
        this._onResize = () => this.resize();
        this.resize();
        if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
            this._resizeObs = new ResizeObserver(this._onResize);
            this._resizeObs.observe(canvas.parentElement);
        } else {
            window.addEventListener('resize', this._onResize, { passive: true });
        }
    }

    resize() {
        const canvas = this.canvas;
        const parent = canvas.parentElement;
        if (!parent) return;
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTs = 0;
        const loop = (ts) => {
            if (!this.running) return;
            const prev = this.lastTs || ts;
            const dt = Math.min(0.05, (ts - prev) / 1000);
            this.lastTs = ts;
            this.sweepAngle += dt * 1.8;
            if (this.sweepAngle > Math.PI * 2) this.sweepAngle -= Math.PI * 2;

            const disc = this.getDiscovery();
            disc.updateAppearAnimations(ts);

            this.draw();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
        this.lastTs = 0;
    }

    destroy() {
        this.stop();
        if (this._resizeObs) {
            this._resizeObs.disconnect();
            this._resizeObs = null;
        } else {
            window.removeEventListener('resize', this._onResize);
        }
    }

    draw() {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w < 2 || h < 2) return;

        const cx = w / 2;
        const cy = h / 2;
        const R = Math.min(w, h) * 0.42;

        ctx.clearRect(0, 0, w, h);

        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00FF41';
        const muted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8899aa';

        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            const r = (R * i) / 4;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - R, cy);
        ctx.lineTo(cx + R, cy);
        ctx.moveTo(cx, cy - R);
        ctx.lineTo(cx, cy + R);
        ctx.stroke();
        ctx.globalAlpha = 1;

        const sweep = this.sweepAngle;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        grad.addColorStop(0, `${accent}33`);
        grad.addColorStop(1, `${accent}00`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, sweep - 0.55, sweep + 0.05);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
        ctx.stroke();
        ctx.globalAlpha = 1;

        const disc = this.getDiscovery();
        const peers = disc.getPeers();
        const maxR = R * 0.88;

        for (const p of peers) {
            const dist = (1 - p.distance) * maxR;
            const px = cx + Math.cos(p.angle) * dist;
            const py = cy + Math.sin(p.angle) * dist;
            const ap = p.appearProgress ?? 1;
            const scale = 0.3 + ap * 0.7;
            ctx.globalAlpha = ap;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(px, py, 7 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;

            p._lastPx = px;
            p._lastPy = py;
            p._lastR = 12;
        }
    }
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLElement} opts.peersListEl
 * @param {HTMLButtonElement} opts.scanBtn
 * @param {HTMLButtonElement} opts.ghostBtn
 * @param {HTMLElement | null} opts.hintEl
 * @param {HTMLElement} opts.modal
 * @param {HTMLElement} opts.modalTitle
 * @param {HTMLElement} opts.modalMeta
 * @param {HTMLButtonElement} opts.modalSend
 * @param {HTMLButtonElement} opts.modalAdd
 * @param {HTMLButtonElement} opts.modalClose
 * @param {(peer: { peerId: string, name: string }) => void} opts.onSendMessage
 * @param {(peer: { peerId: string, name: string }) => void} opts.onAddContact
 */
export function mountRadar(opts) {
    const {
        canvas,
        peersListEl,
        scanBtn,
        ghostBtn,
        hintEl,
        modal,
        modalTitle,
        modalMeta,
        modalSend,
        modalAdd,
        modalClose,
        onSendMessage,
        onAddContact
    } = opts;

    const discovery = new ProximityDiscovery(() => {
        renderPeersList();
        if (radarCanvas) radarCanvas.draw();
    });

    let radarCanvas = new RadarCanvas(canvas, () => discovery);
    let active = false;
    let selectedPeer = null;

    const bluetoothSupported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

    function setHint() {
        if (!hintEl) return;
        if (!bluetoothSupported) {
            hintEl.style.display = 'block';
            hintEl.textContent = 'Bluetooth not supported. Using local network discovery only.';
        } else {
            hintEl.style.display = 'none';
        }
    }

    function renderPeersList() {
        peersListEl.replaceChildren();
        const peers = discovery.getPeers();
        for (const p of peers) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'radar-peer-row';
            row.innerHTML = `<span class="radar-peer-name">${escapeHtml(p.name)}</span><span class="radar-peer-rssi">${Math.round(p.rssi)} dBm</span>`;
            row.addEventListener('click', () => openPeerModal(p));
            peersListEl.appendChild(row);
        }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function openPeerModal(p) {
        selectedPeer = p;
        modalTitle.textContent = p.name;
        modalMeta.textContent = `Signal: ${Math.round(p.rssi)} dBm · ${p.peerId}`;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    }

    function closePeerModal() {
        selectedPeer = null;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    function syncGhostButton() {
        const on = discovery.getGhostMode();
        ghostBtn.textContent = on ? '👻 Ghost Mode: ON' : '👻 Ghost Mode: OFF';
        ghostBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        scanBtn.disabled = on;
    }

    function onScanClick() {
        if (discovery.getGhostMode()) return;
        void discovery.startScan(bluetoothSupported);
    }

    function onGhostClick() {
        discovery.setGhostMode(!discovery.getGhostMode());
        syncGhostButton();
    }

    function onCanvasClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const peers = discovery.getPeers();
        for (const p of peers) {
            if (p._lastPx == null) continue;
            const dx = x - p._lastPx;
            const dy = y - p._lastPy;
            if (dx * dx + dy * dy <= (p._lastR || 14) ** 2) {
                openPeerModal(p);
                return;
            }
        }
    }

    scanBtn.addEventListener('click', onScanClick);
    ghostBtn.addEventListener('click', onGhostClick);
    modalSend.addEventListener('click', () => {
        if (selectedPeer) onSendMessage({ peerId: selectedPeer.peerId, name: selectedPeer.name });
        closePeerModal();
    });
    modalAdd.addEventListener('click', () => {
        if (selectedPeer) onAddContact({ peerId: selectedPeer.peerId, name: selectedPeer.name });
        closePeerModal();
    });
    modalClose.addEventListener('click', closePeerModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePeerModal();
    });
    canvas.addEventListener('click', onCanvasClick);

    syncGhostButton();
    setHint();

    return {
        activate() {
            active = true;
            setHint();
            radarCanvas.resize();
            radarCanvas.start();
        },
        deactivate() {
            active = false;
            radarCanvas.stop();
            discovery.disposeScan();
        },
        isActive() {
            return active;
        },
        dispose() {
            canvas.removeEventListener('click', onCanvasClick);
            scanBtn.removeEventListener('click', onScanClick);
            ghostBtn.removeEventListener('click', onGhostClick);
            radarCanvas.destroy();
            radarCanvas = null;
            discovery.disposeScan();
        }
    };
}
