/**
 * Orbits Drop — High-Bandwidth P2P File Transfer Engine.
 *
 * Handles file transfers with compression, chunked streaming,
 * backpressure control, SHA-256 integrity, and sequence numbers.
 *
 * Sender uses ReadableStream + async iteration (no FileReader callbacks).
 * Receiver assembles chunks in-order and verifies hash on completion.
 */

export class OrbitsDrop {
  constructor() {
    this.CHUNK_SIZE = 65536;       // 64 KB per chunk
    this.MAX_BUFFER_SIZE = 1048576; // 1 MB — pause sending above this

    // Receiver: fileId → { chunks, totalSize, receivedBytes, metadata, ... }
    this.incomingFiles = new Map();
    // Sender:  fileId → { statusMsgId, aborted, lastSentSeq }
    this.outgoingTransfers = new Map();

    // UI callbacks
    this.onProgressUpdate = null;   // (msgId, percent, statusText) => {}
    this.onFileReady = null;        // (msgId, fileUrl, metadata) => {}
    this.onTransferComplete = null; // (msgId) => {}
    this.onTransferFailed = null;   // (msgId, error) => {}
  }

  // ── Compression ──────────────────────────────────────────────────

  async compressImage(file, qualitySetting) {
    if (!file.type.match(/image\/(jpeg|png|webp)/i) || qualitySetting === 'original') {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let w = img.width;
        let h = img.height;
        let quality = 0.9;

        const maxDim = qualitySetting === 'high' ? 1920 : 1080;
        quality = qualitySetting === 'high' ? 0.85 : 0.6;

        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else       { w = Math.round((w * maxDim) / h); h = maxDim; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        const outType = (file.type === 'image/png' && qualitySetting === 'high')
          ? 'image/png' : 'image/jpeg';

        canvas.toBlob((blob) => {
          resolve(blob && blob.size < file.size ? blob : file);
        }, outType, quality);
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ── SHA-256 ──────────────────────────────────────────────────────

  async computeHash(data) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── Sender ───────────────────────────────────────────────────────

  /**
   * Wait until the DataChannel buffer drains below threshold.
   * Returns immediately if there's no backpressure.
   */
  _waitForDrain(dc) {
    if (!dc || dc.bufferedAmount <= this.MAX_BUFFER_SIZE) return Promise.resolve();
    return new Promise((resolve) => {
      dc.bufferedAmountLowThreshold = this.MAX_BUFFER_SIZE / 2;
      const onLow = () => { dc.removeEventListener('bufferedamountlow', onLow); resolve(); };
      dc.addEventListener('bufferedamountlow', onLow);
    });
  }

  /**
   * Stream a file in chunks over a PeerJS DataConnection.
   *
   * Uses File.stream() + async iteration — no FileReader, no recursion.
   */
  async sendFile(file, conn, statusMsgId, fileId = crypto.randomUUID(), resumeFromSeq = 0) {
    if (!conn || !conn.open) throw new Error('Connection not open');

    let fileHash = '';
    try { fileHash = await this.computeHash(file); } catch (_) {}

    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    const dc = conn.dataChannel || null;

    this.outgoingTransfers.set(fileId, { statusMsgId, aborted: false, lastSentSeq: resumeFromSeq });

    // Send metadata
    conn.send({
      type: 'file-start',
      fileId,
      name: file.name || 'orbits_drop_file',
      size: file.size,
      mime: file.type || 'application/octet-stream',
      msgId: statusMsgId,
      hash: fileHash,
      totalChunks,
      resumeFromSeq,
    });

    // Stream chunks
    let seq = 0;
    let offset = 0;
    const skipBytes = resumeFromSeq * this.CHUNK_SIZE;

    // Use File.stream() where available, fallback to slice-based iteration
    const reader = typeof file.stream === 'function'
      ? file.stream().getReader()
      : null;

    try {
      if (reader) {
        // ── ReadableStream path ──────────────────────────────────
        let carry = new Uint8Array(0);

        while (true) {
          const state = this.outgoingTransfers.get(fileId);
          if (!state || state.aborted) throw new Error('Transfer aborted');

          const { done, value } = await reader.read();
          if (done) break;

          // Merge leftover from previous read with new data
          const merged = carry.byteLength > 0
            ? concatBuffers(carry, value)
            : value;
          carry = new Uint8Array(0);

          let pos = 0;
          while (pos + this.CHUNK_SIZE <= merged.byteLength) {
            const chunk = merged.slice(pos, pos + this.CHUNK_SIZE);
            pos += this.CHUNK_SIZE;

            if (offset < skipBytes) { offset += chunk.byteLength; seq++; continue; }

            await this._waitForDrain(dc);
            conn.send({ type: 'file-chunk', fileId, seq, data: chunk.buffer });

            const xferState = this.outgoingTransfers.get(fileId);
            if (xferState) xferState.lastSentSeq = seq;

            offset += chunk.byteLength;
            seq++;

            if (this.onProgressUpdate) {
              this.onProgressUpdate(statusMsgId, Math.floor((offset / file.size) * 100), 'Sending...');
            }
          }

          // Keep remainder for next iteration
          if (pos < merged.byteLength) {
            carry = merged.slice(pos);
          }
        }

        // Flush leftover bytes as final chunk
        if (carry.byteLength > 0) {
          if (offset >= skipBytes) {
            await this._waitForDrain(dc);
            conn.send({ type: 'file-chunk', fileId, seq, data: carry.buffer });
            const xferState = this.outgoingTransfers.get(fileId);
            if (xferState) xferState.lastSentSeq = seq;
          }
          offset += carry.byteLength;
          seq++;
        }
      } else {
        // ── Slice fallback (older browsers) ──────────────────────
        while (offset < file.size) {
          const state = this.outgoingTransfers.get(fileId);
          if (!state || state.aborted) throw new Error('Transfer aborted');

          if (offset < skipBytes) { offset += this.CHUNK_SIZE; seq++; continue; }

          const slice = file.slice(offset, offset + this.CHUNK_SIZE);
          const chunk = await slice.arrayBuffer();

          await this._waitForDrain(dc);
          conn.send({ type: 'file-chunk', fileId, seq, data: chunk });

          const xferState = this.outgoingTransfers.get(fileId);
          if (xferState) xferState.lastSentSeq = seq;

          offset += chunk.byteLength;
          seq++;

          if (this.onProgressUpdate) {
            this.onProgressUpdate(statusMsgId, Math.floor((offset / file.size) * 100), 'Sending...');
          }
        }
      }
    } finally {
      reader?.releaseLock?.();
    }

    // Send completion
    conn.send({ type: 'file-end', fileId });
    this.outgoingTransfers.delete(fileId);
    if (this.onTransferComplete) this.onTransferComplete(statusMsgId);
  }

  abortTransfer(fileId) {
    const state = this.outgoingTransfers.get(fileId);
    if (!state) return false;
    state.aborted = true;
    return true;
  }

  getResumeInfo(fileId) {
    const state = this.incomingFiles.get(fileId);
    return state ? { lastSeq: state.lastSeq } : null;
  }

  // ── Receiver ─────────────────────────────────────────────────────

  handleIncomingPacket(packet) {
    if (!packet?.type) return false;
    switch (packet.type) {
      case 'file-start': this._handleFileStart(packet); return true;
      case 'file-chunk': this._handleFileChunk(packet); return true;
      case 'file-end':   this._handleFileEnd(packet);   return true;
      default: return false;
    }
  }

  _handleFileStart(meta) {
    this.incomingFiles.set(meta.fileId, {
      chunks: new Map(),
      totalSize: meta.size,
      totalChunks: meta.totalChunks || Math.ceil(meta.size / this.CHUNK_SIZE),
      receivedBytes: 0,
      metadata: meta,
      statusMsgId: meta.msgId,
      expectedHash: meta.hash || '',
      lastSeq: -1,
    });
    this.onProgressUpdate?.(meta.msgId, 0, 'Receiving...');
  }

  _handleFileChunk(packet) {
    const state = this.incomingFiles.get(packet.fileId);
    if (!state) return;

    const seq = packet.seq ?? state.chunks.size;
    if (state.chunks.has(seq)) return; // dedup

    state.chunks.set(seq, packet.data);
    state.receivedBytes += packet.data.byteLength;
    if (seq > state.lastSeq) state.lastSeq = seq;

    this.onProgressUpdate?.(
      state.metadata.msgId,
      Math.floor((state.receivedBytes / state.totalSize) * 100),
      'Receiving...'
    );
  }

  async _handleFileEnd(packet) {
    const state = this.incomingFiles.get(packet.fileId);
    if (!state) return;

    try {
      const sorted = Array.from(state.chunks.keys()).sort((a, b) => a - b);
      const blob = new Blob(sorted.map((s) => state.chunks.get(s)), { type: state.metadata.mime });
      const msgId = state.metadata.msgId;

      // Integrity check
      if (state.expectedHash) {
        const actual = await this.computeHash(blob);
        if (actual !== state.expectedHash) {
          this.incomingFiles.delete(packet.fileId);
          const err = new Error(
            `Integrity check failed: expected ${state.expectedHash.slice(0, 12)}..., got ${actual.slice(0, 12)}...`
          );
          err.code = 'INTEGRITY';
          this.onTransferFailed?.(msgId, err);
          return;
        }
      }

      this.incomingFiles.delete(packet.fileId);
      const url = URL.createObjectURL(blob);
      this.onFileReady?.(msgId, url, state.metadata);
      this.onTransferComplete?.(msgId);
    } catch (err) {
      this.onTransferFailed?.(state.metadata.msgId, err);
      this.incomingFiles.delete(packet.fileId);
    }
  }

  // ── Download helper ──────────────────────────────────────────────

  static triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function concatBuffers(a, b) {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a instanceof Uint8Array ? a : new Uint8Array(a), 0);
  out.set(b instanceof Uint8Array ? b : new Uint8Array(b), a.byteLength);
  return out;
}
