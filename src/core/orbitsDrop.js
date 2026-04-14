/**
 * Orbits Drop - High-Bandwidth P2P File Transfer Module
 * Handles massive file transfers with compression, chunking, buffer control,
 * SHA-256 integrity verification, sequence numbers, and resumable transfers.
 * Strictly Zero-Server, Vanilla JS implementation.
 */

export class OrbitsDrop {
  constructor() {
    this.CHUNK_SIZE = 65536; // 64KB per chunk to prevent WebRTC buffer overflow
    this.MAX_BUFFER_SIZE = 1048576; // 1MB WebRTC buffer limit before pausing

    // Receiver State
    // fileId -> { chunks: Map<seq, ArrayBuffer>, totalSize, receivedBytes, metadata, lastSeq, expectedHash }
    this.incomingFiles = new Map();

    // Sender State
    // fileId -> { statusMsgId, aborted, lastSentSeq }
    this.outgoingTransfers = new Map();

    // Callbacks to interact with UI
    this.onProgressUpdate = null;  // (msgId, percent, statusText) => {}
    this.onFileReady = null;       // (msgId, fileUrl, metadata) => {}
    this.onTransferComplete = null; // (msgId) => {}
    this.onTransferFailed = null;   // (msgId, error) => {}
  }

  // ==========================================
  // 1. FILE COMPRESSION MODULE (Pre-transfer)
  // ==========================================

  /**
   * Compresses an image locally using the Canvas API
   * @param {File|Blob} file - Original image file
   * @param {string} qualitySetting - 'original', 'high', or 'fast'
   * @returns {Promise<Blob>} - Compressed Blob or original if compression not applicable
   */
  async compressImage(file, qualitySetting) {
    if (!file.type.match(/image\/(jpeg|png|webp)/i) || qualitySetting === 'original') {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let targetWidth = img.width;
        let targetHeight = img.height;
        let quality = 0.9;

        if (qualitySetting === 'high') {
          const maxDim = 1920;
          if (targetWidth > maxDim || targetHeight > maxDim) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
              targetWidth = maxDim;
            } else {
              targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
              targetHeight = maxDim;
            }
          }
          quality = 0.85;
        } else if (qualitySetting === 'fast') {
          const maxDim = 1080;
          if (targetWidth > maxDim || targetHeight > maxDim) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
              targetWidth = maxDim;
            } else {
              targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
              targetHeight = maxDim;
            }
          }
          quality = 0.6;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const outputType = (file.type === 'image/png' && qualitySetting === 'high') ? 'image/png' : 'image/jpeg';

        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) resolve(blob);
          else resolve(file);
        }, outputType, quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  }

  // ==========================================
  // 2. SHA-256 INTEGRITY
  // ==========================================

  /**
   * Compute SHA-256 hash of an ArrayBuffer or Blob
   * @param {ArrayBuffer|Blob} data
   * @returns {Promise<string>} hex-encoded SHA-256 hash
   */
  async computeHash(data) {
    let buffer;
    if (data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data;
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ==========================================
  // 3. THE WEBRTC CHUNKER (Sender Side)
  // ==========================================

  /**
   * Sends a file in chunks with integrity hash and sequence numbers.
   * @param {File|Blob} file
   * @param {object} conn - PeerJS DataConnection
   * @param {string} statusMsgId
   * @param {string} [fileId]
   * @param {number} [resumeFromSeq] - start from this sequence (for resumable)
   */
  async sendFile(file, conn, statusMsgId, fileId = crypto.randomUUID(), resumeFromSeq = 0) {
    return new Promise(async (resolve, reject) => {
      if (!conn || !conn.open) {
        return reject(new Error('Connection not open'));
      }

      // Compute integrity hash before sending
      let fileHash = '';
      try {
        fileHash = await this.computeHash(file);
      } catch (_) {
        // If hash fails, send without it — receiver won't verify
      }

      const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);

      // Send metadata packet
      const metadata = {
        type: 'file-start',
        fileId,
        name: file.name || 'orbits_drop_file',
        size: file.size,
        mime: file.type || 'application/octet-stream',
        msgId: statusMsgId,
        hash: fileHash,
        totalChunks,
        resumeFromSeq
      };

      this.outgoingTransfers.set(fileId, { statusMsgId, aborted: false, lastSentSeq: resumeFromSeq });

      try {
        conn.send(metadata);
      } catch (err) {
        this.outgoingTransfers.delete(fileId);
        return reject(new Error('Failed to send file metadata'));
      }

      // Setup chunking with sequence numbers
      let seq = resumeFromSeq;
      let offset = resumeFromSeq * this.CHUNK_SIZE;

      const dataChannel = conn.dataChannel || null;
      const canBackpressure =
        !!dataChannel &&
        typeof dataChannel.bufferedAmount === 'number' &&
        typeof dataChannel.addEventListener === 'function';

      if (canBackpressure) {
        dataChannel.bufferedAmountLowThreshold = this.MAX_BUFFER_SIZE / 2;
      }

      const sendNextChunk = () => {
        const transferState = this.outgoingTransfers.get(fileId);
        if (!transferState || transferState.aborted) {
          return reject(new Error('Transfer aborted'));
        }

        // Backpressure control
        if (canBackpressure && dataChannel.bufferedAmount > this.MAX_BUFFER_SIZE) {
          const onBufferedAmountLow = () => {
            dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            sendNextChunk();
          };
          dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
          return;
        }

        if (offset >= file.size) {
          // All chunks sent — send completion
          conn.send({ type: 'file-end', fileId });
          this.outgoingTransfers.delete(fileId);
          if (this.onTransferComplete) this.onTransferComplete(statusMsgId);
          resolve();
          return;
        }

        const slice = file.slice(offset, offset + this.CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (e) => {
          const chunk = e.target.result;
          if (!chunk || chunk.byteLength === 0) return;

          try {
            conn.send({
              type: 'file-chunk',
              fileId,
              seq,
              data: chunk
            });

            const transferState = this.outgoingTransfers.get(fileId);
            if (transferState) transferState.lastSentSeq = seq;

            offset += chunk.byteLength;
            seq++;

            if (this.onProgressUpdate) {
              const percent = Math.floor((offset / file.size) * 100);
              this.onProgressUpdate(statusMsgId, percent, 'Sending...');
            }

            // Yield to main thread between chunks.
            // Use MessageChannel for microtask-like scheduling that avoids
            // setTimeout throttling on mobile browsers in background.
            if (typeof MessageChannel !== 'undefined') {
              const ch = new MessageChannel();
              ch.port1.onmessage = () => sendNextChunk();
              ch.port2.postMessage(null);
            } else {
              setTimeout(sendNextChunk, 0);
            }
          } catch (err) {
            this.outgoingTransfers.delete(fileId);
            if (this.onTransferFailed) this.onTransferFailed(statusMsgId, err);
            reject(err);
          }
        };

        reader.onerror = () => {
          this.outgoingTransfers.delete(fileId);
          if (this.onTransferFailed) this.onTransferFailed(statusMsgId, reader.error);
          reject(reader.error);
        };

        reader.readAsArrayBuffer(slice);
      };

      sendNextChunk();
    });
  }

  abortTransfer(fileId) {
    if (this.outgoingTransfers.has(fileId)) {
      const state = this.outgoingTransfers.get(fileId);
      state.aborted = true;
      return true;
    }
    return false;
  }

  /**
   * Get resume info for a partially-received file.
   * @param {string} fileId
   * @returns {{ lastSeq: number } | null}
   */
  getResumeInfo(fileId) {
    const fileState = this.incomingFiles.get(fileId);
    if (!fileState) return null;
    return { lastSeq: fileState.lastSeq };
  }

  // ==========================================
  // 4. THE WEBRTC ASSEMBLER (Receiver Side)
  // ==========================================

  handleIncomingPacket(packet) {
    if (!packet || !packet.type) return false;
    switch (packet.type) {
      case 'file-start':
        this._handleFileStart(packet);
        return true;
      case 'file-chunk':
        this._handleFileChunk(packet);
        return true;
      case 'file-end':
        this._handleFileEnd(packet);
        return true;
      case 'drop-resume':
        // Handled by DropManager — not here
        return false;
      default:
        return false;
    }
  }

  _handleFileStart(metadata) {
    this.incomingFiles.set(metadata.fileId, {
      chunks: new Map(),
      totalSize: metadata.size,
      totalChunks: metadata.totalChunks || Math.ceil(metadata.size / this.CHUNK_SIZE),
      receivedBytes: 0,
      metadata,
      statusMsgId: metadata.msgId,
      expectedHash: metadata.hash || '',
      lastSeq: -1
    });

    if (this.onProgressUpdate) {
      this.onProgressUpdate(metadata.msgId, 0, 'Receiving...');
    }
  }

  _handleFileChunk(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return;

    const seq = packet.seq ?? fileState.chunks.size;

    // Dedup: skip if we already have this seq
    if (fileState.chunks.has(seq)) return;

    fileState.chunks.set(seq, packet.data);
    fileState.receivedBytes += packet.data.byteLength;
    if (seq > fileState.lastSeq) fileState.lastSeq = seq;

    if (this.onProgressUpdate) {
      const percent = Math.floor((fileState.receivedBytes / fileState.totalSize) * 100);
      this.onProgressUpdate(fileState.metadata.msgId, percent, 'Receiving...');
    }
  }

  async _handleFileEnd(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return;

    try {
      // Assemble chunks in sequence order
      const sortedSeqs = Array.from(fileState.chunks.keys()).sort((a, b) => a - b);
      const orderedChunks = sortedSeqs.map((seq) => fileState.chunks.get(seq));

      const finalBlob = new Blob(orderedChunks, { type: fileState.metadata.mime });
      const metadata = fileState.metadata;
      const msgId = metadata.msgId;

      // Integrity check
      if (fileState.expectedHash) {
        const actualHash = await this.computeHash(finalBlob);
        if (actualHash !== fileState.expectedHash) {
          this.incomingFiles.delete(packet.fileId);
          const err = new Error(`Integrity check failed: expected ${fileState.expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...`);
          err.code = 'INTEGRITY';
          if (this.onTransferFailed) this.onTransferFailed(msgId, err);
          return;
        }
      }

      // Clean up
      this.incomingFiles.delete(packet.fileId);

      const fileUrl = URL.createObjectURL(finalBlob);

      if (this.onFileReady) {
        this.onFileReady(msgId, fileUrl, metadata);
      }
      if (this.onTransferComplete) {
        this.onTransferComplete(msgId);
      }
    } catch (err) {
      if (this.onTransferFailed) {
        this.onTransferFailed(fileState.metadata.msgId, err);
      }
      this.incomingFiles.delete(packet.fileId);
    }
  }

  // ==========================================
  // 5. LOCAL SAVING (Strictly Client-Side)
  // ==========================================

  static triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  }
}
