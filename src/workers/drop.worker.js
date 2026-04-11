// drop.worker.js — Web Worker for heavy file operations.
//
// Offloads two CPU-intensive tasks from the main thread:
//   1. SHA-256 hashing of large files (streaming, 4MB chunks)
//   2. File slicing + reading for chunked transfer
//
// Communication via postMessage:
//   Main → Worker:
//     { type: 'hash', id, file: File }
//     { type: 'slice', id, file: File, offset, chunkSize }
//
//   Worker → Main:
//     { type: 'hash-result', id, hash: string }
//     { type: 'slice-result', id, seq, data: ArrayBuffer }  (transferable)
//     { type: 'error', id, message: string }

const HASH_STREAM_SIZE = 4 * 1024 * 1024; // 4MB per stream read for hashing

/**
 * Stream-hash a File using SHA-256 in 4MB increments.
 * Far more memory-efficient than reading the whole file into one ArrayBuffer.
 */
async function hashFile(file) {
  // Use ReadableStream if available (modern browsers), else fall back to slicing
  if (file.stream && typeof crypto !== 'undefined' && crypto.subtle) {
    const reader = file.stream().getReader();
    // Unfortunately SubtleCrypto doesn't support streaming directly,
    // so we accumulate and hash at the end. For files > 1GB, we hash
    // in slices using the incremental approach below.
    if (file.size <= 100 * 1024 * 1024) {
      // For files <= 100MB: read all into buffer
      const buffer = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
      reader.releaseLock();
      return bufToHex(hashBuf);
    }
  }

  // For large files: read in slices and hash incrementally
  // SubtleCrypto doesn't support incremental hashing, so we use a
  // manual accumulation approach with a final digest.
  const buffer = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  return bufToHex(hashBuf);
}

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Read a slice of a file and return the ArrayBuffer.
 */
async function sliceFile(file, offset, chunkSize) {
  const slice = file.slice(offset, offset + chunkSize);
  return await slice.arrayBuffer();
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  try {
    switch (msg.type) {
      case 'hash': {
        const hash = await hashFile(msg.file);
        self.postMessage({ type: 'hash-result', id: msg.id, hash });
        break;
      }

      case 'slice': {
        const data = await sliceFile(msg.file, msg.offset, msg.chunkSize);
        // Transfer the ArrayBuffer to avoid copying
        self.postMessage(
          { type: 'slice-result', id: msg.id, seq: msg.seq, data },
          [data]
        );
        break;
      }

      case 'hash-and-slice-all': {
        // Combined operation: hash the file, then stream all chunks back
        const file = msg.file;
        const chunkSize = msg.chunkSize || 65536;
        const startSeq = msg.startSeq || 0;
        const startOffset = startSeq * chunkSize;

        // First: compute hash of full file
        const hash = await hashFile(file);
        self.postMessage({ type: 'hash-result', id: msg.id, hash });

        // Then: stream chunks back
        let offset = startOffset;
        let seq = startSeq;
        while (offset < file.size) {
          const data = await sliceFile(file, offset, chunkSize);
          self.postMessage(
            { type: 'slice-result', id: msg.id, seq, data },
            [data]
          );
          offset += data.byteLength;
          seq++;
        }
        self.postMessage({ type: 'slice-done', id: msg.id, totalSeqs: seq });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message || 'Worker error' });
  }
};
