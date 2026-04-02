/**
 * Radar: real online peers from active DataChannels + optional ID prefix filter,
 * profile handshake (orbit_profile_req/res), OffscreenCanvas sonar in radarWorker.
 */

const HANDSHAKE_TIMEOUT_MS = 7000;
const CONNECT_TIMEOUT_MS = 12000;

function readAccentRgb() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--tg-accent').trim();
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  const hex = v.replace('#', '');
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  return { r: 91, g: 155, b: 213 };
}

function passesPrefix(id, prefix) {
  if (!prefix || !String(prefix).trim()) return true;
  return String(id).startsWith(String(prefix).trim());
}

function requestProfileOverConn(conn, remoteId) {
  return new Promise((resolve, reject) => {
    const nonce = (Date.now() << 8) + ((Math.random() * 256) | 0);
    const to = setTimeout(() => {
      window.removeEventListener('orbit-profile-res', onRes);
      reject(new Error('timeout'));
    }, HANDSHAKE_TIMEOUT_MS);

    function onRes(ev) {
      const d = ev.detail;
      if (!d || d.from !== remoteId || d.nonce !== nonce) return;
      clearTimeout(to);
      window.removeEventListener('orbit-profile-res', onRes);
      resolve(d.profile || {});
    }

    window.addEventListener('orbit-profile-res', onRes);
    try {
      if (!conn?.open) {
        clearTimeout(to);
        window.removeEventListener('orbit-profile-res', onRes);
        reject(new Error('closed'));
        return;
      }
      conn.send({ type: 'orbit_profile_req', nonce });
    } catch (err) {
      clearTimeout(to);
      window.removeEventListener('orbit-profile-res', onRes);
      reject(err);
    }
  });
}

export class Radar {
  constructor(options) {
    this.options = options;
    this.view = document.getElementById('radar-view');
    this.canvas = document.getElementById('radar-canvas');
    this.listEl = document.getElementById('radar-results-list');
    this.statusEl = document.getElementById('radar-status');
    this.btn = document.getElementById('radar-scan-btn');
    this.manualInput = document.getElementById('radar-manual-id');
    this.lookupBtn = document.getElementById('radar-lookup-btn');
    this.active = false;
    this.worker = null;
    this._useWorker = false;
    this._scanning = false;
    this._fadeTimer = null;
    this._peerMeta = new Map();

    if (this.btn) this.btn.addEventListener('click', () => this.scan());
    if (this.lookupBtn) {
      this.lookupBtn.addEventListener('click', () => this.manualLookup());
    }
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text || '';
  }

  _initWorker() {
    const canvas = this.canvas;
    if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') {
      console.warn('[Radar] OffscreenCanvas not available; sonar static.');
      return;
    }
    try {
      this.worker = new Worker(new URL('../workers/radarWorker.js', import.meta.url), { type: 'module' });
      const off = canvas.transferControlToOffscreen();
      const rect = canvas.getBoundingClientRect();
      const ww = Math.max(160, (rect.width || 280) | 0);
      const hh = Math.max(160, (rect.height || 280) | 0);
      this.worker.postMessage(
        {
          type: 'init',
          canvas: off,
          width: ww,
          height: hh,
          accent: readAccentRgb()
        },
        [off]
      );
      this._useWorker = true;
    } catch (e) {
      console.warn('[Radar] Worker failed', e);
      this.worker = null;
    }
  }

  _resizeWorker() {
    if (!this._useWorker || !this.worker || !this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    const ww = Math.max(160, (r.width || 280) | 0);
    const hh = Math.max(160, (r.height || 280) | 0);
    this.worker.postMessage({ type: 'resize', width: ww, height: hh });
    this.worker.postMessage({ type: 'accent', accent: readAccentRgb() });
  }

  _startSonar() {
    if (this._useWorker && this.worker) {
      this._resizeWorker();
      this.worker.postMessage({ type: 'start' });
    }
  }

  _stopSonar() {
    if (this._useWorker && this.worker) this.worker.postMessage({ type: 'stop' });
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  _updateBlips(peerIds) {
    if (!this._useWorker || !this.worker) return;
    const n = peerIds.length;
    const blips = peerIds.map((id, i) => ({
      angle: (i / Math.max(n, 1)) * Math.PI * 2 + i * 0.15,
      r: 0.38 + (i % 4) * 0.06,
      fade: 0
    }));
    this.worker.postMessage({ type: 'setBlips', blips });
    if (this._fadeTimer) clearInterval(this._fadeTimer);
    this._fadeTimer = setInterval(() => {
      if (this.worker) this.worker.postMessage({ type: 'tickFade' });
    }, 50);
  }

  activate() {
    if (this.view) this.view.style.display = 'flex';
    this.active = true;
    if (!this.worker && this.canvas?.transferControlToOffscreen) this._initWorker();
    this._startSonar();
    requestAnimationFrame(() => this._resizeWorker());
  }

  deactivate() {
    if (this.view) this.view.style.display = 'none';
    this.active = false;
    this._stopSonar();
    this._scanning = false;
  }

  dispose() {
    this._stopSonar();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (_) { /* ignore */ }
      this.worker = null;
      this._useWorker = false;
    }
  }

  async scan() {
    if (!this.listEl || this._scanning) return;
    const peer = this.options.getPeer?.();
    if (!peer?.open) {
      this._setStatus('Connect to the network first (log in).');
      return;
    }

    this._scanning = true;
    this.listEl.innerHTML = '';
    this._setStatus('Scanning online contacts…');
    this._peerMeta.clear();

    const prefix = this.options.getRadarPrefix?.() ?? localStorage.getItem('orbit_radar_prefix') ?? '';
    const friends = this.options.getFriends?.() || [];
    const blocked = this.options.getBlockedPeers?.() || [];
    const conns = this.options.getActiveConnections?.() || {};

    const candidates = friends
      .map((f) => f.id)
      .filter((id) => !blocked.includes(id))
      .filter((id) => passesPrefix(id, prefix))
      .filter((id) => conns[id]?.open);

    this._updateBlips(candidates);

    const found = [];
    for (let i = 0; i < candidates.length; i++) {
      const id = candidates[i];
      try {
        const profile = await requestProfileOverConn(conns[id], id);
        this._peerMeta.set(id, profile);
        found.push({ id, profile });
        if (this.worker) this.worker.postMessage({ type: 'pulse' });
        this._appendResultRow(id, profile);
      } catch {
        found.push({ id, profile: {} });
        this._appendResultRow(id, {});
      }
    }

    if (found.length === 0) {
      this._setStatus(
        prefix
          ? `No online contacts match prefix “${prefix}”. Try Scan without filter or add friends.`
          : 'No online contacts. Add friends — only connected peers appear here.'
      );
      this._updateBlips([]);
    } else {
      this._setStatus(`${found.length} online`);
    }

    this._scanning = false;
  }

  _appendResultRow(peerId, profile) {
    if (!this.listEl) return;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'radar-peer-chip';
    const label = profile.displayName ? `${profile.displayName} (${peerId})` : peerId;
    row.textContent = label;
    row.addEventListener('click', () => this.openPeerModal(peerId, profile));
    this.listEl.appendChild(row);
    requestAnimationFrame(() => row.classList.add('radar-peer-chip-visible'));
  }

  openPeerModal(peerId, profile = {}) {
    const meta = this._peerMeta.get(peerId) || profile;
    const idEl = document.getElementById('nearby-peer-id');
    const nameRow = document.getElementById('nearby-peer-name-row');
    const nameEl = document.getElementById('nearby-peer-displayname');
    const trustEl = document.getElementById('nearby-peer-trust');

    if (idEl) idEl.textContent = peerId;

    const dn = meta.displayName || '';
    if (nameRow && nameEl) {
      if (dn) {
        nameEl.textContent = dn;
        nameRow.style.display = '';
        nameRow.hidden = false;
      } else {
        nameEl.textContent = '';
        nameRow.style.display = 'none';
        nameRow.hidden = true;
      }
    }

    if (trustEl && this.options.getTrustBadgeData) {
      const t = this.options.getTrustBadgeData(peerId);
      trustEl.textContent = t.text || '';
      trustEl.className = `trust-badge ${t.className || 'trust-neutral'}`;
      trustEl.style.display = t.text ? 'inline-block' : 'none';
    }

    const modal = document.getElementById('nearby-peer-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.removeAttribute('aria-hidden');
    }
  }

  async manualLookup() {
    const raw = this.manualInput?.value?.trim();
    if (!raw) {
      this._setStatus('Enter a peer ID.');
      return;
    }
    const peer = this.options.getPeer?.();
    if (!peer?.open) {
      this._setStatus('Not connected.');
      return;
    }
    if (this.options.getBlockedPeers?.().includes(raw)) {
      this._setStatus('Peer is blocked.');
      return;
    }

    this._setStatus('Connecting…');
    const openFn = this.options.openConnectionForDiscovery;
    if (typeof openFn !== 'function') {
      this._setStatus('Discovery unavailable.');
      return;
    }

    try {
      const conn = await openFn(raw);
      const profile = await requestProfileOverConn(conn, raw);
      this._peerMeta.set(raw, profile);
      if (this.worker) this.worker.postMessage({ type: 'pulse' });
      this._updateBlips([raw]);
      this.openPeerModal(raw, profile);
      this._setStatus('Profile received');
    } catch (e) {
      this._setStatus(e?.message === 'timeout' ? 'Timeout — peer offline or ID wrong.' : 'Could not reach peer.');
      this.options.showToast?.('Lookup failed');
    }
  }
}
