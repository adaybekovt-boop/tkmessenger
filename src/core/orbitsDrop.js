/**
 * Orbits Drop - High-Bandwidth P2P File Transfer Module
 * Handles massive file transfers with compression, chunking, and buffer control.
 * Strictly Zero-Server, Vanilla JS implementation.
 */

export class OrbitsDrop {
  constructor() {
    this.CHUNK_SIZE = 65536; // 64KB per chunk to prevent WebRTC buffer overflow
    this.MAX_BUFFER_SIZE = 1048576; // 1MB WebRTC buffer limit before pausing
    
    // Receiver State
    this.incomingFiles = new Map(); // fileId -> { chunks: [], totalSize: 0, receivedBytes: 0, metadata: {}, statusMsgId: '' }
    
    // Sender State
    this.outgoingTransfers = new Map(); // fileId -> { statusMsgId: '', aborted: false }
    
    // Callbacks to interact with UI
    this.onProgressUpdate = null; // (msgId, percent, statusText) => {}
    this.onFileReady = null; // (msgId, fileUrl, metadata) => {}
    this.onTransferComplete = null; // (msgId) => {}
    this.onTransferFailed = null; // (msgId, error) => {}
  }

  // ==========================================
  // 1. FILE COMPRESSION MODULE (Pre-transfer)
  // ==========================================
  
  /**
   * Compresses an image locally using the Canvas API
   * @param {File} file - Original image file
   * @param {string} qualitySetting - 'original', 'high', or 'fast'
   * @returns {Promise<Blob>} - Compressed Blob or original if compression not applicable
   */
  async compressImage(file, qualitySetting) {
    // Only compress standard images
    if (!file.type.match(/image\/(jpeg|png|webp)/i) || qualitySetting === 'original') {
      return file;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        let targetWidth = img.width;
        let targetHeight = img.height;
        let quality = 0.9;
        
        // Define compression tiers
        if (qualitySetting === 'high') {
          // Max dimension 1920px
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
          // Max dimension 1080px
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
        if (!ctx) {
          resolve(file);
          return;
        }
        // Better scaling algorithm
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Always output as JPEG for compression, unless it's a PNG and we want to preserve transparency
        const outputType = (file.type === 'image/png' && qualitySetting === 'high') ? 'image/png' : 'image/jpeg';
        
        canvas.toBlob((blob) => {
          if (blob) {
            // If compression somehow made it larger, use original
            if (blob.size >= file.size) resolve(file);
            else resolve(blob);
          } else {
            resolve(file); // Fallback to original on failure
          }
        }, outputType, quality);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file); // Fallback to original on error
      };
      
      img.src = url;
    });
  }

  // ==========================================
  // 2. THE WEBRTC CHUNKER (Sender Side)
  // ==========================================

  /**
   * Sends a file in chunks over a WebRTC DataChannel with buffer backpressure control
   */
  async sendFile(file, conn, statusMsgId, fileId = crypto.randomUUID()) {
    return new Promise((resolve, reject) => {
      if (!conn || !conn.open) {
        return reject(new Error('Connection not open'));
      }

      // 1. Send metadata packet
      const metadata = {
        type: 'file-start',
        fileId: fileId,
        name: file.name || 'orbits_drop_file',
        size: file.size,
        mime: file.type || 'application/octet-stream',
        msgId: statusMsgId
      };
      
      this.outgoingTransfers.set(fileId, { statusMsgId, aborted: false });
      
      try {
        conn.send(metadata);
      } catch (err) {
        this.outgoingTransfers.delete(fileId);
        return reject(new Error('Failed to send file metadata'));
      }

      // 2. Setup chunking
      let offset = 0;
      const reader = new FileReader();
      
      const dataChannel = conn.dataChannel || null;
      const canBackpressure =
        !!dataChannel &&
        typeof dataChannel.bufferedAmount === 'number' &&
        typeof dataChannel.addEventListener === 'function';

      const sendNextChunk = () => {
        const transferState = this.outgoingTransfers.get(fileId);
        if (!transferState || transferState.aborted) {
          return reject(new Error('Transfer aborted'));
        }

        // Backpressure control: Wait if buffer is too full
        if (canBackpressure && dataChannel.bufferedAmount > this.MAX_BUFFER_SIZE) {
          const onBufferedAmountLow = () => {
            dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
            sendNextChunk();
          };
          dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
          return;
        }

        // Read next slice
        const slice = file.slice(offset, offset + this.CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        const chunk = e.target.result;
        if (!chunk || chunk.byteLength === 0) return;

        try {
          // Send raw ArrayBuffer. PeerJS passes ArrayBuffers directly to RTCDataChannel
          // We wrap it in our protocol object to distinguish from normal messages
          conn.send({
            type: 'file-chunk',
            fileId: fileId,
            data: chunk
          });
          
          offset += chunk.byteLength;
          
          // Update UI Progress
          if (this.onProgressUpdate) {
            const percent = Math.floor((offset / file.size) * 100);
            this.onProgressUpdate(statusMsgId, percent, 'Sending...');
          }

          if (offset < file.size) {
            // Use setTimeout to avoid blocking the main thread during massive transfers
            setTimeout(sendNextChunk, 0);
          } else {
            // 3. Send Completion Packet
            conn.send({
              type: 'file-end',
              fileId: fileId
            });
            
            this.outgoingTransfers.delete(fileId);
            if (this.onTransferComplete) this.onTransferComplete(statusMsgId);
            resolve();
          }
        } catch (err) {
          this.outgoingTransfers.delete(fileId);
          if (this.onTransferFailed) this.onTransferFailed(statusMsgId, err);
          reject(err);
        }
      };

      reader.onerror = (err) => {
        this.outgoingTransfers.delete(fileId);
        if (this.onTransferFailed) this.onTransferFailed(statusMsgId, reader.error);
        reject(reader.error);
      };

      if (canBackpressure) {
        dataChannel.bufferedAmountLowThreshold = this.MAX_BUFFER_SIZE / 2;
      }
      
      // Start the transfer
      sendNextChunk();
    });
  }

  abortTransfer(fileId) {
    if (this.outgoingTransfers.has(fileId)) {
      const state = this.outgoingTransfers.get(fileId);
      state.aborted = true;
      this.outgoingTransfers.set(fileId, state);
      return true;
    }
    return false;
  }

  // ==========================================
  // 3. THE WEBRTC ASSEMBLER (Receiver Side)
  // ==========================================

  /**
   * Main entry point for processing incoming Orbits Drop protocol packets
   */
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
      default:
        return false; // Not a file packet
    }
  }

  _handleFileStart(metadata) {
    console.log(`[Orbits Drop] Receiving file: ${metadata.name} (${metadata.size} bytes)`);
    
    // Initialize receiver state for this file
    this.incomingFiles.set(metadata.fileId, {
      chunks: [],
      totalSize: metadata.size,
      receivedBytes: 0,
      metadata: metadata,
      statusMsgId: metadata.msgId // ID of the UI message bubble
    });
    
    if (this.onProgressUpdate) {
      this.onProgressUpdate(metadata.msgId, 0, 'Receiving...');
    }
  }

  _handleFileChunk(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return; // Ignore orphaned chunks

    // Store ArrayBuffer chunk in memory
    fileState.chunks.push(packet.data);
    fileState.receivedBytes += packet.data.byteLength;
    
    // Update UI Progress
    if (this.onProgressUpdate) {
      const percent = Math.floor((fileState.receivedBytes / fileState.totalSize) * 100);
      this.onProgressUpdate(fileState.metadata.msgId, percent, 'Receiving...');
    }
  }

  _handleFileEnd(packet) {
    const fileState = this.incomingFiles.get(packet.fileId);
    if (!fileState) return;

    console.log(`[Orbits Drop] Assembly complete: ${fileState.metadata.name}`);
    
    try {
      // Assemble chunks into final Blob
      const finalBlob = new Blob(fileState.chunks, { type: fileState.metadata.mime });
      
      // Clean up memory IMMEDIATELY before generating URL
      const metadata = fileState.metadata;
      const msgId = metadata.msgId;
      this.incomingFiles.delete(packet.fileId);
      
      // 4. Local Saving: Generate Object URL
      const fileUrl = URL.createObjectURL(finalBlob);
      
      // Notify UI that file is ready for download/display
      if (this.onFileReady) {
        this.onFileReady(msgId, fileUrl, metadata);
      }
      
      if (this.onTransferComplete) {
        this.onTransferComplete(msgId);
      }
      
    } catch (err) {
      console.error('[Orbits Drop] File assembly failed:', err);
      if (this.onTransferFailed) {
        this.onTransferFailed(fileState.metadata.msgId, err);
      }
      this.incomingFiles.delete(packet.fileId);
    }
  }

  // ==========================================
  // 4. LOCAL SAVING (Strictly Client-Side)
  // ==========================================

  /**
   * Programmatically triggers native browser download and cleans up memory
   */
  static triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      // Note: We don't revoke here immediately if the URL is also used for UI display (e.g. <img> src).
      // URL revocation should be managed by the UI component when it unmounts.
    }, 100);
  }
}
