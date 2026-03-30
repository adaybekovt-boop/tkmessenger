import { wire, rpc } from '../utils/rpc.js';

const cryptoWorker = new Worker(new URL('../workers/cryptoWorker.js', import.meta.url), { type: 'classic' });
wire(cryptoWorker);

export function cryptoDerive(password, nickname) {
  return rpc(cryptoWorker, 'derive', { password, nickname });
}

export function cryptoLock() {
  return rpc(cryptoWorker, 'lock');
}

export function cryptoEncrypt(obj) {
  return rpc(cryptoWorker, 'encrypt', { obj });
}

export function cryptoDecrypt(enc) {
  return rpc(cryptoWorker, 'decrypt', { enc });
}

export function cryptoDecryptBatch(encList) {
  return rpc(cryptoWorker, 'decryptBatch', { encList });
}

export function cryptoSha256Hex(str) {
  return rpc(cryptoWorker, 'sha256Hex', { str });
}

export function cryptoSha256Buffer(buffer) {
  const ab = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  return rpc(cryptoWorker, 'sha256Buffer', { buffer: ab }, [ab]);
}
