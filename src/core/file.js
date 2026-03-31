import { wire, rpc } from '../utils/rpc.js';

const fileWorker = new Worker(new URL('../workers/fileWorker.js', import.meta.url), { type: 'classic' });
wire(fileWorker);

/** File chunk hashing on dedicated worker (does not compete with crypto vault queue). */
export function fileSha256Buffer(buffer) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return rpc(fileWorker, 'sha256', { buffer: ab }, [ab]);
}
